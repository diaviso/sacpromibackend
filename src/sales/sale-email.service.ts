import { BadRequestException, Injectable } from '@nestjs/common';
import { SaleInvoiceType } from '@prisma/client';
import { MailService } from '../mail/mail.service';

interface SaleInvoiceForEmail {
  reference: string;
  type: SaleInvoiceType;
  invoiceDate: Date | string;
  totalAmount: number;
  customer: { name: string; email?: string | null };
}

/**
 * Wrapper léger : prépare le payload pour MailService.sendInvoice.
 * Conservé pour la compatibilité avec sales.controller.ts.
 */
@Injectable()
export class SaleEmailService {
  constructor(private readonly mail: MailService) {}

  async sendSaleInvoiceEmail(
    invoice: SaleInvoiceForEmail,
    pdfBuffer: Buffer,
  ): Promise<{ message: string; sentTo?: string }> {
    if (!invoice.customer.email) {
      throw new BadRequestException(
        "Le client n'a pas d'adresse email — impossible d'envoyer la facture",
      );
    }

    await this.mail.sendInvoice({
      to: invoice.customer.email,
      customerName: invoice.customer.name,
      invoiceReference: invoice.reference,
      invoiceType: invoice.type,
      invoiceDate: new Date(invoice.invoiceDate),
      totalAmount: invoice.totalAmount,
      pdfBuffer,
    });

    return {
      message: `Email envoyé avec succès à ${invoice.customer.email}`,
      sentTo: invoice.customer.email,
    };
  }
}
