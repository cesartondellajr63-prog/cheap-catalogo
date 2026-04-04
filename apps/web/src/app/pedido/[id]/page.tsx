'use client';

import { useState, useEffect, useRef, Suspense, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import confetti from 'canvas-confetti';
import type { PaymentStatus } from '@/types';

const WHATSAPP = '5511951047070';

// ── PIX flow: polls Mercado Pago via accessToken ──
function PixPoller({
  orderId, accessToken,
  onApproved, onRejected, onTimeout,
}: {
  orderId: string; accessToken: string;
  onApproved: () => void; onRejected: () => void; onTimeout: () => void;
}) {
  const [attempts, setAttempts] = useState(0);
  const MAX = 15;
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const result: PaymentStatus = await api.payments.getStatus(orderId, accessToken);
        setAttempts(a => a + 1);
        if (result.status === 'approved') { clearInterval(ref.current!); sessionStorage.removeItem('pedidoAtual'); onApproved(); }
        else if (result.status === 'rejected' || result.status === 'cancelled') { clearInterval(ref.current!); onRejected(); }
      } catch {}
    };
    poll();
    ref.current = setInterval(() => {
      setAttempts(a => {
        if (a >= MAX) { clearInterval(ref.current!); onTimeout(); }
        return a + 1;
      });
      poll();
    }, 4000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [orderId, accessToken, onApproved, onRejected, onTimeout]);

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, color:'var(--muted)', fontSize:13, marginBottom:24 }}>
      <div className="spinner-w"></div>
      <span>Consultando Mercado Pago... ({attempts}/{MAX})</span>
    </div>
  );
}

// ── Cielo flow: polls order status in Firestore ──
function CieloPoller({
  orderId,
  onApproved, onTimeout,
}: {
  orderId: string;
  onApproved: () => void; onTimeout: () => void;
}) {
  const [attempts, setAttempts] = useState(0);
  const MAX = 36; // ~3 minutos
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = async () => {
    try {
      const order = await api.orders.getById(orderId);
      if (order.status === 'PAID' || order.status === 'SHIPPED' || order.status === 'DELIVERED') {
        if (ref.current) clearInterval(ref.current);
        onApproved();
      }
    } catch {}
  };

  useEffect(() => {
    poll();
    ref.current = setInterval(() => {
      setAttempts(a => {
        const next = a + 1;
        if (next >= MAX) { clearInterval(ref.current!); onTimeout(); }
        return next;
      });
      poll();
    }, 5000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [orderId, onApproved, onTimeout]);

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, marginBottom:24 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, color:'var(--muted)', fontSize:13 }}>
        <div className="spinner-w"></div>
        <span>Aguardando confirmação da Cielo... ({attempts}/{MAX})</span>
      </div>
      <button
        onClick={poll}
        style={{ fontSize:12, color:'var(--muted)', background:'transparent', border:'1px solid var(--border)', borderRadius:8, padding:'6px 14px', cursor:'pointer' }}
      >
        Verificar agora
      </button>
    </div>
  );
}

