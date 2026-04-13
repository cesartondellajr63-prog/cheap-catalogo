import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { CustomersService } from '../customers/customers.service';
import { GoogleSheetsService } from '../../shared/google-sheets/google-sheets.service';
import { ProductsService } from '../products/products.service';
import { CreateOrderDto, OrderItemDto } from './dto/create-order.dto';

const VALID_STATUSES = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly customersService: CustomersService,
    private readonly googleSheetsService: GoogleSheetsService,
    private readonly productsService: ProductsService,
  ) {}

  /**
   * Resolve o preço autoritativo de cada item consultando o Firebase.
   * O unitPrice enviado pelo frontend é IGNORADO — apenas os valores do
   * banco de dados são usados, prevenindo manipulação de preços.
   */
  private async resolveItems(items: OrderItemDto[]): Promise<OrderItemDto[]> {
    return Promise.all(
      items.map(async (item) => {
        try {
          const product = await this.productsService.findBySlug(item.productId);

          if (!product.active) {
            throw new BadRequestException(`Produto "${product.name}" não está disponível.`);
          }

          const variant = (product.variants as any[])?.find(
            (v: any) => v.name === item.variantName || v.id === item.variantId,
          );

          if (variant?.active === false) {
            throw new BadRequestException(`Variante "${item.variantName}" não está disponível.`);
          }

          const unitPrice: number = variant?.priceOverride ?? product.basePrice;

          return { ...item, unitPrice, productName: product.name, variantName: variant?.name ?? item.variantName };
        } catch (e) {
          if (e instanceof BadRequestException) throw e;
          throw new BadRequestException(`Produto "${item.productId}" não encontrado no catálogo.`);
        }
      }),
    );
  }

  private calculateSubtotal(items: OrderItemDto[]): number {
    return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }

  private generateOrderNumber(): string {
    const digits = crypto.randomInt(10000000, 100000000);
    return `CP-${digits}`;
  }

  async createWithId(id: string, dto: CreateOrderDto): Promise<any> {
    const resolvedItems = await this.resolveItems(dto.items);
    const orderNumber = this.generateOrderNumber();
    const subtotal = this.calculateSubtotal(resolvedItems);
    const total = subtotal + dto.shippingCost;
    const now = Date.now();

    const order = {
      id,
      orderNumber,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      customerEmail: dto.customerEmail || null,
      address: dto.address,
      city: dto.city,
      shippingCost: dto.shippingCost,
      items: resolvedItems,
      subtotal,
      total,
      status: 'PENDING',
      mpPaymentId: null,
      mpPreferenceId: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.firebaseService.db.collection('orders').doc(id).set(order);

    const [customerResult, sheetsResult] = await Promise.allSettled([
      this.customersService.upsertFromOrder({
        name: dto.customerName,
        phone: dto.customerPhone,
        email: dto.customerEmail,
        address: `${dto.address}, ${dto.city}`,
      }),
      this.googleSheetsService.appendOrderRow(order),
    ]);

    if (customerResult.status === 'rejected') {
      this.logger.error(`[${order.orderNumber}] Failed to upsert customer: ${customerResult.reason}`);
    }
    if (sheetsResult.status === 'rejected') {
      this.logger.error(`[${order.orderNumber}] Failed to sync Google Sheets: ${sheetsResult.reason}`);
    }

    return order;
  }

  async create(dto: CreateOrderDto): Promise<any> {
    const resolvedItems = await this.resolveItems(dto.items);
    const id = crypto.randomUUID();
    const orderNumber = this.generateOrderNumber();
    const subtotal = this.calculateSubtotal(resolvedItems);
    const total = subtotal + dto.shippingCost;
    const now = Date.now();

    const order = {
      id,
      orderNumber,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      customerEmail: dto.customerEmail || null,
      address: dto.address,
      city: dto.city,
      shippingCost: dto.shippingCost,
      items: resolvedItems,
      subtotal,
      total,
      status: 'PENDING',
      mpPaymentId: null,
      mpPreferenceId: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.firebaseService.db.collection('orders').doc(id).set(order);

    const [customerResult, sheetsResult] = await Promise.allSettled([
      this.customersService.upsertFromOrder({
        name: dto.customerName,
        phone: dto.customerPhone,
        email: dto.customerEmail,
        address: `${dto.address}, ${dto.city}`,
      }),
      this.googleSheetsService.appendOrderRow(order),
    ]);

    if (customerResult.status === 'rejected') {
      this.logger.error(`[${order.orderNumber}] Failed to upsert customer: ${customerResult.reason}`);
    }
    if (sheetsResult.status === 'rejected') {
      this.logger.error(`[${order.orderNumber}] Failed to sync Google Sheets: ${sheetsResult.reason}`);
    }

    return order;
  }

  async findByOrderNumber(orderNumber: string): Promise<any> {
    const snap = await this.firebaseService.db
      .collection('orders')
      .where('orderNumber', '==', orderNumber)
      .limit(1)
      .get();
    if (snap.empty) throw new NotFoundException(`Order "${orderNumber}" not found.`);
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  async findById(id: string): Promise<any> {
    const docRef = this.firebaseService.db.collection('orders').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new NotFoundException(`Order with id "${id}" not found.`);
    }

    return { id: docSnap.id, ...docSnap.data() };
  }

  async findAll(filters?: { status?: string }): Promise<any[]> {
    let query: FirebaseFirestore.Query = this.firebaseService.db
      .collection('orders')
      .orderBy('createdAt', 'desc');

    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async updateStatus(id: string, status: string, actorId?: string): Promise<any> {
    console.log(`[DEBUG] updateStatus called — id=${id} status=${status}`);
    if (!VALID_STATUSES.includes(status)) {
      throw new BadRequestException(
        `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}.`,
      );
    }

    const docRef = this.firebaseService.db.collection('orders').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new NotFoundException(`Order with id "${id}" not found.`);
    }

    const previousStatus = (docSnap.data() as any).status;
    const now = Date.now();

    const existingPaidAt = (docSnap.data() as any).paidAt ?? null;
    const paidAt = status === 'PAID' && !existingPaidAt ? now : existingPaidAt;
    await docRef.update({ status, updatedAt: now, ...(status === 'PAID' && !existingPaidAt ? { paidAt: now } : {}) });

    await this.firebaseService.db.collection('audit_logs').add({
      entityType: 'order',
      entityId: id,
      action: 'status_changed',
      actorId: actorId || 'system',
      payload: { from: previousStatus, to: status },
      createdAt: now,
    });

    const orderData = (docSnap.data() as any);
    console.log(`[Sheets] Triggering status sync for order ${orderData.orderNumber} → ${status}`);
    this.googleSheetsService.updateOrderStatus(orderData.orderNumber, status)
      .catch((err) => console.error(`[Sheets] Failed to update status for ${orderData.orderNumber}:`, err));

    const updated = await docRef.get();
    return { id, ...updated.data() };
  }

  async updateShippingStatus(id: string, shippingStatus: string): Promise<any> {
    const docRef = this.firebaseService.db.collection('orders').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) throw new NotFoundException(`Order with id "${id}" not found.`);
    await docRef.update({ shippingStatus, updatedAt: Date.now() });
    const orderNumber = (docSnap.data() as any).orderNumber;
    this.googleSheetsService.updateOrderShippingStatus(orderNumber, shippingStatus)
      .catch((err) => console.error(`[Sheets] Failed to update shippingStatus for ${orderNumber}:`, err));
    const updated = await docRef.get();
    return { id, ...updated.data() };
  }

  async updateTrackingLink(id: string, trackingLink: string): Promise<any> {
    const docRef = this.firebaseService.db.collection('orders').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) throw new NotFoundException(`Order with id "${id}" not found.`);
    await docRef.update({ trackingLink, updatedAt: Date.now() });
    const updated = await docRef.get();
    return { id, ...updated.data() };
  }

  async updateMotoboy(id: string, motoboy: string): Promise<any> {
    const docRef = this.firebaseService.db.collection('orders').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) throw new NotFoundException(`Order with id "${id}" not found.`);
    await docRef.update({ motoboy, updatedAt: Date.now() });
    const orderNumber = (docSnap.data() as any).orderNumber;
    this.googleSheetsService.updateOrderMotoboy(orderNumber, motoboy)
      .catch((err) => console.error(`[Sheets] Failed to update motoboy for ${orderNumber}:`, err));
    const updated = await docRef.get();
    return { id, ...updated.data() };
  }

  async archive(id: string): Promise<{ success: boolean }> {
    const docRef = this.firebaseService.db.collection('orders').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) throw new NotFoundException(`Order with id "${id}" not found.`);
    await docRef.update({ archived: true, updatedAt: Date.now() });
    return { success: true };
  }

  async unarchive(id: string): Promise<{ success: boolean }> {
    const docRef = this.firebaseService.db.collection('orders').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) throw new NotFoundException(`Order with id "${id}" not found.`);
    await docRef.update({ archived: false, updatedAt: Date.now() });
    return { success: true };
  }

  async setPaymentMethod(id: string, method: 'mp' | 'cielo'): Promise<any> {
    const docRef = this.firebaseService.db.collection('orders').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) throw new NotFoundException(`Order with id "${id}" not found.`);
    const existingData = docSnap.data() as any;
    const now = Date.now();
    await docRef.update({
      status: 'PAID',
      mpPaymentId: method === 'mp' ? 'manual' : null,
      updatedAt: now,
      ...(!existingData.paidAt ? { paidAt: now } : {}),
    });
    const updated = await docRef.get();
    return { id, ...updated.data() };
  }

  async updatePaymentInfo(
    id: string,
    mpPaymentId: string | null,
    mpPreferenceId: string,
    paidAmount?: number,
  ): Promise<void> {
    const docRef = this.firebaseService.db.collection('orders').doc(id);
    await docRef.set(
      {
        mpPaymentId,
        mpPreferenceId,
        updatedAt: Date.now(),
        ...(paidAmount !== undefined ? { paidAmount } : {}),
      },
      { merge: true },
    );
  }

  async updatePaidAmount(id: string, paidAmount: number): Promise<void> {
    const docRef = this.firebaseService.db.collection('orders').doc(id);
    await docRef.update({ paidAmount, updatedAt: Date.now() });
  }
}
