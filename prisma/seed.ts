import {
  PrismaClient,
  BreedingBatchStatus,
  CustomerPriceCategory,
  CustomerType,
  ExpenseActivity,
  ExpenseStatus,
  FinishedLotSource,
  FinishedProductCategory,
  FinishedProductUnit,
  FinishedStockMovementType,
  InventoryStatus,
  InventoryType,
  LotStatus,
  MeasurementUnit,
  PaymentMethod,
  PaymentStatus,
  ProductionOrderStatus,
  PurchaseOrderStatus,
  RawMaterialCategory,
  RawStockMovementType,
  SaleInvoiceType,
  SalePaymentMethod,
  StockReferenceType,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SALT_ROUNDS = 12;

async function nextRef(prefix: string, year: number): Promise<string> {
  const counter = await prisma.sequenceCounter.upsert({
    where: { prefix_year: { prefix, year } },
    create: { prefix, year, counter: 1 },
    update: { counter: { increment: 1 } },
  });
  return `${prefix}-${year}-${counter.counter.toString().padStart(4, '0')}`;
}

async function main() {
  console.log('🌱 Démarrage du seed (Phases 1 + 2)...');

  // === Cleanup (ordre inverse des dépendances) ===
  // Sprint 7 — Finance & Trésorerie (à nettoyer en premier)
  await prisma.treasuryEntry.deleteMany();
  await prisma.depreciationEntry.deleteMany();
  await prisma.capitalMovement.deleteMany();
  await prisma.fixedAsset.deleteMany();
  await prisma.loanPayment.deleteMany();
  await prisma.loanScheduleItem.deleteMany();
  await prisma.loan.deleteMany();
  await prisma.accountTransfer.deleteMany();
  await prisma.account.deleteMany();

  await prisma.expense.deleteMany();
  await prisma.expenseCategory.deleteMany();
  await prisma.customerPayment.deleteMany();
  await prisma.saleInvoiceItem.deleteMany();
  await prisma.finishedProductPriceHistory.deleteMany();
  await prisma.saleInvoice.deleteMany();
  await prisma.customerOrderItem.deleteMany();
  await prisma.customerOrder.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.breedingRecord.deleteMany();
  await prisma.breedingBatch.deleteMany();
  await prisma.finishedStockMovement.deleteMany();
  await prisma.finishedProductLot.deleteMany();
  await prisma.productionOrder.deleteMany();
  await prisma.formulaItem.deleteMany();
  await prisma.formula.deleteMany();
  await prisma.finishedProduct.deleteMany();
  await prisma.rawStockMovement.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.conservationCost.deleteMany();
  await prisma.rawMaterialLot.deleteMany();
  await prisma.supplierPayment.deleteMany();
  await prisma.purchaseInvoiceItem.deleteMany();
  await prisma.purchaseInvoice.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.rawMaterial.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.user.deleteMany();
  await prisma.sequenceCounter.deleteMany();

  console.log('🧹 Tables nettoyées');

  // === Utilisateurs ===
  const directorPassword = await bcrypt.hash('Admin123!', SALT_ROUNDS);
  const operatorPassword = await bcrypt.hash('Oper123!', SALT_ROUNDS);

  const director = await prisma.user.create({
    data: {
      email: 'admin@sacpromi.sn',
      password: directorPassword,
      fullName: 'Mamadou Diop',
      phone: '+221 77 100 00 01',
      role: UserRole.DIRECTOR,
    },
  });

  const operator = await prisma.user.create({
    data: {
      email: 'operateur@sacpromi.sn',
      password: operatorPassword,
      fullName: 'Ibrahima Sall',
      phone: '+221 77 100 00 02',
      role: UserRole.OPERATOR,
    },
  });

  console.log(`👤 Utilisateurs créés : ${director.email}, ${operator.email}`);

  // === Sprint 7 — Comptes de trésorerie par défaut ===
  const cashAccount = await prisma.account.create({
    data: {
      name: 'Caisse principale',
      type: 'CASH',
      openingBalance: 0,
      currency: 'XOF',
      createdById: director.id,
      note: 'Compte par défaut pour les paiements et dépenses en espèces',
    },
  });
  const bankAccount = await prisma.account.create({
    data: {
      name: 'Compte CBAO',
      type: 'BANK',
      bankName: 'CBAO',
      accountNumber: 'SN012 12345 67890123456789 12',
      openingBalance: 0,
      currency: 'XOF',
      createdById: director.id,
    },
  });
  const waveAccount = await prisma.account.create({
    data: {
      name: 'Compte Wave',
      type: 'MOBILE_MONEY',
      accountNumber: '+221 77 100 00 01',
      openingBalance: 0,
      currency: 'XOF',
      createdById: director.id,
    },
  });
  console.log(`💰 3 comptes de trésorerie créés : ${cashAccount.name}, ${bankAccount.name}, ${waveAccount.name}`);

  // === Fournisseurs ===
  const cerealesKaolack = await prisma.supplier.create({
    data: {
      name: 'Grossiste Céréales Kaolack',
      phone: '+221 77 200 11 11',
      address: 'Marché central, Kaolack, Sénégal',
      email: 'cereales.kaolack@example.sn',
      productsSupplied: 'Maïs jaune, sorgho, mil',
    },
  });
  const pecherieJoal = await prisma.supplier.create({
    data: {
      name: 'Pêcherie Joal',
      phone: '+221 77 200 22 22',
      address: 'Port de Joal-Fadiouth, Sénégal',
      productsSupplied: 'Farine de poisson, déchets de poisson séchés',
    },
  });
  const coopArachide = await prisma.supplier.create({
    data: {
      name: 'Coopérative Arachide Diourbel',
      phone: '+221 77 200 33 33',
      address: 'Diourbel, Sénégal',
      email: 'coop.arachide.diourbel@example.sn',
      productsSupplied: "Tourteau d'arachide, huile d'arachide",
    },
  });
  const soyImport = await prisma.supplier.create({
    data: {
      name: 'SoyImport Dakar',
      phone: '+221 77 200 44 44',
      address: 'Zone Industrielle, Dakar, Sénégal',
      email: 'soyimport@example.sn',
      productsSupplied: 'Tourteau de soja importé',
    },
  });
  const premixPro = await prisma.supplier.create({
    data: {
      name: 'PréMix Pro Thiès',
      phone: '+221 77 200 55 55',
      address: 'Thiès, Sénégal',
      email: 'premix.pro@example.sn',
      productsSupplied: 'Prémix pondeuse, prémix chair, sel, phosphate, coquillages broyés',
    },
  });
  console.log('🏭 5 fournisseurs créés');

  // === Matières premières ===
  type RawMatSeed = {
    code: string;
    name: string;
    category: RawMaterialCategory;
    unit: MeasurementUnit;
    alertThreshold: number;
  };
  const rawMaterialsSeed: RawMatSeed[] = [
    { code: 'MAIS-J', name: 'Maïs jaune', category: RawMaterialCategory.CEREALS, unit: MeasurementUnit.KG, alertThreshold: 500 },
    { code: 'SORGHO', name: 'Sorgho', category: RawMaterialCategory.CEREALS, unit: MeasurementUnit.KG, alertThreshold: 300 },
    { code: 'MIL', name: 'Mil', category: RawMaterialCategory.CEREALS, unit: MeasurementUnit.KG, alertThreshold: 200 },
    { code: 'TRT-ARA', name: "Tourteau d'arachide", category: RawMaterialCategory.PROTEINS, unit: MeasurementUnit.KG, alertThreshold: 400 },
    { code: 'TRT-SOJ', name: 'Tourteau de soja', category: RawMaterialCategory.PROTEINS, unit: MeasurementUnit.KG, alertThreshold: 300 },
    { code: 'FAR-POI', name: 'Farine de poisson', category: RawMaterialCategory.PROTEINS, unit: MeasurementUnit.KG, alertThreshold: 100 },
    { code: 'SON-BLE', name: 'Son de blé', category: RawMaterialCategory.CEREALS, unit: MeasurementUnit.KG, alertThreshold: 200 },
    { code: 'PMX-POND', name: 'Prémix pondeuse', category: RawMaterialCategory.PREMIX_MINERALS, unit: MeasurementUnit.KG, alertThreshold: 50 },
    { code: 'PMX-CHA', name: 'Prémix chair', category: RawMaterialCategory.PREMIX_MINERALS, unit: MeasurementUnit.KG, alertThreshold: 50 },
    { code: 'COQ-BR', name: 'Coquillages broyés', category: RawMaterialCategory.PREMIX_MINERALS, unit: MeasurementUnit.KG, alertThreshold: 100 },
    { code: 'PHO-BIC', name: 'Phosphate bicalcique', category: RawMaterialCategory.PREMIX_MINERALS, unit: MeasurementUnit.KG, alertThreshold: 50 },
    { code: 'SEL', name: 'Sel', category: RawMaterialCategory.PREMIX_MINERALS, unit: MeasurementUnit.KG, alertThreshold: 30 },
  ];

  const rawMatsByCode = new Map<string, { id: string; name: string }>();
  for (const m of rawMaterialsSeed) {
    const created = await prisma.rawMaterial.create({ data: m });
    rawMatsByCode.set(m.code, { id: created.id, name: created.name });
  }
  console.log(`🌾 ${rawMaterialsSeed.length} matières premières créées`);

  const get = (code: string) => {
    const m = rawMatsByCode.get(code);
    if (!m) throw new Error(`Matière ${code} introuvable`);
    return m;
  };

  // === Bons de commande ===
  const bc1Items = [
    { itemName: 'Maïs jaune', unit: 'kg', quantityOrdered: 2000, unitPriceEstimate: 250, rawMaterialId: get('MAIS-J').id },
    { itemName: 'Sorgho', unit: 'kg', quantityOrdered: 1000, unitPriceEstimate: 220, rawMaterialId: get('SORGHO').id },
  ];
  const bc1 = await prisma.purchaseOrder.create({
    data: {
      reference: await nextRef('BC', 2026),
      supplierId: cerealesKaolack.id,
      orderDate: new Date('2026-04-15'),
      expectedDate: new Date('2026-04-25'),
      status: PurchaseOrderStatus.DRAFT,
      note: 'Commande mensuelle céréales',
      totalAmount: bc1Items.reduce((s, i) => s + Math.round(i.quantityOrdered * i.unitPriceEstimate), 0),
      createdById: director.id,
      items: { create: bc1Items.map((i) => ({ ...i, lineAmount: Math.round(i.quantityOrdered * i.unitPriceEstimate) })) },
    },
  });

  const bc2Items = [
    { itemName: 'Farine de poisson', unit: 'kg', quantityOrdered: 500, unitPriceEstimate: 800, rawMaterialId: get('FAR-POI').id },
  ];
  const bc2 = await prisma.purchaseOrder.create({
    data: {
      reference: await nextRef('BC', 2026),
      supplierId: pecherieJoal.id,
      orderDate: new Date('2026-04-10'),
      expectedDate: new Date('2026-04-18'),
      status: PurchaseOrderStatus.VALIDATED,
      totalAmount: bc2Items.reduce((s, i) => s + Math.round(i.quantityOrdered * i.unitPriceEstimate), 0),
      createdById: director.id,
      items: { create: bc2Items.map((i) => ({ ...i, lineAmount: Math.round(i.quantityOrdered * i.unitPriceEstimate) })) },
    },
  });

  const bc3Items = [
    { itemName: "Tourteau d'arachide", unit: 'kg', quantityOrdered: 1500, unitPriceEstimate: 350, rawMaterialId: get('TRT-ARA').id },
  ];
  const bc3 = await prisma.purchaseOrder.create({
    data: {
      reference: await nextRef('BC', 2026),
      supplierId: coopArachide.id,
      orderDate: new Date('2026-03-25'),
      expectedDate: new Date('2026-04-02'),
      status: PurchaseOrderStatus.VALIDATED,
      totalAmount: bc3Items.reduce((s, i) => s + Math.round(i.quantityOrdered * i.unitPriceEstimate), 0),
      createdById: director.id,
      items: { create: bc3Items.map((i) => ({ ...i, lineAmount: Math.round(i.quantityOrdered * i.unitPriceEstimate) })) },
    },
  });

  console.log(`📋 3 bons de commande créés : ${bc1.reference}, ${bc2.reference}, ${bc3.reference}`);

  // === Helper : créer une facture d'achat avec lots, mouvements et MAJ stock + prix moyen pondéré ===
  type InvoiceItemSeed = {
    rawMaterialCode: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    transportCost?: number;
    lotNumber?: string;
    expirationDate?: Date;
  };

  async function createInvoiceWithStockEntry(params: {
    supplierInvoiceNumber: string;
    supplierId: string;
    purchaseOrderId?: string;
    invoiceDate: Date;
    receptionDate: Date;
    paymentStatus: PaymentStatus;
    amountPaid: number;
    items: InvoiceItemSeed[];
    createdById: string;
  }) {
    const reference = await nextRef('FA', params.invoiceDate.getFullYear());
    const totalAmount = params.items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice), 0);
    const totalTransportCost = params.items.reduce((s, i) => s + (i.transportCost ?? 0), 0);

    const invoice = await prisma.purchaseInvoice.create({
      data: {
        reference,
        supplierInvoiceNumber: params.supplierInvoiceNumber,
        supplierId: params.supplierId,
        purchaseOrderId: params.purchaseOrderId,
        invoiceDate: params.invoiceDate,
        receptionDate: params.receptionDate,
        totalAmount,
        totalTransportCost,
        amountPaid: params.amountPaid,
        amountRemaining: totalAmount - params.amountPaid,
        paymentStatus: params.paymentStatus,
        createdById: params.createdById,
        items: {
          create: params.items.map((it) => {
            const m = get(it.rawMaterialCode);
            return {
              rawMaterialId: m.id,
              itemName: m.name,
              quantity: it.quantity,
              unit: it.unit,
              unitPrice: it.unitPrice,
              transportCost: it.transportCost ?? 0,
              lineAmount: Math.round(it.quantity * it.unitPrice),
              lotNumber: it.lotNumber,
              expirationDate: it.expirationDate ?? null,
            };
          }),
        },
      },
    });

    for (let i = 0; i < params.items.length; i++) {
      const it = params.items[i];
      const m = get(it.rawMaterialCode);
      const lotNumber = it.lotNumber ?? `${reference}-L${(i + 1).toString().padStart(2, '0')}`;

      const lot = await prisma.rawMaterialLot.create({
        data: {
          lotNumber,
          rawMaterialId: m.id,
          purchaseInvoiceId: invoice.id,
          supplierId: params.supplierId,
          initialQuantity: it.quantity,
          remainingQuantity: it.quantity,
          receptionDate: params.receptionDate,
          expirationDate: it.expirationDate ?? null,
          unitAcquisitionPrice: it.unitPrice,
          transportCost: it.transportCost ?? 0,
          status: LotStatus.ACTIVE,
        },
      });

      await prisma.rawStockMovement.create({
        data: {
          rawMaterialId: m.id,
          lotId: lot.id,
          type: RawStockMovementType.ENTRY_PURCHASE,
          quantity: it.quantity,
          movementDate: params.receptionDate,
          referenceType: StockReferenceType.PURCHASE_INVOICE,
          referenceId: invoice.id,
          createdById: params.createdById,
        },
      });

      // Recalcul prix moyen pondéré + MAJ stock
      const before = await prisma.rawMaterial.findUnique({ where: { id: m.id } });
      if (!before) continue;
      const oldStock = Number(before.currentStock);
      const oldAvg = before.averagePrice;
      const newQty = it.quantity;
      const unitCost = it.unitPrice + (it.transportCost ?? 0) / Math.max(newQty, 1);
      const newAvg =
        oldStock + newQty > 0
          ? Math.round((oldStock * oldAvg + newQty * unitCost) / (oldStock + newQty))
          : Math.round(unitCost);

      await prisma.rawMaterial.update({
        where: { id: m.id },
        data: { currentStock: { increment: newQty }, averagePrice: newAvg },
      });
    }

    return invoice;
  }

  // === Factures + lots ===
  const fa1 = await createInvoiceWithStockEntry({
    supplierInvoiceNumber: 'COOP-ARA-2026-042',
    supplierId: coopArachide.id,
    purchaseOrderId: bc3.id,
    invoiceDate: new Date('2026-04-02'),
    receptionDate: new Date('2026-04-02'),
    paymentStatus: PaymentStatus.PAID,
    amountPaid: 525000,
    createdById: director.id,
    items: [
      {
        rawMaterialCode: 'TRT-ARA',
        quantity: 1500,
        unit: 'kg',
        unitPrice: 350,
        transportCost: 15000,
        lotNumber: 'ARA-2026-001',
        expirationDate: new Date('2027-03-25'),
      },
    ],
  });
  await prisma.purchaseOrderItem.updateMany({ where: { purchaseOrderId: bc3.id }, data: { quantityDelivered: 1500 } });
  await prisma.purchaseOrder.update({ where: { id: bc3.id }, data: { status: PurchaseOrderStatus.DELIVERED } });
  await prisma.supplierPayment.create({
    data: {
      purchaseInvoiceId: fa1.id,
      amount: 525000,
      paymentDate: new Date('2026-04-05'),
      paymentMethod: PaymentMethod.TRANSFER,
      note: 'Virement bancaire',
      createdById: director.id,
    },
  });

  const fa2 = await createInvoiceWithStockEntry({
    supplierInvoiceNumber: 'PMX-PRO-2026-103',
    supplierId: premixPro.id,
    invoiceDate: new Date('2026-04-12'),
    receptionDate: new Date('2026-04-13'),
    paymentStatus: PaymentStatus.PARTIALLY_PAID,
    amountPaid: 300000,
    createdById: director.id,
    items: [
      {
        rawMaterialCode: 'PMX-POND',
        quantity: 200,
        unit: 'kg',
        unitPrice: 1500,
        lotNumber: 'PMX-2026-007',
        expirationDate: new Date('2027-04-10'),
      },
      {
        rawMaterialCode: 'PMX-CHA',
        quantity: 200,
        unit: 'kg',
        unitPrice: 1600,
        lotNumber: 'PMX-2026-008',
        expirationDate: new Date('2027-04-10'),
      },
      {
        rawMaterialCode: 'PHO-BIC',
        quantity: 100,
        unit: 'kg',
        unitPrice: 750,
        lotNumber: 'PHO-2026-002',
      },
    ],
  });
  await prisma.supplierPayment.create({
    data: {
      purchaseInvoiceId: fa2.id,
      amount: 300000,
      paymentDate: new Date('2026-04-13'),
      paymentMethod: PaymentMethod.WAVE,
      note: 'Acompte à la livraison',
      createdById: director.id,
    },
  });

  await createInvoiceWithStockEntry({
    supplierInvoiceNumber: 'SOY-2026-088',
    supplierId: soyImport.id,
    invoiceDate: new Date('2026-04-20'),
    receptionDate: new Date('2026-04-21'),
    paymentStatus: PaymentStatus.UNPAID,
    amountPaid: 0,
    createdById: director.id,
    items: [
      {
        rawMaterialCode: 'TRT-SOJ',
        quantity: 1000,
        unit: 'kg',
        unitPrice: 480,
        transportCost: 12000,
        lotNumber: 'SOJ-2026-014',
        expirationDate: new Date('2027-02-20'),
      },
    ],
  });

  await createInvoiceWithStockEntry({
    supplierInvoiceNumber: 'CER-KAO-2026-019',
    supplierId: cerealesKaolack.id,
    invoiceDate: new Date('2026-02-15'),
    receptionDate: new Date('2026-02-16'),
    paymentStatus: PaymentStatus.UNPAID,
    amountPaid: 0,
    createdById: operator.id,
    items: [
      {
        rawMaterialCode: 'MAIS-J',
        quantity: 1500,
        unit: 'kg',
        unitPrice: 245,
        lotNumber: 'MAI-2026-003',
        expirationDate: new Date('2026-12-15'),
      },
      {
        rawMaterialCode: 'MIL',
        quantity: 500,
        unit: 'kg',
        unitPrice: 290,
        lotNumber: 'MIL-2026-001',
        expirationDate: new Date('2026-12-15'),
      },
    ],
  });

  // Stock complémentaire pour avoir des références cohérentes
  await createInvoiceWithStockEntry({
    supplierInvoiceNumber: 'PEC-JOA-2026-027',
    supplierId: pecherieJoal.id,
    invoiceDate: new Date('2026-04-08'),
    receptionDate: new Date('2026-04-09'),
    paymentStatus: PaymentStatus.PAID,
    amountPaid: 400000,
    createdById: director.id,
    items: [
      {
        rawMaterialCode: 'FAR-POI',
        quantity: 500,
        unit: 'kg',
        unitPrice: 800,
        transportCost: 8000,
        lotNumber: 'POI-2026-005',
        expirationDate: new Date('2026-10-09'),
      },
    ],
  });
  await prisma.purchaseOrderItem.updateMany({ where: { purchaseOrderId: bc2.id }, data: { quantityDelivered: 500 } });
  await prisma.purchaseOrder.update({ where: { id: bc2.id }, data: { status: PurchaseOrderStatus.DELIVERED } });

  // Stock supplémentaire pour mettre certaines matières près du seuil d'alerte
  await createInvoiceWithStockEntry({
    supplierInvoiceNumber: 'CER-KAO-2026-022',
    supplierId: cerealesKaolack.id,
    invoiceDate: new Date('2026-04-22'),
    receptionDate: new Date('2026-04-22'),
    paymentStatus: PaymentStatus.PAID,
    amountPaid: 240000,
    createdById: director.id,
    items: [
      {
        rawMaterialCode: 'SORGHO',
        quantity: 350,
        unit: 'kg',
        unitPrice: 220,
        lotNumber: 'SOR-2026-001',
        expirationDate: new Date('2026-11-22'),
      },
      {
        rawMaterialCode: 'SON-BLE',
        quantity: 800,
        unit: 'kg',
        unitPrice: 180,
        lotNumber: 'SON-2026-001',
        expirationDate: new Date('2026-08-22'),
      },
    ],
  });

  // Petit stock initial pour COQ-BR et SEL (sous le seuil pour générer alerte)
  await createInvoiceWithStockEntry({
    supplierInvoiceNumber: 'PMX-PRO-2026-110',
    supplierId: premixPro.id,
    invoiceDate: new Date('2026-04-05'),
    receptionDate: new Date('2026-04-05'),
    paymentStatus: PaymentStatus.PAID,
    amountPaid: 110000,
    createdById: director.id,
    items: [
      {
        rawMaterialCode: 'COQ-BR',
        quantity: 80,
        unit: 'kg',
        unitPrice: 400,
        lotNumber: 'COQ-2026-001',
      },
      {
        rawMaterialCode: 'SEL',
        quantity: 25,
        unit: 'kg',
        unitPrice: 250,
        lotNumber: 'SEL-2026-001',
      },
    ],
  });

  console.log(`🧾 7 factures d'achat créées avec lots et mouvements de stock`);

  // === Inventaire validé avec écarts ===
  const inventoryRef = await nextRef('INV', 2026);
  const sorghoMat = get('SORGHO');
  const milMat = get('MIL');
  const sorghoStock = await prisma.rawMaterial.findUnique({ where: { id: sorghoMat.id } });
  const milStock = await prisma.rawMaterial.findUnique({ where: { id: milMat.id } });

  if (sorghoStock && milStock) {
    const sorghoTheoretical = Number(sorghoStock.currentStock);
    const milTheoretical = Number(milStock.currentStock);
    const sorghoActual = sorghoTheoretical - 5; // perte légère
    const milActual = milTheoretical - 30; // écart > 5%

    const inventory = await prisma.inventory.create({
      data: {
        reference: inventoryRef,
        type: InventoryType.RAW_MATERIAL,
        inventoryDate: new Date('2026-04-25'),
        status: InventoryStatus.VALIDATED,
        note: 'Inventaire mensuel partiel (céréales) — quelques écarts mineurs',
        createdById: director.id,
        items: {
          create: [
            {
              rawMaterialId: sorghoMat.id,
              theoreticalStock: sorghoTheoretical,
              actualStock: sorghoActual,
              variance: sorghoActual - sorghoTheoretical,
              variancePercent:
                sorghoTheoretical > 0
                  ? Math.round(((sorghoActual - sorghoTheoretical) / sorghoTheoretical) * 10000) / 100
                  : 0,
            },
            {
              rawMaterialId: milMat.id,
              theoreticalStock: milTheoretical,
              actualStock: milActual,
              variance: milActual - milTheoretical,
              variancePercent:
                milTheoretical > 0
                  ? Math.round(((milActual - milTheoretical) / milTheoretical) * 10000) / 100
                  : 0,
            },
          ],
        },
      },
    });

    // Ajustements via mouvements + MAJ stock
    for (const [matId, delta] of [
      [sorghoMat.id, sorghoActual - sorghoTheoretical],
      [milMat.id, milActual - milTheoretical],
    ] as [string, number][]) {
      if (delta < 0) {
        // FIFO sur le lot le plus ancien actif
        const lots = await prisma.rawMaterialLot.findMany({
          where: { rawMaterialId: matId, status: LotStatus.ACTIVE, remainingQuantity: { gt: 0 } },
          orderBy: { receptionDate: 'asc' },
        });
        let toRemove = Math.abs(delta);
        for (const lot of lots) {
          if (toRemove <= 0) break;
          const take = Math.min(Number(lot.remainingQuantity), toRemove);
          const newRem = Number(lot.remainingQuantity) - take;
          await prisma.rawMaterialLot.update({
            where: { id: lot.id },
            data: {
              remainingQuantity: newRem,
              status: newRem <= 0 ? LotStatus.DEPLETED : LotStatus.ACTIVE,
            },
          });
          await prisma.rawStockMovement.create({
            data: {
              rawMaterialId: matId,
              lotId: lot.id,
              type: RawStockMovementType.ADJUSTMENT,
              quantity: -take,
              referenceType: StockReferenceType.INVENTORY,
              referenceId: inventory.id,
              reason: `Ajustement inventaire ${inventory.reference}`,
              createdById: director.id,
            },
          });
          toRemove -= take;
        }
      }
      await prisma.rawMaterial.update({
        where: { id: matId },
        data: { currentStock: { increment: delta } },
      });
    }

    console.log(`📦 Inventaire validé : ${inventory.reference} (2 lignes, écarts traités)`);
  }

  // === Coût de conservation avril 2026 ===
  await prisma.conservationCost.create({
    data: {
      periodStart: new Date('2026-04-01'),
      periodEnd: new Date('2026-04-30'),
      totalAmount: 75000,
      note: 'Stockage + manutention magasin matières premières',
      createdById: director.id,
    },
  });
  console.log('💰 Coût de conservation Avril 2026 enregistré (75 000 FCFA)');

  // ==========================================================================
  // PHASE 3 — Produits finis, formules, ordres de production
  // ==========================================================================

  // Produits finis : 6 aliments en sacs 50 kg + 2 poulets (stock vide)
  const pf = {
    pccDem: await prisma.finishedProduct.create({
      data: {
        code: 'ALI-PCC-DEM-50',
        name: 'Aliment poulet chair démarrage (sac 50 kg)',
        category: FinishedProductCategory.POULTRY_FEED,
        unit: FinishedProductUnit.BAG_50KG,
        wholesalePrice: 18500,
        retailPrice: 19500,
        alertThreshold: 30,
      },
    }),
    pccCro: await prisma.finishedProduct.create({
      data: {
        code: 'ALI-PCC-CRO-50',
        name: 'Aliment poulet chair croissance (sac 50 kg)',
        category: FinishedProductCategory.POULTRY_FEED,
        unit: FinishedProductUnit.BAG_50KG,
        wholesalePrice: 18000,
        retailPrice: 19000,
        alertThreshold: 30,
      },
    }),
    pccFin: await prisma.finishedProduct.create({
      data: {
        code: 'ALI-PCC-FIN-50',
        name: 'Aliment poulet chair finition (sac 50 kg)',
        category: FinishedProductCategory.POULTRY_FEED,
        unit: FinishedProductUnit.BAG_50KG,
        wholesalePrice: 17500,
        retailPrice: 18500,
        alertThreshold: 30,
      },
    }),
    pondPonte: await prisma.finishedProduct.create({
      data: {
        code: 'ALI-POND-50',
        name: 'Aliment pondeuse ponte (sac 50 kg)',
        category: FinishedProductCategory.POULTRY_FEED,
        unit: FinishedProductUnit.BAG_50KG,
        wholesalePrice: 17800,
        retailPrice: 18800,
        alertThreshold: 30,
      },
    }),
    betEng: await prisma.finishedProduct.create({
      data: {
        code: 'ALI-BET-ENG-50',
        name: 'Aliment bétail engraissement (sac 50 kg)',
        category: FinishedProductCategory.CATTLE_FEED,
        unit: FinishedProductUnit.BAG_50KG,
        wholesalePrice: 16500,
        retailPrice: 17500,
        alertThreshold: 20,
      },
    }),
    betEnt: await prisma.finishedProduct.create({
      data: {
        code: 'ALI-BET-ENT-50',
        name: 'Aliment bétail entretien (sac 50 kg)',
        category: FinishedProductCategory.CATTLE_FEED,
        unit: FinishedProductUnit.BAG_50KG,
        wholesalePrice: 15500,
        retailPrice: 16500,
        alertThreshold: 20,
      },
    }),
    pVivant: await prisma.finishedProduct.create({
      data: {
        code: 'POULET-VIVANT',
        name: 'Poulet de chair vivant',
        category: FinishedProductCategory.LIVE_CHICKEN,
        unit: FinishedProductUnit.HEAD,
        wholesalePrice: 4500,
        retailPrice: 5000,
        alertThreshold: 0,
      },
    }),
    pAbattu: await prisma.finishedProduct.create({
      data: {
        code: 'POULET-ABATTU',
        name: 'Poulet abattu',
        category: FinishedProductCategory.SLAUGHTERED_CHICKEN,
        unit: FinishedProductUnit.KG,
        wholesalePrice: 3200,
        retailPrice: 3500,
        alertThreshold: 0,
      },
    }),
  };
  console.log('🐔 8 produits finis créés (6 aliments + 2 poulets)');

  // Helpers pour formules : référence aux matières par code
  function pickMat(code: string) {
    const m = rawMatsByCode.get(code);
    if (!m) throw new Error(`Matière ${code} non trouvée pour formule`);
    return m;
  }

  async function createFormulaWithItems(opts: {
    finishedProductId: string;
    name: string;
    productionUnit: string;
    unitWeightKg: number;
    isActive: boolean;
    items: Array<{ code: string; quantity: number }>;
  }) {
    const total = opts.items.reduce((s, it) => s + it.quantity, 0);
    return prisma.formula.create({
      data: {
        finishedProductId: opts.finishedProductId,
        name: opts.name,
        version: 1,
        productionUnit: opts.productionUnit,
        unitWeightKg: opts.unitWeightKg,
        isActive: opts.isActive,
        items: {
          create: opts.items.map((it) => ({
            rawMaterialId: pickMat(it.code).id,
            quantity: it.quantity,
            proportion: Math.round((it.quantity / total) * 10000) / 100,
          })),
        },
      },
    });
  }

  // Formules pour 1 tonne (1000 kg) — recettes réalistes
  const formulaPCC = await createFormulaWithItems({
    finishedProductId: pf.pccCro.id,
    name: 'Poulet chair croissance — 1 tonne',
    productionUnit: '1 tonne',
    unitWeightKg: 1000,
    isActive: true,
    items: [
      { code: 'MAIS-J', quantity: 550 },
      { code: 'TRT-SOJ', quantity: 200 },
      { code: 'FAR-POI', quantity: 80 },
      { code: 'SON-BLE', quantity: 100 },
      { code: 'PMX-CHA', quantity: 30 },
      { code: 'COQ-BR', quantity: 25 },
      { code: 'PHO-BIC', quantity: 15 },
    ],
  });

  await createFormulaWithItems({
    finishedProductId: pf.pccDem.id,
    name: 'Poulet chair démarrage — 1 tonne',
    productionUnit: '1 tonne',
    unitWeightKg: 1000,
    isActive: true,
    items: [
      { code: 'MAIS-J', quantity: 500 },
      { code: 'TRT-SOJ', quantity: 250 },
      { code: 'FAR-POI', quantity: 100 },
      { code: 'SON-BLE', quantity: 80 },
      { code: 'PMX-CHA', quantity: 40 },
      { code: 'COQ-BR', quantity: 20 },
      { code: 'PHO-BIC', quantity: 10 },
    ],
  });

  await createFormulaWithItems({
    finishedProductId: pf.pondPonte.id,
    name: 'Pondeuse ponte — 1 tonne',
    productionUnit: '1 tonne',
    unitWeightKg: 1000,
    isActive: true,
    items: [
      { code: 'MAIS-J', quantity: 580 },
      { code: 'TRT-ARA', quantity: 150 },
      { code: 'TRT-SOJ', quantity: 100 },
      { code: 'FAR-POI', quantity: 60 },
      { code: 'SON-BLE', quantity: 40 },
      { code: 'PMX-POND', quantity: 30 },
      { code: 'COQ-BR', quantity: 30 },
      { code: 'PHO-BIC', quantity: 10 },
    ],
  });

  await createFormulaWithItems({
    finishedProductId: pf.betEng.id,
    name: 'Bétail engraissement — 1 tonne',
    productionUnit: '1 tonne',
    unitWeightKg: 1000,
    isActive: true,
    items: [
      { code: 'MAIS-J', quantity: 400 },
      { code: 'SORGHO', quantity: 200 },
      { code: 'TRT-ARA', quantity: 250 },
      { code: 'SON-BLE', quantity: 100 },
      { code: 'COQ-BR', quantity: 30 },
      { code: 'SEL', quantity: 20 },
    ],
  });

  console.log('📐 4 formules de fabrication créées');

  // 2 ordres de production complétés (consomme MP, génère PF + lots)
  async function completeProduction(opts: {
    formulaId: string;
    finishedProductId: string;
    productionUnitName: string;
    targetQty: number;
    producedQty: number;
    productionDate: Date;
    expirationDate: Date;
    transformationCost: number;
  }) {
    const reference = await nextRef('OP', opts.productionDate.getFullYear());

    // Récupérer la formule + items
    const formula = await prisma.formula.findUniqueOrThrow({
      where: { id: opts.formulaId },
      include: { items: true },
    });

    let totalMaterialsCost = 0;

    // Consommer chaque matière (FIFO simplifié)
    for (const item of formula.items) {
      const consumeQty = Number(item.quantity) * opts.producedQty;
      const lots = await prisma.rawMaterialLot.findMany({
        where: {
          rawMaterialId: item.rawMaterialId,
          status: LotStatus.ACTIVE,
          remainingQuantity: { gt: 0 },
        },
        orderBy: [{ receptionDate: 'asc' }],
      });

      let toConsume = consumeQty;
      for (const lot of lots) {
        if (toConsume <= 0) break;
        const take = Math.min(Number(lot.remainingQuantity), toConsume);
        const newRem = Number(lot.remainingQuantity) - take;
        await prisma.rawMaterialLot.update({
          where: { id: lot.id },
          data: {
            remainingQuantity: newRem,
            status: newRem <= 0 ? LotStatus.DEPLETED : LotStatus.ACTIVE,
          },
        });
        await prisma.rawStockMovement.create({
          data: {
            rawMaterialId: item.rawMaterialId,
            lotId: lot.id,
            type: RawStockMovementType.EXIT_PRODUCTION,
            quantity: -take,
            movementDate: opts.productionDate,
            referenceType: StockReferenceType.PRODUCTION_ORDER,
            referenceId: reference, // sera updaté avec l'ID après création de l'ordre
            createdById: director.id,
          },
        });
        totalMaterialsCost += Math.round(take * lot.unitAcquisitionPrice);
        toConsume -= take;
      }

      if (toConsume > 0) {
        // Stock insuffisant : on stoppe sans créer l'ordre — pour le seed on ignore juste
        console.warn(
          `⚠️ Stock insuffisant pour matière ${item.rawMaterialId} dans le seed (manque ${toConsume})`,
        );
        return null;
      }

      await prisma.rawMaterial.update({
        where: { id: item.rawMaterialId },
        data: { currentStock: { decrement: consumeQty } },
      });
    }

    const totalCost = totalMaterialsCost + opts.transformationCost;
    const unitCost = Math.round(totalCost / opts.producedQty);
    const productionLoss = opts.targetQty > opts.producedQty ? opts.targetQty - opts.producedQty : 0;

    const order = await prisma.productionOrder.create({
      data: {
        reference,
        formulaId: opts.formulaId,
        finishedProductId: opts.finishedProductId,
        targetQuantity: opts.targetQty,
        producedQuantity: opts.producedQty,
        productionLoss,
        productionDate: opts.productionDate,
        expirationDate: opts.expirationDate,
        status: ProductionOrderStatus.COMPLETED,
        totalMaterialsCost,
        transformationCost: opts.transformationCost,
        totalCost,
        unitCost,
        createdById: director.id,
      },
    });

    // Créer le lot PF + entrée stock
    const lotNumber = `${reference}-L01`;
    const lot = await prisma.finishedProductLot.create({
      data: {
        lotNumber,
        finishedProductId: opts.finishedProductId,
        source: FinishedLotSource.PRODUCTION,
        productionOrderId: order.id,
        initialQuantity: opts.producedQty,
        remainingQuantity: opts.producedQty,
        manufactureDate: opts.productionDate,
        expirationDate: opts.expirationDate,
        unitCost,
        status: LotStatus.ACTIVE,
      },
    });

    await prisma.finishedStockMovement.create({
      data: {
        finishedProductId: opts.finishedProductId,
        lotId: lot.id,
        type: FinishedStockMovementType.ENTRY_PRODUCTION,
        quantity: opts.producedQty,
        movementDate: opts.productionDate,
        referenceType: StockReferenceType.PRODUCTION_ORDER,
        referenceId: order.id,
        createdById: director.id,
      },
    });

    // MAJ stock + coût moyen pondéré PF
    const product = await prisma.finishedProduct.findUniqueOrThrow({
      where: { id: opts.finishedProductId },
    });
    const oldStock = Number(product.currentStock);
    const oldAvg = product.averageCost;
    const newQty = opts.producedQty;
    const newAvg =
      oldStock + newQty > 0
        ? Math.round((oldStock * oldAvg + newQty * unitCost) / (oldStock + newQty))
        : unitCost;
    await prisma.finishedProduct.update({
      where: { id: opts.finishedProductId },
      data: {
        currentStock: { increment: newQty },
        averageCost: newAvg,
      },
    });

    return order;
  }

  // Production 1 : 2 tonnes d'aliment poulet chair croissance
  // (la formule produit 1 tonne par unité — donc 2 unités = 2 tonnes = 40 sacs de 50 kg)
  // Mais notre PF est "sac 50 kg", donc 2 tonnes = 40 sacs.
  // Pour rester cohérent : la formule définit 1 tonne (1000 kg de mélange) → on convertit en sacs.
  // On utilise targetQty/producedQty = 40 (sacs) avec une "formula unitWeight" 50kg/sac.
  // Pour simplifier le seed, on garde la formule sur 1 tonne mais on produit l'équivalent en sacs.
  // Note : la cohérence stricte sera affinée en démo. Ici on simule producedQty = 40 sacs et la formule consomme proportionnellement.
  const op1 = await completeProduction({
    formulaId: formulaPCC.id,
    finishedProductId: pf.pccCro.id,
    productionUnitName: '1 tonne',
    targetQty: 1, // 1 tonne (= 20 sacs équivalents pour la facture)
    producedQty: 1,
    productionDate: new Date('2026-04-22'),
    expirationDate: new Date('2026-08-22'),
    transformationCost: 35000,
  });

  if (op1) {
    console.log(
      `🏭 Ordre de production OP-2026-0001 (poulet chair croissance) clôturé : ${op1.unitCost} FCFA/unité`,
    );
  }

  // ==========================================================================
  // PHASE 4 — Élevage
  // ==========================================================================
  const breedingActive = await prisma.breedingBatch.create({
    data: {
      reference: await nextRef('B', 2026),
      startDate: new Date('2026-04-01'),
      strain: 'Cobb 500',
      initialCount: 1000,
      currentCount: 985,
      chickSupplier: 'Coopérative Avicole Thiès',
      chicksCost: 350000,
      fixedCharges: 50000,
      averageWeight: 0.85,
      status: BreedingBatchStatus.ACTIVE,
      createdById: director.id,
    },
  });

  // Quelques relevés sur la bande active (sans consommation stock pour seed simplifié)
  for (let day = 7; day <= 28; day += 7) {
    await prisma.breedingRecord.create({
      data: {
        breedingBatchId: breedingActive.id,
        recordDate: new Date(2026, 3, day), // Avril
        mortality: day === 7 ? 8 : day === 14 ? 4 : day === 21 ? 2 : 1,
        feedQuantity: day * 35,
        feedCost: 0,
        averageWeight: 0.15 * (day / 7),
        vetCost: day === 14 ? 12000 : 0,
        vetTreatment: day === 14 ? 'Vaccination Newcastle' : undefined,
        observations: `Jour ${day} — bande en bonne santé`,
        createdById: director.id,
      },
    });
  }

  // Recompute costs
  const records = await prisma.breedingRecord.findMany({
    where: { breedingBatchId: breedingActive.id },
  });
  const totalVetCost = records.reduce((s, r) => s + r.vetCost, 0);
  const totalCost = breedingActive.chicksCost + totalVetCost + breedingActive.fixedCharges;
  await prisma.breedingBatch.update({
    where: { id: breedingActive.id },
    data: {
      totalVetCost,
      totalCost,
      costPerHead: Math.round(totalCost / 985),
    },
  });

  // Bande clôturée
  const breedingClosed = await prisma.breedingBatch.create({
    data: {
      reference: await nextRef('B', 2026),
      startDate: new Date('2026-02-01'),
      closeDate: new Date('2026-03-22'),
      strain: 'Ross 308',
      initialCount: 800,
      currentCount: 770,
      chickSupplier: 'Coopérative Avicole Thiès',
      chicksCost: 280000,
      fixedCharges: 40000,
      averageWeight: 2.1,
      totalFeedCost: 850000,
      totalVetCost: 25000,
      totalCost: 1195000,
      costPerHead: Math.round(1195000 / 770),
      status: BreedingBatchStatus.CLOSED,
      slaughterCost: 30000,
      createdById: director.id,
    },
  });

  // Lot poulets vivants pour la bande clôturée
  const liveProduct = await prisma.finishedProduct.findFirst({
    where: { category: FinishedProductCategory.LIVE_CHICKEN },
  });
  if (liveProduct) {
    const lotLive = await prisma.finishedProductLot.create({
      data: {
        lotNumber: `${breedingClosed.reference}-VIVANT`,
        finishedProductId: liveProduct.id,
        source: FinishedLotSource.BREEDING,
        breedingBatchId: breedingClosed.id,
        initialQuantity: 700,
        remainingQuantity: 700,
        manufactureDate: breedingClosed.closeDate!,
        unitCost: breedingClosed.costPerHead,
        status: LotStatus.ACTIVE,
      },
    });
    await prisma.finishedStockMovement.create({
      data: {
        finishedProductId: liveProduct.id,
        lotId: lotLive.id,
        type: FinishedStockMovementType.ENTRY_BREEDING,
        quantity: 700,
        movementDate: breedingClosed.closeDate!,
        referenceType: StockReferenceType.BREEDING_BATCH,
        referenceId: breedingClosed.id,
        createdById: director.id,
      },
    });
    await prisma.finishedProduct.update({
      where: { id: liveProduct.id },
      data: { currentStock: 700, averageCost: breedingClosed.costPerHead },
    });
  }

  console.log('🐣 2 bandes d\'élevage créées (1 active avec relevés, 1 clôturée avec poulets en stock)');

  // ==========================================================================
  // PHASE 5 — Clients & Ventes
  // ==========================================================================

  const walkInCustomer = await prisma.customer.create({
    data: {
      name: 'Client comptoir',
      phone: '—',
      address: 'Comptoir SACPROMI',
      type: CustomerType.OTHER,
      priceCategory: CustomerPriceCategory.RETAIL,
      isWalkIn: true,
    },
  });

  const customers = [
    { name: 'Élevage Sokhna Touba', phone: '+221 77 511 22 33', address: 'Touba', type: CustomerType.BREEDER, priceCategory: CustomerPriceCategory.WHOLESALE, paymentTerms: '30 jours', creditLimit: 1500000 },
    { name: 'Ferme Avicole Mbour', phone: '+221 77 511 44 55', address: 'Mbour', type: CustomerType.BREEDER, priceCategory: CustomerPriceCategory.WHOLESALE, paymentTerms: '15 jours', creditLimit: 800000 },
    { name: 'Fadel Élevage', phone: '+221 77 511 66 77', address: 'Saint-Louis', type: CustomerType.BREEDER, priceCategory: CustomerPriceCategory.WHOLESALE, paymentTerms: 'Comptant', creditLimit: 0 },
    { name: 'Boutique Médina Avi', phone: '+221 77 522 11 22', address: 'Médina, Dakar', type: CustomerType.RESELLER, priceCategory: CustomerPriceCategory.WHOLESALE, paymentTerms: '15 jours', creditLimit: 500000 },
    { name: 'Marché HLM Distribution', phone: '+221 77 522 33 44', address: 'HLM, Dakar', type: CustomerType.RESELLER, priceCategory: CustomerPriceCategory.WHOLESALE, paymentTerms: 'Comptant', creditLimit: 0 },
    { name: 'Détail Pikine', phone: '+221 77 522 55 66', address: 'Pikine', type: CustomerType.RESELLER, priceCategory: CustomerPriceCategory.RETAIL, paymentTerms: 'Comptant', creditLimit: 0 },
    { name: 'Aïssatou Diop', phone: '+221 77 533 11 22', address: 'Yoff', type: CustomerType.INDIVIDUAL, priceCategory: CustomerPriceCategory.RETAIL, paymentTerms: 'Comptant', creditLimit: 0 },
    { name: 'Famille Ndiaye', phone: '+221 77 533 33 44', address: 'Ouakam', type: CustomerType.INDIVIDUAL, priceCategory: CustomerPriceCategory.RETAIL, paymentTerms: 'Comptant', creditLimit: 0 },
  ];
  const createdCustomers = [];
  for (const c of customers) {
    createdCustomers.push(await prisma.customer.create({ data: c }));
  }
  console.log(`👥 ${createdCustomers.length + 1} clients créés (dont 1 client comptoir)`);

  // Vente sur la bande clôturée (poulets vivants) — 1 facture wholesale + 1 reçu retail
  const liveProductFresh = await prisma.finishedProduct.findFirst({
    where: { category: FinishedProductCategory.LIVE_CHICKEN },
  });
  const liveLot = await prisma.finishedProductLot.findFirst({
    where: { breedingBatchId: breedingClosed.id, finishedProductId: liveProductFresh?.id },
  });

  if (liveProductFresh && liveLot) {
    const fac1Ref = await nextRef('FAC', 2026);
    const wholesaleClient = createdCustomers[0];
    const fac1 = await prisma.saleInvoice.create({
      data: {
        reference: fac1Ref,
        type: SaleInvoiceType.INVOICE,
        customerId: wholesaleClient.id,
        invoiceDate: new Date('2026-04-15'),
        totalAmount: 50 * liveProductFresh.wholesalePrice,
        paymentMethod: SalePaymentMethod.CREDIT,
        paymentStatus: PaymentStatus.PARTIALLY_PAID,
        amountPaid: 50000,
        amountRemaining: 50 * liveProductFresh.wholesalePrice - 50000,
        createdById: director.id,
        items: {
          create: [{
            finishedProductId: liveProductFresh.id,
            finishedLotId: liveLot.id,
            productName: liveProductFresh.name,
            quantity: 50,
            unitPrice: liveProductFresh.wholesalePrice,
            lineAmount: 50 * liveProductFresh.wholesalePrice,
          }],
        },
      },
    });
    await prisma.customerPayment.create({
      data: {
        saleInvoiceId: fac1.id,
        amount: 50000,
        paymentDate: new Date('2026-04-15'),
        paymentMethod: SalePaymentMethod.CASH,
        note: 'Acompte à la livraison',
        createdById: director.id,
      },
    });
    // Diminuer le stock + lot
    await prisma.finishedProductLot.update({
      where: { id: liveLot.id },
      data: { remainingQuantity: { decrement: 50 } },
    });
    await prisma.finishedStockMovement.create({
      data: {
        finishedProductId: liveProductFresh.id,
        lotId: liveLot.id,
        type: FinishedStockMovementType.EXIT_SALE,
        quantity: -50,
        movementDate: new Date('2026-04-15'),
        referenceType: StockReferenceType.SALE_INVOICE,
        referenceId: fac1.id,
        createdById: director.id,
      },
    });
    await prisma.finishedProduct.update({
      where: { id: liveProductFresh.id },
      data: { currentStock: { decrement: 50 } },
    });

    // Reçu détail (cash)
    const rec1Ref = await nextRef('REC', 2026);
    await prisma.saleInvoice.create({
      data: {
        reference: rec1Ref,
        type: SaleInvoiceType.RECEIPT,
        customerId: walkInCustomer.id,
        invoiceDate: new Date('2026-04-20'),
        totalAmount: 5 * liveProductFresh.retailPrice,
        paymentMethod: SalePaymentMethod.CASH,
        paymentStatus: PaymentStatus.PAID,
        amountPaid: 5 * liveProductFresh.retailPrice,
        amountRemaining: 0,
        createdById: operator.id,
        items: {
          create: [{
            finishedProductId: liveProductFresh.id,
            finishedLotId: liveLot.id,
            productName: liveProductFresh.name,
            quantity: 5,
            unitPrice: liveProductFresh.retailPrice,
            lineAmount: 5 * liveProductFresh.retailPrice,
          }],
        },
      },
    });
    await prisma.finishedProductLot.update({
      where: { id: liveLot.id },
      data: { remainingQuantity: { decrement: 5 } },
    });
    await prisma.finishedProduct.update({
      where: { id: liveProductFresh.id },
      data: { currentStock: { decrement: 5 } },
    });
  }

  console.log('🛒 2 ventes seedées (1 facture gros à crédit + 1 reçu détail cash)');

  // ==========================================================================
  // PHASE 6 — Catégories de dépenses + dépenses
  // ==========================================================================
  const defaultCategories = [
    'Salaires',
    'Électricité',
    'Eau',
    'Carburant',
    'Transport / Logistique',
    'Entretien / Réparations',
    'Vétérinaire',
    'Emballage',
    'Loyer',
    'Impôts / Taxes',
    'Divers',
  ];
  const createdCategories: Record<string, string> = {};
  for (let i = 0; i < defaultCategories.length; i++) {
    const cat = await prisma.expenseCategory.create({
      data: { name: defaultCategories[i], displayOrder: i + 1, isDefault: true },
    });
    createdCategories[cat.name] = cat.id;
  }
  console.log(`💼 ${defaultCategories.length} catégories de dépenses par défaut créées`);

  // Dépenses Avril 2026 (variées)
  const expensesData = [
    { amount: 850000, cat: 'Salaires', activity: ExpenseActivity.GENERAL, date: '2026-04-01', desc: 'Salaires Avril 2026', isRec: true, day: 1 },
    { amount: 75000, cat: 'Électricité', activity: ExpenseActivity.PRODUCTION, date: '2026-04-05', desc: 'Facture Sénélec Avril' },
    { amount: 45000, cat: 'Électricité', activity: ExpenseActivity.BREEDING, date: '2026-04-05', desc: 'Bâtiment élevage' },
    { amount: 15000, cat: 'Eau', activity: ExpenseActivity.GENERAL, date: '2026-04-08', desc: 'SDE Avril' },
    { amount: 80000, cat: 'Carburant', activity: ExpenseActivity.COMMERCIAL, date: '2026-04-10', desc: 'Carburant livraisons', beneficiary: 'Total Energies' },
    { amount: 35000, cat: 'Transport / Logistique', activity: ExpenseActivity.COMMERCIAL, date: '2026-04-12', desc: 'Transporteur Touba' },
    { amount: 22000, cat: 'Entretien / Réparations', activity: ExpenseActivity.PRODUCTION, date: '2026-04-15', desc: 'Réparation broyeur' },
    { amount: 12000, cat: 'Vétérinaire', activity: ExpenseActivity.BREEDING, date: '2026-04-14', desc: 'Vaccination Newcastle' },
    { amount: 18000, cat: 'Emballage', activity: ExpenseActivity.PRODUCTION, date: '2026-04-18', desc: 'Sacs 50 kg' },
    { amount: 200000, cat: 'Loyer', activity: ExpenseActivity.GENERAL, date: '2026-04-01', desc: 'Loyer atelier Avril', isRec: true, day: 1 },
    { amount: 8500, cat: 'Divers', activity: ExpenseActivity.GENERAL, date: '2026-04-22', desc: 'Fournitures bureau' },
    { amount: 28000, cat: 'Carburant', activity: ExpenseActivity.PRODUCTION, date: '2026-04-25', desc: 'Groupe électrogène' },
  ];

  for (const e of expensesData) {
    await prisma.expense.create({
      data: {
        amount: e.amount,
        categoryId: createdCategories[e.cat],
        activity: e.activity,
        expenseDate: new Date(e.date),
        description: e.desc,
        beneficiary: e.beneficiary,
        status: ExpenseStatus.CONFIRMED,
        isRecurring: e.isRec ?? false,
        recurrenceDayOfMonth: e.day,
        createdById: director.id,
      },
    });
  }

  console.log(`💸 ${expensesData.length} dépenses Avril 2026 enregistrées (dont 2 récurrentes : salaires + loyer)`);

  console.log('---');
  console.log('✅ Seed terminé avec succès');
  console.log('Comptes :');
  console.log('  Directeur : admin@sacpromi.sn / Admin123!');
  console.log('  Opérateur : operateur@sacpromi.sn / Oper123!');
}

main()
  .catch((e) => {
    console.error('❌ Erreur seed :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
