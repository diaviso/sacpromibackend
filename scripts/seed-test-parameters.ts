import {
  FinishedProductCategory,
  FinishedProductUnit,
  MeasurementUnit,
  PrismaClient,
  RawMaterialCategory,
} from '@prisma/client';

const prisma = new PrismaClient();

type SupplierSeed = {
  name: string;
  phone: string;
  address: string;
  email?: string;
  productsSupplied: string;
};

type RawMaterialSeed = {
  code: string;
  name: string;
  category: RawMaterialCategory;
  unit: MeasurementUnit;
  weightPerBag?: number;
  averagePrice: number;
  alertThreshold: number;
};

type FinishedProductSeed = {
  code: string;
  name: string;
  category: FinishedProductCategory;
  unit: FinishedProductUnit;
  wholesalePrice: number;
  retailPrice: number;
  averageCost: number;
  alertThreshold: number;
};

type FormulaSeed = {
  productCode: string;
  name: string;
  productionUnit: string;
  unitWeightKg: number;
  isActive: boolean;
  technicalNote?: string;
  items: Array<{ code: string; quantity: number }>;
};

const suppliers: SupplierSeed[] = [
  {
    name: 'Grossiste Cereales Kaolack',
    phone: '+221 77 200 11 11',
    address: 'Marche central, Kaolack',
    email: 'cereales.kaolack@example.sn',
    productsSupplied: 'Mais jaune, sorgho, mil, son de ble',
  },
  {
    name: 'Pecherie Joal',
    phone: '+221 77 200 22 22',
    address: 'Port de Joal-Fadiouth',
    email: 'contact@pecherie-joal.example.sn',
    productsSupplied: 'Farine de poisson, huile de poisson',
  },
  {
    name: 'Cooperative Arachide Diourbel',
    phone: '+221 77 200 33 33',
    address: 'Route de Bambey, Diourbel',
    email: 'coop.arachide.diourbel@example.sn',
    productsSupplied: "Tourteau d'arachide, coque d'arachide",
  },
  {
    name: 'SoyImport Dakar',
    phone: '+221 77 200 44 44',
    address: 'Zone industrielle, Dakar',
    email: 'soyimport.dakar@example.sn',
    productsSupplied: 'Tourteau de soja, huile vegetale',
  },
  {
    name: 'PreMix Pro Thies',
    phone: '+221 77 200 55 55',
    address: 'Zone artisanale, Thies',
    email: 'premix.pro.thies@example.sn',
    productsSupplied: 'Premix chair, premix pondeuse, vitamines, mineraux',
  },
  {
    name: 'Mineraux du Sahel',
    phone: '+221 77 200 66 66',
    address: 'Keur Massar, Dakar',
    email: 'contact@mineraux-sahel.example.sn',
    productsSupplied: 'Calcaire, phosphate bicalcique, sel',
  },
  {
    name: 'Sacs et Emballages Mbour',
    phone: '+221 77 200 77 77',
    address: 'Mbour, Petite-Cote',
    productsSupplied: 'Sacs 25 kg, sacs 50 kg, etiquettes',
  },
  {
    name: 'Avipro Senegal',
    phone: '+221 77 200 88 88',
    address: 'Rufisque, Dakar',
    email: 'avipro@example.sn',
    productsSupplied: 'Concentre volaille, additifs nutritionnels',
  },
];

