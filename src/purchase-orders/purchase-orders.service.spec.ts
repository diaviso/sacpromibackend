import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PurchaseOrderStatus } from '@prisma/client';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/services/sequence.service';

interface MockPrisma {
  purchaseOrder: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
}

describe('PurchaseOrdersService — nouveau workflow', () => {
  let service: PurchaseOrdersService;
  let mockPrisma: MockPrisma;

  beforeEach(async () => {
    mockPrisma = {
      purchaseOrder: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: { nextReference: jest.fn() } },
      ],
    }).compile();

    service = module.get<PurchaseOrdersService>(PurchaseOrdersService);
  });

  // ── validate() ────────────────────────────────────────────────────────

  describe('validate()', () => {
    const baseOrder = {
      id: 'po-1',
      status: PurchaseOrderStatus.DRAFT,
      items: [],
      purchaseInvoices: [],
      expectedDate: null as Date | null,
    };

    it('refuse si statut != DRAFT', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        ...baseOrder,
        status: PurchaseOrderStatus.VALIDATED,
      });
      await expect(service.validate('po-1')).rejects.toThrow(BadRequestException);
    });

    it("refuse si expectedDate n'est pas renseignee — date attendue obligatoire", async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({ ...baseOrder, expectedDate: null });
      await expect(service.validate('po-1')).rejects.toThrow(
        /Date de livraison attendue requise/,
      );
    });

    it('valide et stamp validatedAt si expectedDate renseignee', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        ...baseOrder,
        expectedDate: new Date('2026-07-15'),
      });
      mockPrisma.purchaseOrder.update.mockResolvedValue({
        ...baseOrder,
        status: PurchaseOrderStatus.VALIDATED,
        validatedAt: expect.any(Date),
      });

      await service.validate('po-1');

      expect(mockPrisma.purchaseOrder.update).toHaveBeenCalledWith({
        where: { id: 'po-1' },
        data: expect.objectContaining({
          status: PurchaseOrderStatus.VALIDATED,
          validatedAt: expect.any(Date),
        }),
        include: expect.anything(),
      });
    });

    it('throw NotFound si BC introuvable', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue(null);
      await expect(service.validate('po-missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── invalidate() ──────────────────────────────────────────────────────

  describe('invalidate()', () => {
    const validatedOrder = {
      id: 'po-1',
      status: PurchaseOrderStatus.VALIDATED,
      items: [{ quantityDelivered: 0 }],
      purchaseInvoices: [],
    };

    it('reset validatedAt a null', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue(validatedOrder);
      mockPrisma.purchaseOrder.update.mockResolvedValue({});

      await service.invalidate('po-1');

      expect(mockPrisma.purchaseOrder.update).toHaveBeenCalledWith({
        where: { id: 'po-1' },
        data: {
          status: PurchaseOrderStatus.DRAFT,
          validatedAt: null,
        },
        include: expect.anything(),
      });
    });
  });

  // ── expire() ───────────────────────────────────────────────────────────

  describe('expire()', () => {
    it('refuse si statut DRAFT (non valide)', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        id: 'po-1',
        status: PurchaseOrderStatus.DRAFT,
        items: [],
        purchaseInvoices: [],
      });
      await expect(service.expire('po-1')).rejects.toThrow(BadRequestException);
    });

    it('refuse si statut DELIVERED', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        id: 'po-1',
        status: PurchaseOrderStatus.DELIVERED,
        items: [],
        purchaseInvoices: [],
      });
      await expect(service.expire('po-1')).rejects.toThrow(BadRequestException);
    });

    it('accepte VALIDATED et bascule en EXPIRED', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        id: 'po-1',
        status: PurchaseOrderStatus.VALIDATED,
        items: [],
        purchaseInvoices: [],
      });
      mockPrisma.purchaseOrder.update.mockResolvedValue({});

      await service.expire('po-1', 'Fournisseur defaillant');

      expect(mockPrisma.purchaseOrder.update).toHaveBeenCalledWith({
        where: { id: 'po-1' },
        data: {
          status: PurchaseOrderStatus.EXPIRED,
          cancelReason: 'Expire : Fournisseur defaillant',
        },
        include: expect.anything(),
      });
    });

    it('accepte PARTIALLY_DELIVERED (livraison partielle abandonnee)', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        id: 'po-1',
        status: PurchaseOrderStatus.PARTIALLY_DELIVERED,
        items: [],
        purchaseInvoices: [],
      });
      mockPrisma.purchaseOrder.update.mockResolvedValue({});

      await service.expire('po-1');

      expect(mockPrisma.purchaseOrder.update).toHaveBeenCalledWith({
        where: { id: 'po-1' },
        data: {
          status: PurchaseOrderStatus.EXPIRED,
          cancelReason: 'BC expire (aucune reception attendue)',
        },
        include: expect.anything(),
      });
    });
  });

  // ── cancel() ──────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('refuse si statut EXPIRED (terminal)', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        id: 'po-1',
        status: PurchaseOrderStatus.EXPIRED,
        items: [],
        purchaseInvoices: [],
      });
      await expect(service.cancel('po-1', { reason: 'test' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── getPaymentSummary() ──────────────────────────────────────────────

  describe('getPaymentSummary()', () => {
    it('calcule estime / receptionne / paye / restant correctement', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        id: 'po-1',
        status: PurchaseOrderStatus.PARTIALLY_DELIVERED,
        totalAmount: 100000, // estimatif BC
        purchaseInvoices: [
          { totalAmount: 40000, amountPaid: 40000, amountRemaining: 0 }, // reception 1, payee
          { totalAmount: 35000, amountPaid: 10000, amountRemaining: 25000 }, // reception 2, partielle
        ],
      });

      const summary = await service.getPaymentSummary('po-1');

      expect(summary).toEqual({
        estimatedTotalAmount: 100000,
        receivedAmount: 75000, // 40000 + 35000
        paidAmount: 50000, // 40000 + 10000
        remainingToPay: 25000, // = sum amountRemaining
        unbilledEstimate: 25000, // 100000 - 75000
        receptionCount: 2,
      });
    });

    it('unbilledEstimate = 0 si receptionne > estime', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        id: 'po-1',
        status: PurchaseOrderStatus.DELIVERED,
        totalAmount: 50000,
        purchaseInvoices: [
          { totalAmount: 60000, amountPaid: 0, amountRemaining: 60000 }, // reception > estime
        ],
      });

      const summary = await service.getPaymentSummary('po-1');

      expect(summary.unbilledEstimate).toBe(0);
      expect(summary.receivedAmount).toBe(60000);
    });

    it('throw NotFound si BC introuvable', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue(null);
      await expect(service.getPaymentSummary('po-missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('toutes valeurs a 0 si aucune reception', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        id: 'po-1',
        status: PurchaseOrderStatus.VALIDATED,
        totalAmount: 100000,
        purchaseInvoices: [],
      });

      const summary = await service.getPaymentSummary('po-1');

      expect(summary).toEqual({
        estimatedTotalAmount: 100000,
        receivedAmount: 0,
        paidAmount: 0,
        remainingToPay: 0,
        unbilledEstimate: 100000,
        receptionCount: 0,
      });
    });
  });
});