function PedidoContent({ orderId: orderIdProp }: { orderId: string }) {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | 'timeout'>('pending');

  useEffect(() => {
    if (status !== 'approved') return;
    const end = Date.now() + 3000;
    const frame = () => {
      confetti({ particleCount: 6, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#c8ff00', '#ffffff', '#00e676'] });
      confetti({ particleCount: 6, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#c8ff00', '#ffffff', '#00e676'] });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, [status]);

  const pedidoAtual = (() => { try { return JSON.parse(localStorage.getItem('pedidoAtual') ?? '{}'); } catch { return {}; } })();

  const orderId = orderIdProp
    || searchParams.get('external_reference')
    || (pedidoAtual.orderId ?? '');

  const accessToken = searchParams.get('token')
    || searchParams.get('accessToken')
    || (pedidoAtual.accessToken ?? '');

  // Se paymentType === 'card' ou não há accessToken → veio da Cielo (cartão)
  const isCard = pedidoAtual.paymentType === 'card' || !accessToken;

  const itemsText = (pedidoAtual.items as string[] | undefined)?.join(', ') ?? '';
  const addressText = (pedidoAtual.address as string | undefined) ?? '';
  const waMsg = itemsText && addressText
    ? `Olá! Acabei de finalizar o pagamento do pedido do meu ${itemsText} no endereço ${addressText} e gostaria de confirmar. Nº do pedido: ${orderId}`
    : `Olá! Acabei de finalizar o pagamento do pedido e gostaria de confirmar. Nº do pedido: ${orderId}`;
  const waLink = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(waMsg)}`;

  return (
    <main style={{ minHeight:'80vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px var(--pad)', position:'relative', zIndex:1 }}>
      <div style={{ maxWidth:860, width:'100%', textAlign:'center' }}>
        <div style={{
          background: 'var(--surface)',
          border: `1px solid ${status==='approved' ? 'rgba(200,255,0,0.3)' : status==='rejected' ? 'rgba(255,80,80,0.3)' : 'var(--border)'}`,
          borderRadius: 24,
          padding: 'clamp(48px,6vw,80px) clamp(40px,5vw,72px)',
        }}>

          {/* Status badge */}
          <div style={{
            display:'inline-flex', alignItems:'center', gap:6,
            padding:'6px 16px', borderRadius:99, fontSize:12, fontWeight:600,
            marginBottom:28,
            background: status==='approved' ? 'rgba(200,255,0,0.1)' : status==='rejected' ? 'rgba(255,80,80,0.1)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${status==='approved' ? 'rgba(200,255,0,0.3)' : status==='rejected' ? 'rgba(255,80,80,0.3)' : 'rgba(255,255,255,0.1)'}`,
            color: status==='approved' ? 'var(--accent)' : status==='rejected' ? '#ff5050' : 'var(--muted)',
          }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'currentColor', display:'inline-block', animation: status==='pending' ? 'pulse 1.5s ease infinite' : undefined }}></span>
            {status==='approved' ? 'Pagamento confirmado' : status==='rejected' ? 'Pagamento não aprovado' : status==='timeout' ? 'Aguardando confirmação' : 'Processando pagamento...'}
          </div>

          {/* Icon */}
          <div style={{ fontSize:'clamp(52px,9vw,80px)', marginBottom:20, lineHeight:1 }}>
            {status==='approved' ? '✅' : status==='rejected' ? '❌' : status==='timeout' ? '🕐' : isCard ? '💳' : '⏳'}
          </div>

          {/* Title */}
          <h1 style={{ fontFamily:'var(--font-syne),Syne,sans-serif', fontSize:'clamp(26px,5vw,42px)', fontWeight:800, marginBottom:16, letterSpacing:'-1px', color:'#fff', lineHeight:1.15 }}>
            {status==='approved'
              ? <><span>Pagamento </span><em style={{ fontStyle:'normal', color:'var(--accent)' }}>aprovado!</em></>
              : status==='rejected'
              ? <><span>Pagamento </span><em style={{ fontStyle:'normal', color:'#ff5050' }}>não aprovado</em></>
              : status==='timeout'
              ? <><span>Pedido </span><em style={{ fontStyle:'normal', color:'var(--accent)' }}>recebido!</em></>
              : isCard
              ? <><span>Pedido </span><em style={{ fontStyle:'normal', color:'var(--accent)' }}>enviado!</em></>
              : <><span>Verificando seu </span><em style={{ fontStyle:'normal', color:'var(--accent)' }}>pagamento...</em></>
            }
          </h1>

          {/* Description */}
          <p style={{ fontSize:'clamp(14px,2vw,15px)', color:'var(--muted)', lineHeight:1.65, maxWidth:380, margin:'0 auto 28px' }}>
            {status==='approved'
              ? 'Seu pagamento foi confirmado! Em breve você receberá uma atualização sobre a entrega.'
              : status==='rejected'
              ? 'O pagamento não foi aprovado. Tente novamente ou entre em contato.'
              : status==='timeout'
              ? isCard
                ? 'Seu pedido foi registrado. A confirmação do cartão pode levar alguns minutos — você receberá atualização em breve.'
                : 'Não conseguimos confirmar automaticamente. Entre em contato via WhatsApp se precisar de ajuda.'
              : isCard
              ? 'Aguardando confirmação da Cielo. Isso pode levar alguns instantes...'
              : 'Estamos confirmando seu PIX. Isso pode levar alguns segundos.'
            }
          </p>

          {/* Pollers */}
          {status === 'pending' && !isCard && orderId && accessToken && (
            <PixPoller
              orderId={orderId} accessToken={accessToken}
              onApproved={() => setStatus('approved')}
              onRejected={() => setStatus('rejected')}
              onTimeout={() => setStatus('timeout')}
            />
          )}
          {status === 'pending' && isCard && orderId && (
            <CieloPoller
              orderId={orderId}
              onApproved={() => setStatus('approved')}
              onTimeout={() => setStatus('timeout')}
            />
          )}

          {/* Actions */}
          <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:8 }}>
            {(status === 'approved' || status === 'timeout') && (
              <a href={waLink} target="_blank" rel="noopener noreferrer"
                style={{ background:'var(--accent)', color:'#000', padding:'14px 32px', borderRadius:12, fontSize:14, fontWeight:700, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, minHeight:48, textDecoration:'none', transition:'all 0.2s' }}>
                💬 {status === 'approved' ? 'Acompanhar entrega' : 'Confirmar pedido no WhatsApp'}
              </a>
            )}
            {status === 'rejected' && (
              <a href={waLink} target="_blank" rel="noopener noreferrer"
                style={{ background:'rgba(255,80,80,0.15)', color:'#ff5050', border:'1px solid rgba(255,80,80,0.3)', padding:'14px 32px', borderRadius:12, fontSize:14, fontWeight:700, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, minHeight:48, textDecoration:'none' }}>
                💬 Entrar em contato
              </a>
            )}
            {status !== 'pending' && (
              <a href="/"
                style={{ background:'var(--surface2)', color:'var(--text)', padding:'14px 32px', borderRadius:12, border:'1px solid var(--border)', fontSize:14, fontWeight:600, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, minHeight:48, textDecoration:'none' }}>
                ← Voltar ao Catálogo
              </a>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <>
      <header style={{ position:'relative', padding:'16px var(--pad)', borderBottom:'1px solid var(--border)', zIndex:1 }}>
        <div style={{ maxWidth:600, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ fontFamily:'var(--font-syne),Syne,sans-serif', fontSize:'clamp(16px,3vw,20px)', fontWeight:800, cursor:'pointer' }}
            onClick={() => window.location.href = '/'}>
            Cheaps<span style={{ color:'var(--accent)' }}>.</span>Pods
          </div>
        </div>
      </header>

      <Suspense fallback={
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh', color:'var(--muted)', gap:10 }}>
          <div className="spinner-w"></div> Carregando...
        </div>
      }>
        <PedidoContent orderId={id} />
      </Suspense>

      <footer style={{ position:'relative', zIndex:1, padding:'24px var(--pad)', textAlign:'center', borderTop:'1px solid var(--border)', color:'var(--muted)', fontSize:12 }}>
        <p>© 2026 Cheaps Pods — Todos os direitos reservados</p>
      </footer>
    </>
  );
}
