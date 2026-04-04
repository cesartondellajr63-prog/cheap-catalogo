// ✅ API SEGURA DE FRETE - Chaves escondidas no backend
// Arquivo: /api/frete.js

const crypto = require('crypto');

// ─────────────────────────────────────────
// 🔐 RATE LIMITING — 15 tentativas / 5 min por IP
// ─────────────────────────────────────────
const RL_WINDOW = 5 * 60 * 1000; // 5 minutos
const RL_MAX = 15;

function getIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  global._freteRateLimit = global._freteRateLimit || {};
  const now = Date.now();
  const record = global._freteRateLimit[ip];

  if (!record || now - record.start > RL_WINDOW) {
    global._freteRateLimit[ip] = { count: 1, start: now };
    return false;
  }
  
  record.count += 1;
  return record.count > RL_MAX;
}

// 🔐 CHAVES NO BACKEND (variáveis de ambiente)
// NUNCA exponha isso no frontend!
const LALAMOVE_API_KEY = process.env.LALAMOVE_API_KEY;
const LALAMOVE_API_SECRET = process.env.LALAMOVE_API_SECRET;
const LALAMOVE_BASE_URL = 'https://rest.lalamove.com';

// 📍 ORIGEM (Seu armazém/loja)
const ORIGEM = {
  lat: '-23.5329',
  lng: '-46.7889',
  address: 'Avenida Analice Sakatauskas, 860, Bela Vista, Osasco, SP, Brasil'
};

function hmacSHA256(secret, message) {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

export default async function handler(req, res) {
  // 🔐 CORS seguro
  res.setHeader('Access-Control-Allow-Origin', 'https://cheapspods-catalogo-cesar8.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // 🛡️ Verificar Rate Limit
  const ip = getIP(req);
  if (isRateLimited(ip)) {
    console.warn(`[Frete] 🚫 IP bloqueado por excesso de requisições: ${ip}`);
    return res.status(429).json({ 
      error: 'Muitas simulações de frete. Por favor, aguarde alguns minutos antes de tentar novamente.' 
    });
  }

  // 📦 VALIDAR ENTRADA
  const { lat, lng, address } = req.body || {};

  if (!lat || !lng || !address) {
    console.error('❌ Parâmetros inválidos:', { lat, lng, address });
    return res.status(400).json({ 
      error: 'Parâmetros inválidos (lat, lng, address obrigatórios)' 
    });
  }

  // ✅ VALIDAR COORDENADAS (devem ser números)
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);

  if (isNaN(latNum) || isNaN(lngNum)) {
    console.error('❌ Coordenadas inválidas:', { lat, lng });
    return res.status(400).json({ 
      error: 'Coordenadas inválidas (devem ser números)' 
    });
  }

  // ✅ VALIDAR LATITUDE/LONGITUDE RAZOÁVEIS (Brasil)
  // Brasil: latitude entre -33 a 5, longitude entre -73 a -35
  if (latNum < -33 || latNum > 5 || lngNum < -73 || lngNum > -35) {
    console.error('❌ Coordenadas fora do Brasil:', { lat: latNum, lng: lngNum });
    return res.status(400).json({ 
      error: 'Endereço fora do Brasil ou coordenadas inválidas' 
    });
  }

  const timestamp = Date.now().toString();

  // 📋 PAYLOAD PARA LALAMOVE API v3
  const bodyObj = {
    data: {
      serviceType: 'LALAGO',
      language: 'pt_BR',
      stops: [
        {
          coordinates: { 
            lat: ORIGEM.lat, 
            lng: ORIGEM.lng 
          },
          address: ORIGEM.address
        },
        {
          coordinates: { 
            lat: String(latNum), 
            lng: String(lngNum) 
          },
          // CORREÇÃO 3: Sanitização do endereço removendo quebras de linha
          address: String(address).replace(/[\r\n]/g, ' ').substring(0, 255)
        }
      ],
      item: {
        quantity: '1',
        weight: 'LESS_THAN_3_KG',
        categories: ['SMALL_PACKAGE'],
        handlingInstructions: []
      }
    }
  };

  const bodyStr = JSON.stringify(bodyObj);

  // 🔐 GERAR ASSINATURA HMAC
  const rawSignature = `${timestamp}\r\nPOST\r\n/v3/quotations\r\n\r\n${bodyStr}`;
  const token = hmacSHA256(LALAMOVE_API_SECRET, rawSignature);

  try {
    // 🔐 VALIDAR CREDENCIAIS
    if (!LALAMOVE_API_KEY || !LALAMOVE_API_SECRET) {
      console.error("❌ [Frete] Credenciais Lalamove não configuradas no Vercel!");
      return res.status(500).json({ 
        error: "Credenciais não configuradas. Contate o administrador." 
      });
    }

    const lalaRes = await fetch(`${LALAMOVE_BASE_URL}/v3/quotations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `hmac ${LALAMOVE_API_KEY}:${timestamp}:${token}`,
        'Market': 'BR'
      },
      body: bodyStr,
      timeout: 30000 // 30 segundos de timeout
    });

    const data = await lalaRes.json();

    if (!lalaRes.ok) {
      console.error('❌ [Frete] Erro Lalamove:', {
        status: lalaRes.status,
        code: data.code,
        message: data.message,
        details: data
      });

      // Mensagens de erro mais claras
      let errorMsg = 'Erro ao calcular frete';
      if (data.code === 'DELIVERY_NOT_AVAILABLE') {
        errorMsg = 'Entrega não disponível nesta região';
      } else if (data.code === 'INVALID_LOCATION') {
        errorMsg = 'Localização inválida ou não encontrada';
      }

      return res.status(lalaRes.status).json({
        error: errorMsg,
        code: data.code,
        message: data.message
      });
    }

    // ✅ EXTRAIR PREÇO (valor bruto, sem adicionais)
    const totalReais = 
      parseFloat(data.data?.priceBreakdown?.total || 
      data.priceBreakdown?.total || 
      data.totalFee || 
      0);

    // CORREÇÃO 2: Validação rigorosa do valor recebido (evita frete grátis indevido)
    if (isNaN(totalReais) || totalReais <= 0) {
      console.error('❌ [Frete] Erro: Valor de frete inválido ou zero recebido da Lalamove.', data);
      return res.status(502).json({
         error: 'Não foi possível calcular o valor exato do frete no momento.'
      });
    }

    // ⏱️ EXTRAIR DATA DE EXPIRAÇÃO (em milissegundos)
    const expiresAt = data.data?.expiresAt || null;
    let expiresAtMs = null;
    
    if (expiresAt) {
      try {
        const dataExp = new Date(expiresAt);
        expiresAtMs = dataExp.getTime(); // Timestamp em ms
      } catch (e) {
        expiresAtMs = null;
      }
    }


    return res.status(200).json({
      frete: totalReais,
      freteFormatado: 'R$ ' + totalReais.toFixed(2).replace('.', ','),
      expiresAtMs: expiresAtMs,
      success: true
    });

  } catch (err) {
    console.error('❌ [Frete] Erro interno:', {
      message: err.message,
      stack: err.stack
    });

    // CORREÇÃO 1: Remoção do err.message do retorno da API para não vazar detalhes do servidor
    return res.status(500).json({
      error: 'Erro interno ao processar a cotação de frete. Tente novamente mais tarde.'
    });
  }
}
