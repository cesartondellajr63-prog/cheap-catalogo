// ✅ API - Registrar pedido de cartão na planilha Google Sheets
// Arquivo: /api/pedido-cartao.js

const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');

// ─────────────────────────────────────────
// 🔐 RATE LIMITING — 5 pedidos / 10 min por IP
// ─────────────────────────────────────────
const RL_WINDOW = 10 * 60 * 1000; // 10 minutos
const RL_MAX = 5;

function getIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  global._pedidoRateLimit = global._pedidoRateLimit || {};
  const now = Date.now();
  const record = global._pedidoRateLimit[ip];

  if (!record || now - record.start > RL_WINDOW) {
    global._pedidoRateLimit[ip] = { count: 1, start: now };
    return false;
  }
  
  record.count += 1;
  return record.count > RL_MAX;
}

const SHEET_NAME = 'Pedidos';

// 🛡️ Proteção contra Injeção de Fórmulas (CSV Injection)
function sanitizarSheets(texto) {
  if (!texto) return '—';
  const str = String(texto).trim();
  if (/^[=+\-@]/.test(str)) {
    return "'" + str;
  }
  return str;
}

async function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

async function garantirCabecalho(sheets, spreadsheetId) {
  const HEADER = ['Nº Pedido','Data/Hora','Nome','WhatsApp','Endereço','Produtos + Sabores','Valor Produtos (R$)','Frete (R$)','Total (R$)','Payment ID','Pagamento','Frete'];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:L1`,
    });
    const firstRow = res.data.values?.[0] || [];
    if (!firstRow.length || firstRow[0] !== 'Nº Pedido') {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADER] },
      });
    }
  } catch (err) {
    if (err.message?.includes('Unable to parse range')) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] }
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADER] },
      });
    }
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
    
    // ✅ CORREÇÃO: Formatação de string 100% segura sem crases
    const data = "'" + pad(d.getDate()) + "/" + pad(d.getMonth()+1) + "/" + d.getFullYear();
    
    await sheets.spreadsheets.values.append({ spreadsheetId, range: `${ABA_CLIENTES}!A:D`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: [[nome, whatsapp, endereco, data]] } });
  } catch(e) { console.warn('[Clientes] Erro ao salvar cliente:', e.message); }
}

async function pedidoJaExiste(sheets, spreadsheetId, orderId) {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SHEET_NAME}!A:A` });
    return (res.data.values || []).some(row => row[0] === orderId);
  } catch (e) { return false; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://cheapspods-catalogo-cesar8.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  // 🛡️ Verificar Rate Limit
  const ip = getIP(req);
  if (isRateLimited(ip)) {
    console.warn(`[Cartão] 🚫 IP bloqueado por excesso de pedidos: ${ip}`);
    return res.status(429).json({ 
      error: 'Muitos pedidos registrados rapidamente. Por favor, aguarde alguns minutos.' 
    });
  }

  const { orderId, nome, whatsapp, endereco, produtos, valorProdutos, valorFrete, valorTotal } = req.body || {};

  if (!orderId || !nome) return res.status(400).json({ error: 'Parâmetros obrigatórios faltando' });
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_SHEET_ID) return res.status(500).json({ error: 'Credenciais não configuradas' });

  try {
    const sheets = await getSheetsClient();
    const SHEET_IDS = [process.env.GOOGLE_SHEET_ID, process.env.GOOGLE_SHEET_ID_2].filter(Boolean);
    const spreadsheetId = SHEET_IDS[0];

    if (await pedidoJaExiste(sheets, spreadsheetId, orderId)) {
      return res.status(200).json({ success: true, duplicata: true });
    }

    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const pad = n => String(n).padStart(2, '0');
    
    // ✅ CORREÇÃO: Formatação de string segura
    const agora = "'" + pad(d.getDate()) + "/" + pad(d.getMonth()+1) + "/" + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());

    let produtosStr = '—';
    try {
      const itens = JSON.parse(produtos || '[]');
      produtosStr = itens.map(i => `${i.model} - ${i.flavor} x${i.qty}`).join(' | ');
    } catch(e) {}

    // 🛡️ Aplicando sanitização nos inputs do usuário
    const nomeSeguro = sanitizarSheets(nome);
    const whatsSeguro = sanitizarSheets(whatsapp);
    const enderecoSeguro = sanitizarSheets(endereco);
    const produtosSeguros = sanitizarSheets(produtosStr);
    const orderIdSeguro = sanitizarSheets(orderId);

    const linha = [
      orderIdSeguro,                                                    // A  Nº Pedido
      agora,                                                            // B  Data/Hora
      nomeSeguro,                                                       // C  Nome
      whatsSeguro,                                                      // D  WhatsApp
      enderecoSeguro,                                                   // E  Endereço
      produtosSeguros,                                                  // F  Produtos + Sabores
      parseFloat(valorProdutos||0).toFixed(2).replace('.', ','),       // G  Valor Produtos
      parseFloat(valorFrete||0).toFixed(2).replace('.', ','),          // H  Frete (R$)
      parseFloat(valorTotal||0).toFixed(2).replace('.', ','),          // I  Total
      'Gerar Link',                                                     // J  Payment ID / Link
      'Não Pago',                                                       // K  Pagamento
      'Pendente',                                                       // L  Frete/Entrega
    ];

    for (const sheetId of SHEET_IDS) {
      try {
        await garantirCabecalho(sheets, sheetId);
        await sheets.spreadsheets.values.append({
          spreadsheetId: sheetId,
          range: `${SHEET_NAME}!A:L`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [linha] },
        });
      } catch(e) { console.error(`[Cartão] ❌ Erro:`, e.message); }
    }

    await salvarClienteUnico(sheets, SHEET_IDS[0], nomeSeguro, whatsSeguro, enderecoSeguro);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[Cartão] ❌ Erro:', err.message);
    return res.status(500).json({ error: 'Erro ao registrar pedido' });
  }
}
