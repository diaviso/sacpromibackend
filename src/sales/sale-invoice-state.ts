import { PaymentStatus, Prisma } from '@prisma/client';

export interface SaleInvoiceState {
  amountPaid: number;
  amountRemaining: number;
  paymentStatus: PaymentStatus;
}

/**
 * Recalcule l'état de paiement d'une facture de VENTE depuis la source de
 * vérité (audit C1) et persiste le résultat sur la facture :
 *
 *   amountPaid      = Σ encaissements client
 *   credits         = − Σ totalAmount des avoirs (factures enfant, montant négatif)
 *   amountRemaining = totalAmount − credits − amountPaid
 *
 * Avant ce correctif, la création d'avoir gonflait `amountPaid` (mélange
 * crédit/paiement) et la création/suppression de paiement recalculait
 * `amountRemaining = totalAmount − amountPaid`, effaçant la réduction des avoirs
 * (créance fantôme). `amountRemaining` peut devenir négatif (= avoir client).
 */
export async function recomputeSaleInvoiceState(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<SaleInvoiceState | null> {
  const invoice = await tx.saleInvoice.findUnique({
    where: { id: invoiceId },
    select: { totalAmount: true },
  });
  if (!invoice) return null;

  const [paidAgg, creditAgg] = await Promise.all([
    tx.customerPayment.aggregate({
      where: { saleInvoiceId: invoiceId },
      _sum: { amount: true },
    }),
    // Avoirs = factures enfant (parentInvoiceId), à totalAmount négatif.
    tx.saleInvoice.aggregate({
      where: { parentInvoiceId: invoiceId, deletedAt: null },
      _sum: { totalAmount: true },
    }),
  ]);

  const amountPaid = paidAgg._sum.amount ?? 0;
  const totalCredits = -(creditAgg._sum.totalAmount ?? 0);
  const amountRemaining = invoice.totalAmount - totalCredits - amountPaid;
  const paymentStatus: PaymentStatus =
    amountRemaining <= 0
      ? PaymentStatus.PAID
      : amountPaid > 0
        ? PaymentStatus.PARTIALLY_PAID
        : PaymentStatus.UNPAID;

  await tx.saleInvoice.update({
    where: { id: invoiceId },
    data: { amountPaid, amountRemaining, paymentStatus },
  });

  return { amountPaid, amountRemaining, paymentStatus };
}
