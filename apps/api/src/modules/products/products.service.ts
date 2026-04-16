import { Injectable, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly firebaseService: FirebaseService) {}

  async findAll(activeOnly = true): Promise<any[]> {
    let query: FirebaseFirestore.Query = this.firebaseService.db.collection('products');

    if (activeOnly) {
      query = query.where('active', '==', true);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async findBySlug(slug: string): Promise<any> {
    const snapshot = await this.firebaseService.db
      .collection('products')
      .where('slug', '==', slug)
      .limit(1)
      .get();

    if (snapshot.empty) {
      throw new NotFoundException(`Product with slug "${slug}" not found.`);
    }

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  async create(dto: CreateProductDto): Promise<any> {
    const now = Date.now();
    const docRef = await this.firebaseService.db.collection('products').add({
      ...dto,
      createdAt: now,
      updatedAt: now,
    });

    const created = await docRef.get();
    return { id: docRef.id, ...created.data() };
  }

  async update(id: string, dto: UpdateProductDto): Promise<any> {
    const docRef = this.firebaseService.db.collection('products').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new NotFoundException(`Product with id "${id}" not found.`);
    }

    const updates = { ...dto, updatedAt: Date.now() };
    await docRef.update(updates);

    const updated = await docRef.get();
    return { id, ...updated.data() };
  }

  async deactivate(id: string): Promise<{ success: boolean }> {
    const docRef = this.firebaseService.db.collection('products').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new NotFoundException(`Product with id "${id}" not found.`);
    }

    await docRef.update({ active: false, updatedAt: Date.now() });
    return { success: true };
  }

  async decrementVariantStock(productSlug: string, variantName: string, quantity: number): Promise<void> {
    const snapshot = await this.firebaseService.db
      .collection('products')
      .where('slug', '==', productSlug)
      .limit(1)
      .get();

    if (snapshot.empty) return;

    const doc = snapshot.docs[0];
    const data = doc.data() as any;
    const variants: any[] = data.variants ?? [];

    const updated = variants.map(v => {
      if (v.name === variantName) {
        const newStock = Math.max(0, (v.stock ?? 0) - quantity);
        return { ...v, stock: newStock };
      }
      return v;
    });

    await doc.ref.update({ variants: updated, updatedAt: Date.now() });
  }
}
