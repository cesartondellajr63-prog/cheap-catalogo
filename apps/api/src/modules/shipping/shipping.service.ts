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

  private fetchWithTimeout(url: string, options: RequestInit = {}, ms = 10000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...options, signal: controller.signal }).finally(() =>
      clearTimeout(timer),
    );
  }

  private async geocodeZip(zipCode: string, address: string): Promise<{ lat: string; lng: string }> {
    const raw = zipCode.replace(/\D/g, '');

    // 1. ViaCEP para obter cidade/estado
    const viaCepRes = await this.fetchWithTimeout(`https://viacep.com.br/ws/${raw}/json/`, {}, 8000);
    if (!viaCepRes.ok) throw new InternalServerErrorException('CEP não encontrado.');
    const viaCep = await viaCepRes.json() as any;
    if (viaCep.erro) throw new InternalServerErrorException('CEP não encontrado.');

    // 2. Nominatim (OpenStreetMap) para geocodificar
    const query = encodeURIComponent(
      `${address}, ${viaCep.localidade}, ${viaCep.uf}, Brasil`,
    );
    const nominatimRes = await this.fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      { headers: { 'User-Agent': 'CheapsPods/1.0' } },
      10000,
    );
    if (!nominatimRes.ok) throw new InternalServerErrorException('Erro ao geocodificar endereço.');
    const nominatim = await nominatimRes.json() as any[];

    if (!nominatim.length) {
      // Fallback: geocodificar só pela cidade
      const fallbackQuery = encodeURIComponent(`${viaCep.localidade}, ${viaCep.uf}, Brasil`);
      const fallbackRes = await this.fetchWithTimeout(
        `https://nominatim.openstreetmap.org/search?q=${fallbackQuery}&format=json&limit=1`,
        { headers: { 'User-Agent': 'CheapsPods/1.0' } },
        10000,
      );
      const fallback = await fallbackRes.json() as any[];
      if (!fallback.length) throw new InternalServerErrorException('Endereço não encontrado.');
      return { lat: fallback[0].lat, lng: fallback[0].lon };
    }

    return { lat: nominatim[0].lat, lng: nominatim[0].lon };
  }

  async getQuote(dto: QuoteShippingDto): Promise<any> {
    const raw = dto.zipCode.replace(/\D/g, '');
    const cacheRef = this.firebaseService.db.collection('shipping_quotes').doc(raw);
    const cacheSnap = await cacheRef.get();

    if (cacheSnap.exists) {
      const cached = cacheSnap.data() as { price: number; expiresAt: number };
      if (cached.expiresAt > Date.now()) {
        return {
          price: cached.price,
          priceFormatted: 'R$ ' + cached.price.toFixed(2).replace('.', ','),
          expiresAt: cached.expiresAt,
          cached: true,
        };
      }
    }

    const { lat, lng } = await this.geocodeZip(dto.zipCode, dto.address);

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
            coordinates: { lat, lng },
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
      15000,
    );

    if (!lalamoveResponse.ok) {
      const errorText = await lalamoveResponse.text();
      this.logger.error(`Lalamove API error: ${errorText}`);
      throw new InternalServerErrorException('Falha ao calcular frete. Tente novamente.');
    }

    const data = (await lalamoveResponse.json()) as any;
    const priceStr = data.data?.priceBreakdown?.total || data.priceBreakdown?.total || '0';
    const totalReais = parseFloat(priceStr) / 100;

    this.logger.log(`Lalamove raw response: ${JSON.stringify(data)}`);
    this.logger.log(`Lalamove price string: "${priceStr}" → R$ ${totalReais}`);

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

    const expiresAt = Date.now() + 5 * 60 * 1000;

    await cacheRef.set({
      price: finalPrice,
      expiresAt,
      zipCode: raw,
      address: dto.address,
      createdAt: Date.now(),
    });

    return {
      price: finalPrice,
      priceFormatted: 'R$ ' + finalPrice.toFixed(2).replace('.', ','),
      expiresAt,
    };
  }
}