const rawMaterials: RawMaterialSeed[] = [
  { code: 'MAIS-J', name: 'Mais jaune', category: RawMaterialCategory.CEREALS, unit: MeasurementUnit.KG, averagePrice: 245, alertThreshold: 1200 },
  { code: 'SORGHO', name: 'Sorgho', category: RawMaterialCategory.CEREALS, unit: MeasurementUnit.KG, averagePrice: 220, alertThreshold: 800 },
  { code: 'MIL', name: 'Mil', category: RawMaterialCategory.CEREALS, unit: MeasurementUnit.KG, averagePrice: 230, alertThreshold: 600 },
  { code: 'SON-BLE', name: 'Son de ble', category: RawMaterialCategory.CEREALS, unit: MeasurementUnit.KG, averagePrice: 155, alertThreshold: 700 },
  { code: 'BRIS-RIZ', name: 'Brisure de riz', category: RawMaterialCategory.CEREALS, unit: MeasurementUnit.KG, averagePrice: 210, alertThreshold: 500 },
  { code: 'TRT-ARA', name: "Tourteau d'arachide", category: RawMaterialCategory.PROTEINS, unit: MeasurementUnit.KG, averagePrice: 320, alertThreshold: 700 },
  { code: 'TRT-SOJ', name: 'Tourteau de soja', category: RawMaterialCategory.PROTEINS, unit: MeasurementUnit.KG, averagePrice: 430, alertThreshold: 600 },
  { code: 'FAR-POI', name: 'Farine de poisson', category: RawMaterialCategory.PROTEINS, unit: MeasurementUnit.KG, averagePrice: 780, alertThreshold: 250 },
  { code: 'COQ-ARA', name: "Coque d'arachide", category: RawMaterialCategory.OTHER, unit: MeasurementUnit.KG, averagePrice: 70, alertThreshold: 400 },
  { code: 'HUI-VEG', name: 'Huile vegetale', category: RawMaterialCategory.OTHER, unit: MeasurementUnit.LITER, averagePrice: 950, alertThreshold: 120 },
  { code: 'PMX-CHA', name: 'Premix poulet chair', category: RawMaterialCategory.PREMIX_MINERALS, unit: MeasurementUnit.KG, averagePrice: 1850, alertThreshold: 80 },
  { code: 'PMX-POND', name: 'Premix pondeuse', category: RawMaterialCategory.PREMIX_MINERALS, unit: MeasurementUnit.KG, averagePrice: 1750, alertThreshold: 80 },
  { code: 'VIT-MIN', name: 'Complexe vitamines mineraux', category: RawMaterialCategory.PREMIX_MINERALS, unit: MeasurementUnit.KG, averagePrice: 2200, alertThreshold: 50 },
  { code: 'PHO-BIC', name: 'Phosphate bicalcique', category: RawMaterialCategory.PREMIX_MINERALS, unit: MeasurementUnit.KG, averagePrice: 650, alertThreshold: 120 },
  { code: 'CALC', name: 'Calcaire broye', category: RawMaterialCategory.PREMIX_MINERALS, unit: MeasurementUnit.KG, averagePrice: 95, alertThreshold: 300 },
  { code: 'COQ-BR', name: 'Coquillages broyes', category: RawMaterialCategory.PREMIX_MINERALS, unit: MeasurementUnit.KG, averagePrice: 110, alertThreshold: 300 },
  { code: 'SEL', name: 'Sel alimentaire', category: RawMaterialCategory.PREMIX_MINERALS, unit: MeasurementUnit.KG, averagePrice: 120, alertThreshold: 100 },
  { code: 'METH', name: 'Methionine', category: RawMaterialCategory.PREMIX_MINERALS, unit: MeasurementUnit.KG, averagePrice: 4200, alertThreshold: 25 },
];

