// ✅ API - Buscar clientes da aba "Clientes"
// Arquivo: /api/clientes-data.js

const crypto = require('crypto');
const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');

const ABA_CLIENTES = 'Clientes';

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

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

  // 🔐 Auth
  if (!autenticado(req)) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_SHEET_ID) {
    return res.status(500).json({ error: 'Credenciais não configuradas' });
  }

  try {
    const sheets        = await getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    const res2 = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${ABA_CLIENTES}!A:D`,
    });

    const rows = res2.data.values || [];

    if (rows.length <= 1) {
      return res.status(200).json({ clientes: [] });
    }

    // Pular cabecalho e deduplicar por WhatsApp — mantém primeira ocorrência
    const vistos = new Set();
    const clientes = rows.slice(1).reduce((acc, row) => {
      const whatsapp = row[1] || '—';
      if (!vistos.has(whatsapp)) {
        vistos.add(whatsapp);
        acc.push({
          nome:          row[0] || '—',
          whatsapp,
          endereco:      row[2] || '—',
          primeiroPedido:(row[3] || '—').replace(/^'/, ''),
        });
      }
      return acc;
    }, []);

    return res.status(200).json({ clientes });

  } catch (err) {
    console.error('[Clientes] Erro:', err.message);
    return res.status(500).json({ error: 'Erro ao buscar clientes' });
  }
}
