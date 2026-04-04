import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { CreateOrderDto, OrderItemDto } from './dto/create-order.dto';

const VALID_STATUSES = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];

@Injectable()
export class OrdersService {
  constructor(private readonly firebaseService: FirebaseService) {}

  private calculateSubtotal(items: OrderItemDto[]): number {
    return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }

  private async generateOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const snapshot = await this.firebaseService.db
      .collection('orders')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    let count = 1;
    if (!snapshot.empty) {
      const lastOrder = snapshot.docs[0].data();
      if (lastOrder.orderNumber) {
        const parts = lastOrder.orderNumber.split('-');
        const lastCount = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastCount)) {
          count = lastCount + 1;
        }
      }
    }

    return `CP-${year}-${String(count).padStart(4, '0')}`;
  }

  async create(dto: CreateOrderDto): Promise<any> {
    const id = crypto.randomUUID();
    const orderNumber = await this.generateOrderNumber();
    const subtotal = this.calculateSubtotal(dto.items);
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
      items: dto.items,
      subtotal,
      total,
      status: 'PENDING',
      mpPaymentId: null,
      mpPreferenceId: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.firebaseService.db.collection('orders').doc(id).set(order);
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

    await docRef.update({ status, updatedAt: now });

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
