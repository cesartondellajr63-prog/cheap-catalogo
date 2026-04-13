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
    const credentialsJson = this.configService.get<string>('GOOGLE_SHEETS_CREDENTIALS_JSON');

    if (!spreadsheetId || !credentialsJson) {
      this.logger.warn(
        `Google Sheets not configured — missing: ${[
          !spreadsheetId && 'GOOGLE_SHEETS_SPREADSHEET_ID',
          !credentialsJson && 'GOOGLE_SHEETS_CREDENTIALS_JSON',
        ]
          .filter(Boolean)
          .join(', ')}`,
      );
      return;
    }

    let credentials: { client_email: string; private_key: string };
    try {
      credentials = JSON.parse(credentialsJson);
    } catch {
      this.logger.error('GOOGLE_SHEETS_CREDENTIALS_JSON is not valid JSON.');
      return;
    }

    this.spreadsheetId = spreadsheetId;

    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
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
      const pad = (n: number) => String(n).padStart(2, '0');
      // UTC-3 (Brasília)
      const br = new Date(date.getTime() - 3 * 60 * 60 * 1000);
      const dataHora = `${pad(br.getUTCDate())}/${pad(br.getUTCMonth() + 1)}/${br.getUTCFullYear()} ${pad(br.getUTCHours())}:${pad(br.getUTCMinutes())}`;

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

  async updateOrderStatus(orderNumber: string, status: string): Promise<void> {
    if (!this.sheets || !this.spreadsheetId) return;

    const statusMap: Record<string, string> = {
      PENDING: 'PENDENTE',
      PAID: 'PAGO',
      SHIPPED: 'ENVIADO',
      DELIVERED: 'ENTREGUE',
      CANCELLED: 'CANCELADO',
      REFUNDED: 'REEMBOLSADO',
    };
    const statusLabel = statusMap[status] ?? status;

    try {
      // Find the row that matches the orderNumber in column A
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'A:A',
      });

      const rows = response.data.values ?? [];
      const rowIndex = rows.findIndex((r) => r[0] === orderNumber);
      if (rowIndex === -1) {
        this.logger.warn(`Order ${orderNumber} not found in Google Sheets — skipping status sync.`);
        return;
      }

      // Rows are 1-indexed in Sheets API; column K = index 11
      const sheetRow = rowIndex + 1;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `K${sheetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[statusLabel]] },
      });

      this.logger.log(`Order ${orderNumber} status updated to "${statusLabel}" in Google Sheets.`);
    } catch (err) {
      this.logger.error('Failed to update order status in Google Sheets:', err);
    }
  }
}
