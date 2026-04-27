'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function AdminLoginPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.admin.login({ usuario, senha });
      if (result?.token) {
        localStorage.setItem('admin-token', result.token);
      }
      router.push('/admin');
    } catch (err: any) {
      const msg = err?.message || '';
      setError(msg.toLowerCase().includes('muitas') ? msg : 'Usuário ou senha incorretos.');
      setShake(true);
      setTimeout(() => setShake(false), 400);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{loginCSS}</style>
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: '#0a0a0a', position: 'relative', zIndex: 1,
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{
            background: 'rgba(17,17,17,0.85)',
            backdropFilter: 'blur(40px)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 28,
            padding: '56px 44px 48px',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 60px 120px rgba(0,0,0,0.7), 0 0 0 1px rgba(200,255,0,0.04) inset',
          }}>
            {/* top accent line */}
            <div style={{ position:'absolute',top:0,left:0,right:0,height:1,background:'linear-gradient(90deg,transparent,rgba(200,255,0,0.4),rgba(126,255,245,0.4),transparent)' }}></div>

            <div style={{ width:64,height:64,background:'linear-gradient(135deg,rgba(200,255,0,0.12),rgba(126,255,245,0.08))',border:'1px solid rgba(200,255,0,0.2)',borderRadius:20,display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,margin:'0 auto 24px' }}>⚡</div>

            <div style={{ fontFamily:'JetBrains Mono,monospace',fontSize:10,fontWeight:700,letterSpacing:4,textTransform:'uppercase',color:'#c8ff00',marginBottom:8,opacity:0.8 }}>CheapPods</div>
            <div style={{ fontSize:24,fontWeight:800,color:'#fff',letterSpacing:-0.5,marginBottom:36 }}>Painel Administrativo</div>

            <form onSubmit={handleLogin}>
              <div style={{ marginBottom:16 }}>
                <input
                  type="text"
                  value={usuario}
                  onChange={e => setUsuario(e.target.value)}
                  placeholder="Usuário"
                  autoComplete="username"
                  required
                  onKeyDown={e => e.key === 'Enter' && document.getElementById('senhaInput')?.focus()}
                  style={{
                    width: '100%',
                    background: 'rgba(26,26,26,0.8)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 14,
                    padding: '15px 18px',
                    fontFamily: 'JetBrains Mono,monospace',
                    fontSize: 16, color: '#fff',
                    outline: 'none', textAlign: 'center',
                    letterSpacing: 0,
                    transition: 'border-color 0.3s, box-shadow 0.3s',
                  }}
                  className="login-field-input"
                />
              </div>
              <div style={{ marginBottom:24 }}>
                <input
                  id="senhaInput"
                  type="password"
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  style={{
                    width: '100%',
                    background: 'rgba(26,26,26,0.8)',
                    border: `1px solid ${error ? '#ff4d4d' : 'rgba(255,255,255,0.12)'}`,
                    borderRadius: 14,
                    padding: '15px 18px',
                    fontFamily: 'JetBrains Mono,monospace',
                    fontSize: 16, color: '#fff',
                    outline: 'none', textAlign: 'center',
                    letterSpacing: 6,
                    transition: 'border-color 0.3s, box-shadow 0.3s',
                    animation: shake ? 'shake 0.35s ease' : 'none',
                  }}
                  className="login-field-input"
                />
              </div>

              {error && <div style={{ color:'#ff4d4d',fontSize:12,marginBottom:12,fontWeight:500 }}>{error}</div>}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '15px',
                  background: loading ? 'rgba(200,255,0,0.7)' : '#c8ff00',
                  color: '#0a0a0a',
                  border: 'none', borderRadius: 14,
                  fontFamily: 'Satoshi,sans-serif', fontSize: 15, fontWeight: 800,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.25s',
                  letterSpacing: 0.3,
                }}
                className="login-btn"
              >
                {loading ? 'Entrando...' : 'Acessar painel'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

const loginCSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
  .login-field-input::placeholder { letter-spacing: 2px; font-size: 14px; color: #6a6a6a; }
  .login-field-input:focus {
    border-color: rgba(200,255,0,0.45) !important;
    box-shadow: 0 0 0 4px rgba(200,255,0,0.08), 0 0 40px rgba(200,255,0,0.06) !important;
  }
  .login-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(200,255,0,0.3), 0 0 0 1px rgba(200,255,0,0.4);
  }
  @keyframes shake {
    0%,100%{transform:translateX(0)}
    20%{transform:translateX(-8px)}
    40%{transform:translateX(8px)}
    60%{transform:translateX(-5px)}
    80%{transform:translateX(5px)}
  }
`;
