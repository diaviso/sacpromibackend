import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { PurchaseInvoicesModule } from './purchase-invoices/purchase-invoices.module';
import { SupplierPaymentsModule } from './supplier-payments/supplier-payments.module';
import { RawStockModule } from './raw-stock/raw-stock.module';
import { RawMaterialsModule } from './raw-materials/raw-materials.module';
import { InventoryModule } from './inventory/inventory.module';
import { ConservationCostsModule } from './conservation-costs/conservation-costs.module';
import { FinishedStockModule } from './finished-stock/finished-stock.module';
import { FinishedProductsModule } from './finished-products/finished-products.module';
import { FormulasModule } from './formulas/formulas.module';
import { ProductionModule } from './production/production.module';
import { BreedingModule } from './breeding/breeding.module';
import { CustomersModule } from './customers/customers.module';
import { CustomerOrdersModule } from './customer-orders/customer-orders.module';
import { SalesModule } from './sales/sales.module';
import { CustomerPaymentsModule } from './customer-payments/customer-payments.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ReportsModule } from './reports/reports.module';
import { BackupModule } from './backup/backup.module';
import { HealthModule } from './health/health.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AccountsModule } from './accounts/accounts.module';
import { TreasuryModule } from './treasury/treasury.module';
import { LoansModule } from './loans/loans.module';
import { FixedAssetsModule } from './fixed-assets/fixed-assets.module';
import { CapitalMovementsModule } from './capital-movements/capital-movements.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    CommonModule,
    MailModule,
    RawStockModule,
    FinishedStockModule,
    AuthModule,
    UsersModule,
    SuppliersModule,
    RawMaterialsModule,
    PurchaseOrdersModule,
    PurchaseInvoicesModule,
    SupplierPaymentsModule,
    InventoryModule,
    ConservationCostsModule,
    FinishedProductsModule,
    FormulasModule,
    ProductionModule,
    BreedingModule,
    CustomersModule,
    CustomerOrdersModule,
    SalesModule,
    CustomerPaymentsModule,
    ExpensesModule,
    ReportsModule,
    BackupModule,
    HealthModule,
    DashboardModule,
    // Sprint 7 — Finance & Trésorerie
    AccountsModule,
    TreasuryModule,
    LoansModule,
    FixedAssetsModule,
    CapitalMovementsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
