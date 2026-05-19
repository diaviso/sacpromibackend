import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RawStockService } from './raw-stock.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  LotStatus,
  RawStockMovementType,
  StockReferenceType,
} from '@prisma/client';

interface MockTx {
  rawMaterial: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  rawMaterialLot: {
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  rawStockMovement: {
    create: jest.Mock;
  };
}

describe('RawStockService', () => {
  let service: RawStockService;
  let mockTx: MockTx;

  beforeEach(async () => {
    mockTx = {
      rawMaterial: { findUnique: jest.fn(), update: jest.fn() },
      rawMaterialLot: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      rawStockMovement: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RawStockService,
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    service = module.get<RawStockService>(RawStockService);
  });

  describe('createLotFromPurchase — recalcul prix moyen pondéré', () => {
    it('initialise le prix moyen avec le prix d achat sur le premier lot', async () => {
      mockTx.rawMaterial.findUnique.mockResolvedValue({
        id: 'mat-1',
        currentStock: 0,
        averagePrice: 0,
      });
      mockTx.rawMaterialLot.create.mockResolvedValue({ id: 'lot-1' });

      await service.createLotFromPurchase(mockTx as never, {
        rawMaterialId: 'mat-1',
        lotNumber: 'L-001',
        quantity: 100,
        receptionDate: new Date('2026-04-01'),
        unitAcquisitionPrice: 250,
        userId: 'user-1',
      });

      expect(mockTx.rawMaterial.update).toHaveBeenCalledWith({
        where: { id: 'mat-1' },
        data: {
          currentStock: { increment: 100 },
          averagePrice: 250,
        },
      });
    });

    it('calcule la moyenne pondérée sur le 2e lot', async () => {
      // Stock existant : 100 unités à 200 FCFA
      // Achat : 50 unités à 300 FCFA
      // Moyenne attendue : (100*200 + 50*300) / 150 = 35000/150 ≈ 233
      mockTx.rawMaterial.findUnique.mockResolvedValue({
        id: 'mat-1',
        currentStock: 100,
        averagePrice: 200,
      });
      mockTx.rawMaterialLot.create.mockResolvedValue({ id: 'lot-2' });

      await service.createLotFromPurchase(mockTx as never, {
        rawMaterialId: 'mat-1',
        lotNumber: 'L-002',
        quantity: 50,
        receptionDate: new Date('2026-04-15'),
        unitAcquisitionPrice: 300,
        userId: 'user-1',
      });

      expect(mockTx.rawMaterial.update).toHaveBeenCalledWith({
        where: { id: 'mat-1' },
        data: {
          currentStock: { increment: 50 },
          averagePrice: 233,
        },
      });
    });

    it('intègre les frais de transport au coût unitaire', async () => {
      mockTx.rawMaterial.findUnique.mockResolvedValue({
        id: 'mat-1',
        currentStock: 0,
        averagePrice: 0,
      });
      mockTx.rawMaterialLot.create.mockResolvedValue({ id: 'lot-3' });

      // 100 unités à 250 + 5000 FCFA transport → 250 + 50 = 300 FCFA/unité
      await service.createLotFromPurchase(mockTx as never, {
        rawMaterialId: 'mat-1',
        lotNumber: 'L-003',
        quantity: 100,
        receptionDate: new Date('2026-04-20'),
        unitAcquisitionPrice: 250,
        transportCost: 5000,
        userId: 'user-1',
      });

      expect(mockTx.rawMaterial.update).toHaveBeenCalledWith({
        where: { id: 'mat-1' },
        data: {
          currentStock: { increment: 100 },
          averagePrice: 300,
        },
      });
    });

    it('lance NotFoundException si la matière premières est introuvable', async () => {
      mockTx.rawMaterial.findUnique.mockResolvedValue(null);

      await expect(
        service.createLotFromPurchase(mockTx as never, {
          rawMaterialId: 'unknown',
          lotNumber: 'L-X',
          quantity: 100,
          receptionDate: new Date(),
          unitAcquisitionPrice: 250,
          userId: 'user-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('consumeStock — FIFO', () => {
    it('consomme uniquement le lot le plus ancien si suffisant', async () => {
      mockTx.rawMaterial.findUnique.mockResolvedValue({
        id: 'mat-1',
        currentStock: 200,
        averagePrice: 250,
        name: 'Maïs',
        alertThreshold: 50,
      });
      mockTx.rawMaterialLot.findMany.mockResolvedValue([
        {
          id: 'lot-old',
          lotNumber: 'OLD',
          remainingQuantity: 100,
          unitAcquisitionPrice: 200,
          receptionDate: new Date('2026-01-01'),
        },
        {
          id: 'lot-new',
          lotNumber: 'NEW',
          remainingQuantity: 100,
          unitAcquisitionPrice: 300,
          receptionDate: new Date('2026-04-01'),
        },
      ]);

      const result = await service.consumeStock(mockTx as never, {
        rawMaterialId: 'mat-1',
        quantity: 60,
        movementType: RawStockMovementType.EXIT_PRODUCTION,
        userId: 'user-1',
      });

      // Doit consommer 60 du lot-old uniquement
      expect(result.consumedLots).toHaveLength(1);
      expect(result.consumedLots[0].lotId).toBe('lot-old');
      expect(result.consumedLots[0].quantity).toBe(60);
      expect(result.totalCost).toBe(60 * 200); // = 12000

      // Le lot-old doit être mis à jour avec 40 restants, encore ACTIVE
      expect(mockTx.rawMaterialLot.update).toHaveBeenCalledWith({
        where: { id: 'lot-old' },
        data: { remainingQuantity: 40, status: LotStatus.ACTIVE },
      });
    });

    it('épuise un lot puis bascule sur le suivant (cross-lot)', async () => {
      mockTx.rawMaterial.findUnique.mockResolvedValue({
        id: 'mat-1',
        currentStock: 200,
        averagePrice: 250,
        name: 'Maïs',
        alertThreshold: 50,
      });
      mockTx.rawMaterialLot.findMany.mockResolvedValue([
        {
          id: 'lot-old',
          lotNumber: 'OLD',
          remainingQuantity: 80,
          unitAcquisitionPrice: 200,
          receptionDate: new Date('2026-01-01'),
        },
        {
          id: 'lot-new',
          lotNumber: 'NEW',
          remainingQuantity: 120,
          unitAcquisitionPrice: 300,
          receptionDate: new Date('2026-04-01'),
        },
      ]);

      const result = await service.consumeStock(mockTx as never, {
        rawMaterialId: 'mat-1',
        quantity: 150,
        movementType: RawStockMovementType.EXIT_PRODUCTION,
        userId: 'user-1',
      });

      expect(result.consumedLots).toHaveLength(2);
      expect(result.consumedLots[0]).toMatchObject({ lotId: 'lot-old', quantity: 80, cost: 80 * 200 });
      expect(result.consumedLots[1]).toMatchObject({ lotId: 'lot-new', quantity: 70, cost: 70 * 300 });
      expect(result.totalCost).toBe(80 * 200 + 70 * 300); // = 16000 + 21000 = 37000

      // Le lot-old doit être DEPLETED
      expect(mockTx.rawMaterialLot.update).toHaveBeenCalledWith({
        where: { id: 'lot-old' },
        data: { remainingQuantity: 0, status: LotStatus.DEPLETED },
      });
    });

    it('refuse si stock global insuffisant', async () => {
      mockTx.rawMaterial.findUnique.mockResolvedValue({
        id: 'mat-1',
        currentStock: 50,
        averagePrice: 250,
        name: 'Maïs',
        alertThreshold: 100,
      });

      await expect(
        service.consumeStock(mockTx as never, {
          rawMaterialId: 'mat-1',
          quantity: 100,
          movementType: RawStockMovementType.EXIT_PRODUCTION,
          userId: 'user-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuse une quantité négative ou nulle', async () => {
      await expect(
        service.consumeStock(mockTx as never, {
          rawMaterialId: 'mat-1',
          quantity: 0,
          movementType: RawStockMovementType.EXIT_PRODUCTION,
          userId: 'user-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("exige un motif pour LOSS et ADJUSTMENT", async () => {
      mockTx.rawMaterial.findUnique.mockResolvedValue({
        id: 'mat-1',
        currentStock: 100,
        name: 'Maïs',
      });

      await expect(
        service.consumeStock(mockTx as never, {
          rawMaterialId: 'mat-1',
          quantity: 10,
          movementType: RawStockMovementType.LOSS,
          userId: 'user-1',
          // pas de reason
        }),
      ).rejects.toThrow(/motif est obligatoire/);
    });
  });
});
