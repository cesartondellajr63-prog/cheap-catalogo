'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://cheap-catalogo.onrender.com';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type OrderStatus = 'PENDING' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';

interface TrackingOrder {
  orderNumber: string;
  customerName: string;
  address: string;
  city: string;
  items: Array<{
    productName: string;
    variantName: string;
    quantity: number;
    unitPrice: number;
  }>;
  subtotal: number;
  shippingCost: number;
  total: number;
  status: OrderStatus;
  shippingStatus: string | null;
  trackingLink: string | null;
  motoboy: string | null;
  createdAt: number;
}

// ─── Pagamento: box de confirmação ───────────────────────────────────────────

const PAYMENT_CONFIG: Record<OrderStatus, { label: string; icon: string; accent: string; bg: string } | null> = {
  PENDING:   null, // sem box de pagamento enquanto não confirmado
  PAID:      { label: 'Pagamento Confirmado', icon: '✅', accent: '#c8ff00', bg: 'rgba(200,255,0,0.08)' },
  SHIPPED:   { label: 'Pagamento Confirmado', icon: '✅', accent: '#c8ff00', bg: 'rgba(200,255,0,0.08)' },
  DELIVERED: { label: 'Pagamento Confirmado', icon: '✅', accent: '#c8ff00', bg: 'rgba(200,255,0,0.08)' },
  CANCELLED: { label: 'Pedido Cancelado',     icon: '❌', accent: '#ff5050', bg: 'rgba(255,80,80,0.08)' },
  REFUNDED:  { label: 'Reembolsado',          icon: '↩️', accent: 'rgba(255,255,255,0.5)', bg: 'rgba(255,255,255,0.04)' },
};

// ─── Entrega: mapeamento shippingStatus → texto para o cliente ───────────────
// Admin vê:          Cliente vê:
// 🔴 Pendente     →  Em separação
// 🟠 Solicitado   →  Buscando motorista
// 🟡 A Caminho    →  A caminho
// 🟢 Entregue     →  Entregue
// ⛔ Cancelado    →  Cancelado

