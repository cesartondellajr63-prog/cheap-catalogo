// ✅ API DE STATUS DO PEDIDO - Consulta Mercado Pago
// Arquivo: /api/status-pedido.js

const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://cheapspods-catalogo-cesar8.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { orderId, accessToken } = req.query;

  if (!orderId || !accessToken) {
    return res.status(400).json({ error: 'orderId e accessToken obrigatórios' });
  }

  // 🔐 Validar accessToken vinculado ao orderId
  const registro = global._pixTokens?.[orderId];
  if (!registro) {
    return res.status(403).json({ error: 'Pedido não encontrado ou token inválido' });
  }
  if (registro.accessToken !== accessToken) {
    return res.status(403).json({ error: 'Token inválido' });
  }
  if (registro.expiresAt < Date.now()) {
    delete global._pixTokens[orderId];
    return res.status(403).json({ error: 'Token expirado' });
  }

  if (!MERCADOPAGO_ACCESS_TOKEN) {
    console.error('❌ [Status] MERCADOPAGO_ACCESS_TOKEN não configurado');
    return res.status(500).json({ error: 'Configuração faltando' });
  }

  try {
    // 🔍 BUSCAR PAGAMENTOS PELO external_reference (orderId)
    const searchRes = await fetch(
      `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`
        }
      }
    );

    if (!searchRes.ok) {
      console.error('❌ [Status] Erro ao buscar pagamentos:', searchRes.status);
      return res.status(searchRes.status).json({ error: 'Erro ao consultar pagamento' });
    }

    const searchData = await searchRes.json();
    const payments = searchData.results || [];

    // Sem pagamentos ainda
    if (payments.length === 0) {
      return res.status(200).json({
        status: 'pending',
        message: 'Aguardando pagamento'
      });
    }

    const payment = payments[0];

    // Mapear status
    const statusMap = {
      approved:   'approved',
      pending:    'pending',
      in_process: 'pending',
      rejected:   'rejected',
      cancelled:  'rejected',
      refunded:   'rejected'
    };

    // Limpar token após aprovação ou rejeição definitiva
    if (['approved', 'rejected', 'cancelled', 'refunded'].includes(payment.status)) {
      delete global._pixTokens[orderId];
    }

    return res.status(200).json({
      status: statusMap[payment.status] || 'pending',
      paymentId: payment.id,
      amount: payment.transaction_amount,
      method: payment.payment_method_id,
      updatedAt: payment.date_last_updated,
      // ✅ CORREÇÃO AQUI: Enviando os metadados do pedido de volta para o site
      metadata: payment.metadata || {} 
    });

  } catch (err) {
    console.error('❌ [Status] Erro interno:', err.message);
    return res.status(500).json({ error: 'Erro interno ao consultar status' });
  }
}
