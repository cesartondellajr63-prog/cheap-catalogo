import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { QuoteShippingDto } from './dto/quote-shipping.dto';

const ORIGIN = {
  lat: process.env.ORIGIN_LAT || '-23.5329',
  lng: process.env.ORIGIN_LNG || '-46.7889',
  address:
    process.env.ORIGIN_ADDRESS ||
    'Avenida Analice Sakatauskas, 860, Bela Vista, Osasco, SP, Brasil',
};

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  private fetchWithTimeout(url: string, options: RequestInit = {}, ms = 15000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...options, signal: controller.signal }).finally(() =>
      clearTimeout(timer),
    );
  }

  async getQuote(dto: QuoteShippingDto): Promise<any> {
    const raw = dto.zipCode?.replace(/\D/g, '') ?? null;

    // Cache por CEP quando disponível
    if (raw) {
      const cacheRef = this.firebaseService.db.collection('shipping_quotes').doc(raw);
      const cacheSnap = await cacheRef.get();

      if (cacheSnap.exists) {
        const cached = cacheSnap.data() as { price: number; expiresAt: number };
        const expired = cached.expiresAt <= Date.now();
        this.logger.log(`[FRETE] Cache CEP ${raw}: R$${cached.price} expired=${expired}`);
        if (!expired) {
          return {
            price: cached.price,
            priceFormatted: 'R$ ' + cached.price.toFixed(2).replace('.', ','),
            expiresAt: cached.expiresAt,
            cached: true,
          };
        }
      } else {
        this.logger.log(`[FRETE] Cache miss CEP ${raw}`);
      }
    }

    // Validar que coordenadas são do Brasil
    const latNum = parseFloat(dto.lat);
    const lngNum = parseFloat(dto.lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
      throw new InternalServerErrorException('Coordenadas inválidas.');
    }

    if (latNum < -33 || latNum > 5 || lngNum < -73 || lngNum > -35) {
      throw new InternalServerErrorException('Endereço fora do Brasil ou coordenadas inválidas.');
    }

    // Chamar Lalamove com lat/lng já geocodificados pelo frontend
    const apiKey = process.env.LALAMOVE_API_KEY as string;
    const apiSecret = process.env.LALAMOVE_API_SECRET as string;
    const timestamp = Date.now().toString();

    const bodyObj = {
      data: {
        serviceType: 'LALAGO',
        language: 'pt_BR',
        stops: [
          {
            coordinates: { lat: ORIGIN.lat, lng: ORIGIN.lng },
            address: ORIGIN.address,
          },
          {
            coordinates: { lat: String(latNum), lng: String(lngNum) },
            address: dto.address.replace(/[\r\n]/g, ' ').substring(0, 255),
          },
        ],
        item: {
          quantity: '1',
          weight: 'LESS_THAN_3_KG',
          categories: ['SMALL_PACKAGE'],
          handlingInstructions: [],
        },
      },
    };

    const bodyStr = JSON.stringify(bodyObj);
    const rawSignature = `${timestamp}\r\nPOST\r\n/v3/quotations\r\n\r\n${bodyStr}`;
    const token = crypto.createHmac('sha256', apiSecret).update(rawSignature).digest('hex');
    const authHeader = `hmac ${apiKey}:${timestamp}:${token}`;

    const lalamoveResponse = await this.fetchWithTimeout(
      'https://rest.lalamove.com/v3/quotations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          Market: 'BR',
        },
        body: bodyStr,
      },
      30000,
    );

    if (!lalamoveResponse.ok) {
      const errorText = await lalamoveResponse.text();
      this.logger.error(`[FRETE] Lalamove error: ${errorText}`);

      try {
        const errJson = JSON.parse(errorText);
        const code: string = errJson?.code ?? '';
        const msg: string = errJson?.message ?? '';
        if (code === 'DELIVERY_NOT_AVAILABLE' || msg.includes('OUT_OF_SERVICE_AREA')) {
          throw new InternalServerErrorException(
            'Entrega não disponível nesta região. Atendemos apenas regiões metropolitanas de SP, RJ, BH, Curitiba e Porto Alegre.',
          );
        }
        if (code === 'INVALID_LOCATION') {
          throw new InternalServerErrorException('Localização inválida ou não encontrada.');
        }
      } catch (parseErr) {
        if (parseErr instanceof InternalServerErrorException) throw parseErr;
      }

      throw new InternalServerErrorException('Falha ao calcular frete. Tente novamente.');
    }

    const data = (await lalamoveResponse.json()) as any;

    // Lalamove BR retorna o valor já em reais (não centavos)
    const totalReais = parseFloat(
      data.data?.priceBreakdown?.total ||
      data.priceBreakdown?.total ||
      data.totalFee ||
      0,
    );

    this.logger.log(`[FRETE] Lalamove retornou R$${totalReais}`);

    if (isNaN(totalReais) || totalReais <= 0) {
      throw new InternalServerErrorException('Preço de frete inválido recebido da Lalamove.');
    }

    // Regras de frete:
    // - Mínimo: R$ 11,00
    // - Entre R$ 11 e R$ 18: adicionar R$ 2,00
    // - Acima de R$ 18: manter valor original
    let finalPrice: number;
    if (totalReais < 11) {
      finalPrice = 11;
    } else if (totalReais <= 18) {
      finalPrice = totalReais + 2;
    } else {
      finalPrice = totalReais;
    }
    finalPrice = Math.round(finalPrice * 100) / 100;

    this.logger.log(`[FRETE] finalPrice=R$${finalPrice}`);

    // Expiração da cotação Lalamove (se disponível) ou 5 min
    const llExpiresAt = data.data?.expiresAt;
    const expiresAt = llExpiresAt
      ? new Date(llExpiresAt).getTime()
      : Date.now() + 5 * 60 * 1000;

    // Salva cache por CEP (sem bloquear retorno)
    if (raw) {
      this.firebaseService.db.collection('shipping_quotes').doc(raw).set({
        price: finalPrice,
        expiresAt,
        zipCode: raw,
        address: dto.address,
        createdAt: Date.now(),
      }).catch((err: unknown) => {
        this.logger.warn(`[FRETE] Falha ao salvar cache CEP ${raw}: ${err}`);
      });
    }

    return {
      price: finalPrice,
      priceFormatted: 'R$ ' + finalPrice.toFixed(2).replace('.', ','),
      expiresAt,
    };
  }
}