const finishedProducts: FinishedProductSeed[] = [
  { code: 'ALI-PCC-DEM-50', name: 'Aliment poulet chair demarrage 50 kg', category: FinishedProductCategory.POULTRY_FEED, unit: FinishedProductUnit.BAG_50KG, wholesalePrice: 18500, retailPrice: 19500, averageCost: 16200, alertThreshold: 30 },
  { code: 'ALI-PCC-CRO-50', name: 'Aliment poulet chair croissance 50 kg', category: FinishedProductCategory.POULTRY_FEED, unit: FinishedProductUnit.BAG_50KG, wholesalePrice: 18000, retailPrice: 19000, averageCost: 15600, alertThreshold: 30 },
  { code: 'ALI-PCC-FIN-50', name: 'Aliment poulet chair finition 50 kg', category: FinishedProductCategory.POULTRY_FEED, unit: FinishedProductUnit.BAG_50KG, wholesalePrice: 17500, retailPrice: 18500, averageCost: 15000, alertThreshold: 30 },
  { code: 'ALI-POND-50', name: 'Aliment pondeuse ponte 50 kg', category: FinishedProductCategory.POULTRY_FEED, unit: FinishedProductUnit.BAG_50KG, wholesalePrice: 17800, retailPrice: 18800, averageCost: 15200, alertThreshold: 25 },
  { code: 'ALI-POND-DEM-50', name: 'Aliment poussine demarrage 50 kg', category: FinishedProductCategory.POULTRY_FEED, unit: FinishedProductUnit.BAG_50KG, wholesalePrice: 18200, retailPrice: 19200, averageCost: 15800, alertThreshold: 20 },
  { code: 'ALI-BET-ENG-50', name: 'Aliment betail engraissement 50 kg', category: FinishedProductCategory.CATTLE_FEED, unit: FinishedProductUnit.BAG_50KG, wholesalePrice: 16500, retailPrice: 17500, averageCost: 14100, alertThreshold: 20 },
  { code: 'ALI-BET-ENT-50', name: 'Aliment betail entretien 50 kg', category: FinishedProductCategory.CATTLE_FEED, unit: FinishedProductUnit.BAG_50KG, wholesalePrice: 15500, retailPrice: 16500, averageCost: 13200, alertThreshold: 20 },
  { code: 'ALI-MOUT-50', name: 'Aliment mouton embouche 50 kg', category: FinishedProductCategory.CATTLE_FEED, unit: FinishedProductUnit.BAG_50KG, wholesalePrice: 16800, retailPrice: 17800, averageCost: 14500, alertThreshold: 20 },
  { code: 'POULET-VIVANT', name: 'Poulet de chair vivant', category: FinishedProductCategory.LIVE_CHICKEN, unit: FinishedProductUnit.HEAD, wholesalePrice: 4500, retailPrice: 5000, averageCost: 3500, alertThreshold: 0 },
  { code: 'POULET-ABATTU', name: 'Poulet abattu pret a vendre', category: FinishedProductCategory.SLAUGHTERED_CHICKEN, unit: FinishedProductUnit.KG, wholesalePrice: 3200, retailPrice: 3500, averageCost: 2600, alertThreshold: 0 },
];

