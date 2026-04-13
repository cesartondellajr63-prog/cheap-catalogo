import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';

// Column layout (1-indexed):
// A=1  Nº Pedido
// B=2  Data/Hora
// C=3  Nome
// D=4  WhatsApp
// E=5  Endereço
// F=6  Produtos + Sabores
// G=7  Valor Produtos (R$)
// H=8  Frete (R$)
// I=9  Total (R$)
// J=10 Método de Pagamento
// K=11 Pagamento
// L=12 Motoboy
// M=13 Frete (status)

const COL_PAGAMENTO  = 'K';
const COL_MOTOBOY    = 'L';
const COL_FRETE      = 'M';

/** Remove leading emoji + space, e.g. "🛵 Lala Move" → "Lala Move" */
function stripEmoji(value: string): string {
  return value.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]+\s*/u, '').trim();
}

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

  // ─── Internal helpers ────────────────────────────────────────────────────────

  /** Returns the 1-indexed sheet row for the given orderNumber, or -1 if not found. */
  private async findOrderRow(orderNumber: string): Promise<number> {
    const response = await this.sheets!.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId!,
      range: 'A:A',
    });
    const rows = response.data.values ?? [];
    const idx = rows.findIndex((r) => r[0] === orderNumber);
    return idx === -1 ? -1 : idx + 1;
  }

  private async updateCell(col: string, row: number, value: string): Promise<void> {
    await this.sheets!.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId!,
      range: `${col}${row}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[value]] },
    });
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

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
    paymentMethod?: 'mp' | 'cielo';
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

      const metodoPagamento = order.paymentMethod === 'mp'
        ? 'Mercado Pago (PIX)'
        : 'Cielo (Cartão)';

      const row = [
        order.orderNumber,                                   // A  Nº Pedido
        dataHora,                                            // B  Data/Hora
        order.customerName,                                  // C  Nome
        order.customerPhone,                                 // D  WhatsApp
        `${order.address}, ${order.city}`,                   // E  Endereço
        produtos,                                            // F  Produtos + Sabores
        order.subtotal.toFixed(2).replace('.', ','),         // G  Valor Produtos (R$)
        order.shippingCost.toFixed(2).replace('.', ','),     // H  Frete (R$)
        order.total.toFixed(2).replace('.', ','),            // I  Total (R$)
        metodoPagamento,                                     // J  Método de Pagamento
        'PENDENTE',                                          // K  Pagamento
        'Pendente',                                          // L  Motoboy
        'Pendente',                                          // M  Frete (status)
      ];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'A1',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] },
      });

      this.logger.log(`Order ${order.orderNumber} appended to Google Sheets.`);
    } catch (err) {
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
    const label = statusMap[status] ?? status;

    console.log(`[Sheets] updateOrderStatus ${orderNumber} → ${label}`);
    const row = await this.findOrderRow(orderNumber);
    if (row === -1) {
      console.warn(`[Sheets] Order ${orderNumber} not found — skipping.`);
      return;
    }
    await this.updateCell(COL_PAGAMENTO, row, label);
    console.log(`[Sheets] K${row} updated to "${label}".`);
  }

  async updateOrderMotoboy(orderNumber: string, motoboy: string): Promise<void> {
    if (!this.sheets || !this.spreadsheetId) return;

    const label = stripEmoji(motoboy);
    console.log(`[Sheets] updateOrderMotoboy ${orderNumber} → ${label}`);
    const row = await this.findOrderRow(orderNumber);
    if (row === -1) {
      console.warn(`[Sheets] Order ${orderNumber} not found — skipping.`);
      return;
    }
    await this.updateCell(COL_MOTOBOY, row, label);
    console.log(`[Sheets] L${row} updated to "${label}".`);
  }

  async updateOrderShippingStatus(orderNumber: string, shippingStatus: string): Promise<void> {
    if (!this.sheets || !this.spreadsheetId) return;

    const label = stripEmoji(shippingStatus);
    console.log(`[Sheets] updateOrderShippingStatus ${orderNumber} → ${label}`);
    const row = await this.findOrderRow(orderNumber);
    if (row === -1) {
      console.warn(`[Sheets] Order ${orderNumber} not found — skipping.`);
      return;
    }
    await this.updateCell(COL_FRETE, row, label);
    console.log(`[Sheets] M${row} updated to "${label}".`);
  }
}
