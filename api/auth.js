// ✅ API - Autenticação do dashboard (Segurança Reforçada)
// Arquivo: /api/auth.js
// Env vars necessárias: DASHBOARD_USER, DASHBOARD_PASS, JWT_SECRET

const crypto = require('crypto');

// ─────────────────────────────────────────
// 🔐 RATE LIMITING — 5 tentativas / 15 min por IP
// ─────────────────────────────────────────
const MAX_TENTATIVAS = 5;
const LOCKOUT_MS     = 15 * 60 * 1000; // 15 minutos

function getIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function verificarRateLimit(ip) {
  global._loginAttempts = global._loginAttempts || {};
  const agora   = Date.now();
  const registro = global._loginAttempts[ip];

  if (!registro || agora > registro.bloqueadoAte) {
    global._loginAttempts[ip] = { tentativas: 0, bloqueadoAte: 0 };
    return { bloqueado: false };
  }

  if (registro.bloqueadoAte > agora) {
    const restamMs  = registro.bloqueadoAte - agora;
    const restamMin = Math.ceil(restamMs / 60000);
    return { bloqueado: true, restamMin };
  }

  return { bloqueado: false };
}

function registrarFalha(ip) {
  global._loginAttempts = global._loginAttempts || {};
  const registro = global._loginAttempts[ip] || { tentativas: 0, bloqueadoAte: 0 };
  registro.tentativas += 1;

  if (registro.tentativas >= MAX_TENTATIVAS) {
    registro.bloqueadoAte = Date.now() + LOCKOUT_MS;
    console.warn(`[Auth] 🔒 IP bloqueado por 15min: ${ip} (${registro.tentativas} tentativas)`);
  }

  global._loginAttempts[ip] = registro;
}

function registrarSucesso(ip) {
  if (global._loginAttempts?.[ip]) {
    delete global._loginAttempts[ip];
  }
}

// ─────────────────────────────────────────
// JWT
// ─────────────────────────────────────────
function gerarToken(usuario) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não configurado nas variáveis de ambiente');

  const payload = { u: usuario, t: Date.now(), exp: Date.now() + 24 * 60 * 60 * 1000 };
  const base = Buffer.from(JSON.stringify(payload)).toString('base64');
  const sig = crypto.createHmac('sha256', secret).update(base).digest('base64');
  return `${base}.${sig}`;
}

function validarToken(token) {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null; // Falha segura: sem segredo, sem acesso

    const [base, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', secret).update(base).digest('base64');
    if (sig !== expected) return null;
    
    const payload = JSON.parse(Buffer.from(base, 'base64').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

// ─────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-auth-token');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Verificar token existente (GET)
  if (req.method === 'GET') {
    const token = req.headers['x-auth-token'];
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });
    const payload = validarToken(token);
    if (!payload) return res.status(401).json({ error: 'Token inválido ou expirado' });
    return res.status(200).json({ ok: true, usuario: payload.u });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  // ─── Rate limiting ───
  const ip = getIP(req);
  const limite = verificarRateLimit(ip);

  if (limite.bloqueado) {
    console.warn(`[Auth] 🚫 Tentativa bloqueada — IP: ${ip}`);
    return res.status(429).json({
      error: `Muitas tentativas. Tente novamente em ${limite.restamMin} minuto${limite.restamMin > 1 ? 's' : ''}.`
    });
  }

  // ─── Validar credenciais ───
  const { usuario, senha } = req.body || {};

  const DASHBOARD_USER = process.env.DASHBOARD_USER;
  const DASHBOARD_PASS = process.env.DASHBOARD_PASS;

  // Proteção Crítica: Se faltar variável na Vercel, derruba a API.
  if (!DASHBOARD_USER || !DASHBOARD_PASS) {
    console.error('[Auth] ❌ ERRO CRÍTICO: DASHBOARD_USER ou DASHBOARD_PASS não configurados na Vercel.');
    return res.status(500).json({ error: 'Erro de configuração no servidor. Contate o administrador.' });
  }

  if (!usuario || !senha) {
    return res.status(400).json({ error: 'Usuário e senha obrigatórios' });
  }

  if (usuario !== DASHBOARD_USER || senha !== DASHBOARD_PASS) {
    registrarFalha(ip);

    const registro = global._loginAttempts[ip];
    const restam   = MAX_TENTATIVAS - registro.tentativas;

    if (registro.bloqueadoAte > Date.now()) {
      return res.status(429).json({
        error: `Muitas tentativas. Conta bloqueada por 15 minutos.`
      });
    }

    return res.status(401).json({
      error: `Usuário ou senha incorretos. ${restam} tentativa${restam !== 1 ? 's' : ''} restante${restam !== 1 ? 's' : ''}.`
    });
  }

  // ─── Login bem-sucedido ───
  registrarSucesso(ip);
  const token = gerarToken(usuario);
  return res.status(200).json({ ok: true, token, usuario });
};

module.exports.validarToken = validarToken;
