import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';

const DEFAULT_MESSAGE = 'Loja temporariamente fechada. Voltamos em breve!';
const DEFAULT_MESSAGE_BOT = 'Hoje não estamos mais funcionando. Te avisaremos quando estivermos funcionando!';

const ALL_BRAND_IDS = ['ignite','elfbar','lostmary','oxbar','hqd','nikbar','dinnerlady','rabbeats'];

@Injectable()
export class StoreConfigService {
  constructor(private readonly firebaseService: FirebaseService) {}

  async get(): Promise<{ isOpen: boolean; closedMessage: string; closedMessageBot: string }> {
    const doc = await this.firebaseService.db.doc('config/store').get();
    if (!doc.exists) {
      return { isOpen: true, closedMessage: DEFAULT_MESSAGE, closedMessageBot: DEFAULT_MESSAGE_BOT };
    }
    const data = doc.data()!;
    return {
      isOpen: data.isOpen ?? true,
      closedMessage: data.closedMessage ?? DEFAULT_MESSAGE,
      closedMessageBot: data.closedMessageBot ?? DEFAULT_MESSAGE_BOT,
    };
  }

  async update(body: { isOpen?: boolean; closedMessage?: string; closedMessageBot?: string }): Promise<{ isOpen: boolean; closedMessage: string; closedMessageBot: string }> {
    await this.firebaseService.db.doc('config/store').set(body, { merge: true });
    return this.get();
  }

  async getBrandsFilter(): Promise<{ visibleBrands: string[]; customBrands: { id: string; label: string; color: string }[] }> {
    const doc = await this.firebaseService.db.doc('config/brands-filter').get();
    if (!doc.exists) {
      return { visibleBrands: ALL_BRAND_IDS, customBrands: [] };
    }
    const data = doc.data()!;
    return {
      visibleBrands: data.visibleBrands ?? ALL_BRAND_IDS,
      customBrands: data.customBrands ?? [],
    };
  }

  async updateBrandsFilter(body: { visibleBrands?: string[]; customBrands?: { id: string; label: string; color: string }[] }): Promise<{ visibleBrands: string[]; customBrands: { id: string; label: string; color: string }[] }> {
    await this.firebaseService.db.doc('config/brands-filter').set(body, { merge: true });
    return this.getBrandsFilter();
  }
}
