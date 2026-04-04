// ✅ API - Dashboard de pedidos
// Arquivo: /api/dashboard-data.js
const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');
const crypto = require('crypto');

const SHEET_NAME = 'Pedidos';

function validarToken(token) {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return false; // Bloqueia se a variável não existir
    
    const [base, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', secret).update(base).digest('base64');
    if (sig !== expected) return false;
    const payload = JSON.parse(Buffer.from(base, 'base64').toString());
    if (payload.exp < Date.now()) return false;
    return true;
  } catch { return false; }
}

function autenticado(req) {
  // Aceita token JWT (novo) ou DASHBOARD_SECRET legado
  const token  = req.headers['x-auth-token'] || req.headers['x-dashboard-secret'];
  const SECRET = process.env.DASHBOARD_SECRET;
  
  if (SECRET && token === SECRET) return true;
  return validarToken(token);
}

async function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-dashboard-secret, x-auth-token');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

  if (!autenticado(req)) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_SHEET_ID) {
    return res.status(500).json({ error: 'Credenciais não configuradas' });
  }

  try {
    const sheets = await getSheetsClient();

    const res2 = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${SHEET_NAME}!A:L`,
    });

    const rows = res2.data.values || [];
    if (rows.length <= 1) return res.status(200).json({ pedidos: [] });

    const pedidos = rows.slice(1).map(row => ({
      numeroPedido:  row[0]  || '—',
      dataHora:      (row[1] || '—').replace(/^'/, ''),
      nome:          row[2]  || '—',
      whatsapp:      row[3]  || '—',
      endereco:      row[4]  || '—',
      produtos:      row[5]  || '—',
      valorProdutos: row[6]  || '0',
      frete:         row[7]  || '0',
      total:         row[8]  || '0',
      paymentId:     row[9]  || '—',
      pagamento:     row[10] || '—',
      statusEntrega: row[11] || 'Pendente',
    }));

    return res.status(200).json({ pedidos });

  } catch (err) {
    console.error('[Dashboard] Erro:', err.message);
    return res.status(500).json({ error: 'Erro ao buscar dados' });
  }
}
