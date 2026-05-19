import { escapeHtml } from './layout';

export function renderInvoiceEmail(opts: {
  customerName: string;
  invoiceReference: string;
  invoiceType: 'INVOICE' | 'RECEIPT';
  invoiceDate: Date;
  totalAmount: number;
}): string {
  const fmtXOF = (n: number) =>
    new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' FCFA';
  const fmtDate = new Intl.DateTimeFormat('fr-FR').format(opts.invoiceDate);
  const docTitle = opts.invoiceType === 'INVOICE' ? 'votre facture' : 'votre reçu';

  return `
    <h1 style="margin:0 0 16px;font-size:22px;color:#0F1F14;">Bonjour ${escapeHtml(opts.customerName)},</h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#2D3A2E;">
      Veuillez trouver ci-joint <strong>${docTitle} ${escapeHtml(opts.invoiceReference)}</strong>
      émise le ${fmtDate}.
    </p>

    <div style="margin:0 0 24px;padding:20px;background:#F8FBF5;border-radius:12px;border:1px solid #E2E8DA;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td style="font-size:13px;color:#5A6B5C;">Référence</td>
          <td style="font-size:13px;text-align:right;font-family:monospace;font-weight:700;color:#0F1F14;">${escapeHtml(opts.invoiceReference)}</td>
        </tr>
        <tr><td style="height:6px;" colspan="2"></td></tr>
        <tr>
          <td style="font-size:13px;color:#5A6B5C;">Date</td>
          <td style="font-size:13px;text-align:right;color:#0F1F14;">${fmtDate}</td>
        </tr>
        <tr><td style="height:6px;" colspan="2"></td></tr>
        <tr>
          <td style="font-size:13px;color:#5A6B5C;">Montant total</td>
          <td style="font-size:18px;text-align:right;font-weight:800;color:#047857;">${fmtXOF(opts.totalAmount)}</td>
        </tr>
      </table>
    </div>

    <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#5A6B5C;">
      📎 Le PDF complet est joint à cet email.
    </p>
    <p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:#5A6B5C;">
      Pour toute question, n'hésitez pas à nous contacter.
    </p>

    <p style="margin:0;font-size:13px;color:#5A6B5C;">
      Cordialement,<br/>
      <strong style="color:#0F1F14;">L'équipe SACPROMI</strong>
    </p>
  `;
}
