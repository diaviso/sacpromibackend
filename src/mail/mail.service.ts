import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { renderEmailLayout } from './templates/layout';
import { renderPasswordResetEmail } from './templates/password-reset';
import { renderWelcomeEmail } from './templates/welcome';
import { renderPaymentReceiptEmail } from './templates/payment-receipt';
import { renderInvoiceEmail } from './templates/invoice';

export interface MailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private fromAddress = 'SACPROMI <noreply@sacpromi.sn>';

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const host = this.config.get<string>('MAIL_HOST');
    const user = this.config.get<string>('MAIL_USER');
    const pass = this.config.get<string>('MAIL_PASS');
    const port = parseInt(this.config.get<string>('MAIL_PORT', '465'), 10);
    const secure = this.config.get<string>('MAIL_SECURE', 'true') === 'true';
    this.fromAddress =
      this.config.get<string>('MAIL_FROM') ?? this.fromAddress;

    if (!host || !user || !pass) {
      this.logger.warn(
        '⚠️ SMTP non configuré (MAIL_HOST/MAIL_USER/MAIL_PASS) — les emails seront simulés (jsonTransport)',
      );
      this.transporter = nodemailer.createTransport({ jsonTransport: true });
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    try {
      await this.transporter.verify();
      this.logger.log(`📧 SMTP prêt (${host}:${port}, from: ${this.fromAddress})`);
    } catch (err) {
      this.logger.error('❌ Échec de connexion SMTP', err);
    }
  }

  /** Envoie un email brut avec le layout commun. */
  async send(opts: SendMailOptions): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('Transporter non initialisé — skip envoi');
      return;
    }

    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
        attachments: opts.attachments,
      });
      this.logger.log(`📤 Email envoyé à ${opts.to} — ${opts.subject}`);
      if (process.env.NODE_ENV !== 'production') {
        this.logger.debug(`messageId: ${info.messageId}`);
      }
    } catch (err) {
      this.logger.error(`❌ Échec envoi email à ${opts.to}`, err);
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // High-level API : un par contexte métier
  // ──────────────────────────────────────────────────────────────────

  /** Email contenant le lien de réinitialisation du mot de passe. */
  async sendPasswordReset(opts: {
    to: string;
    fullName: string;
    resetUrl: string;
    expiresInMinutes: number;
  }): Promise<void> {
    const html = renderEmailLayout({
      title: 'Réinitialisation de votre mot de passe',
      body: renderPasswordResetEmail(opts),
    });
    await this.send({
      to: opts.to,
      subject: 'Réinitialisation de votre mot de passe — SACPROMI',
      html,
      text: `Bonjour ${opts.fullName},\n\nVous avez demandé la réinitialisation de votre mot de passe SACPROMI.\nCliquez sur ce lien (valide ${opts.expiresInMinutes} minutes) :\n${opts.resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce mail.`,
    });
  }

  /** Email de bienvenue avec identifiants temporaires. */
  async sendWelcome(opts: {
    to: string;
    fullName: string;
    role: string;
    tempPassword?: string;
    loginUrl: string;
  }): Promise<void> {
    const html = renderEmailLayout({
      title: `Bienvenue sur SACPROMI, ${opts.fullName.split(' ')[0]} !`,
      body: renderWelcomeEmail(opts),
    });
    await this.send({
      to: opts.to,
      subject: 'Bienvenue sur SACPROMI',
      html,
      text: `Bonjour ${opts.fullName},\n\nVotre compte SACPROMI vient d'être créé.\nRôle : ${opts.role}\n${opts.tempPassword ? `Mot de passe temporaire : ${opts.tempPassword}\n` : ''}Connectez-vous : ${opts.loginUrl}`,
    });
  }

  /** Confirmation d'encaissement reçu d'un client. */
  async sendPaymentReceipt(opts: {
    to: string;
    customerName: string;
    invoiceReference: string;
    amount: number;
    paymentDate: Date;
    paymentMethod: string;
    amountRemaining: number;
    totalAmount: number;
  }): Promise<void> {
    const html = renderEmailLayout({
      title: `Paiement bien reçu — ${opts.invoiceReference}`,
      body: renderPaymentReceiptEmail(opts),
    });
    const fmtXOF = (n: number) =>
      new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' FCFA';
    await this.send({
      to: opts.to,
      subject: `Paiement bien reçu — ${opts.invoiceReference}`,
      html,
      text: `Bonjour ${opts.customerName},\n\nNous avons bien reçu votre paiement de ${fmtXOF(opts.amount)} pour la facture ${opts.invoiceReference}.\n${opts.amountRemaining > 0 ? `Reste à régler : ${fmtXOF(opts.amountRemaining)}` : 'Cette facture est désormais entièrement soldée. Merci !'}\n\nL'équipe SACPROMI`,
    });
  }

  /** Envoi de la facture PDF par email au client. */
  async sendInvoice(opts: {
    to: string;
    customerName: string;
    invoiceReference: string;
    invoiceType: 'INVOICE' | 'RECEIPT';
    invoiceDate: Date;
    totalAmount: number;
    pdfBuffer: Buffer;
  }): Promise<void> {
    const html = renderEmailLayout({
      title: `${opts.invoiceType === 'INVOICE' ? 'Facture' : 'Reçu'} ${opts.invoiceReference}`,
      body: renderInvoiceEmail(opts),
    });
    const docTitle = opts.invoiceType === 'INVOICE' ? 'Facture' : 'Reçu';
    await this.send({
      to: opts.to,
      subject: `${docTitle} ${opts.invoiceReference} — SACPROMI`,
      html,
      attachments: [
        {
          filename: `${opts.invoiceReference}.pdf`,
          content: opts.pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
  }
}
