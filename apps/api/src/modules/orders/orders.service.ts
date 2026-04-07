import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { CustomersService } from '../customers/customers.service';
import { GoogleSheetsService } from '../../shared/google-sheets/google-sheets.service';
import { ProductsService } from '../products/products.service';
import { CreateOrderDto } from './dto/create-order.dto';

const VALID_STATUSES = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];

// Authoritative price map mirroring the static frontend catalog.
// Used as fallback when a product is not yet registered in Firestore.
// Keep in sync with apps/web/src/lib/catalog-data.ts.
const STATIC_CATALOG_PRICES: Record<string, number> = {
  'eb-king': 99.99, 'eb-trio': 99.99, 'eb-te': 89.99, 'eb-gh': 84.99,
  'eb-bc': 64.99, 'lm-dura': 89.99, 'bs-30k': 99.99, 'ox-30k': 84.99,
  'ox-9k': 64.99, 'ig-v400m': 99.99, 'ig-v400': 104.99, 'ig-v400s': 99.99,
  'ig-v250': 89.99, 'ig-v155': 84.99, 'ig-v150': 79.99, 'ig-v80': 74.99,
  'ig-v55': 69.99, 'ig-nano': 29.99,
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly customersService: CustomersService,
    private readonly googleSheetsService: GoogleSheetsService,
    private readonly productsService: ProductsService,
  ) {}

  private generateOrderNumber(): string {
    const digits = crypto.randomInt(10000000, 100000000);
    return `CP-${digits}`;
  }

  /**
   * Resolves authoritative item prices from Firestore and the authoritative
   * shipping cost from the cached Lalamove quote. Client-supplied prices are
   * intentionally discarded — this prevents price manipulation attacks.
   */
  private async resolveOrderPricing(dto: CreateOrderDto): Promise<{
    items: any[];
    shippingCost: number;
    subtotal: number;
    total: number;
  }> {
    // 1. Validate each item and resolve authoritative unitPrice.
    //    Priority: Firestore product (by slug) → static catalog price map.
    //    Client-supplied unitPrice is never trusted.
    const items = await Promise.all(
      dto.items.map(async (item) => {
        let unitPrice: number | undefined;
        let resolvedProductName = item.productName;
        let resolvedVariantName = item.variantName;

        try {
          const product = await this.productsService.findBySlug(item.productId);

          if (!product.active) {
            throw new BadRequestException(
              `Produto "${product.name}" não está disponível.`,
            );
          }

          // Variant lookup by name (static catalog uses flavor names, not UUIDs)
          const variant = (product.variants as any[])?.find(
            (v: any) => v.name === item.variantName || v.id === item.variantId,
          );

          if (variant?.active === false) {
            throw new BadRequestException(
              `Variante "${item.variantName}" do produto "${product.name}" não está disponível.`,
            );
          }

          unitPrice = variant?.priceOverride ?? product.basePrice;
          resolvedProductName = product.name;
          resolvedVariantName = variant?.name ?? item.variantName;
        } catch (e) {
          if (e instanceof BadRequestException) throw e;
          // Product not in Firestore — fall back to static catalog price map
          const staticPrice = STATIC_CATALOG_PRICES[item.productId];
          if (staticPrice === undefined) {
            throw new BadRequestException(
              `Produto "${item.productId}" não encontrado.`,
            );
          }
          this.logger.warn(
            `[ORDERS] Product "${item.productId}" not in Firestore, using static price R$${staticPrice}`,
          );
          unitPrice = staticPrice;
        }

        return {
          productId: item.productId,
          productName: resolvedProductName,
          variantId: item.variantId,
          variantName: resolvedVariantName,
          quantity: item.quantity,
          unitPrice,
        };
      }),
    );

    // 2. Resolve authoritative shipping cost from cached Lalamove quote
    let shippingCost = dto.shippingCost;
    if (dto.zipCode) {
      const raw = dto.zipCode.replace(/\D/g, '');
      const cacheSnap = await this.firebaseService.db
        .collection('shipping_quotes')
        .doc(raw)
        .get();

      if (cacheSnap.exists) {
        const cached = cacheSnap.data() as { price: number; expiresAt: number };
        if (cached.expiresAt > Date.now()) {
          shippingCost = cached.price;
          this.logger.log(`[ORDERS] Shipping overridden from cache: R$${shippingCost} (zip ${raw})`);
        } else {
          this.logger.warn(`[ORDERS] Shipping cache expired for zip ${raw}, using client value R$${shippingCost}`);
        }
      } else {
        this.logger.warn(`[ORDERS] No shipping cache for zip ${raw}, using client value R$${shippingCost}`);
      }
    }

    const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const total = subtotal + shippingCost;

    return { items, shippingCost, subtotal, total };
  }

  async createWithId(id: string, dto: CreateOrderDto): Promise<any> {
    const orderNumber = this.generateOrderNumber();
    const { items, shippingCost, subtotal, total } = await this.resolveOrderPricing(dto);
    const now = Date.now();

    const order = {
      id,
      orderNumber,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      customerEmail: dto.customerEmail || null,
      address: dto.address,
      city: dto.city,
      shippingCost,
      items,
      subtotal,
      total,
      status: 'PENDING',
      mpPaymentId: null,
      mpPreferenceId: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.firebaseService.db.collection('orders').doc(id).set(order);

    // Registra/atualiza cliente deduplcado por telefone
    this.customersService.upsertFromOrder({
      name: dto.customerName,
      phone: dto.customerPhone,
      email: dto.customerEmail,
      address: `${dto.address}, ${dto.city}`,
    }).catch((err: Error) => this.logger.error(`Failed to upsert customer: ${err.message}`));

    // Sincroniza com Google Sheets
    this.googleSheetsService.appendOrderRow(order).catch((err: Error) => this.logger.error(`Failed to sync Google Sheets: ${err.message}`));

    return order;
  }

  async create(dto: CreateOrderDto): Promise<any> {
    const id = crypto.randomUUID();
    const orderNumber = this.generateOrderNumber();
    const { items, shippingCost, subtotal, total } = await this.resolveOrderPricing(dto);
    const now = Date.now();

    const order = {
      id,
      orderNumber,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      customerEmail: dto.customerEmail || null,
      address: dto.address,
      city: dto.city,
      shippingCost,
      items,
      subtotal,
      total,
      status: 'PENDING',
      mpPaymentId: null,
      mpPreferenceId: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.firebaseService.db.collection('orders').doc(id).set(order);

    // Registra/atualiza cliente deduplcado por telefone
    this.customersService.upsertFromOrder({
      name: dto.customerName,
      phone: dto.customerPhone,
      email: dto.customerEmail,
      address: `${dto.address}, ${dto.city}`,
    }).catch((err: Error) => this.logger.error(`Failed to upsert customer: ${err.message}`));

    // Sincroniza com Google Sheets
    this.googleSheetsService.appendOrderRow(order).catch((err: Error) => this.logger.error(`Failed to sync Google Sheets: ${err.message}`));

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

    const updated = await docRef.get();
    return { id, ...updated.data() };
  }

  async updateShippingStatus(id: string, shippingStatus: string): Promise<any> {
    const docRef = this.firebaseService.db.collection('orders').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) throw new NotFoundException(`Order with id "${id}" not found.`);
    await docRef.update({ shippingStatus, updatedAt: Date.now() });
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
  ): Promise<void> {
    const docRef = this.firebaseService.db.collection('orders').doc(id);
    // Use set with merge so it creates the doc if it doesn't exist yet
    await docRef.set(
      {
        mpPaymentId,
        mpPreferenceId,
        updatedAt: Date.now(),
      },
      { merge: true },
    );
  }
}
