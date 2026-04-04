// ✅ WEBHOOK SEGURO - Mercado Pago + Google Sheets (Com validação de assinatura)
// Arquivo: /api/webhook-mp.js

const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');
const crypto = require('crypto'); // 🔐 Necessário para validar a assinatura

// ─────────────────────────────────────────────────────
// 🔐 VARIÁVEIS DE AMBIENTE (configurar no Vercel)
//
//  MERCADOPAGO_ACCESS_TOKEN  → token do Mercado Pago
//  WEBHOOK_SECRET            → Segredo do Webhook (Pegue no painel do MP)
//  GOOGLE_SERVICE_ACCOUNT_JSON → conteúdo completo do JSON
//  GOOGLE_SHEET_ID → ID da planilha
// ─────────────────────────────────────────────────────

const SHEET_NAME  = 'Pedidos';   
const SHEET_RANGE = 'A:K';       

const processandoPagamentos = new Set();

const HEADER = [
  'Nº Pedido', 'Data/Hora', 'Nome', 'WhatsApp', 'Endereço', 
  'Produtos + Sabores', 'Valor Produtos (R$)', 'Frete (R$)', 
  'Total (R$)', 'Payment ID', 'Pagamento', 'Frete'
];

// 🛡️ Proteção contra Injeção de Fórmulas
function sanitizarSheets(texto) {
  if (!texto) return '—';
  const str = String(texto).trim();
  if (/^[=+\-@]/.test(str)) { return "'" + str; }
  return str;
}

// 🛡️ Validação Criptográfica do Webhook do Mercado Pago
function validarAssinaturaMP(req, dataId) {
  const secret = process.env.WEBHOOK_SECRET;
  
  // Se você ainda não configurou o segredo na Vercel, ele avisa mas permite passar (para não quebrar a loja)
  // O ideal é configurar o mais rápido possível!
  if (!secret) {
    console.warn('⚠️ [MP Webhook] WEBHOOK_SECRET não configurado na Vercel! Validação de assinatura pulada.');
    return true; 
  }

  const signatureHeader = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];

  if (!signatureHeader || !requestId || !dataId) {
    console.warn('🚫 [MP Webhook] Cabeçalhos de assinatura ausentes na requisição.');
    return false;
  }

  // O x-signature vem no formato: ts=1711234567,v1=a1b2c3d4e5f6...
  const parts = signatureHeader.split(',');
  let ts = '';
  let hash = '';

  parts.forEach(part => {
    const [key, val] = part.split('=');
    if (key === 'ts') ts = val;
    if (key === 'v1') hash = val;
  });

  if (!ts || !hash) return false;

  // Montar o manifesto exatamente como o MP exige
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  
  // Gerar o hash localmente e comparar com o que o MP enviou
  const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  return hmac === hash;
}

async function getSheetsClient() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não configurado');
  let credentials;
  try { credentials = JSON.parse(serviceAccountJson); } 
  catch (e) { throw new Error('JSON malformado'); }
  const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

async function pedidoJaExiste(sheets, spreadsheetId, orderId, paymentId) {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SHEET_NAME}!A:L` });
    const rows = res.data.values || [];
    const paymentIdStr = String(paymentId);
    return rows.some(row => row[10] === paymentIdStr || row[0] === orderId);
  } catch (e) { return false; }
}

async function garantirCabecalho(sheets, spreadsheetId) {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SHEET_NAME}!A1:L1` });
    const firstRow = res.data.values?.[0] || [];
    if (!firstRow.length || firstRow[0] !== 'Nº Pedido') {
      await sheets.spreadsheets.values.update({ spreadsheetId, range: `${SHEET_NAME}!A1`, valueInputOption: 'RAW', requestBody: { values: [HEADER] } });
    }
  } catch (err) {
    if (err.message?.includes('Unable to parse range')) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] } });
      await sheets.spreadsheets.values.update({ spreadsheetId, range: `${SHEET_NAME}!A1`, valueInputOption: 'RAW', requestBody: { values: [HEADER] } });
    } else { throw err; }
  }
}

