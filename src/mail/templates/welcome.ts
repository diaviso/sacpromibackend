import { escapeHtml } from './layout';

export function renderWelcomeEmail(opts: {
  fullName: string;
  role: string;
  tempPassword?: string;
  loginUrl: string;
}): string {
  const firstName = opts.fullName.split(' ')[0];
  return `
    <h1 style="margin:0 0 16px;font-size:22px;color:#0F1F14;">Bienvenue ${escapeHtml(firstName)} ! 🌱</h1>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#2D3A2E;">
      Votre compte SACPROMI vient d'être créé avec le rôle <strong>${escapeHtml(opts.role)}</strong>.
    </p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#2D3A2E;">
      Vous pouvez maintenant vous connecter à l'application pour piloter les achats, stocks, production, élevage et ventes de SACPROMI.
    </p>

    ${opts.tempPassword ? `
    <div style="margin:0 0 24px;padding:18px;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:12px;">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#047857;">
        Vos identifiants
      </p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#5A6B5C;">Email</td>
          <td style="padding:6px 0;font-size:13px;text-align:right;font-family:monospace;color:#0F1F14;">${escapeHtml(opts.fullName)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#5A6B5C;">Mot de passe temporaire</td>
          <td style="padding:6px 0;font-size:13px;text-align:right;font-family:monospace;color:#047857;font-weight:700;">${escapeHtml(opts.tempPassword)}</td>
        </tr>
      </table>
    </div>
    <p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#92400E;background:#FFFBEB;padding:12px;border-radius:8px;border:1px solid #FCD34D;">
      💡 <strong>Conseil :</strong> changez votre mot de passe dès la première connexion (depuis votre profil).
    </p>
    ` : ''}

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 28px;">
      <tr>
        <td align="center" style="background:linear-gradient(135deg,#047857,#10B981);border-radius:12px;">
          <a href="${escapeHtml(opts.loginUrl)}"
             style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.3px;">
            Se connecter à SACPROMI
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#5A6B5C;">
      À très vite,<br/>
      <strong style="color:#0F1F14;">L'équipe SACPROMI</strong>
    </p>
  `;
}