const formulas: FormulaSeed[] = [
  {
    productCode: 'ALI-PCC-DEM-50',
    name: 'Poulet chair demarrage - 1 tonne',
    productionUnit: '1 tonne',
    unitWeightKg: 1000,
    isActive: true,
    technicalNote: 'Formule test riche en proteines pour les 10 premiers jours.',
    items: [
      { code: 'MAIS-J', quantity: 520 },
      { code: 'TRT-SOJ', quantity: 260 },
      { code: 'FAR-POI', quantity: 90 },
      { code: 'SON-BLE', quantity: 55 },
      { code: 'HUI-VEG', quantity: 20 },
      { code: 'PMX-CHA', quantity: 25 },
      { code: 'PHO-BIC', quantity: 15 },
      { code: 'CALC', quantity: 10 },
      { code: 'SEL', quantity: 5 },
    ],
  },
  {
    productCode: 'ALI-PCC-CRO-50',
    name: 'Poulet chair croissance - 1 tonne',
    productionUnit: '1 tonne',
    unitWeightKg: 1000,
    isActive: true,
    items: [
      { code: 'MAIS-J', quantity: 560 },
      { code: 'TRT-SOJ', quantity: 210 },
      { code: 'FAR-POI', quantity: 70 },
      { code: 'SON-BLE', quantity: 95 },
      { code: 'HUI-VEG', quantity: 20 },
      { code: 'PMX-CHA', quantity: 20 },
      { code: 'PHO-BIC', quantity: 15 },
      { code: 'CALC', quantity: 5 },
      { code: 'SEL', quantity: 5 },
    ],
  },
  {
    productCode: 'ALI-PCC-FIN-50',
    name: 'Poulet chair finition - 1 tonne',
    productionUnit: '1 tonne',
    unitWeightKg: 1000,
    isActive: true,
    items: [
      { code: 'MAIS-J', quantity: 600 },
      { code: 'TRT-SOJ', quantity: 170 },
      { code: 'FAR-POI', quantity: 45 },
      { code: 'SON-BLE', quantity: 125 },
      { code: 'HUI-VEG', quantity: 20 },
      { code: 'PMX-CHA', quantity: 18 },
      { code: 'PHO-BIC', quantity: 12 },
      { code: 'CALC', quantity: 5 },
      { code: 'SEL', quantity: 5 },
    ],
  },
  {
    productCode: 'ALI-POND-50',
    name: 'Pondeuse ponte - 1 tonne',
    productionUnit: '1 tonne',
    unitWeightKg: 1000,
    isActive: true,
    items: [
      { code: 'MAIS-J', quantity: 500 },
      { code: 'TRT-SOJ', quantity: 180 },
      { code: 'SON-BLE', quantity: 130 },
      { code: 'COQ-BR', quantity: 90 },
      { code: 'CALC', quantity: 55 },
      { code: 'PMX-POND', quantity: 25 },
      { code: 'PHO-BIC', quantity: 12 },
      { code: 'SEL', quantity: 8 },
    ],
  },
  {
    productCode: 'ALI-POND-DEM-50',
    name: 'Poussine demarrage - 1 tonne',
    productionUnit: '1 tonne',
    unitWeightKg: 1000,
    isActive: true,
    items: [
      { code: 'MAIS-J', quantity: 540 },
      { code: 'TRT-SOJ', quantity: 230 },
      { code: 'FAR-POI', quantity: 65 },
      { code: 'SON-BLE', quantity: 90 },
      { code: 'PMX-POND', quantity: 25 },
      { code: 'PHO-BIC', quantity: 15 },
      { code: 'CALC', quantity: 25 },
      { code: 'SEL', quantity: 10 },
    ],
  },
  {
    productCode: 'ALI-BET-ENG-50',
    name: 'Betail engraissement - 1 tonne',
    productionUnit: '1 tonne',
    unitWeightKg: 1000,
    isActive: true,
    items: [
      { code: 'SON-BLE', quantity: 360 },
      { code: 'BRIS-RIZ', quantity: 240 },
      { code: 'TRT-ARA', quantity: 170 },
      { code: 'COQ-ARA', quantity: 120 },
      { code: 'MELASSE', quantity: 0 },
      { code: 'CALC', quantity: 60 },
      { code: 'SEL', quantity: 20 },
      { code: 'VIT-MIN', quantity: 30 },
    ].filter((item) => item.quantity > 0),
  },
  {
    productCode: 'ALI-BET-ENT-50',
    name: 'Betail entretien - 1 tonne',
    productionUnit: '1 tonne',
    unitWeightKg: 1000,
    isActive: true,
    items: [
      { code: 'SON-BLE', quantity: 430 },
      { code: 'BRIS-RIZ', quantity: 220 },
      { code: 'TRT-ARA', quantity: 120 },
      { code: 'COQ-ARA', quantity: 140 },
      { code: 'CALC', quantity: 60 },
      { code: 'SEL', quantity: 20 },
      { code: 'VIT-MIN', quantity: 10 },
    ],
  },
  {
    productCode: 'ALI-MOUT-50',
    name: 'Mouton embouche - 1 tonne',
    productionUnit: '1 tonne',
    unitWeightKg: 1000,
    isActive: true,
    items: [
      { code: 'SON-BLE', quantity: 320 },
      { code: 'BRIS-RIZ', quantity: 250 },
      { code: 'TRT-ARA', quantity: 210 },
      { code: 'COQ-ARA', quantity: 110 },
      { code: 'MIL', quantity: 60 },
      { code: 'CALC', quantity: 30 },
      { code: 'SEL', quantity: 20 },
    ],
  },
];

async function upsertSupplier(data: SupplierSeed) {
  const existing = await prisma.supplier.findFirst({ where: { name: data.name } });
  if (existing) {
    return prisma.supplier.update({
      where: { id: existing.id },
      data: { ...data, isActive: true },
    });
  }
  return prisma.supplier.create({ data });
}

