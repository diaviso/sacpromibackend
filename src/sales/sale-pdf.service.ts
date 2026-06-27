import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { SaleInvoiceType } from '@prisma/client';

type SaleInvoiceForPdf = {
  reference: string;
  type: SaleInvoiceType;
  invoiceDate: Date | string;
  subtotalAmount?: number;
  discountAmount?: number;
  discountReason?: string | null;
  totalAmount: number;
  amountPaid: number;
  amountRemaining: number;
  paymentMethod: string;
  paymentStatus: string;
  note?: string | null;
  customer: {
    name: string;
    address: string;
    phone: string;
    email?: string | null;
  };
  items: ReadonlyArray<{
    productName: string;
    quantity: unknown;
    unitPrice: number;
    lineAmount: number;
  }>;
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Espèces',
  WAVE: 'Wave',
  ORANGE_MONEY: 'Orange Money',
  TRANSFER: 'Virement',
  CHECK: 'Chèque',
  CREDIT: 'Crédit',
};

const STATUS_LABELS: Record<string, string> = {
  PAID: 'PAYÉE',
  PARTIALLY_PAID: 'PARTIELLEMENT PAYÉE',
  UNPAID: 'NON PAYÉE',
};

@Injectable()
export class SalePdfService {
  async generateSaleInvoicePdf(invoice: SaleInvoiceForPdf): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks: Buffer[] = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const fmtXOF = (amount: number) =>
          new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount) + ' FCFA';
        const fmtDate = (d: Date | string) =>
          new Intl.DateTimeFormat('fr-FR').format(new Date(d));

        const isInvoice = invoice.type === SaleInvoiceType.INVOICE;
        const docTitle = isInvoice ? 'FACTURE' : 'REÇU';

        // ── Header avec couleur SACPROMI ──
        doc.rect(0, 0, doc.page.width, 110).fill('#047857');
        doc
          .fillColor('#FFFFFF')
          .fontSize(28)
          .font('Helvetica-Bold')
          .text('SACPROMI', 50, 35, { align: 'left' });
        doc
          .fontSize(9)
          .font('Helvetica')
          .text("Société de Production d'Aliments pour Animaux", 50, 68)
          .text('Sénégal • +221 XX XXX XX XX', 50, 82);
        doc
          .fontSize(22)
          .font('Helvetica-Bold')
          .text(docTitle, 0, 45, { align: 'right', width: doc.page.width - 50 });
        doc
          .fontSize(11)
          .font('Helvetica')
          .text(invoice.reference, 0, 75, { align: 'right', width: doc.page.width - 50 });

        // ── Infos facture + client ──
        const startY = 140;
        doc.fillColor('#0F1F14').fontSize(9).font('Helvetica-Bold');
        doc.text('FACTURÉ À', 50, startY);
        doc.text('DÉTAILS', 320, startY);

        doc.font('Helvetica').fontSize(10);
        doc.text(invoice.customer.name, 50, startY + 14);
        doc.text(invoice.customer.address, 50, startY + 28);
        doc.text(invoice.customer.phone, 50, startY + 42);
        if (invoice.customer.email) {
          doc.text(invoice.customer.email, 50, startY + 56);
        }

        doc.fontSize(9).font('Helvetica-Bold').text('Date :', 320, startY + 14);
        doc.font('Helvetica').text(fmtDate(invoice.invoiceDate), 365, startY + 14);
        doc.font('Helvetica-Bold').text('Mode :', 320, startY + 28);
        doc.font('Helvetica').text(PAYMENT_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod, 365, startY + 28);
        doc.font('Helvetica-Bold').text('Statut :', 320, startY + 42);
        doc.font('Helvetica').fillColor(
          invoice.paymentStatus === 'PAID'
            ? '#047857'
            : invoice.paymentStatus === 'PARTIALLY_PAID'
              ? '#D97706'
              : '#DC2626',
        );
        doc.text(STATUS_LABELS[invoice.paymentStatus] ?? invoice.paymentStatus, 365, startY + 42);

        // ── Tableau des lignes ──
        const tableTop = 230;
        doc.fillColor('#FFFFFF').rect(50, tableTop, doc.page.width - 100, 24).fill('#0F1F14');
        doc
          .fillColor('#FFFFFF')
          .fontSize(9)
          .font('Helvetica-Bold')
          .text('PRODUIT', 60, tableTop + 8)
          .text('QTÉ', 320, tableTop + 8, { width: 50, align: 'right' })
          .text('PU', 380, tableTop + 8, { width: 70, align: 'right' })
          .text('TOTAL', 460, tableTop + 8, { width: 85, align: 'right' });

        let rowY = tableTop + 30;
        doc.fillColor('#0F1F14').font('Helvetica').fontSize(9.5);
        invoice.items.forEach((item, idx) => {
          if (idx % 2 === 0) {
            doc.rect(50, rowY - 4, doc.page.width - 100, 22).fill('#F8FBF5');
            doc.fillColor('#0F1F14');
          }
          doc.text(item.productName, 60, rowY, { width: 250 });
          doc.text(String(Number(item.quantity)), 320, rowY, { width: 50, align: 'right' });
          doc.text(fmtXOF(item.unitPrice), 380, rowY, { width: 70, align: 'right' });
          doc.text(fmtXOF(item.lineAmount), 460, rowY, { width: 85, align: 'right' });
          rowY += 22;
        });

        // ── Totaux ──
        rowY += 10;
        doc
          .strokeColor('#E2E8DA')
          .lineWidth(1)
          .moveTo(330, rowY)
          .lineTo(545, rowY)
          .stroke();
        rowY += 8;
        doc.font('Helvetica').fontSize(10);

        // Sous-total + remise si applicable (mode CAISSE)
        const hasDiscount = (invoice.discountAmount ?? 0) > 0;
        if (hasDiscount) {
          doc.text('Sous-total :', 330, rowY, { width: 130, align: 'right' });
          doc
            .font('Helvetica')
            .text(fmtXOF(invoice.subtotalAmount ?? invoice.totalAmount + (invoice.discountAmount ?? 0)), 460, rowY, {
              width: 85,
              align: 'right',
            });
          rowY += 18;
          doc.font('Helvetica').fillColor('#B45309').text(
            invoice.discountReason ? `Remise (${invoice.discountReason}) :` : 'Remise :',
            330,
            rowY,
            { width: 130, align: 'right' },
          );
          doc.font('Helvetica-Bold').fillColor('#B45309').text(
            `- ${fmtXOF(invoice.discountAmount ?? 0)}`,
            460,
            rowY,
            { width: 85, align: 'right' },
          );
          doc.fillColor('#0F1F14');
          rowY += 18;
        }

        doc.font('Helvetica').text('Total :', 330, rowY, { width: 130, align: 'right' });
        doc.font('Helvetica-Bold').text(fmtXOF(invoice.totalAmount), 460, rowY, { width: 85, align: 'right' });

        if (invoice.amountPaid > 0 && invoice.amountPaid < invoice.totalAmount) {
          rowY += 18;
          doc.font('Helvetica').text('Payé :', 330, rowY, { width: 130, align: 'right' });
          doc.font('Helvetica-Bold').fillColor('#047857').text(fmtXOF(invoice.amountPaid), 460, rowY, { width: 85, align: 'right' });
          rowY += 18;
          doc.fillColor('#0F1F14').font('Helvetica').text('Reste dû :', 330, rowY, { width: 130, align: 'right' });
          doc.font('Helvetica-Bold').fillColor('#DC2626').text(fmtXOF(invoice.amountRemaining), 460, rowY, { width: 85, align: 'right' });
        }

        // ── Footer ──
        const footerY = doc.page.height - 80;
        doc.fillColor('#5A6B5C').font('Helvetica').fontSize(8);
        if (invoice.note) {
          doc.text(invoice.note, 50, footerY - 30, { width: doc.page.width - 100 });
        }
        doc
          .text(
            `${docTitle} générée le ${fmtDate(new Date())} par SACPROMI — Application de gestion intégrée`,
            50,
            footerY,
            { align: 'center', width: doc.page.width - 100 },
          );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
