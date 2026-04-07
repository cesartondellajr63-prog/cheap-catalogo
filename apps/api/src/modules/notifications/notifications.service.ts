import { Injectable, Logger } from '@nestjs/common';

interface OrderItem {
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
}

interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  total: number;
  status: string;
  address: string;
  city: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  private formatCurrency(value: number): string {
    return 'R$ ' + value.toFixed(2).replace('.', ',');
  }

  private buildOrderItemsHtml(items: OrderItem[]): string {
    return items
      .map(
        (item) => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #1a1a1a; color: #e0e0e0;">
            ${item.productName} - ${item.variantName}
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #1a1a1a; color: #e0e0e0; text-align: center;">
            ${item.quantity}
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #1a1a1a; color: #e0e0e0; text-align: right;">
            ${this.formatCurrency(item.unitPrice * item.quantity)}
          </td>
        </tr>
      `,
      )
      .join('');
  }

  private buildBaseEmailHtml(title: string, content: string): string {
    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; padding: 30px 0; border-bottom: 2px solid #c8ff00;">
            <h1 style="color: #c8ff00; margin: 0; font-size: 28px; letter-spacing: 2px;">CHEAPS<span style="color: #ffffff;">PODS</span></h1>
          </div>
          ${content}
          <div style="text-align: center; padding: 20px; margin-top: 20px; border-top: 1px solid #1a1a1a;">
            <p style="color: #666; font-size: 12px; margin: 0;">
              CheapPods &mdash; O melhor custo-benefício em pods descartáveis
            </p>
            <p style="color: #666; font-size: 12px; margin: 5px 0 0 0;">
              Este é um e-mail automático, por favor não responda.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  async sendOrderConfirmation(order: Order): Promise<void> {
    if (!order.customerEmail) {
      this.logger.log(`Order ${order.orderNumber}: no email provided, skipping confirmation.`);
      return;
    }

    const resendApiKey = process.env.RESEND_API_KEY;

    const content = `
      <div style="padding: 30px 0;">
        <h2 style="color: #c8ff00; margin-bottom: 10px;">Pedido Confirmado!</h2>
        <p style="color: #e0e0e0;">Olá, <strong>${order.customerName}</strong>!</p>
        <p style="color: #e0e0e0;">Seu pedido foi recebido e está sendo processado.</p>

        <div style="background: #111; border: 1px solid #1a1a1a; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="color: #c8ff00; font-size: 14px; margin: 0 0 5px 0; text-transform: uppercase; letter-spacing: 1px;">Número do Pedido</p>
          <p style="color: #ffffff; font-size: 22px; font-weight: bold; margin: 0;">${order.orderNumber}</p>
        </div>

        <div style="background: #111; border: 1px solid #1a1a1a; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="color: #c8ff00; margin-top: 0;">Itens do Pedido</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="padding: 8px 12px; text-align: left; color: #888; font-size: 12px; text-transform: uppercase;">Produto</th>
                <th style="padding: 8px 12px; text-align: center; color: #888; font-size: 12px; text-transform: uppercase;">Qtd</th>
                <th style="padding: 8px 12px; text-align: right; color: #888; font-size: 12px; text-transform: uppercase;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${this.buildOrderItemsHtml(order.items)}
            </tbody>
          </table>
          <div style="border-top: 1px solid #1a1a1a; margin-top: 12px; padding-top: 12px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #888;">Subtotal:</span>
              <span style="color: #e0e0e0;">${this.formatCurrency(order.subtotal)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #888;">Frete:</span>
              <span style="color: #e0e0e0;">${this.formatCurrency(order.shippingCost)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 12px; padding-top: 12px; border-top: 1px solid #c8ff00;">
              <span style="color: #c8ff00; font-weight: bold; font-size: 16px;">Total:</span>
              <span style="color: #c8ff00; font-weight: bold; font-size: 16px;">${this.formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>

        <div style="background: #111; border: 1px solid #1a1a1a; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="color: #c8ff00; margin-top: 0;">Endereço de Entrega</h3>
          <p style="color: #e0e0e0; margin: 0;">${order.address}</p>
          <p style="color: #e0e0e0; margin: 5px 0 0 0;">${order.city}</p>
        </div>

        <div style="background: #111; border: 1px solid #c8ff00; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center;">
          <p style="color: #888; margin: 0 0 5px 0; font-size: 12px;">Status do Pedido</p>
          <p style="color: #c8ff00; font-weight: bold; margin: 0; font-size: 16px;">AGUARDANDO PAGAMENTO</p>
        </div>
      </div>
    `;

    if (!resendApiKey) {
      this.logger.log(
        `[DEV] Order confirmation email for ${order.orderNumber} to ${order.customerEmail}`,
      );
      return;
    }

    try {
      const { Resend } = await import('resend');
      const resend = new Resend(resendApiKey);

      await resend.emails.send({
        from: 'CheapPods <noreply@cheapspods.com.br>',
        to: [order.customerEmail],
        subject: `Pedido ${order.orderNumber} confirmado - CheapPods`,
        html: this.buildBaseEmailHtml(`Pedido ${order.orderNumber} confirmado`, content),
      });

      this.logger.log(`Order confirmation email sent for ${order.orderNumber}.`);
    } catch (error) {
      this.logger.error(`Failed to send order confirmation email: ${(error as Error).message}`);
    }
  }

  async sendPaymentApproved(order: Order): Promise<void> {
    if (!order.customerEmail) {
      this.logger.log(`Order ${order.orderNumber}: no email provided, skipping payment approved.`);
      return;
    }

    const resendApiKey = process.env.RESEND_API_KEY;

    const content = `
      <div style="padding: 30px 0;">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="width: 70px; height: 70px; background: #c8ff00; border-radius: 50%; margin: 0 auto 15px auto; display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 36px;">✓</span>
          </div>
          <h2 style="color: #c8ff00; margin: 0;">Pagamento Aprovado!</h2>
        </div>

        <p style="color: #e0e0e0;">Olá, <strong>${order.customerName}</strong>!</p>
        <p style="color: #e0e0e0;">Ótimas notícias! Seu pagamento foi aprovado e seu pedido já está sendo preparado.</p>

        <div style="background: #111; border: 1px solid #1a1a1a; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="color: #c8ff00; font-size: 14px; margin: 0 0 5px 0; text-transform: uppercase; letter-spacing: 1px;">Número do Pedido</p>
          <p style="color: #ffffff; font-size: 22px; font-weight: bold; margin: 0;">${order.orderNumber}</p>
        </div>

        <div style="background: #111; border: 1px solid #1a1a1a; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="color: #c8ff00; margin-top: 0;">Resumo do Pedido</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="padding: 8px 12px; text-align: left; color: #888; font-size: 12px; text-transform: uppercase;">Produto</th>
                <th style="padding: 8px 12px; text-align: center; color: #888; font-size: 12px; text-transform: uppercase;">Qtd</th>
                <th style="padding: 8px 12px; text-align: right; color: #888; font-size: 12px; text-transform: uppercase;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${this.buildOrderItemsHtml(order.items)}
            </tbody>
          </table>
          <div style="border-top: 1px solid #1a1a1a; margin-top: 12px; padding-top: 12px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #888;">Subtotal:</span>
              <span style="color: #e0e0e0;">${this.formatCurrency(order.subtotal)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #888;">Frete:</span>
              <span style="color: #e0e0e0;">${this.formatCurrency(order.shippingCost)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 12px; padding-top: 12px; border-top: 1px solid #c8ff00;">
              <span style="color: #c8ff00; font-weight: bold; font-size: 16px;">Total Pago:</span>
              <span style="color: #c8ff00; font-weight: bold; font-size: 16px;">${this.formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>

        <div style="background: #111; border: 1px solid #c8ff00; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center;">
          <p style="color: #888; margin: 0 0 5px 0; font-size: 12px;">Status do Pedido</p>
          <p style="color: #c8ff00; font-weight: bold; margin: 0; font-size: 16px;">PAGO - EM PREPARACAO</p>
        </div>

        <p style="color: #888; font-size: 13px; text-align: center;">
          Você receberá uma notificação quando seu pedido for enviado.
        </p>
      </div>
    `;

    if (!resendApiKey) {
      this.logger.log(
        `[DEV] Payment approved email for ${order.orderNumber} to ${order.customerEmail}`,
      );
      return;
    }

    try {
      const { Resend } = await import('resend');
      const resend = new Resend(resendApiKey);

      await resend.emails.send({
        from: 'CheapPods <noreply@cheapspods.com.br>',
        to: [order.customerEmail],
        subject: `Pagamento aprovado - Pedido ${order.orderNumber} - CheapPods`,
        html: this.buildBaseEmailHtml(`Pagamento Aprovado - ${order.orderNumber}`, content),
      });

      this.logger.log(`Payment approved email sent for ${order.orderNumber}.`);
    } catch (error) {
      this.logger.error(`Failed to send payment approved email: ${(error as Error).message}`);
    }
  }
}
