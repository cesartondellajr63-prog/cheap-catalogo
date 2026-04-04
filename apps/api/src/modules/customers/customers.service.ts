import { Injectable, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';

interface CustomerData {
  name: string;
  phone: string;
  email?: string;
  address?: string;
}

@Injectable()
export class CustomersService {
  constructor(private readonly firebaseService: FirebaseService) {}

  async findAll(): Promise<any[]> {
    const snapshot = await this.firebaseService.db
      .collection('customers')
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async findById(id: string): Promise<any> {
    const docRef = this.firebaseService.db.collection('customers').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new NotFoundException(`Customer with id "${id}" not found.`);
    }

    return { id: docSnap.id, ...docSnap.data() };
  }

  async upsertFromOrder(customerData: CustomerData): Promise<any> {
    const db = this.firebaseService.db;
    const now = Date.now();

    const existingQuery = await db
      .collection('customers')
      .where('phone', '==', customerData.phone)
      .limit(1)
      .get();

    if (!existingQuery.empty) {
      const existingDoc = existingQuery.docs[0];
      const existingData = existingDoc.data();
      const updates: Record<string, any> = { updatedAt: now };

      if (customerData.name && customerData.name !== existingData.name) {
        updates.name = customerData.name;
      }
      if (customerData.address && customerData.address !== existingData.address) {
        updates.address = customerData.address;
      }
      if (customerData.email && !existingData.email) {
        updates.email = customerData.email;
      }

      await existingDoc.ref.update(updates);
      const updated = await existingDoc.ref.get();
      return { id: existingDoc.id, ...updated.data() };
    } else {
      const docRef = await db.collection('customers').add({
        name: customerData.name,
        phone: customerData.phone,
        email: customerData.email || null,
        address: customerData.address || null,
        createdAt: now,
        updatedAt: now,
      });

      const created = await docRef.get();
      return { id: docRef.id, ...created.data() };
    }
  }
}
