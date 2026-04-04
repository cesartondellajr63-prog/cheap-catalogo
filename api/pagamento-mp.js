//  API SEGURA DE PAGAMENTO - Mercado Pago (APENAS PIX)
// Arquivo: /api/pagamento-mp.js
// Usando Checkout Standard com filtro de PIX

const crypto = require('crypto');
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const MERCADOPAGO_BASE_URL = 'https://api.mercadopago.com/checkout/preferences';

module.exports = async function handler(req, res) {
  //  CORS seguro
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

  const {
    orderId,
    items,
    shippingPrice,
    customerEmail,
    customerName,
    customerPhone,
    address,
    city
  } = req.body || {};

  //  VALIDAÇÕES
  if (!orderId || !items || !customerEmail || !customerName || !customerPhone) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios faltando' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items deve ser um array não vazio' });
  }

  // Validar cada item
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.model || !item.flavor || !item.price || !item.qty) {
      return res.status(400).json({ error: `Item ${i} incompleto` });
    }

    const price = parseFloat(item.price);
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ error: `Preço inválido no item ${i}` });
    }

    const qty = parseInt(item.qty);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: `Quantidade inválida no item ${i}` });
    }
  }

  // Validar frete
  const freteNum = parseFloat(shippingPrice);
  if (isNaN(freteNum) || freteNum < 0) {
    return res.status(400).json({ error: 'Valor de frete inválido' });
  }

  // Validar email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(customerEmail)) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  // Validar telefone
  const phoneNumbers = customerPhone.replace(/\D/g, '');
  if (phoneNumbers.length < 10) {
    return res.status(400).json({ error: 'Telefone inválido' });
  }

  // Validar credenciais
  if (!MERCADOPAGO_ACCESS_TOKEN) {
    console.error(" MERCADOPAGO_ACCESS_TOKEN não configurado!");
    return res.status(500).json({ error: "Credenciais não configuradas" });
  }

  try {

    // 🎯 CONSTRUIR PREFERÊNCIA - APENAS PIX
    const preference = {
      //  ITENS DO CARRINHO
      items: items.map(item => ({
        title: `${item.model} - ${item.flavor}`,
        description: `Quantidade: ${item.qty}`,
        unit_price: parseFloat(item.price),
        quantity: parseInt(item.qty),
        currency_id: 'BRL'
      })),

      // 📍 FRETE
      shipments: {
        cost: freteNum,
        mode: 'not_specified'
      },

      //  CLIENTE
      payer: {
        name: customerName,
        email: customerEmail,
        phone: {
          area_code: phoneNumbers.substring(0, 2),
          number: phoneNumbers.substring(2)
        }
      },

      //  REFERÊNCIA
      external_reference: orderId,

      //  URLs DE RETORNO
      back_urls: {
        success: `https://cheapspods-catalogo-cesar8.vercel.app/obrigado.html?orderId=${encodeURIComponent(orderId)}`,
        failure: `https://cheapspods-catalogo-cesar8.vercel.app/obrigado.html?orderId=${encodeURIComponent(orderId)}`,
        pending: `https://cheapspods-catalogo-cesar8.vercel.app/obrigado.html?orderId=${encodeURIComponent(orderId)}`
      },

      //  CONFIGURAÇÕES - 🎯 APENAS PIX
      auto_return: 'approved',
      
      //  BLOQUEAR TUDO EXCETO PIX (bank_transfer)
      payment_methods: {
        //  Excluir APENAS cartão e boleto
        excluded_payment_types: [
          {
            id: 'credit_card'     //  Cartão de crédito
          },
          {
            id: 'debit_card'      //  Cartão de débito
          },
          {
            id: 'ticket'          //  Boleto
          },
          {
            id: 'atm'             //  Caixa eletrônico
          },
          {
            id: 'prepaid_card'    //  Cartão pré-pago
          }
        ],
        // ⚠️ NÃO excluir 'bank_transfer' porque PIX é isso!
        
        //  PIX como padrão
        default_payment_method_id: 'pix'
      },

      //  WEBHOOK
      notification_url: 'https://cheapspods-catalogo-cesar8.vercel.app/api/webhook-mp',

      //  METADADOS (usados pelo webhook para salvar na planilha)
      metadata: {
        order_id: orderId,
        customer_name: customerName,
        customer_phone: phoneNumbers,
        customer_address: `${address}, ${city}`,
        valor_produtos: items.reduce((s, i) => s + parseFloat(i.price) * parseInt(i.qty), 0).toFixed(2),
        valor_frete: parseFloat(shippingPrice).toFixed(2),
        valor_total: (items.reduce((s, i) => s + parseFloat(i.price) * parseInt(i.qty), 0) + parseFloat(shippingPrice)).toFixed(2)
      }
    };


    // 📤 CHAMAR API MERCADO PAGO
    const response = await fetch(MERCADOPAGO_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`
      },
      body: JSON.stringify(preference)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(' Erro MP:', {
        status: response.status,
        error: data.error,
        message: data.message
      });

      return res.status(response.status).json({
        error: 'Erro ao criar preferência de pagamento.',
        details: data.message
      });
    }

    if (!data.id || !data.init_point) {
      console.error(' Resposta inválida de MP:', data);
      return res.status(500).json({ error: 'Resposta inválida do Mercado Pago' });
    }


    //  Gerar accessToken vinculado ao orderId para validação no polling
    const accessToken = crypto.randomBytes(32).toString('hex');
    const expiresAt   = Date.now() + 2 * 60 * 60 * 1000; // 2 horas
    global._pixTokens = global._pixTokens || {};
    global._pixTokens[orderId] = { accessToken, expiresAt };

    return res.status(200).json({
      success: true,
      checkoutUrl: data.init_point,
      preferenceId: data.id,
      accessToken
    });

  } catch (err) {
    console.error(' Erro:', err.message);
    return res.status(500).json({
      error: 'Erro ao processar pagamento. Tente novamente.'
    });
  }
}
