import { PaymentStatus } from '@prisma/client';
import { recomputeSaleInvoiceState } from './sale-invoice-state';

/**
 * Verrouille le correctif C1 (audit) : le recalcul de l'état d'une facture de
 * vente doit tenir compte des avoirs, sans regonfler la dette ni gonfler
 * artificiellement amountPaid.
 */
describe('recomputeSaleInvoiceState (C1)', () => {
  function makeTx(opts: {
    totalAmount: number | null;
    paymentsSum: number | null;
    creditsSum: number | null; // somme des totalAmount des avoirs (négative)
  }) {
    const update = jest.fn().mockResolvedValue(undefined);
    const tx = {
      saleInvoice: {
        findUnique: jest.fn().mockResolvedValue(
          opts.totalAmount === null ? null : { totalAmount: opts.totalAmount },
        ),
        aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: opts.creditsSum } }),
        update,
      },
      customerPayment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: opts.paymentsSum } }),
      },
    };
    return { tx, update };
  }

  it('paiement partiel, sans avoir → PARTIALLY_PAID', async () => {
    const { tx, update } = makeTx({ totalAmount: 100_000, paymentsSum: 30_000, creditsSum: 0 });
    const state = await recomputeSaleInvoiceState(tx as never, 'inv1');
    expect(state).toEqual({
      amountPaid: 30_000,
      amountRemaining: 70_000,
      paymentStatus: PaymentStatus.PARTIALLY_PAID,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'inv1' },
      data: { amountPaid: 30_000, amountRemaining: 70_000, paymentStatus: PaymentStatus.PARTIALLY_PAID },
    });
  });

  it('avoir 30k + paiement 70k sur facture 100k → soldée (pas de dette fantôme)', async () => {
    // Scénario exact de l'audit : avoir de 30 000 (totalAmount -30 000) +
    // paiement de 70 000. Le reste dû doit être 0, JAMAIS 100 000.
    const { tx } = makeTx({ totalAmount: 100_000, paymentsSum: 70_000, creditsSum: -30_000 });
    const state = await recomputeSaleInvoiceState(tx as never, 'inv1');
    expect(state?.amountRemaining).toBe(0);
    expect(state?.paymentStatus).toBe(PaymentStatus.PAID);
  });

  it('avoir seul (sans paiement) → reste réduit, amountPaid reste 0', async () => {
    const { tx } = makeTx({ totalAmount: 100_000, paymentsSum: 0, creditsSum: -30_000 });
    const state = await recomputeSaleInvoiceState(tx as never, 'inv1');
    expect(state?.amountPaid).toBe(0);
    expect(state?.amountRemaining).toBe(70_000);
    expect(state?.paymentStatus).toBe(PaymentStatus.UNPAID);
  });

  it('avoir après paiement intégral → crédit client (amountRemaining négatif)', async () => {
    const { tx } = makeTx({ totalAmount: 100_000, paymentsSum: 100_000, creditsSum: -30_000 });
    const state = await recomputeSaleInvoiceState(tx as never, 'inv1');
    expect(state?.amountRemaining).toBe(-30_000); // le client a un avoir de 30k
    expect(state?.paymentStatus).toBe(PaymentStatus.PAID);
  });

  it('facture introuvable → null, aucune écriture', async () => {
    const { tx, update } = makeTx({ totalAmount: null, paymentsSum: 0, creditsSum: 0 });
    const state = await recomputeSaleInvoiceState(tx as never, 'inv1');
    expect(state).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
