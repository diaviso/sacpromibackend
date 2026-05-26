import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BreedingService } from './breeding.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/services/sequence.service';
import { FinishedStockService } from '../finished-stock/finished-stock.service';
import { BreedingBatchStatus } from '@prisma/client';

describe('BreedingService', () => {
  let service: BreedingService;
  let prisma: { breedingBatch: { findUnique: jest.Mock }; $transaction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      breedingBatch: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BreedingService,
        { provide: PrismaService, useValue: prisma },
        { provide: SequenceService, useValue: { nextReference: jest.fn() } },
        { provide: FinishedStockService, useValue: { consumeFinishedStock: jest.fn(), createLot: jest.fn() } },
      ],
    }).compile();

    service = module.get<BreedingService>(BreedingService);
  });

  describe('addRecord — validation métier', () => {
    it("refuse si la bande n'existe pas", async () => {
      prisma.breedingBatch.findUnique.mockResolvedValue(null);
      await expect(
        service.addRecord('inexistant', { recordDate: '2026-04-15' } as never, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuse si la bande est clôturée', async () => {
      prisma.breedingBatch.findUnique.mockResolvedValue({
        id: 'b1',
        currentCount: 100,
        status: BreedingBatchStatus.CLOSED,
      });
      await expect(
        service.addRecord('b1', { recordDate: '2026-04-15' } as never, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuse si mortality > currentCount', async () => {
      prisma.breedingBatch.findUnique.mockResolvedValue({
        id: 'b1',
        currentCount: 50,
        status: BreedingBatchStatus.ACTIVE,
      });

      await expect(
        service.addRecord(
          'b1',
          { recordDate: '2026-04-15', mortality: 60 } as never,
          'user-1',
        ),
      ).rejects.toThrow(/Mortalité 60 > sujets vivants 50/);
    });

    it('accepte si mortality = currentCount', async () => {
      prisma.breedingBatch.findUnique.mockResolvedValue({
        id: 'b1',
        currentCount: 10,
        status: BreedingBatchStatus.ACTIVE,
      });
      prisma.$transaction.mockImplementation(async (fn: any) => fn({
        breedingRecord: { create: jest.fn().mockResolvedValue({ id: 'r1' }) },
        breedingBatch: {
          update: jest.fn(),
          findUnique: jest
            .fn()
            // 1er appel : recomputeBatchCosts (besoin de records)
            .mockResolvedValueOnce({
              id: 'b1', initialCount: 100, currentCount: 0,
              chicksCost: 0, fixedCharges: 0, records: [],
            })
            // 2e appel : vérification mortalité finale
            .mockResolvedValueOnce({
              id: 'b1', initialCount: 100, currentCount: 0, reference: 'B-2026-001',
            }),
        },
      }));

      const result = await service.addRecord(
        'b1',
        { recordDate: '2026-04-15', mortality: 10 } as never,
        'user-1',
      );

      expect(result).toEqual({ id: 'r1' });
    });
  });

  describe('close — validation comptes vivants/abattus', () => {
    it('refuse si liveForSale + toSlaughter > finalCount', async () => {
      prisma.breedingBatch.findUnique.mockResolvedValue({
        id: 'b1',
        status: BreedingBatchStatus.ACTIVE,
        currentCount: 100,
        reference: 'B-2026-001',
        chicksCost: 50000,
        fixedCharges: 0,
      });

      await expect(
        service.close(
          'b1',
          {
            finalCount: 90,
            liveForSale: 60,
            toSlaughter: 40,
            finalAverageWeight: 2.0,
          } as never,
          'user-1',
        ),
      ).rejects.toThrow(/100/);
    });

    it('refuse si la bande est déjà clôturée', async () => {
      prisma.breedingBatch.findUnique.mockResolvedValue({
        id: 'b1',
        status: BreedingBatchStatus.CLOSED,
      });

      await expect(
        service.close(
          'b1',
          { finalCount: 90, finalAverageWeight: 2.0 } as never,
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