async function seedFormula(formula: FormulaSeed, productIdByCode: Map<string, string>, rawMaterialIdByCode: Map<string, string>) {
  const finishedProductId = productIdByCode.get(formula.productCode);
  if (!finishedProductId) throw new Error(`Produit fini introuvable: ${formula.productCode}`);

  const total = formula.items.reduce((sum, item) => sum + item.quantity, 0);
  if (total <= 0) throw new Error(`Formule vide: ${formula.name}`);

  if (formula.isActive) {
    await prisma.formula.updateMany({
      where: { finishedProductId, isActive: true, name: { not: formula.name } },
      data: { isActive: false },
    });
  }

  const existing = await prisma.formula.findFirst({
    where: { finishedProductId, name: formula.name },
    orderBy: { version: 'desc' },
  });

  const formulaData = {
    finishedProductId,
    name: formula.name,
    version: existing?.version ?? 1,
    productionUnit: formula.productionUnit,
    unitWeightKg: formula.unitWeightKg,
    isActive: formula.isActive,
    technicalNote: formula.technicalNote,
  };

  const savedFormula = existing
    ? await prisma.formula.update({ where: { id: existing.id }, data: formulaData })
    : await prisma.formula.create({ data: formulaData });

  await prisma.formulaItem.deleteMany({ where: { formulaId: savedFormula.id } });
  await prisma.formulaItem.createMany({
    data: formula.items.map((item) => {
      const rawMaterialId = rawMaterialIdByCode.get(item.code);
      if (!rawMaterialId) throw new Error(`Matiere premiere introuvable: ${item.code}`);
      return {
        formulaId: savedFormula.id,
        rawMaterialId,
        quantity: item.quantity,
        proportion: Math.round((item.quantity / total) * 10000) / 100,
      };
    }),
  });

  return savedFormula;
}

async function main() {
  console.log('Seed parametres de test SACPROMI (non financier)');

  for (const supplier of suppliers) {
    await upsertSupplier(supplier);
  }

  const rawMaterialIdByCode = new Map<string, string>();
  for (const material of rawMaterials) {
    const saved = await prisma.rawMaterial.upsert({
      where: { code: material.code },
      create: {
        ...material,
        currentStock: 0,
        isActive: true,
      },
      update: {
        name: material.name,
        category: material.category,
        unit: material.unit,
        weightPerBag: material.weightPerBag,
        averagePrice: material.averagePrice,
        alertThreshold: material.alertThreshold,
        isActive: true,
      },
    });
    rawMaterialIdByCode.set(saved.code, saved.id);
  }

  const productIdByCode = new Map<string, string>();
  for (const product of finishedProducts) {
    const saved = await prisma.finishedProduct.upsert({
      where: { code: product.code },
      create: {
        ...product,
        currentStock: 0,
        isActive: true,
      },
      update: {
        name: product.name,
        category: product.category,
        unit: product.unit,
        wholesalePrice: product.wholesalePrice,
        retailPrice: product.retailPrice,
        averageCost: product.averageCost,
        alertThreshold: product.alertThreshold,
        isActive: true,
      },
    });
    productIdByCode.set(saved.code, saved.id);
  }

  for (const formula of formulas) {
    await seedFormula(formula, productIdByCode, rawMaterialIdByCode);
  }

  const counts = {
    suppliers: await prisma.supplier.count(),
    rawMaterials: await prisma.rawMaterial.count(),
    finishedProducts: await prisma.finishedProduct.count(),
    formulas: await prisma.formula.count(),
    formulaItems: await prisma.formulaItem.count(),
    purchaseInvoices: await prisma.purchaseInvoice.count(),
    saleInvoices: await prisma.saleInvoice.count(),
    supplierPayments: await prisma.supplierPayment.count(),
    customerPayments: await prisma.customerPayment.count(),
    treasuryEntries: await prisma.treasuryEntry.count(),
  };

  console.log(JSON.stringify(counts, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
