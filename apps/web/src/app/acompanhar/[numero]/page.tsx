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

// ─── Helpers de status ────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<OrderStatus, { label: string; accent: string; bg: string; icon: string; description: string }> = {
  PENDING:   { label: 'Aguardando Pagamento', accent: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: '⏳', description: 'Seu pagamento ainda está sendo processado.' },
  PAID:      { label: 'Pagamento Confirmado',  accent: '#c8ff00', bg: 'rgba(200,255,0,0.08)', icon: '✅', description: 'Pagamento aprovado! Estamos preparando seu pedido.' },
  SHIPPED:   { label: 'Em Entrega',            accent: '#7efff5', bg: 'rgba(126,255,245,0.08)', icon: '🚚', description: 'Seu pedido está a caminho!' },
  DELIVERED: { label: 'Entregue',              accent: '#c8ff00', bg: 'rgba(200,255,0,0.08)', icon: '📦', description: 'Pedido entregue com sucesso. Aproveite!' },
  CANCELLED: { label: 'Cancelado',             accent: '#ff5050', bg: 'rgba(255,80,80,0.08)', icon: '❌', description: 'Este pedido foi cancelado.' },
  REFUNDED:  { label: 'Reembolsado',           accent: 'rgba(255,255,255,0.45)', bg: 'rgba(255,255,255,0.04)', icon: '↩️', description: 'O valor foi estornado para você.' },
};

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

  // Polling a cada 30s para atualizar status em tempo real
  useEffect(() => {
    const interval = setInterval(fetchOrder, 30_000);
    return () => clearInterval(interval);
  }, [fetchOrder]);

  // ── Loading ──
  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', position:'relative', zIndex:2 }}>
        <p style={{ color:'rgba(255,255,255,0.45)', fontSize:14 }}>Buscando seu pedido...</p>
      </div>
    );
  }

  // ── Erro ──
  if (error || !order) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', gap:16, padding:'0 24px', position:'relative', zIndex:2, textAlign:'center' }}>
        <p style={{ fontSize:40 }}>😕</p>
        <p style={{ color:'#fff', fontWeight:600 }}>{error}</p>
        <a href="/" style={{ color:'#c8ff00', fontSize:14, textDecoration:'underline' }}>Voltar ao catálogo</a>
      </div>
    );
  }

  const sc = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PENDING;

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 20,
    padding: '20px 24px',
  };

  const label: React.CSSProperties = {
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
          <p style={label}>Número do pedido</p>
          <p style={{ fontFamily:'var(--font-syne),Syne,sans-serif', fontSize:22, fontWeight:800, color:'var(--accent)', letterSpacing:'-0.5px' }}>{order.orderNumber}</p>
          <p style={{ color:'rgba(255,255,255,0.45)', fontSize:13, marginTop:4 }}>Realizado em {formatDate(order.createdAt)}</p>
          <p style={{ color:'#fff', fontSize:14, marginTop:8 }}>
            Olá, <span style={{ fontWeight:600 }}>{order.customerName}</span>!
          </p>
        </div>

        {/* Itens do pedido */}
        <div style={card}>
          <p style={label}>Itens do pedido</p>
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
          <p style={label}>Endereço de entrega</p>
          <p style={{ color:'#fff', fontSize:14 }}>{order.address}</p>
          <p style={{ color:'rgba(255,255,255,0.45)', fontSize:13, marginTop:2 }}>{order.city}</p>
        </div>

        {/* Status — destaque */}
        <div style={{ ...card, background: sc.bg, border: `1px solid ${sc.accent}33` }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <span style={{ fontSize:36, lineHeight:1 }}>{sc.icon}</span>
            <div>
              <p style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'0.06em', color: sc.accent, fontWeight:600 }}>Status do pedido</p>
              <p style={{ fontSize:20, fontWeight:800, color: sc.accent, fontFamily:'var(--font-syne),Syne,sans-serif', letterSpacing:'-0.3px', marginTop:2 }}>{sc.label}</p>
            </div>
          </div>
          <p style={{ fontSize:13, color:`${sc.accent}cc`, marginTop:12 }}>{sc.description}</p>

          {(order.motoboy || order.shippingStatus || order.trackingLink) && (
            <div style={{ borderTop:`1px solid ${sc.accent}22`, marginTop:14, paddingTop:14, display:'flex', flexDirection:'column', gap:8 }}>
              {order.shippingStatus && (
                <p style={{ fontSize:13, color: sc.accent }}>
                  <span style={{ fontWeight:600 }}>Entrega:</span> {order.shippingStatus}
                </p>
              )}
              {order.motoboy && (
                <p style={{ fontSize:13, color: sc.accent }}>
                  <span style={{ fontWeight:600 }}>Entregador:</span> {order.motoboy}
                </p>
              )}
              {order.trackingLink && (
                <a href={order.trackingLink} target="_blank" rel="noopener noreferrer"
                  style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:13, fontWeight:700, color: sc.accent, textDecoration:'underline' }}>
                  🔗 Rastrear entrega em tempo real
                </a>
              )}
            </div>
          )}
        </div>

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
