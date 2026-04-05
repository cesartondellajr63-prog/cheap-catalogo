import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirebaseService } from '../firebase/firebase.service';

export const Throttle = (config: { limit: number; windowSeconds: number; lockoutSeconds: number }) =>
  SetMetadata('throttle', config);

export const ThrottleKey = (key: string) => SetMetadata('throttleKey', key);

@Injectable()
export class ThrottleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly firebaseService: FirebaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const throttleConfig = this.reflector.get<{
      limit: number;
      windowSeconds: number;
      lockoutSeconds: number;
    }>('throttle', context.getHandler());

    if (!throttleConfig) {
      return true;
    }

    const endpointKey = this.reflector.get<string>('throttleKey', context.getHandler()) || 'default';
    const { limit, windowSeconds, lockoutSeconds } = throttleConfig;

    const request = context.switchToHttp().getRequest();
    const trustProxy = process.env.TRUST_PROXY === 'true';
    const forwarded = trustProxy ? request.headers['x-forwarded-for'] : null;
    const ip: string = forwarded
      ? (forwarded as string).split(',')[0].trim()
      : request.socket?.remoteAddress || 'unknown';

    const docId = `${ip}_${endpointKey}`;
    const db = this.firebaseService.db;
    const docRef = db.collection('rate_limits').doc(docId);
    const now = Date.now();

    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const data = docSnap.data() as {
        attempts: number;
        windowStart: number;
        blockedUntil?: number;
      };

      if (data.blockedUntil && data.blockedUntil > now) {
        const minutesRemaining = Math.ceil((data.blockedUntil - now) / 60000);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `Too many requests. Try again in ${minutesRemaining} minute(s).`,
            error: 'Too Many Requests',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const windowExpired = data.windowStart + windowSeconds * 1000 < now;

      if (windowExpired) {
        await docRef.set({
          attempts: 1,
          windowStart: now,
          blockedUntil: null,
          ip,
          endpoint: endpointKey,
          updatedAt: now,
        });
        return true;
      }

      const newAttempts = data.attempts + 1;

      if (newAttempts >= limit) {
        const blockedUntil = now + lockoutSeconds * 1000;
        await docRef.update({
          attempts: newAttempts,
          blockedUntil,
          updatedAt: now,
        });
        const minutesRemaining = Math.ceil(lockoutSeconds / 60);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `Too many requests. Try again in ${minutesRemaining} minute(s).`,
            error: 'Too Many Requests',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      await docRef.update({
        attempts: newAttempts,
        updatedAt: now,
      });
    } else {
      await docRef.set({
        attempts: 1,
        windowStart: now,
        blockedUntil: null,
        ip,
        endpoint: endpointKey,
        createdAt: now,
        updatedAt: now,
      });
    }

    return true;
  }
}
