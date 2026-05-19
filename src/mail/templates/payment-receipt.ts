import { escapeHtml } from './layout';

export function renderPaymentReceiptEmail(opts: {
  customerName: string;
  invoiceReference: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: string;
  amountRemaining: number;
  totalAmount: number;
}): string {
  const fmtXOF = (n: number) =>
    new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' FCFA';
  const fmtDate = new Intl.DateTimeFormat('fr-FR').format(opts.paymentDate);
  const isPaid = opts.amountRemaining <= 0;

  return `
    <h1 style="margin:0 0 16px;font-size:22px;color:#0F1F14;">Bonjour ${escapeHtml(opts.customerName)},</h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#2D3A2E;">
      Nous avons bien reçu votre paiement. Merci pour votre confiance ! 🌱
    </p>

    <div style="margin:0 0 24px;padding:24px;background:linear-gradient(135deg,#ECFDF5 0%,#F0FDF4 100%);border:1px solid #A7F3D0;border-radius:14px;text-align:center;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#047857;">
        Paiement reçu
      </p>
      <p style="margin:0 0 12px;font-size:32px;font-weight:800;color:#047857;letter-spacing:-1px;">
        ${fmtXOF(opts.amount)}
      </p>
      <p style="margin:0;font-size:13px;color:#5A6B5C;">
        ${escapeHtml(opts.paymentMethod)} • ${fmtDate}
      </p>
    </div>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px;background:#F8FBF5;border-radius:10px;border:1px solid #E2E8DA;">
      <tr>
        <td style="padding:14px 16px;font-size:13px;color:#5A6B5C;">Facture</td>
        <td style="padding:14px 16px;font-size:13px;text-align:right;font-family:monospace;font-weight:700;color:#0F1F14;">${escapeHtml(opts.invoiceReference)}</td>
      </tr>
      <tr style="border-top:1px solid #E2E8DA;">
        <td style="padding:14px 16px;font-size:13px;color:#5A6B5C;">Total facture</td>
        <td style="padding:14px 16px;font-size:13px;text-align:right;color:#0F1F14;">${fmtXOF(opts.totalAmount)}</td>
      </tr>
      <tr style="border-top:1px solid #E2E8DA;">
        <td style="padding:14px 16px;font-size:13px;color:#5A6B5C;">Reste à régler</td>
        <td style="padding:14px 16px;font-size:14px;text-align:right;font-weight:700;color:${isPaid ? '#047857' : '#D97706'};">
          ${isPaid ? '✓ Soldée' : fmtXOF(opts.amountRemaining)}
        </td>
      </tr>
    </table>

    ${isPaid ? `
    <div style="margin:0 0 20px;padding:14px;background:#ECFDF5;border-radius:10px;border-left:4px solid #10B981;text-align:center;">
      <p style="margin:0;font-size:13px;color:#047857;font-weight:600;">
        🎉 Cette facture est désormais entièrement soldée. Merci !
      </p>
    </div>` : ''}

    <p style="margin:0;font-size:13px;color:#5A6B5C;">
      Cordialement,<br/>
      <strong style="color:#0F1F14;">L'équipe SACPROMI</strong>
    </p>
  `;
}
