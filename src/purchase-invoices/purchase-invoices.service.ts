import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/services/sequence.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { RawStockService } from '../raw-stock/raw-stock.service';
import { CreatePurchaseInvoiceDto } from './dto/create-purchase-invoice.dto';
import { QueryPurchaseInvoicesDto } from './dto/query-purchase-invoices.dto';
import { paginate } from '../common/dto/pagination.dto';

@Injectable()
export class PurchaseInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly rawStockService: RawStockService,
  ) {}

  async create(dto: CreatePurchaseInvoiceDto, userId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier || !supplier.isActive) {
      throw new BadRequestException('Fournisseur introuvable ou inactif');
    }

    if (dto.purchaseOrderId) {
      const order = await this.prisma.purchaseOrder.findUnique({
        where: { id: dto.purchaseOrderId },
      });
      if (!order) {
        throw new BadRequestException('Bon de commande introuvable');
      }
      if (order.supplierId !== dto.supplierId) {
        throw new BadRequestException(
          "Le fournisseur de la facture ne correspond pas à celui du bon de commande",
        );
      }
    }

    // Vérifier que toutes les matières existent et sont actives
    const materialIds = Array.from(new Set(dto.items.map((it) => it.rawMaterialId)));
    const materials = await this.prisma.rawMaterial.findMany({
      where: { id: { in: materialIds } },
    });
    if (materials.length !== materialIds.length) {
      throw new BadRequestException(
        "Une ou plusieurs matières premières référencées sont introuvables",
      );
    }
    const inactive = materials.filter((m) => !m.isActive);
    if (inactive.length > 0) {
      throw new BadRequestException(
        `Matières inactives : ${inactive.map((m) => m.name).join(', ')}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const invoiceDate = new Date(dto.invoiceDate);
      const receptionDate = new Date(dto.receptionDate);
      const reference = await this.sequence.nextReference('FA', invoiceDate.getFullYear(), tx);

      const totalAmount = dto.items.reduce(
        (sum, item) => sum + Math.round(item.quantity * item.unitPrice),
        0,
      );
      const totalTransportCost = dto.items.reduce(
        (sum, item) => sum + (item.transportCost ?? 0),
        0,
      );

      const invoice = await tx.purchaseInvoice.create({
        data: {
          reference,
          supplierInvoiceNumber: dto.supplierInvoiceNumber,
          supplierId: dto.supplierId,
          purchaseOrderId: dto.purchaseOrderId,
          invoiceDate,
          receptionDate,
          totalAmount,
          totalTransportCost,
          amountPaid: 0,
          amountRemaining: totalAmount,
          scanUrl: dto.scanUrl,
          createdById: userId,
          items: {
            create: dto.items.map((item) => ({
              rawMaterialId: item.rawMaterialId,
              itemName: item.itemName,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              transportCost: item.transportCost ?? 0,
              lineAmount: Math.round(item.quantity * item.unitPrice),
              lotNumber: item.lotNumber,
              expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
            })),
          },
        },
        include: { items: true, supplier: { select: { id: true, name: true } } },
      });

      // Créer un lot par ligne + entrée stock + recalcul prix moyen pondéré
      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i];
        const lotNumber =
          item.lotNumber ?? `${reference}-L${(i + 1).toString().padStart(2, '0')}`;

        await this.rawStockService.createLotFromPurchase(tx, {
          rawMaterialId: item.rawMaterialId,
          lotNumber,
          purchaseInvoiceId: invoice.id,
          supplierId: dto.supplierId,
          quantity: item.quantity,
          receptionDate,
          expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
          unitAcquisitionPrice: item.unitPrice,
          transportCost: item.transportCost ?? 0,
          userId,
        });
      }

      // MAJ statut BC lié
      if (dto.purchaseOrderId) {
        await this.purchaseOrdersService.updateDeliveryFromInvoice(
          tx,
          dto.purchaseOrderId,
          dto.items.map((it) => ({ itemName: it.itemName, quantity: it.quantity })),
        );
      }

      return invoice;
    });
  }

  async findAll(query: QueryPurchaseInvoicesDto) {
    const where: Prisma.PurchaseInvoiceWhereInput = {};
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.from || query.to) {
      where.invoiceDate = {};
      if (query.from) where.invoiceDate.gte = new Date(query.from);
      if (query.to) where.invoiceDate.lte = new Date(query.to);
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { reference: { contains: term, mode: 'insensitive' } },
        { supplierInvoiceNumber: { contains: term, mode: 'insensitive' } },
        { supplier: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const sortBy = query.sortBy ?? 'invoiceDate';
    const sortOrder = query.sortOrder ?? 'desc';
    const orderBy: Prisma.PurchaseInvoiceOrderByWithRelationInput = { [sortBy]: sortOrder };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseInvoice.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy,
        include: {
          supplier: { select: { id: true, name: true } },
          _count: { select: { items: true, payments: true } },
        },
      }),
      this.prisma.purchaseInvoice.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const invoice = await this.prisma.purchaseInvoice.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            rawMaterial: { select: { id: true, code: true, name: true, unit: true } },
          },
        },
        supplier: true,
        purchaseOrder: { select: { id: true, reference: true, status: true } },
        createdBy: { select: { id: true, fullName: true, email: true } },
        payments: {
          orderBy: { paymentDate: 'desc' },
          include: { createdBy: { select: { id: true, fullName: true } } },
        },
        rawMaterialLots: {
          include: { rawMaterial: { select: { id: true, code: true, name: true } } },
        },
      },
    });
    if (!invoice) {
      throw new NotFoundException(`Facture ${id} introuvable`);
    }
    return invoice;
  }
}
