import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';

const DEFAULT_MESSAGE = 'Loja temporariamente fechada. Voltamos em breve!';

@Injectable()
export class StoreConfigService {
  constructor(private readonly firebaseService: FirebaseService) {}

  async get(): Promise<{ isOpen: boolean; closedMessage: string }> {
    const doc = await this.firebaseService.db.doc('config/store').get();
    if (!doc.exists) {
      return { isOpen: true, closedMessage: DEFAULT_MESSAGE };
    }
    const data = doc.data()!;
    return {
      isOpen: data.isOpen ?? true,
      closedMessage: data.closedMessage ?? DEFAULT_MESSAGE,
    };
  }

  async update(body: { isOpen?: boolean; closedMessage?: string }): Promise<{ isOpen: boolean; closedMessage: string }> {
    await this.firebaseService.db.doc('config/store').set(body, { merge: true });
    return this.get();
  }
}