function getDeliveryStatus(shippingStatus: string | null): { label: string; icon: string; accent: string; bg: string } {
  if (shippingStatus === '🟠 Solicitado') {
    return { label: 'Buscando motorista', icon: '🔍', accent: '#ff9500', bg: 'rgba(255,149,0,0.1)' };
  }
  if (shippingStatus === '🟡 A Caminho') {
    return { label: 'A caminho', icon: '🚚', accent: '#7efff5', bg: 'rgba(126,255,245,0.08)' };
  }
  if (shippingStatus === '🟢 Entregue') {
    return { label: 'Entregue', icon: '📦', accent: '#c8ff00', bg: 'rgba(200,255,0,0.08)' };
  }
  if (shippingStatus === '⛔ Cancelado') {
    return { label: 'Cancelado', icon: '❌', accent: '#ff5050', bg: 'rgba(255,80,80,0.08)' };
  }
  // 🔴 Pendente ou null → Em separação
  return { label: 'Em separação', icon: '📋', accent: '#f59e0b', bg: 'rgba(245,158,11,0.1)' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AcompanharPedidoPage() {
  const params = useParams();
  const numero = (params.numero as string)?.toUpperCase();

  const [order, setOrder] = useState<TrackingOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`${API}/orders/track/${numero}`, { cache: 'no-store' });
      if (!res.ok) {
        setError('Pedido não encontrado. Verifique o número e tente novamente.');
        return;
      }
      const data: TrackingOrder = await res.json();
      setOrder(data);
      setError(null);
    } catch {
      setError('Erro ao buscar pedido. Tente novamente em instantes.');
    } finally {
      setLoading(false);
    }
  }, [numero]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  useEffect(() => {
    const interval = setInterval(fetchOrder, 30_000);
    return () => clearInterval(interval);
  }, [fetchOrder]);

  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', position:'relative', zIndex:2 }}>
        <p style={{ color:'rgba(255,255,255,0.45)', fontSize:14 }}>Buscando seu pedido...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', gap:16, padding:'0 24px', position:'relative', zIndex:2, textAlign:'center' }}>
        <p style={{ fontSize:40 }}>😕</p>
        <p style={{ color:'#fff', fontWeight:600 }}>{error}</p>
        <a href="/" style={{ color:'#c8ff00', fontSize:14, textDecoration:'underline' }}>Voltar ao catálogo</a>
      </div>
    );
  }

  const showTracking =
    order.shippingStatus === '🟡 A Caminho' &&
    !!order.trackingLink &&
    order.motoboy !== '🏍️ Motoboy Próprio';
  const paymentCfg = PAYMENT_CONFIG[order.status];
  const deliveryCfg = getDeliveryStatus(order.shippingStatus);

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 20,
    padding: '20px 24px',
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 8,
  };

  return (
    <main style={{ minHeight:'100vh', padding:'clamp(24px,4vw,48px) var(--pad)', position:'relative', zIndex:2 }}>
      <div style={{ maxWidth:520, margin:'0 auto', display:'flex', flexDirection:'column', gap:16 }}>

        {/* Cabeçalho */}
        <div style={{ textAlign:'center', marginBottom:8 }}>
          <h1 style={{ fontFamily:'var(--font-syne),Syne,sans-serif', fontSize:'clamp(20px,4vw,26px)', fontWeight:800, color:'#fff', letterSpacing:'-0.5px' }}>
            Cheaps<span style={{ color:'var(--accent)' }}>.</span>Pods
          </h1>
          <p style={{ color:'rgba(255,255,255,0.45)', fontSize:13, marginTop:4 }}>Acompanhamento de Pedido</p>
        </div>

        {/* Identificação */}
        <div style={card}>
          <p style={sectionLabel}>Número do pedido</p>
          <p style={{ fontFamily:'var(--font-syne),Syne,sans-serif', fontSize:22, fontWeight:800, color:'var(--accent)', letterSpacing:'-0.5px' }}>{order.orderNumber}</p>
          <p style={{ color:'rgba(255,255,255,0.45)', fontSize:13, marginTop:4 }}>Realizado em {formatDate(order.createdAt)}</p>
          <p style={{ color:'#fff', fontSize:14, marginTop:8 }}>
            Olá, <span style={{ fontWeight:600 }}>{order.customerName}</span>!
          </p>
        </div>

        {/* Itens do pedido */}
        <div style={card}>
          <p style={sectionLabel}>Itens do pedido</p>
          <ul style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {order.items.map((item, i) => (
              <li key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:12 }}>
                <span style={{ color:'rgba(255,255,255,0.8)', fontSize:14 }}>
                  {item.quantity}x {item.productName}
                  {item.variantName && <span style={{ color:'rgba(255,255,255,0.4)' }}> — {item.variantName}</span>}
                </span>
                <span style={{ color:'#fff', fontWeight:600, fontSize:14, flexShrink:0 }}>
                  {formatCurrency(item.unitPrice * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <div style={{ borderTop:'1px solid var(--border)', marginTop:14, paddingTop:14, display:'flex', flexDirection:'column', gap:6 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'rgba(255,255,255,0.45)' }}>
              <span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'rgba(255,255,255,0.45)' }}>
              <span>Frete</span><span>{formatCurrency(order.shippingCost)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:16, fontWeight:700, color:'#fff' }}>
              <span>Total</span><span>{formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Endereço */}
        <div style={card}>
          <p style={sectionLabel}>Endereço de entrega</p>
          <p style={{ color:'#fff', fontSize:14 }}>{order.address}</p>
          <p style={{ color:'rgba(255,255,255,0.45)', fontSize:13, marginTop:2 }}>{order.city}</p>
        </div>

        {/* Box: Pagamento */}
        {paymentCfg && (
          <div style={{ ...card, background: paymentCfg.bg, border: `1px solid ${paymentCfg.accent}33`, display:'flex', alignItems:'center', gap:14 }}>
            <span style={{ fontSize:32, lineHeight:1 }}>{paymentCfg.icon}</span>
            <p style={{ fontFamily:'var(--font-syne),Syne,sans-serif', fontSize:18, fontWeight:800, color: paymentCfg.accent }}>
              {paymentCfg.label}
            </p>
          </div>
        )}

        {/* Box: Status da entrega */}
        {order.status !== 'PENDING' && order.status !== 'CANCELLED' && order.status !== 'REFUNDED' && (
          <div style={{ ...card, background: deliveryCfg.bg, border: `1px solid ${deliveryCfg.accent}33` }}>
            <p style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'0.06em', color: deliveryCfg.accent, fontWeight:600, marginBottom:12 }}>
              Status da entrega
            </p>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <span style={{ fontSize:36, lineHeight:1 }}>{deliveryCfg.icon}</span>
              <p style={{ fontFamily:'var(--font-syne),Syne,sans-serif', fontSize:22, fontWeight:800, color: deliveryCfg.accent, letterSpacing:'-0.3px' }}>
                {deliveryCfg.label}
              </p>
            </div>

          </div>
        )}

      </div>

      {/* iframe de rastreio inline — só quando A Caminho + link preenchido */}
      {showTracking && (
        <div style={{ maxWidth:760, margin:'32px auto 0', borderRadius:20, overflow:'hidden', border:'1px solid rgba(126,255,245,0.2)', background:'#111' }}>
          <div style={{ padding:'12px 20px', borderBottom:'1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <p style={{ fontFamily:'var(--font-syne),Syne,sans-serif', fontWeight:700, fontSize:13, color:'#7efff5' }}>
              🚚 Rastreio da entrega
            </p>
            <a href={order.trackingLink!} target="_blank" rel="noopener noreferrer"
              style={{ fontSize:11, color:'rgba(255,255,255,0.3)', textDecoration:'underline' }}>
              Abrir em nova aba
            </a>
          </div>
          <iframe
            src={order.trackingLink!}
            style={{ width:'100%', height:'min(70vh, 620px)', border:'none', display:'block' }}
            title="Rastreio de entrega"
            allow="geolocation"
          />
        </div>
      )}

      <div style={{ maxWidth:520, margin:'0 auto' }}>

        <p style={{ textAlign:'center', fontSize:12, color:'rgba(255,255,255,0.25)' }}>
          Esta página atualiza automaticamente a cada 30 segundos.
        </p>

        <a href="/" style={{ display:'block', textAlign:'center', fontSize:13, color:'var(--accent)', textDecoration:'underline', paddingBottom:32 }}>
          Voltar ao catálogo
        </a>

      </div>
    </main>
  );
}
