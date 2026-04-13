import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private firebaseApp: admin.app.App;

  onModuleInit() {
    if (admin.apps.length > 0) {
      this.firebaseApp = admin.apps[0] as admin.app.App;
      this.logger.log('Firebase Admin SDK already initialized, reusing existing app.');
      return;
    }

    const privateKey = (process.env.FIREBASE_PRIVATE_KEY as string).replace(/\\n/g, '\n');

    this.firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });

    this.logger.log('Firebase Admin SDK initialized successfully.');
  }

  get db(): admin.firestore.Firestore {
    return this.firebaseApp.firestore();
  }

  get auth(): admin.auth.Auth {
    return this.firebaseApp.auth();
  }

  get storage(): admin.storage.Storage {
    return this.firebaseApp.storage();
  }
}
