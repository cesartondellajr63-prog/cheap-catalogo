import {
  Injectable,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { OrdersService } from '../orders/orders.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateCardPaymentDto } from './dto/create-card-payment.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly ordersService: OrdersService,
  ) {}

  async createPixPayment(dto: CreatePaymentDto): Promise<any> {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      throw new InternalServerErrorException('Mercado Pago access token not configured.');
    }

    const frontendUrl = process.env.FRONTEND_URL!;
    const backendUrl = process.env.BACKEND_URL!;

    const phone = dto.customerPhone.replace(/\D/g, '');
    const areaCode = phone.substring(0, 2);
    const phoneNumber = phone.substring(2);

    const valorProdutos = dto.items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const valorTotal = valorProdutos + dto.shippingPrice;

    const preference = {
      items: dto.items.map((item) => ({
        title: `${item.model} - ${item.flavor}`,
        description: `Quantidade: ${item.qty}`,
        unit_price: item.price,
        quantity: item.qty,
        currency_id: 'BRL',
      })),
      shipments: {
        cost: dto.shippingPrice,
        mode: 'not_specified',
      },
      payer: {
        name: dto.customerName,
        email: dto.customerEmail,
        phone: {
          area_code: areaCode,
          number: phoneNumber,
        },
      },
      external_reference: dto.orderId,
      back_urls: {
        success: `${frontendUrl}/pedido/${dto.orderId}`,
        failure: `${frontendUrl}/pedido/${dto.orderId}`,
        pending: `${frontendUrl}/pedido/${dto.orderId}`,
      },
      payment_methods: {
        excluded_payment_types: [
          { id: 'credit_card' },
          { id: 'debit_card' },
          { id: 'ticket' },
          { id: 'atm' },
          { id: 'prepaid_card' },
        ],
        default_payment_method_id: 'pix',
      },
      notification_url: `${backendUrl}/webhooks/mercadopago`,
      metadata: {
        order_id: dto.orderId,
        customer_name: dto.customerName,
        customer_phone: dto.customerPhone,
        customer_address: dto.address,
        valor_produtos: valorProdutos,
        valor_frete: dto.shippingPrice,
        valor_total: valorTotal,
      },
    };

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preference),
    });

    if (!mpResponse.ok) {
      const errorBody = await mpResponse.text();
      this.logger.error(`MercadoPago preference creation failed [${mpResponse.status}]: ${errorBody}`);
      throw new InternalServerErrorException('Erro ao criar preferência de pagamento. Tente novamente.');
    }

    const data = (await mpResponse.json()) as any;

    const sessionAccessToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(sessionAccessToken).digest('hex');

    // Cria o pedido atomicamente para evitar race condition com requests duplicados
    const orderRef = this.firebaseService.db.collection('orders').doc(dto.orderId);
    let orderCreated = false;
    await this.firebaseService.db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) {
        orderCreated = true;
      }
    });
    if (orderCreated) {
      await this.ordersService.createWithId(dto.orderId, {
        customerName: dto.customerName,
        customerPhone: dto.customerPhone.replace(/\D/g, ''),
        customerEmail: dto.customerEmail,
        address: dto.address,
        city: dto.city,
        shippingCost: dto.shippingPrice,
        items: dto.items.map(i => ({
          productId: i.model,
          productName: i.model,
          variantId: i.flavor,
          variantName: i.flavor,
          quantity: i.qty,
          unitPrice: i.price,
        })),
      });
    }

    await this.firebaseService.db.collection('sessions').doc(dto.orderId).set({
      tokenHash,
      expiresAt: Date.now() + 2 * 60 * 60 * 1000,
      createdAt: Date.now(),
    });

    await this.ordersService.updatePaymentInfo(dto.orderId, null as any, data.id);

    const orderDoc = await this.firebaseService.db.collection('orders').doc(dto.orderId).get();
    const orderNumber = (orderDoc.data() as any)?.orderNumber ?? dto.orderId;

    return {
      success: true,
      orderId: dto.orderId,
      orderNumber,
      checkoutUrl: data.init_point,
      preferenceId: data.id,
      accessToken: sessionAccessToken,
    };
  }

  async createCardPayment(dto: CreateCardPaymentDto): Promise<any> {
    const merchantId  = process.env.CIELO_MERCHANT_ID;
    const merchantKey = process.env.CIELO_MERCHANT_KEY;
    if (!merchantId || !merchantKey) {
      throw new InternalServerErrorException('Cielo credentials not configured.');
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const backendUrl  = process.env.BACKEND_URL  || 'http://localhost:3001';

    // 1. Cria o pedido no Firestore
    const order = await this.ordersService.create({
      customerName:  dto.customerName,
      customerPhone: dto.customerPhone.replace(/\D/g, ''),
      customerEmail: dto.customerEmail,
      address: `${dto.rua}, ${dto.numero}${dto.complemento ? ', ' + dto.complemento : ''}, ${dto.bairro}`,
      city: dto.cidade,
      shippingCost: dto.shippingPrice,
      items: dto.items.map(i => ({
        productId:   i.name,
        productName: i.name,
        variantId:   i.flavor,
        variantName: i.flavor,
        quantity:    i.qty,
        unitPrice:   i.price,
      })),
    });

    // 2. Monta o body para o Checkout Cielo
    // Cielo trabalha com centavos (inteiros)
    const CARD_FEE = 1.07;
    const toCents = (v: number) => Math.round(v * 100);
    const withFee = (v: number) => Math.round(v * CARD_FEE * 100) / 100;

    const body = {
      OrderNumber:    order.orderNumber,
      SoftDescriptor: 'CheapsPods',
      Cart: {
        Items: dto.items.map(i => ({
          Name:      `${i.name} - ${i.flavor}`,
          UnitPrice: toCents(withFee(i.price)),
          Quantity:  i.qty,
          Type:      'Asset',
        })),
      },
      Shipping: {
        Type:          'FixedAmount',
        TargetZipCode: dto.cep.replace(/\D/g, ''),
        Services: [{ Name: 'Entrega Motoboy', Price: toCents(dto.shippingPrice) }],
        Address: {
          Street:     dto.rua,
          Number:     dto.numero,
          Complement: dto.complemento ?? '',
          District:   dto.bairro,
          City:       dto.cidade,
          State:      dto.estado,
          ZipCode:    dto.cep.replace(/\D/g, ''),
        },
      },
      Payment: {
        BankSlipDays: 0,
      },
      Customer: {
        FullName: dto.customerName,
        Email:    dto.customerEmail,
        Phone:    dto.customerPhone.replace(/\D/g, ''),
      },
      Options: {
        AntifraudEnabled: false,
        ReturnUrl: `${frontendUrl}/pedido/${order.id}`,
        NotifyUrl: `${backendUrl}/webhooks/cielo`,
      },
    };

    // 3. Chama a API do Checkout Cielo
    const cieloRes = await fetch('https://cieloecommerce.cielo.com.br/api/public/v1/orders', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'MerchantId':   merchantId,
        'MerchantKey':  merchantKey,
      },
      body: JSON.stringify(body),
    });

    if (!cieloRes.ok) {
      const err = await cieloRes.text();
      this.logger.error(`Cielo error [${cieloRes.status}]: ${err}`);
      throw new InternalServerErrorException('Erro ao criar pagamento com cartão. Tente novamente.');
    }

    const data = (await cieloRes.json()) as any;
    const checkoutUrl: string = data?.settings?.checkoutUrl;

    if (!checkoutUrl) {
      this.logger.error('Cielo did not return checkoutUrl', JSON.stringify(data));
      throw new InternalServerErrorException('Cielo não retornou URL de pagamento.');
    }

    return {
      success:      true,
      orderId:      order.id,
      orderNumber:  order.orderNumber,
      checkoutUrl,
    };
  }

  async getCardPaymentStatus(orderId: string): Promise<{ status: string; orderNumber: string }> {
    const doc = await this.firebaseService.db.collection('orders').doc(orderId).get();
    if (!doc.exists) {
      return { status: 'PENDING', orderNumber: '' };
    }
    const data = doc.data() as any;
    return {
      status: data.status || 'PENDING',
      orderNumber: data.orderNumber || '',
    };
  }

  async getPaymentStatus(orderId: string, accessToken: string): Promise<any> {
    const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

    const sessionRef = this.firebaseService.db.collection('sessions').doc(orderId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      throw new ForbiddenException('Session not found.');
    }

    const session = sessionSnap.data() as { tokenHash: string; expiresAt: number };

    const providedHash = crypto.createHash('sha256').update(accessToken).digest('hex');

    let tokenValid = false;
    try {
      const a = Buffer.from(providedHash);
      const b = Buffer.from(session.tokenHash);
      tokenValid = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      tokenValid = false;
    }
    if (!tokenValid) {
      throw new ForbiddenException('Invalid access token.');
    }

    if (session.expiresAt < Date.now()) {
      await sessionRef.delete();
      throw new ForbiddenException('Token expired.');
    }

    const searchResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/search?external_reference=${orderId}&sort=date_created&criteria=desc&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${mpToken}`,
        },
      },
    );

    if (!searchResponse.ok) {
      throw new InternalServerErrorException('Failed to fetch payment status.');
    }

    const searchData = (await searchResponse.json()) as any;
    const results = searchData.results || [];

    if (results.length === 0) {
      return { status: 'pending', paymentId: null, amount: null, metadata: null };
    }

    const payment = results[0];
    let status: string;

    if (payment.status === 'approved') {
      status = 'approved';
    } else if (payment.status === 'pending' || payment.status === 'in_process') {
      status = 'pending';
    } else {
      status = 'rejected';
    }

    if (status === 'approved') {
      await sessionRef.delete();
      try {
        const order = await this.ordersService.findById(orderId);
        if (order.status !== 'PAID') {
          await this.ordersService.updatePaymentInfo(orderId, String(payment.id), payment.preference_id || '');
          await this.ordersService.updateStatus(orderId, 'PAID', 'polling_mercadopago');
        }
      } catch {}
    } else if (status === 'rejected') {
      await sessionRef.delete();
    }

    return {
      status,
      paymentId: payment.id,
      amount: payment.transaction_amount,
      metadata: payment.metadata,
    };
  }
}
