// ✅ API - Atualizar status do pedido na planilha (Segurança Reforçada)
// Arquivo: /api/atualizar-pedido.js

const crypto = require('crypto');
const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');

const SHEET_NAME = 'Pedidos';

function validarToken(token) {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return false; // Falha segura

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
  
  // Verifica token legado apenas se a variável existir na Vercel
  if (SECRET && token === SECRET) {
    return true;
  }
  
  // Valida o novo formato JWT
  return validarToken(token);
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-dashboard-secret, x-auth-token');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  if (!autenticado(req)) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const { numeroPedido, campo, valor } = req.body || {};

  if (!numeroPedido || !campo || !valor) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios: numeroPedido, campo, valor' });
  }

  // Estrutura colunas (base 1: A=1):
  const colunaMap = {
    paymentId:     10,  // J
    pagamento:     11,  // K
    pagCartao:     11,  // alias K
    statusEntrega: 12,  // L
  };

  if (!colunaMap[campo]) {
    return res.status(400).json({ error: 'Campo inválido: ' + campo });
  }

  const coluna   = colunaMap[campo];
  const colLetra = String.fromCharCode(64 + coluna);

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_SHEET_ID) {
    return res.status(500).json({ error: 'Credenciais do Google não configuradas' });
  }

  try {
    const sheets        = await getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A:A`,
    });

    const rows = readRes.data.values || [];
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === numeroPedido) { rowIndex = i + 1; break; }
    }

    if (rowIndex === -1) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    // Sanitização contra Injeção de CSV/Fórmulas no Sheets
    let valorSeguro = String(valor);
    if (/^[=+\-@]/.test(valorSeguro)) {
      valorSeguro = "'" + valorSeguro;
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!${colLetra}${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[valorSeguro]] },
    });


    if (process.env.GOOGLE_SHEET_ID_2) {
      try {
        const readRes2 = await sheets.spreadsheets.values.get({
          spreadsheetId: process.env.GOOGLE_SHEET_ID_2,
          range: `${SHEET_NAME}!A:A`,
        });
        const rows2 = readRes2.data.values || [];
        let rowIndex2 = -1;
        for (let i = 0; i < rows2.length; i++) {
          if (rows2[i][0] === numeroPedido) { rowIndex2 = i + 1; break; }
        }
        if (rowIndex2 !== -1) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: process.env.GOOGLE_SHEET_ID_2,
            range: `${SHEET_NAME}!${colLetra}${rowIndex2}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[valorSeguro]] },
          });
        }
      } catch(e) { console.warn('[Atualizar] Erro planilha 2:', e.message); }
    }

    return res.status(200).json({ success: true, numeroPedido, campo, valor: valorSeguro });

  } catch (err) {
    console.error('[Atualizar] ❌ Erro:', err.message);
    return res.status(500).json({ error: 'Erro ao atualizar planilha' });
  }
}
