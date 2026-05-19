import { escapeHtml } from './layout';

export function renderPasswordResetEmail(opts: {
  fullName: string;
  resetUrl: string;
  expiresInMinutes: number;
}): string {
  const firstName = opts.fullName.split(' ')[0];
  return `
    <h1 style="margin:0 0 16px;font-size:22px;color:#0F1F14;">Bonjour ${escapeHtml(firstName)},</h1>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#2D3A2E;">
      Vous avez demandé la <strong>réinitialisation de votre mot de passe</strong> SACPROMI.
    </p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#2D3A2E;">
      Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe (lien valide ${opts.expiresInMinutes} minutes) :
    </p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 28px;">
      <tr>
        <td align="center" style="background:linear-gradient(135deg,#047857,#10B981);border-radius:12px;">
          <a href="${escapeHtml(opts.resetUrl)}"
             style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.3px;">
            Réinitialiser mon mot de passe
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:#5A6B5C;">
      Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
    </p>
    <p style="margin:0 0 24px;font-size:12px;line-height:1.4;color:#5A6B5C;word-break:break-all;background:#F8FBF5;padding:12px;border-radius:8px;border:1px solid #E2E8DA;">
      <a href="${escapeHtml(opts.resetUrl)}" style="color:#047857;text-decoration:none;">${escapeHtml(opts.resetUrl)}</a>
    </p>
    <div style="margin:24px 0;padding:16px;background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:8px;">
      <p style="margin:0;font-size:13px;line-height:1.5;color:#78350F;">
        <strong>⚠️ Important</strong> — Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message. Votre mot de passe actuel reste inchangé.
      </p>
    </div>
    <p style="margin:0;font-size:13px;color:#5A6B5C;">
      Cordialement,<br/>
      <strong style="color:#0F1F14;">L'équipe SACPROMI</strong>
    </p>
  `;
}
