import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LotStatus } from '@prisma/client';
import { SupplierCreditNotesService } from './supplier-credit-notes.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/services/sequence.service';

// Mock minimal d'une transaction Prisma pour les tests
interface MockTx {
  purchaseInvoice: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  supplierCreditNoteItem: {
    findMany: jest.Mock;
  };
  supplierCreditNote: {
    create: jest.Mock;
  };
  rawStockMovement: { create: jest.Mock };
  rawMaterialLot: { update: jest.Mock };
  rawMaterial: { update: jest.Mock };
}

describe('SupplierCreditNotesService — invariants', () => {
  let service: SupplierCreditNotesService;
  let mockTx: MockTx;
  let mockPrisma: { $transaction: jest.Mock };
  let mockSequence: { nextReference: jest.Mock };

  beforeEach(async () => {
    mockTx = {
      purchaseInvoice: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      supplierCreditNoteItem: { findMany: jest.fn().mockResolvedValue([]) },
      supplierCreditNote: { create: jest.fn() },
      rawStockMovement: { create: jest.fn() },
      rawMaterialLot: {
        update: jest.fn().mockResolvedValue({ remainingQuantity: 100 }),
      },
      rawMaterial: { update: jest.fn() },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (fn) => fn(mockTx)),
    };
    mockSequence = { nextReference: jest.fn().mockResolvedValue('AVR-2026-0001') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplierCreditNotesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequence },
      ],
    }).compile();

    service = module.get<SupplierCreditNotesService>(SupplierCreditNotesService);
  });

  const buildInvoice = (overrides: Record<string, unknown> = {}) => ({
    id: 'inv-1',
    reference: 'FA-2026-0001',
    deletedAt: null,
    supplierId: 'sup-1',
    totalAmount: 100000,
    amountRemaining: 100000,
    amountPaid: 0,
    supplier: { id: 'sup-1', name: 'Fournisseur' },
    items: [
      {
        id: 'item-1',
        rawMaterialId: 'mat-1',
        itemName: 'Mais',
        quantity: 50,
        unit: 'kg',
        unitPrice: 1000,
        lotNumber: 'FA-2026-0001-L01',
        rawMaterial: { id: 'mat-1', code: 'MAI', name: 'Mais' },
      },
    ],
    rawMaterialLots: [
      {
        id: 'lot-1',
        lotNumber: 'FA-2026-0001-L01',
        rawMaterialId: 'mat-1',
        remainingQuantity: 50,
        status: LotStatus.ACTIVE,
      },
    ],
    ...overrides,
  });

  // ── Cas nominal ────────────────────────────────────────────────────────

  it('cree un avoir simple sur une ligne de reception', async () => {
    mockTx.purchaseInvoice.findUnique.mockResolvedValue(buildInvoice());
    mockTx.supplierCreditNote.create.mockResolvedValue({
      id: 'avr-1',
      reference: 'AVR-2026-0001',
    });

    await service.create(
      {
        purchaseInvoiceId: 'inv-1',
        creditDate: '2026-06-30',
        reason: 'Sacs eventres',
        items: [{ purchaseInvoiceItemId: 'item-1', quantity: 5 }],
      },
      'user-1',
    );

    expect(mockTx.supplierCreditNote.create).toHaveBeenCalled();
    expect(mockTx.rawMaterialLot.update).toHaveBeenCalledWith({
      where: { id: 'lot-1' },
      data: { remainingQuantity: { decrement: 5 } },
      select: { remainingQuantity: true },
    });
    // amountPaid=0 + amountRemaining devient 95000 (positif) => UNPAID
    expect(mockTx.purchaseInvoice.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { amountRemaining: 95000, paymentStatus: 'UNPAID' },
    });
  });

  // ── Cumul sur le meme lot ──────────────────────────────────────────────

  it('refuse si deux lignes DTO depassent cumulativement le stock du lot', async () => {
    // 2 invoiceItems pointant vers le meme rawMaterial (et donc le meme
    // lotNumber dans cet exemple simplifie). En realite ce serait deux
    // lotNumbers distincts. Ici on simule 1 item / 1 lot et 2 lignes DTO
    // sur cet item.
    mockTx.purchaseInvoice.findUnique.mockResolvedValue({
      ...buildInvoice(),
      items: [{
        id: 'item-1',
        rawMaterialId: 'mat-1',
        itemName: 'Mais',
        quantity: 50,
        unit: 'kg',
        unitPrice: 1000,
        lotNumber: 'FA-2026-0001-L01',
      }],
      rawMaterialLots: [{
        id: 'lot-1',
        lotNumber: 'FA-2026-0001-L01',
        rawMaterialId: 'mat-1',
        remainingQuantity: 30,
        status: LotStatus.ACTIVE,
      }],
    });

    // Deux lignes DTO sur le meme item, cumul = 40 > qty recue (50) OK
    // mais > stock restant du lot (30)
    await expect(
      service.create(
        {
          purchaseInvoiceId: 'inv-1',
          creditDate: '2026-06-30',
          reason: 'Retour partiel',
          items: [
            { purchaseInvoiceItemId: 'item-1', quantity: 20 },
            { purchaseInvoiceItemId: 'item-1', quantity: 20 },
          ],
        },
        'user-1',
      ),
    ).rejects.toThrow(/Cumul retours sur le lot FA-2026-0001-L01 \(40\) superieur au stock restant \(30\)/);
  });

  // ── Cumul des avoirs deja emis ─────────────────────────────────────────

  it('refuse si un avoir precedent + le nouveau depassent qty recue', async () => {
    mockTx.purchaseInvoice.findUnique.mockResolvedValue(buildInvoice());
    // Avoir precedent : 40 sur 50 deja retourne sur item-1
    mockTx.supplierCreditNoteItem.findMany.mockResolvedValue([
      { purchaseInvoiceItemId: 'item-1', quantity: 40, lineAmount: 40000 },
    ]);

    await expect(
      service.create(
        {
          purchaseInvoiceId: 'inv-1',
          creditDate: '2026-06-30',
          reason: 'Retour final',
          items: [{ purchaseInvoiceItemId: 'item-1', quantity: 15 }],
        },
        'user-1',
      ),
    ).rejects.toThrow(/superieur au reste retournable \(10/);
  });

  // ── Plafond comptable total ────────────────────────────────────────────

  it('refuse si cumul avoirs depasse totalAmount facture parent', async () => {
    mockTx.purchaseInvoice.findUnique.mockResolvedValue({
      ...buildInvoice(),
      totalAmount: 50000, // facture de 50000
    });
    mockTx.supplierCreditNoteItem.findMany.mockResolvedValue([
      { purchaseInvoiceItemId: null, quantity: 0, lineAmount: 40000 }, // 40k deja avoire
    ]);

    // Nouvel avoir de 15000 -> total 55k > 50k facture
    await expect(
      service.create(
        {
          purchaseInvoiceId: 'inv-1',
          creditDate: '2026-06-30',
          reason: 'Test plafond',
          items: [{ purchaseInvoiceItemId: 'item-1', quantity: 15 }],
        },
        'user-1',
      ),
    ).rejects.toThrow(/Cumul des avoirs.*superieur au total de la reception/);
  });

  // ── Validation lotNumber manquant ──────────────────────────────────────

  it('refuse si invoiceItem n\'a pas de lotNumber (donnees heritage)', async () => {
    mockTx.purchaseInvoice.findUnique.mockResolvedValue({
      ...buildInvoice(),
      items: [
        {
          id: 'item-1',
          rawMaterialId: 'mat-1',
          itemName: 'Mais',
          quantity: 50,
          unit: 'kg',
          unitPrice: 1000,
          lotNumber: null, // heritage
        },
      ],
    });

    await expect(
      service.create(
        {
          purchaseInvoiceId: 'inv-1',
          creditDate: '2026-06-30',
          reason: 'Test heritage',
          items: [{ purchaseInvoiceItemId: 'item-1', quantity: 5 }],
        },
        'user-1',
      ),
    ).rejects.toThrow(/lotNumber persiste/);
  });

  // ── Refus si reception soft-deleted ────────────────────────────────────

  it('refuse de creer un avoir sur une reception annulee', async () => {
    mockTx.purchaseInvoice.findUnique.mockResolvedValue({
      ...buildInvoice(),
      deletedAt: new Date(),
    });

    await expect(
      service.create(
        {
          purchaseInvoiceId: 'inv-1',
          creditDate: '2026-06-30',
          reason: 'Test deleted',
          items: [{ purchaseInvoiceItemId: 'item-1', quantity: 5 }],
        },
        'user-1',
      ),
    ).rejects.toThrow(/Reception annulee/);
  });

  // ── Refus si lot status != ACTIVE ──────────────────────────────────────

  it('refuse si lot d\'origine en statut DEPLETED', async () => {
    mockTx.purchaseInvoice.findUnique.mockResolvedValue({
      ...buildInvoice(),
      rawMaterialLots: [
        {
          id: 'lot-1',
          lotNumber: 'FA-2026-0001-L01',
          rawMaterialId: 'mat-1',
          remainingQuantity: 0,
          status: LotStatus.DEPLETED,
        },
      ],
    });

    await expect(
      service.create(
        {
          purchaseInvoiceId: 'inv-1',
          creditDate: '2026-06-30',
          reason: 'Test depleted',
          items: [{ purchaseInvoiceItemId: 'item-1', quantity: 5 }],
        },
        'user-1',
      ),
    ).rejects.toThrow(/statut DEPLETED/);
  });

  // ── amountRemaining peut devenir negatif ───────────────────────────────

  it('amountRemaining peut devenir negatif et paymentStatus passe a PAID', async () => {
    mockTx.purchaseInvoice.findUnique.mockResolvedValue({
      ...buildInvoice(),
      totalAmount: 50000,
      amountRemaining: 10000, // reste 10k a payer
      amountPaid: 40000,
    });
    mockTx.supplierCreditNote.create.mockResolvedValue({ id: 'avr-1', reference: 'AVR' });

    await service.create(
      {
        purchaseInvoiceId: 'inv-1',
        creditDate: '2026-06-30',
        reason: 'Test credit excedentaire',
        items: [{ purchaseInvoiceItemId: 'item-1', quantity: 20 }], // 20000 d'avoir
      },
      'user-1',
    );

    expect(mockTx.purchaseInvoice.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: {
        amountRemaining: -10000, // 10000 - 20000 = -10000
        paymentStatus: 'PAID',
      },
    });
  });
});
