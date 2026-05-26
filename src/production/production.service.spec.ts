import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductionService } from './production.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/services/sequence.service';
import { RawStockService } from '../raw-stock/raw-stock.service';
import { FinishedStockService } from '../finished-stock/finished-stock.service';
import { ProductionOrderStatus } from '@prisma/client';

describe('ProductionService', () => {
  let service: ProductionService;
  let prisma: {
    productionOrder: { findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      productionOrder: { findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionService,
        { provide: PrismaService, useValue: prisma },
        { provide: SequenceService, useValue: { nextReference: jest.fn() } },
        { provide: RawStockService, useValue: { consumeStock: jest.fn() } },
        { provide: FinishedStockService, useValue: { createLot: jest.fn() } },
      ],
    }).compile();

    service = module.get<ProductionService>(ProductionService);
  });

  describe('start', () => {
    it('passe PLANNED → IN_PROGRESS', async () => {
      prisma.productionOrder.findUnique.mockResolvedValue({
        id: 'op-1',
        status: ProductionOrderStatus.PLANNED,
        formula: { items: [] },
      });
      prisma.productionOrder.update.mockResolvedValue({
        id: 'op-1',
        status: ProductionOrderStatus.IN_PROGRESS,
      });

      const res = await service.start('op-1');
      expect(res.status).toBe(ProductionOrderStatus.IN_PROGRESS);
    });

    it("refuse de démarrer un ordre déjà IN_PROGRESS", async () => {
      prisma.productionOrder.findUnique.mockResolvedValue({
        id: 'op-1',
        status: ProductionOrderStatus.IN_PROGRESS,
        formula: { items: [] },
      });
      await expect(service.start('op-1')).rejects.toThrow(BadRequestException);
    });

    it("refuse de démarrer un ordre COMPLETED", async () => {
      prisma.productionOrder.findUnique.mockResolvedValue({
        id: 'op-1',
        status: ProductionOrderStatus.COMPLETED,
        formula: { items: [] },
      });
      await expect(service.start('op-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('annule un ordre PLANNED avec motif', async () => {
      prisma.productionOrder.findUnique.mockResolvedValue({
        id: 'op-1',
        status: ProductionOrderStatus.PLANNED,
        formula: { items: [] },
      });
      prisma.productionOrder.update.mockResolvedValue({
        id: 'op-1',
        status: ProductionOrderStatus.CANCELLED,
        cancelReason: 'Test',
      });

      const res = await service.cancel('op-1', { reason: 'Test' } as never);
      expect(res.status).toBe(ProductionOrderStatus.CANCELLED);
    });

    it("refuse d'annuler un ordre COMPLETED", async () => {
      prisma.productionOrder.findUnique.mockResolvedValue({
        id: 'op-1',
        status: ProductionOrderStatus.COMPLETED,
        formula: { items: [] },
      });
      await expect(
        service.cancel('op-1', { reason: 'X' } as never),
      ).rejects.toThrow(/COMPLETED/);
    });

    it("refuse d'annuler un ordre CANCELLED", async () => {
      prisma.productionOrder.findUnique.mockResolvedValue({
        id: 'op-1',
        status: ProductionOrderStatus.CANCELLED,
        formula: { items: [] },
      });
      await expect(
        service.cancel('op-1', { reason: 'X' } as never),
      ).rejects.toThrow(/CANCELLED/);
    });
  });

  describe('findOne', () => {
    it("lève NotFoundException si l'ordre n'existe pas", async () => {
      prisma.productionOrder.findUnique.mockResolvedValue(null);
      await expect(service.findOne('inexistant')).rejects.toThrow(NotFoundException);
    });
  });
});
