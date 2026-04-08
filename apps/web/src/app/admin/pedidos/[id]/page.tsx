'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { api, fmtBRL } from '@/lib/api';
import type { Order, OrderStatus } from '@/types';
import { AppleSelect } from '@/components/AppleSelect';

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('admin-token') ?? '';
}

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'PENDING',   label: '⏳ Pendente' },
  { value: 'PAID',      label: '✅ Pago' },
  { value: 'SHIPPED',   label: '🚚 Enviado' },
  { value: 'DELIVERED', label: '📦 Entregue' },
  { value: 'CANCELLED', label: '❌ Cancelado' },
  { value: 'REFUNDED',  label: '↩️ Reembolsado' },
];

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState<OrderStatus | ''>('');
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace('/admin/login'); return; }
    api.orders.getById(id, token)
      .then(o => { setOrder(o); setNewStatus(o.status); })
      .catch(() => setError('Pedido não encontrado.'))
      .finally(() => setLoading(false));
  }, [id, router]);

  const updateStatus = async () => {
    if (!newStatus || !order || newStatus === order.status) return;
    const token = getToken();
    setUpdating(true);
    setError('');
    try {
      const updated = await api.orders.updateStatus(order.id, newStatus, token);
      setOrder(updated);
      setSuccess('Status atualizado com sucesso!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar status.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: 'var(--muted)' }}>
      Carregando...
    </div>
  );

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
      <div style={{ background: 'rgba(10,10,10,0.95)', borderBottom: '1px solid var(--border)', padding: '12px var(--pad)', position: 'sticky', top: 0, zIndex: 40, backdropFilter: 'blur(20px)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.push('/admin')}
            className="back-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
            Pedidos
          </button>
          <div style={{ fontFamily: 'var(--font-syne),Syne,sans-serif', fontSize: 16, fontWeight: 700, color: '#fff' }}>
            {order?.orderNumber ?? id}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: 'clamp(20px,3vw,32px) var(--pad)' }}>
        {error && <div className="error-msg visible" style={{ marginBottom: 16 }}>{error}</div>}
        {success && <div style={{ background: 'rgba(200,255,0,0.1)', border: '1px solid rgba(200,255,0,0.3)', borderRadius: 10, padding: '10px 14px', color: 'var(--accent)', fontSize: 13, marginBottom: 16 }}>{success}</div>}

        {order && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Customer info */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-syne),Syne,sans-serif', fontWeight: 800, marginBottom: 16, color: '#fff' }}>Cliente</h3>
              <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Nome</span><span>{order.customer.name}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Telefone</span><span>{order.customer.phone}</span></div>
                {order.customer.email && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Email</span><span>{order.customer.email}</span></div>}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Endereço</span><span style={{ textAlign: 'right', maxWidth: 300 }}>{order.customer.address}, {order.customer.city}</span></div>
              </div>
            </div>

            {/* Items */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-syne),Syne,sans-serif', fontWeight: 800, marginBottom: 16, color: '#fff' }}>Itens</h3>
              <ul className="order-list">
                {order.items.map((item, i) => (
                  <li key={i}>
                    <div className="order-item-info">
                      <div className="order-item-name">{item.productName}</div>
                      <div className="order-item-flavor">{item.variantName} × {item.quantity}</div>
                    </div>
                    <div className="order-item-price">{fmtBRL(item.subtotal)}</div>
                  </li>
                ))}
              </ul>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}><span>Subtotal</span><span>{fmtBRL(order.subtotal)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}><span>Frete</span><span>{fmtBRL(order.shippingCost)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-syne),Syne,sans-serif', fontWeight: 800, fontSize: 18, color: 'var(--accent)' }}><span>Total</span><span>{fmtBRL(order.total)}</span></div>
              </div>
            </div>

            {/* Status */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-syne),Syne,sans-serif', fontWeight: 800, marginBottom: 16, color: '#fff' }}>Status do Pedido</h3>
              <div className="address-form">
                <div className="form-group">
                  <label>Atualizar status</label>
                  <AppleSelect
                    value={newStatus}
                    onChange={v => setNewStatus(v as OrderStatus)}
                    options={STATUS_OPTIONS}
                    triggerStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 28px 12px 14px', color: '#fff', fontSize: 14, fontFamily: 'var(--font-inter),Inter,sans-serif', width: '100%', minHeight: 44, cursor: 'pointer' }}
                  />
                </div>
              </div>
              <button
                className="btn-primary"
                onClick={updateStatus}
                disabled={updating || newStatus === order.status}
                style={{ marginTop: 12 }}
              >
                {updating ? <><span className="spinner"></span> Atualizando...</> : 'Salvar status'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