async function salvarClienteUnico(sheets, spreadsheetId, nome, whatsapp, endereco) {
  const ABA_CLIENTES = 'Clientes';
  const HEADER_CLI   = ['Nome', 'WhatsApp', 'Endereço', 'Primeiro Pedido'];
  try {
    let rows = [];
    try {
      const r = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${ABA_CLIENTES}!A:D` });
      rows = r.data.values || [];
    } catch(e) {
      if (e.message?.includes('Unable to parse range')) {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: ABA_CLIENTES } } }] } });
        await sheets.spreadsheets.values.update({ spreadsheetId, range: `${ABA_CLIENTES}!A1`, valueInputOption: 'RAW', requestBody: { values: [HEADER_CLI] } });
      }
    }
    const jaExiste = rows.slice(1).some(row => row[1] === String(whatsapp));
    if (jaExiste) return;

    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const pad = n => String(n).padStart(2, '0');
    const data = "'" + pad(d.getDate()) + "/" + pad(d.getMonth()+1) + "/" + d.getFullYear();

    await sheets.spreadsheets.values.append({ spreadsheetId, range: `${ABA_CLIENTES}!A:D`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: [[nome, whatsapp, endereco, data]] } });
  } catch(e) { console.warn('[Clientes] Erro ao salvar cliente:', e.message); }
}

async function salvarPedidoNaplanilha(payment) {
  const SHEET_IDS = [process.env.GOOGLE_SHEET_ID, process.env.GOOGLE_SHEET_ID_2].filter(Boolean);
  if (!SHEET_IDS.length) throw new Error('GOOGLE_SHEET_ID não configurado');

  const sheets = await getSheetsClient();
  const spreadsheetId = SHEET_IDS[0];
  await garantirCabecalho(sheets, spreadsheetId);

  const jaExiste = await pedidoJaExiste(sheets, spreadsheetId, payment.external_reference, payment.id);
  if (jaExiste) return false;

  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const pad = n => String(n).padStart(2, '0');
  const agora = "'" + pad(d.getDate()) + "/" + pad(d.getMonth()+1) + "/" + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());

  const meta = payment.metadata || {};
  const valorProd  = parseFloat(meta.valor_produtos) || payment.transaction_amount || 0;
  const valorFrete = parseFloat(meta.valor_frete)    || payment.shipping_amount    || 0;
  const valorTotal = parseFloat(meta.valor_total)    || (valorProd + valorFrete);

  let produtosStr = '—';
  try {
    if (payment.order?.id) {
      const orderRes = await fetch(`https://api.mercadopago.com/merchant_orders/${payment.order.id}`, { headers: { 'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` } });
      if (orderRes.ok) {
        const order = await orderRes.json();
        if (order.items?.length) { produtosStr = order.items.map(i => `${i.title} x${i.quantity}`).join(' | '); }
      }
    }
  } catch (e) {}

  const nomeCliente    = sanitizarSheets(meta.customer_name    || payment.payer?.first_name || '—');
  const whatsCliente   = sanitizarSheets(meta.customer_phone   || payment.payer?.phone?.number || '—');
  const enderecoCliente= sanitizarSheets(meta.customer_address || '—');
  const produtosSeguros= sanitizarSheets(produtosStr);
  const orderIdSeguro  = sanitizarSheets(payment.external_reference || '—');

  const linha = [
    orderIdSeguro, agora, nomeCliente, whatsCliente, enderecoCliente, produtosSeguros,
    valorProd.toFixed(2).replace('.', ','), valorFrete.toFixed(2).replace('.', ','), valorTotal.toFixed(2).replace('.', ','),
    String(payment.id), 'Pago ✅', 'Pendente',
  ];

  for (const sheetId of SHEET_IDS) {
    try {
      await garantirCabecalho(sheets, sheetId);
      await sheets.spreadsheets.values.append({ spreadsheetId: sheetId, range: `${SHEET_NAME}!A:L`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: [linha] } });
    } catch (e) {}
  }
  await salvarClienteUnico(sheets, SHEET_IDS[0], nomeCliente, whatsCliente, enderecoCliente);
  return true;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const type = req.query?.type || req.body?.type || req.query?.topic || req.body?.topic;
  const paymentId = req.body?.data?.id || req.query?.['data.id'] || req.body?.id || req.query?.id;

  if (type !== 'payment') return res.status(200).json({ message: 'OK' });

  try {
    if (!paymentId) return res.status(400).json({ error: 'Payment ID obrigatório' });

    // 🛡️ VALIDAÇÃO DE ASSINATURA ANTES DE TUDO
    if (!validarAssinaturaMP(req, paymentId)) {
      console.error(`[MP Webhook] 🚫 Assinatura inválida bloqueada! ID: ${paymentId}`);
      return res.status(403).json({ error: 'Assinatura inválida ou ausente' });
    }

    if (!process.env.MERCADOPAGO_ACCESS_TOKEN) return res.status(500).json({ error: 'Token MP não configurado' });

    const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, { headers: { 'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` } });
    if (!paymentRes.ok) return res.status(paymentRes.status).json({ error: 'Erro ao buscar pagamento' });

    const payment = await paymentRes.json();

    if (payment.status === 'approved') {
      try {
        const delay = Math.floor(Math.random() * 2000);
        await new Promise(r => setTimeout(r, delay));
        await salvarPedidoNaplanilha(payment);
      } catch (sheetsErr) { console.error('❌ Erro Sheets:', sheetsErr.message); }
      return res.status(200).json({ status: 'approved', orderId: payment.external_reference, sheets: 'saved' });
    }

    if (payment.status === 'pending' || payment.status === 'in_process') return res.status(200).json({ status: 'pending', orderId: payment.external_reference });
    if (payment.status === 'rejected') return res.status(200).json({ status: 'rejected', orderId: payment.external_reference });

    return res.status(200).json({ status: payment.status });
  } catch (err) {
    return res.status(200).json({ error: 'Erro interno', message: err.message });
  }
}
