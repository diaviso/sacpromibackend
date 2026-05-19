import { Test, TestingModule } from '@nestjs/testing';
import { SequenceService } from './sequence.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('SequenceService', () => {
  let service: SequenceService;
  let mockPrisma: { sequenceCounter: { upsert: jest.Mock } };

  beforeEach(async () => {
    mockPrisma = {
      sequenceCounter: { upsert: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SequenceService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SequenceService>(SequenceService);
  });

  describe('nextReference', () => {
    it('génère une référence formatée PREFIX-YYYY-0001 au premier appel', async () => {
      mockPrisma.sequenceCounter.upsert.mockResolvedValue({
        prefix: 'BC',
        year: 2026,
        counter: 1,
      });

      const ref = await service.nextReference('BC', 2026);

      expect(ref).toBe('BC-2026-0001');
      expect(mockPrisma.sequenceCounter.upsert).toHaveBeenCalledWith({
        where: { prefix_year: { prefix: 'BC', year: 2026 } },
        create: { prefix: 'BC', year: 2026, counter: 1 },
        update: { counter: { increment: 1 } },
      });
    });

    it('pade à 4 chiffres pour les compteurs > 1', async () => {
      mockPrisma.sequenceCounter.upsert.mockResolvedValue({
        prefix: 'FA',
        year: 2026,
        counter: 42,
      });

      const ref = await service.nextReference('FA', 2026);
      expect(ref).toBe('FA-2026-0042');
    });

    it('gère les très grands compteurs (> 9999)', async () => {
      mockPrisma.sequenceCounter.upsert.mockResolvedValue({
        prefix: 'FAC',
        year: 2026,
        counter: 12345,
      });

      const ref = await service.nextReference('FAC', 2026);
      expect(ref).toBe('FAC-2026-12345');
    });
  });

  describe('currentYear', () => {
    it("renvoie l'année courante", () => {
      const expected = new Date().getFullYear();
      expect(service.currentYear()).toBe(expected);
    });
  });
});
