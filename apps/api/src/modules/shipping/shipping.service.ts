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

// Cidades cobertas pela Lalamove no Brasil (regiões metropolitanas)
const LALAMOVE_COVERED_CITIES: Record<string, string[]> = {
  SP: ['são paulo', 'osasco', 'guarulhos', 'santo andré', 'são bernardo do campo',
       'são caetano do sul', 'mauá', 'ribeirão pires', 'diadema', 'mogi das cruzes',
       'suzano', 'itaquaquecetuba', 'ferraz de vasconcelos', 'poá', 'barueri',
       'cotia', 'carapicuíba', 'taboão da serra', 'embu das artes', 'itapecerica da serra',
       'santana de parnaíba', 'jandira', 'itapevi', 'cajamar', 'mairiporã',
       'franco da rocha', 'francisco morato', 'caieiras', 'arujá', 'santa isabel'],
  RJ: ['rio de janeiro', 'niterói', 'são gonçalo', 'duque de caxias', 'nova iguaçu',
       'belford roxo', 'nilópolis', 'mesquita', 'queimados', 'japeri',
       'itaguaí', 'seropédica', 'magé', 'guapimirim', 'itaboraí'],
  MG: ['belo horizonte', 'contagem', 'betim', 'nova lima', 'sabará',
       'ribeirão das neves', 'santa luzia', 'vespasiano', 'ibirité', 'brumadinho'],
  PR: ['curitiba', 'são josé dos pinhais', 'colombo', 'araucária', 'fazenda rio grande',
       'pinhais', 'piraquara', 'campo largo', 'almirante tamandaré', 'quatro barras'],
  RS: ['porto alegre', 'canoas', 'novo hamburgo', 'são leopoldo', 'alvorada',
       'viamão', 'gravataí', 'cachoeirinha', 'esteio', 'sapucaia do sul'],
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

  // Valida se a cidade está dentro da cobertura da Lalamove
  private isCovered(cidade: string, uf: string): boolean {
    const covered = LALAMOVE_COVERED_CITIES[uf.toUpperCase()];
    if (!covered) return false;
    const cidadeNorm = cidade.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return covered.some(c => {
      const cNorm = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return cidadeNorm.includes(cNorm) || cNorm.includes(cidadeNorm);
    });
  }

  private async geocodeZip(
    zipCode: string,
    address: string,
  ): Promise<{ lat: string; lng: string; cidade: string; uf: string }> {
    const raw = zipCode.replace(/\D/g, '');

    // 1. ViaCEP para obter cidade/estado
    const viaCepRes = await this.fetchWithTimeout(`https://viacep.com.br/ws/${raw}/json/`, {}, 8000);
    if (!viaCepRes.ok) throw new InternalServerErrorException('CEP não encontrado.');
    const viaCep = await viaCepRes.json() as any;
    if (viaCep.erro) throw new InternalServerErrorException('CEP não encontrado.');

    const cidade: string = viaCep.localidade ?? '';
    const uf: string = viaCep.uf ?? '';

    // 2. Nominatim (OpenStreetMap) para geocodificar
    const query = encodeURIComponent(`${address}, ${cidade}, ${uf}, Brasil`);
    const nominatimRes = await this.fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      { headers: { 'User-Agent': 'CheapsPods/1.0' } },
      10000,
    );
    if (!nominatimRes.ok) throw new InternalServerErrorException('Erro ao geocodificar endereço.');
    const nominatim = await nominatimRes.json() as any[];

    if (!nominatim.length) {
      // Fallback: geocodificar só pela cidade
      const fallbackQuery = encodeURIComponent(`${cidade}, ${uf}, Brasil`);
      const fallbackRes = await this.fetchWithTimeout(
        `https://nominatim.openstreetmap.org/search?q=${fallbackQuery}&format=json&limit=1`,
        { headers: { 'User-Agent': 'CheapsPods/1.0' } },
        10000,
      );
      // F17: verificar HTTP error no fallback também
      if (!fallbackRes.ok) throw new InternalServerErrorException('Erro ao geocodificar endereço.');
      const fallback = await fallbackRes.json() as any[];
      if (!fallback.length) throw new InternalServerErrorException('Endereço não encontrado.');
      return { lat: String(fallback[0].lat), lng: String(fallback[0].lon), cidade, uf };
    }

    return { lat: String(nominatim[0].lat), lng: String(nominatim[0].lon), cidade, uf };
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

    const { lat, lng, cidade, uf } = await this.geocodeZip(dto.zipCode, dto.address);

    // Validação de cobertura: verifica se a cidade está na área atendida pela Lalamove
    if (!this.isCovered(cidade, uf)) {
      this.logger.warn(`Cidade fora da cobertura Lalamove: ${cidade}/${uf}`);
      throw new InternalServerErrorException(
        `Entrega não disponível para ${cidade}/${uf}. Atendemos apenas regiões metropolitanas de SP, RJ, BH, Curitiba e Porto Alegre.`,
      );
    }

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

      // Tenta extrair código de erro da Lalamove para mensagem amigável
      try {
        const errJson = JSON.parse(errorText);
        const errCode: string = errJson?.message ?? errJson?.error ?? '';
        if (errCode.includes('OUT_OF_SERVICE_AREA') || errCode.includes('SERVICE_AREA')) {
          throw new InternalServerErrorException(
            `Entrega não disponível para ${cidade}/${uf}. Atendemos apenas regiões metropolitanas de SP, RJ, BH, Curitiba e Porto Alegre.`,
          );
        }
      } catch (parseErr) {
        if (parseErr instanceof InternalServerErrorException) throw parseErr;
      }

      throw new InternalServerErrorException('Falha ao calcular frete. Tente novamente.');
    }

    const data = (await lalamoveResponse.json()) as any;
    const priceStr = data.data?.priceBreakdown?.total || data.priceBreakdown?.total || '0';
    const totalReais = parseFloat(priceStr) / 100;

    this.logger.log(`Lalamove cotação para ${cidade}/${uf}: "${priceStr}" → R$ ${totalReais}`);

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

    // F16: salva cache sem bloquear — erro não impede retorno do resultado
    cacheRef.set({
      price: finalPrice,
      expiresAt,
      zipCode: raw,
      address: dto.address,
      cidade,
      uf,
      createdAt: Date.now(),
    }).catch((err: unknown) => {
      this.logger.warn(`Falha ao salvar cache de frete para CEP ${raw}: ${err}`);
    });

    return {
      price: finalPrice,
      priceFormatted: 'R$ ' + finalPrice.toFixed(2).replace('.', ','),
      expiresAt,
    };
  }
}
