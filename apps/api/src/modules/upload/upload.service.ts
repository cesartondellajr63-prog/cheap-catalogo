import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';

interface UploadedFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

@Injectable()
export class UploadService {
  constructor(private readonly firebaseService: FirebaseService) {}

  async uploadImage(file: UploadedFile): Promise<{ url: string }> {
    const bucket = this.firebaseService.storage.bucket();
    const bucketName = bucket.name;
    const filePath = `products/${Date.now()}-${file.originalname}`;
    const fileRef = bucket.file(filePath);

    await fileRef.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
      },
    });

    await fileRef.makePublic();

    const url = `https://storage.googleapis.com/${bucketName}/${filePath}`;
    return { url };
  }
}
