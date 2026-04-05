import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';

export interface BrandDto {
  name: string;
  slug: string;
  color: string;
  active?: boolean;
}

@Injectable()
export class BrandsService {
  constructor(private readonly firebaseService: FirebaseService) {}

  async findAll(): Promise<any[]> {
    const snapshot = await this.firebaseService.db
      .collection('brands')
      .where('active', '==', true)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async create(dto: BrandDto): Promise<any> {
    const now = Date.now();
    const docRef = await this.firebaseService.db.collection('brands').add({
      ...dto,
      active: dto.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
    const created = await docRef.get();
    return { id: docRef.id, ...created.data() };
  }
}
