import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';

@Injectable()
export class GoogleSheetsService implements OnModuleInit {
  private readonly logger = new Logger(GoogleSheetsService.name);
  private sheets: sheets_v4.Sheets | null = null;
  private spreadsheetId: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const spreadsheetId = this.configService.get<string>('GOOGLE_SHEETS_SPREADSHEET_ID');
    const clientEmail = this.configService.get<string>('GOOGLE_SHEETS_CLIENT_EMAIL');
    const privateKey = this.configService
      .get<string>('GOOGLE_SHEETS_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');

    if (!spreadsheetId || !clientEmail || !privateKey) {
      this.logger.warn(
        'Google Sheets not configured — set GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SHEETS_CLIENT_EMAIL and GOOGLE_SHEETS_PRIVATE_KEY to enable sync.',
      );
      return;
    }

    this.spreadsheetId = spreadsheetId;

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    this.logger.log('Google Sheets sync enabled.');
  }

  async appendOrderRow(order: {
    orderNumber: string;
    createdAt: number;
    customerName: string;
    customerPhone: string;
    address: string;
    city: string;
    items: Array<{ productName: string; quantity: number; unitPrice: number }>;
    subtotal: number;
    shippingCost: number;
    total: number;
    mpPaymentId?: string | null;
  }): Promise<void> {
    if (!this.sheets || !this.spreadsheetId) return;

    try {
      const date = new Date(order.createdAt);
      const dataHora = date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      const produtos = order.items
        .map((i) => `${i.quantity}x ${i.productName}`)
        .join(', ');

      const metodoPagamento = order.mpPaymentId === undefined || order.mpPaymentId === null
        ? 'Cielo (Cartão)'
        : 'Mercado Pago (PIX)';

      const row = [
        order.orderNumber,           // Nº Pedido
        dataHora,                    // Data/Hora
        order.customerName,          // Nome
        order.customerPhone,         // WhatsApp
        `${order.address}, ${order.city}`, // Endereço
        produtos,                    // Produtos + Sabores
        order.subtotal.toFixed(2).replace('.', ','),    // Valor Produtos (R$)
        order.shippingCost.toFixed(2).replace('.', ','), // Frete (R$)
        order.total.toFixed(2).replace('.', ','),        // Total (R$)
        metodoPagamento,             // Método de Pagamento
        'PENDENTE',                  // Pagamento (status inicial)
        'Pendente',                  // Frete (status inicial)
      ];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'A1',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [row],
        },
      });

      this.logger.log(`Order ${order.orderNumber} appended to Google Sheets.`);
    } catch (err) {
      // Never block the order creation if Sheets fails
      this.logger.error('Failed to append row to Google Sheets:', err);
    }
  }
}
