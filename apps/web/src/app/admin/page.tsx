'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Order, OrderStatus } from '@/types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function getToken(): string {
  if (typeof document === 'undefined') return '';
  return document.cookie.match(/admin-token=([^;]+)/)?.[1] ?? '';
}

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'x-auth-token': token, ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  createdAt: number;
}

type Page = 'dashboard' | 'pedidos' | 'clientes' | 'config';

function fmtR(v: number) {
  return 'R$ ' + v.toFixed(2).replace('.', ',');
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function fmtDateOnly(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR');
}

const FRETE_OPTIONS = ['🔴 Pendente', '🟠 Solicitado', '🟡 A Caminho', '🟢 Entregue', '⛔ Cancelado'] as const;
type FreteOption = (typeof FRETE_OPTIONS)[number];

function statusToFrete(s: OrderStatus): FreteOption {
  switch (s) {
    case 'PAID': return '🟠 Solicitado';
    case 'SHIPPED': return '🟡 A Caminho';
    case 'DELIVERED': return '🟢 Entregue';
    case 'CANCELLED': return '⛔ Cancelado';
    default: return '🔴 Pendente';
  }
}
function freteToStatus(f: FreteOption): OrderStatus {
  switch (f) {
    case '🟠 Solicitado': return 'PAID';
    case '🟡 A Caminho': return 'SHIPPED';
    case '🟢 Entregue': return 'DELIVERED';
    case '⛔ Cancelado': return 'CANCELLED';
    default: return 'PENDING';
  }
}
function isPaid(s: OrderStatus) {
  return s === 'PAID' || s === 'SHIPPED' || s === 'DELIVERED';
}

// ── Doughnut chart via canvas ──
function drawDonut(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  values: number[], colors: string[]
) {
  ctx.clearRect(0, 0, w, h);
  const total = values.reduce((s, v) => s + v, 0);
  if (!total) return;
  const cx = w / 2, cy = h / 2;
  const r = Math.min(cx, cy) * 0.88;
  const inner = r * 0.6;
  const gap = 0.03;
  let start = -Math.PI / 2;
  values.forEach((v, i) => {
    const sweep = (v / total) * Math.PI * 2 - gap;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + sweep);
    ctx.arc(cx, cy, inner, start + sweep, start, true);
    ctx.closePath();
    ctx.fillStyle = colors[i];
    ctx.fill();
    start += (v / total) * Math.PI * 2;
  });
}

const MOTOBOY_OPTIONS = ['⏳ Pendente', '🛵 Lala Move', '🏍️ Motoboy Próprio'] as const;
type MotoboyOption = (typeof MOTOBOY_OPTIONS)[number];
const MOTOBOY_COLOR: Record<MotoboyOption, string> = {
  '⏳ Pendente': '#ff4d4d',
  '🛵 Lala Move': '#ff8c00',
  '🏍️ Motoboy Próprio': '#7efff5',
};

function normalizeOrder(o: any): Order {
  return {
    ...o,
    items: o.items ?? [],
    customer: o.customer ?? {
      name: o.customerName ?? '',
      phone: o.customerPhone ?? '',
      email: o.customerEmail ?? '',
      address: o.address ?? '',
      city: o.city ?? '',
    },
    createdAt: typeof o.createdAt === 'number' ? new Date(o.createdAt).toISOString() : o.createdAt ?? new Date().toISOString(),
    updatedAt: typeof o.updatedAt === 'number' ? new Date(o.updatedAt).toISOString() : o.updatedAt ?? new Date().toISOString(),
  };
}

export default function AdminDashboard() {
  const router = useRouter();
  const [page, setPage] = useState<Page>('dashboard');
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingClients, setLoadingClients] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const [lastUpdate, setLastUpdate] = useState('—');
  const [usuario, setUsuario] = useState('');

  // Filters — dashboard
  const [filtro, setFiltro] = useState<'todos' | 'pendente' | 'pago' | 'concluido'>('todos');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Filters — pedidos page
  const [pSearch, setPSearch] = useState('');
  const [pFiltro, setPFiltro] = useState<'todos' | 'pendente' | 'pago' | 'concluido'>('todos');

  // Filters — clientes
  const [cSearch, setCSearch] = useState('');

  // Modal
  const [modalOrder, setModalOrder] = useState<Order | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadOrders = useCallback(async (silent = false) => {
    const token = getToken();
    if (!token) { router.replace('/admin/login'); return; }
    if (!silent) setRefreshing(true);
    try {
      const raw = await apiFetch<any[]>('/orders', token);
      const data = raw.map(normalizeOrder);
      if (silent) {
        setOrders(prev => {
          if (data.length > prev.length) {
            const diff = data.length - prev.length;
            void diff;
          }
          return data;
        });
      } else {
        setOrders(data);
        setLoading(false);
      }
      setLastUpdate(new Date().toLocaleTimeString('pt-BR'));
    } catch {
      if (!silent) setLoading(false);
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, [router]);

  const loadCustomers = useCallback(async () => {
    const token = getToken();
    setLoadingClients(true);
    try {
      const data = await apiFetch<Customer[]>('/customers', token);
      setCustomers(data);
    } catch {
      // ignore
    } finally {
      setLoadingClients(false);
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace('/admin/login'); return; }
    // Try to get username from token payload
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setUsuario(payload.u || payload.sub || 'admin');
    } catch { setUsuario('admin'); }
    loadOrders();
  }, [router, loadOrders]);

  // Auto-refresh
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          loadOrders(true);
          return 15;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loadOrders]);

  // Load customers when navigating to clientes
  useEffect(() => {
    if (page === 'clientes' && customers.length === 0) {
      loadCustomers();
    }
  }, [page, customers.length, loadCustomers]);

  // Draw chart
  useEffect(() => {
    if (!canvasRef.current || loading) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    const concluidos = orders.filter(o => o.status === 'DELIVERED').length;
    const pagos = orders.filter(o => o.status === 'PAID' || o.status === 'SHIPPED').length;
    const pendentes = orders.filter(o => o.status === 'PENDING').length;
    const outros = orders.filter(o => o.status === 'CANCELLED' || o.status === 'REFUNDED').length;
    drawDonut(ctx, w, h,
      [concluidos, pagos, pendentes, outros].filter((_, i) => [concluidos, pagos, pendentes, outros][i] > 0),
      ['#c8ff00', '#7efff5', '#ffb545', '#6a6a6a'].filter((_, i) => [concluidos, pagos, pendentes, outros][i] > 0)
    );
  }, [orders, loading, page]);

  const updateMotoboy = useCallback(async (id: string, motoboy: string) => {
    const token = getToken();
    try {
      const raw = await apiFetch<any>(`/orders/${id}/motoboy`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motoboy }),
      });
      const updated = normalizeOrder(raw);
      setOrders(prev => prev.map(o => o.id === id ? updated : o));
      if (modalOrder?.id === id) setModalOrder(updated);
    } catch (e) {
      alert('Erro ao atualizar motoboy: ' + (e instanceof Error ? e.message : 'desconhecido'));
    }
  }, [modalOrder]);

  const updateOrderStatus = useCallback(async (id: string, status: OrderStatus) => {
    const token = getToken();
    try {
      const raw = await apiFetch<any>(`/orders/${id}/status`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const updated = normalizeOrder(raw);
      setOrders(prev => prev.map(o => o.id === id ? updated : o));
      if (modalOrder?.id === id) setModalOrder(updated);
    } catch (e) {
      alert('Erro ao atualizar: ' + (e instanceof Error ? e.message : 'desconhecido'));
    }
  }, [modalOrder]);

  const logout = () => {
    document.cookie = 'admin-token=; max-age=0; path=/';
    router.push('/admin/login');
  };

  // ── Filtered lists ──
  function filterOrders(list: Order[], f: typeof filtro, dFrom: string, dTo: string) {
    let r = [...list];
    if (f === 'pendente') r = r.filter(o => o.status === 'PENDING');
    else if (f === 'pago') r = r.filter(o => o.status === 'PAID' || o.status === 'SHIPPED');
    else if (f === 'concluido') r = r.filter(o => o.status === 'DELIVERED');
    if (dFrom) r = r.filter(o => new Date(o.createdAt) >= new Date(dFrom));
    if (dTo) r = r.filter(o => new Date(o.createdAt) <= new Date(dTo + 'T23:59:59'));
    return r.reverse();
  }

  function filterPedidos(list: Order[], f: typeof pFiltro, search: string) {
    let r = [...list];
    if (f === 'pendente') r = r.filter(o => o.status === 'PENDING');
    else if (f === 'pago') r = r.filter(o => o.status === 'PAID' || o.status === 'SHIPPED');
    else if (f === 'concluido') r = r.filter(o => o.status === 'DELIVERED');
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(o =>
        o.orderNumber?.toLowerCase().includes(q) ||
        o.customer?.name?.toLowerCase().includes(q) ||
        o.customer?.phone?.includes(q) ||
        o.items?.some(i => i.productName?.toLowerCase().includes(q))
      );
    }
    return r.reverse();
  }

  // KPIs
  const totalVendido = orders.filter(o => isPaid(o.status)).reduce((s, o) => s + o.total, 0);
  const totalPedidos = orders.length;
  const aguardando = orders.filter(o => o.status === 'PENDING').length;
  const pendentes = orders.filter(o => o.status === 'PAID' || o.status === 'SHIPPED').length;
  const concluidos = orders.filter(o => o.status === 'DELIVERED').length;
  const pctConcluidos = totalPedidos ? Math.round((concluidos / totalPedidos) * 100) : 0;

  const chartConcluidos = concluidos;
  const chartPagos = pendentes;
  const chartPendentes = aguardando;
  const chartOutros = orders.filter(o => o.status === 'CANCELLED' || o.status === 'REFUNDED').length;

  // ── Render ──
  return (
    <>
      <style>{adminCSS}</style>

      {/* Sidebar */}
      <aside style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 232,
        background: 'rgba(8,8,8,0.95)', backdropFilter: 'blur(30px)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column',
        zIndex: 100, padding: '28px 16px',
      }}>
        <div style={{ display:'flex',alignItems:'center',gap:12,padding:'0 10px',marginBottom:40 }}>
          <div style={{ width:40,height:40,background:'linear-gradient(135deg,rgba(200,255,0,0.18),rgba(126,255,245,0.12))',border:'1px solid rgba(200,255,0,0.25)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:17 }}>⚡</div>
          <div>
            <div style={{ fontFamily:'Satoshi,sans-serif',fontSize:15,fontWeight:800,color:'#fff' }}>Cheaps Pods</div>
            <div style={{ fontFamily:'JetBrains Mono,monospace',fontSize:9,fontWeight:600,letterSpacing:'1.5px',textTransform:'uppercase',color:'#8a8a8a',marginTop:2 }}>Admin Panel</div>
          </div>
        </div>

        <nav style={{ flex:1,display:'flex',flexDirection:'column',gap:4 }}>
          {([
            { id:'dashboard', icon:'📊', label:'Dashboard' },
            { id:'pedidos',   icon:'📦', label:'Pedidos' },
            { id:'clientes',  icon:'👥', label:'Clientes' },
            { id:'config',    icon:'⚙️', label:'Configurações' },
          ] as { id: Page; icon: string; label: string }[]).map(item => (
            <div key={item.id}
              onClick={() => setPage(item.id)}
              style={{
                display:'flex',alignItems:'center',gap:11,
                padding:'11px 14px',borderRadius:12,
                fontSize:13,fontWeight:600,cursor:'pointer',
                transition:'all 0.2s',
                border: page === item.id ? '1px solid rgba(200,255,0,0.12)' : '1px solid transparent',
                background: page === item.id ? 'rgba(200,255,0,0.07)' : 'transparent',
                color: page === item.id ? '#c8ff00' : '#b0b0b0',
              }}>
              <span style={{ fontSize:16,width:22,textAlign:'center' }}>{item.icon}</span>
              {item.label}
            </div>
          ))}
        </nav>

        <div style={{ borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:18,marginTop:16 }}>
          <div style={{ fontSize:11,color:'#6a6a6a',padding:'0 10px',marginBottom:8 }}>Usuário: {usuario}</div>
          <button onClick={logout} style={{ width:'100%',padding:7,background:'rgba(255,77,77,0.1)',border:'1px solid rgba(255,77,77,0.25)',borderRadius:8,color:'#ff4d4d',fontFamily:'Satoshi,sans-serif',fontSize:12,fontWeight:600,cursor:'pointer',transition:'all 0.2s' }}
            onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,77,77,0.2)')}
            onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,77,77,0.1)')}>
            Sair
          </button>
          <div style={{ fontFamily:'JetBrains Mono,monospace',fontSize:10,color:'#6a6a6a',padding:'12px 10px 0',lineHeight:1.7 }}>
            Última atualização<span style={{ color:'#7efff5',display:'block',fontWeight:600 }}>{lastUpdate}</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div style={{ marginLeft: 232, minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>

        {/* ── DASHBOARD PAGE ── */}
        {page === 'dashboard' && (
          <>
            <header style={topbar}>
              <div style={{ fontSize:15,fontWeight:700,color:'#fff',letterSpacing:-0.3 }}>
                Dashboard <span style={{ color:'#6a6a6a',fontWeight:400 }}>/ Visão Geral</span>
              </div>
              <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                <span style={{ fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'#6a6a6a' }}>
                  <span style={{ width:7,height:7,borderRadius:'50%',background:'#c8ff00',display:'inline-block',marginRight:6 }}></span>
                  refresh em {countdown}s
                </span>
                <button className="admin-btn-refresh" onClick={() => loadOrders()} disabled={refreshing}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}>
                    <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                    <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                  </svg>
                  Atualizar
                </button>
              </div>
            </header>

            <div style={{ padding:'28px 32px',flex:1 }}>
              {/* KPI Cards */}
              <div style={{ display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr',gap:14,marginBottom:24 }}>
                <StatCard label="Total Vendido" value={fmtR(totalVendido)} sub="pagos + enviados" color="#c8ff00" icon="💰" featured />
                <StatCard label="Total Pedidos" value={String(totalPedidos)} sub="todos os status" color="#7efff5" icon="📦" />
                <StatCard label="Aguardando" value={String(aguardando)} sub="pagamento pendente" color="#7efff5" icon="🔗" />
                <StatCard label="Pendentes" value={String(pendentes)} sub="não entregues" color="#ffb545" icon="⏳" />
                <StatCard label="Concluídos" value={String(concluidos)} sub={`${pctConcluidos}% do total`} color="#c8ff00" icon="✅" />
              </div>

              {/* Chart + Filters row */}
              <div style={{ display:'grid',gridTemplateColumns:'290px 1fr',gap:16,marginBottom:24,alignItems:'start' }}>
                {/* Chart */}
                <div style={glassCard}>
                  <div style={cardTitle}><span style={cardTitleBar}></span>Distribuição de Status</div>
                  <div style={{ position:'relative',width:180,height:180,margin:'0 auto 22px' }}>
                    <canvas ref={canvasRef} width={180} height={180} style={{ display:'block' }} />
                    <div style={{ position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',pointerEvents:'none' }}>
                      <div style={{ fontFamily:'JetBrains Mono,monospace',fontSize:24,fontWeight:700,color:'#fff' }}>{totalPedidos}</div>
                      <div style={{ fontSize:10,color:'#8a8a8a',marginTop:3,fontWeight:500 }}>pedidos</div>
                    </div>
                  </div>
                  <div style={{ display:'flex',flexDirection:'column',gap:11 }}>
                    {[
                      { label:'Concluídos', val:chartConcluidos, color:'#c8ff00' },
                      { label:'Pagos/Enviados', val:chartPagos, color:'#7efff5' },
                      { label:'Pendentes', val:chartPendentes, color:'#ffb545' },
                      { label:'Outros', val:chartOutros, color:'#6a6a6a' },
                    ].map(item => (
                      <div key={item.label} style={{ display:'flex',alignItems:'center',gap:10 }}>
                        <div style={{ width:10,height:10,borderRadius:4,background:item.color,flexShrink:0 }}></div>
                        <div style={{ fontSize:12,color:'#b0b0b0',flex:1,fontWeight:500 }}>{item.label}</div>
                        <div style={{ fontFamily:'JetBrains Mono,monospace',fontSize:12,fontWeight:700,color:'#fff' }}>{item.val}</div>
                        <div style={{ fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'#6a6a6a',minWidth:34,textAlign:'right' }}>
                          {totalPedidos ? Math.round(item.val/totalPedidos*100) : 0}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Filters */}
                <div style={glassCard}>
                  <div style={cardTitle}><span style={cardTitleBar}></span>Filtros</div>
                  <div style={{ marginBottom:22 }}>
                    <div style={{ fontSize:10,fontWeight:700,letterSpacing:'1.2px',textTransform:'uppercase',color:'#8a8a8a',marginBottom:12 }}>Status</div>
                    <div style={{ display:'flex',flexWrap:'wrap',gap:8 }}>
                      {([
                        { key:'todos', label:'Todos', cls:'green' },
                        { key:'pendente', label:'⏳ Pendentes', cls:'amber' },
                        { key:'pago', label:'💳 Pagos', cls:'blue' },
                        { key:'concluido', label:'✅ Concluídos', cls:'green' },
                      ] as const).map(f => (
                        <button key={f.key} onClick={() => setFiltro(f.key)}
                          style={{ padding:'7px 16px',borderRadius:10,border:'1px solid',fontFamily:'Satoshi,sans-serif',fontSize:12,fontWeight:700,cursor:'pointer',transition:'all 0.2s',whiteSpace:'nowrap',
                            ...(filtro === f.key
                              ? f.cls==='amber' ? { background:'rgba(255,181,69,0.1)',borderColor:'rgba(255,181,69,0.3)',color:'#ffb545' }
                              : f.cls==='blue' ? { background:'rgba(126,255,245,0.08)',borderColor:'rgba(126,255,245,0.25)',color:'#7efff5' }
                              : { background:'rgba(200,255,0,0.1)',borderColor:'rgba(200,255,0,0.3)',color:'#c8ff00' }
                              : { background:'rgba(255,255,255,0.04)',borderColor:'rgba(255,255,255,0.12)',color:'#b0b0b0' })
                          }}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:10,fontWeight:700,letterSpacing:'1.2px',textTransform:'uppercase',color:'#8a8a8a',marginBottom:12 }}>Período</div>
                    <div style={{ display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' }}>
                      <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={dateInput} />
                      <span style={{ fontSize:11,color:'#6a6a6a' }}>→</span>
                      <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={dateInput} />
                      <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ padding:'9px 16px',borderRadius:10,border:'1px solid rgba(255,255,255,0.12)',background:'transparent',fontFamily:'Satoshi,sans-serif',fontSize:12,fontWeight:700,color:'#8a8a8a',cursor:'pointer',transition:'all 0.2s',whiteSpace:'nowrap' }}
                        onMouseEnter={e=>(e.currentTarget.style.color='#ff4d4d')}
                        onMouseLeave={e=>(e.currentTarget.style.color='#8a8a8a')}>
                        Limpar
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Orders table */}
              <OrdersTable
                orders={filterOrders(orders, filtro, dateFrom, dateTo)}
                loading={loading}
                onRowClick={setModalOrder}
                onStatusChange={updateOrderStatus}
                onMotoboyChange={updateMotoboy}
              />
            </div>
          </>
        )}

        {/* ── PEDIDOS PAGE ── */}
        {page === 'pedidos' && (
          <>
            <header style={topbar}>
              <div style={{ fontSize:15,fontWeight:700,color:'#fff',letterSpacing:-0.3 }}>
                Pedidos <span style={{ color:'#6a6a6a',fontWeight:400 }}>/ Lista Completa</span>
              </div>
              <div style={{ flex:1,display:'flex',justifyContent:'center',maxWidth:400,margin:'0 auto' }}>
                <div style={{ display:'flex',alignItems:'center',gap:10,flex:1,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:12,padding:'9px 16px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6a6a6a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input value={pSearch} onChange={e => setPSearch(e.target.value)} placeholder="Buscar por nome, produto, nº pedido..." style={{ background:'transparent',border:'none',outline:'none',fontFamily:'Satoshi,sans-serif',fontSize:13,color:'#fff',width:'100%' }} />
                </div>
              </div>
              <button className="admin-btn-refresh" onClick={() => loadOrders()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                  <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                </svg>
                Atualizar
              </button>
            </header>

            <div style={{ padding:'28px 32px',flex:1 }}>
              <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:20,flexWrap:'wrap' }}>
                {([
                  { key:'todos', label:'Todos', cls:'green' },
                  { key:'pendente', label:'⏳ Pag. Pendentes', cls:'amber' },
                  { key:'pago', label:'💳 Pagos', cls:'blue' },
                  { key:'concluido', label:'✅ Concluídos', cls:'green' },
                ] as const).map(f => (
                  <button key={f.key} onClick={() => setPFiltro(f.key)}
                    style={{ padding:'7px 16px',borderRadius:10,border:'1px solid',fontFamily:'Satoshi,sans-serif',fontSize:12,fontWeight:700,cursor:'pointer',transition:'all 0.2s',whiteSpace:'nowrap',
                      ...(pFiltro === f.key
                        ? f.cls==='amber' ? { background:'rgba(255,181,69,0.1)',borderColor:'rgba(255,181,69,0.3)',color:'#ffb545' }
                        : f.cls==='blue' ? { background:'rgba(126,255,245,0.08)',borderColor:'rgba(126,255,245,0.25)',color:'#7efff5' }
                        : { background:'rgba(200,255,0,0.1)',borderColor:'rgba(200,255,0,0.3)',color:'#c8ff00' }
                        : { background:'rgba(255,255,255,0.04)',borderColor:'rgba(255,255,255,0.12)',color:'#b0b0b0' })
                    }}>
                    {f.label}
                  </button>
                ))}
              </div>

              <OrdersTable
                orders={filterPedidos(orders, pFiltro, pSearch)}
                loading={loading}
                onRowClick={setModalOrder}
                onStatusChange={updateOrderStatus}
                onMotoboyChange={updateMotoboy}
              />
            </div>
          </>
        )}

        {/* ── CLIENTES PAGE ── */}
        {page === 'clientes' && (
          <>
            <header style={topbar}>
              <div style={{ fontSize:15,fontWeight:700,color:'#fff',letterSpacing:-0.3 }}>
                Clientes <span style={{ color:'#6a6a6a',fontWeight:400 }}>/ Base de Clientes</span>
              </div>
              <button className="admin-btn-refresh" onClick={loadCustomers}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                  <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                </svg>
                Atualizar
              </button>
            </header>

            <div style={{ padding:'28px 32px',flex:1 }}>
              <div style={tableCard}>
                <div style={tableHead}>
                  <span style={{ fontSize:13,fontWeight:800,color:'#fff' }}>👥 Clientes Cadastrados</span>
                  <span style={tableCount}>{customers.length} cliente{customers.length !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ padding:'12px 24px',borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
                  <input value={cSearch} onChange={e => setCSearch(e.target.value)} placeholder="Buscar por nome, telefone ou endereço..."
                    style={{ width:'100%',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:10,padding:'9px 14px',fontFamily:'Satoshi,sans-serif',fontSize:13,color:'#e0e0e0',outline:'none' }} />
                </div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%',borderCollapse:'collapse' }}>
                    <thead>
                      <tr>
                        {['#','Nome','WhatsApp','Endereço','Primeiro Pedido'].map(h => (
                          <th key={h} style={th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loadingClients ? (
                        <tr><td colSpan={5}><StateBox icon="⏳" text="Carregando clientes..." /></td></tr>
                      ) : (() => {
                        const q = cSearch.toLowerCase();
                        const list = q ? customers.filter(c =>
                          c.name?.toLowerCase().includes(q) ||
                          c.phone?.includes(q) ||
                          c.address?.toLowerCase().includes(q)
                        ) : customers;
                        return list.length === 0
                          ? <tr><td colSpan={5}><StateBox icon="🔍" text="Nenhum cliente encontrado." /></td></tr>
                          : list.map((c, i) => (
                            <tr key={c.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.07)',transition:'background 0.15s' }}
                              onMouseEnter={e=>(e.currentTarget.style.background='rgba(200,255,0,0.02)')}
                              onMouseLeave={e=>(e.currentTarget.style.background='')}>
                              <td style={tdMono}>{i + 1}</td>
                              <td style={{ ...td,fontWeight:700,color:'#fff' }}>{c.name}</td>
                              <td style={td}>
                                {c.phone ? <>
                                  <a href={`https://wa.me/55${c.phone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer"
                                    style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:30,height:30,borderRadius:10,background:'rgba(37,211,102,0.1)',border:'1px solid rgba(37,211,102,0.2)',textDecoration:'none',fontSize:14 }}>💬</a>
                                  <span style={{ fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'#8a8a8a',marginLeft:8 }}>{c.phone}</span>
                                </> : <span style={{ color:'#6a6a6a' }}>—</span>}
                              </td>
                              <td style={{ ...td,maxWidth:220,whiteSpace:'normal',wordBreak:'break-word',lineHeight:1.4 }}>{c.address ?? '—'}</td>
                              <td style={tdMono}>{c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR') : '—'}</td>
                            </tr>
                          ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── CONFIG PAGE ── */}
        {page === 'config' && (
          <>
            <header style={topbar}>
              <div style={{ fontSize:15,fontWeight:700,color:'#fff',letterSpacing:-0.3 }}>
                Configurações <span style={{ color:'#6a6a6a',fontWeight:400 }}>/ Conta</span>
              </div>
            </header>
            <div style={{ padding:'28px 32px',flex:1 }}>
              <div style={{ ...tableCard,maxWidth:480,margin:'0 auto' }}>
                <div style={tableHead}><span style={{ fontSize:13,fontWeight:800,color:'#fff' }}>👤 Informações da conta</span></div>
                <div style={{ padding:'20px 28px' }}>
                  {[
                    { label:'Usuário', value: usuario },
                    { label:'Sessão expira em', value: '24h', lime: true },
                  ].map(row => (
                    <div key={row.label} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
                      <span style={{ fontSize:12,color:'#8a8a8a' }}>{row.label}</span>
                      <span style={{ fontSize:13,fontWeight:600,color: row.lime ? '#c8ff00' : '#fff' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── ORDER DETAIL MODAL ── */}
      {modalOrder && (
        <OrderModal order={modalOrder} onClose={() => setModalOrder(null)} onStatusChange={updateOrderStatus} />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ── Shared styles ──
const topbar: React.CSSProperties = {
  position: 'sticky', top: 0, zIndex: 50,
  background: 'rgba(8,8,8,0.92)',
  backdropFilter: 'blur(28px) saturate(160%)',
  borderBottom: '1px solid rgba(255,255,255,0.07)',
  height: 62,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '0 32px', gap: 12,
};
const glassCard: React.CSSProperties = {
  background: 'linear-gradient(135deg,rgba(255,255,255,0.08) 0%,rgba(255,255,255,0.03) 50%,rgba(255,255,255,0.06) 100%)',
  backdropFilter: 'blur(32px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.13)',
  borderTop: '1px solid rgba(255,255,255,0.22)',
  borderRadius: 16, padding: 26,
  boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
  position: 'relative',
};
const cardTitle: React.CSSProperties = {
  fontSize: 13, fontWeight: 800, color: '#fff',
  letterSpacing: -0.2, marginBottom: 22,
  display: 'flex', alignItems: 'center', gap: 10,
};
const cardTitleBar: React.CSSProperties = {
  display: 'block', width: 3, height: 16,
  background: 'linear-gradient(180deg,#c8ff00,#7efff5)', borderRadius: 2,
};
const tableCard: React.CSSProperties = {
  background: 'linear-gradient(135deg,rgba(255,255,255,0.08) 0%,rgba(255,255,255,0.03) 50%,rgba(255,255,255,0.06) 100%)',
  border: '1px solid rgba(255,255,255,0.13)',
  borderTop: '1px solid rgba(255,255,255,0.22)',
  borderRadius: 16, overflow: 'hidden',
  boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
};
const tableHead: React.CSSProperties = {
  padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
};
const tableCount: React.CSSProperties = {
  fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#8a8a8a',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)',
  padding: '5px 12px', borderRadius: 8, fontWeight: 600,
};
const th: React.CSSProperties = {
  padding: '9px 14px', textAlign: 'left',
  fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase',
  color: '#b0b0b0', whiteSpace: 'nowrap',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  background: 'linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))',
};
const td: React.CSSProperties = { padding: '9px 14px', verticalAlign: 'top', fontSize: 12, whiteSpace: 'nowrap', color: '#e0e0e0' };
const tdMono: React.CSSProperties = { ...td, fontFamily: 'JetBrains Mono,monospace', color: '#8a8a8a', fontSize: 11 };
const dateInput: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10, padding: '9px 14px',
  fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: '#e0e0e0',
  outline: 'none', flex: 1, minWidth: 120,
  colorScheme: 'dark',
};

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + '…' : s; }

// ── StatCard ──
function StatCard({ label, value, sub, color, icon, featured }: {
  label: string; value: string; sub: string; color: string; icon: string; featured?: boolean;
}) {
  return (
    <div style={{
      background: featured
        ? `linear-gradient(135deg,rgba(200,255,0,0.10),rgba(200,255,0,0.04),rgba(255,255,255,0.05))`
        : 'linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03),rgba(255,255,255,0.06))',
      backdropFilter: 'blur(32px)',
      border: featured ? '1px solid rgba(200,255,0,0.18)' : '1px solid rgba(255,255,255,0.13)',
      borderTop: featured ? '1px solid rgba(200,255,0,0.35)' : '1px solid rgba(255,255,255,0.22)',
      borderRadius: 16, padding: 22,
      position: 'relative', overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      transition: 'transform 0.3s',
    }}>
      {/* top glow line */}
      <div style={{ position:'absolute',top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${color}55,transparent)`,pointerEvents:'none' }}></div>
      <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16 }}>
        <div style={{ fontSize:10,fontWeight:700,letterSpacing:'1.2px',textTransform:'uppercase',color:'#b0b0b0' }}>{label}</div>
        <div style={{ width:36,height:36,borderRadius:11,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,background:`${color}1a`,border:`1px solid ${color}33` }}>{icon}</div>
      </div>
      <div style={{ fontFamily:'JetBrains Mono,monospace',fontSize: featured ? 32 : 24,fontWeight:700,letterSpacing:-0.5,color }}>{value}</div>
      <div style={{ fontSize:11,color:'#6a6a6a',marginTop:5,fontWeight:500 }}>{sub}</div>
      <div style={{ position:'absolute',bottom:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${color},transparent)` }}></div>
    </div>
  );
}

// ── OrderRow ──
function OrderRow({ o, onRowClick, onStatusChange, onMotoboyChange }: {
  o: Order;
  onRowClick: (o: Order) => void;
  onStatusChange: (id: string, status: OrderStatus) => void;
  onMotoboyChange: (id: string, motoboy: string) => void;
}) {
  const produtos = (o.items ?? []).map(i => `${i.productName ?? ''} — ${i.variantName ?? ''} ×${i.quantity ?? 0}`).join(' | ');
  const phone = o.customer?.phone?.replace(/\D/g, '');
  const frete = statusToFrete(o.status);
  const freteColor =
    frete === '🟢 Entregue' ? '#4cff72' :
    frete === '🟡 A Caminho' ? '#ffe500' :
    frete === '🟠 Solicitado' ? '#ff8c00' :
    frete === '⛔ Cancelado' ? '#ff4d4d' : '#ff4d4d';

  return (
    <tr
      onClick={() => onRowClick(o)}
      style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', transition: 'background 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(200,255,0,0.06)')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      <td style={tdMono}>{o.orderNumber ?? '—'}</td>
      <td style={tdMono}>{o.createdAt ? fmtDate(o.createdAt) : '—'}</td>
      <td style={{ ...td, fontWeight: 700, color: '#fff' }}>{o.customer?.name ?? '—'}</td>
      <td style={td}>
        {phone
          ? <a href={`https://wa.me/55${phone}`} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ fontFamily:'JetBrains Mono,monospace',fontSize:12,fontWeight:600,color:'#25d366',textDecoration:'none',whiteSpace:'nowrap' }}
              onMouseEnter={e => (e.currentTarget.style.textDecoration='underline')}
              onMouseLeave={e => (e.currentTarget.style.textDecoration='none')}>
              {o.customer?.phone}
            </a>
          : <span style={{ color:'#6a6a6a' }}>—</span>}
      </td>
      <td style={{ ...td, maxWidth: 200, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.4 }}>
        {o.customer?.address ?? ''}{o.customer?.city ? `, ${o.customer.city}` : ''}
      </td>
      <td style={{ ...tdMono, fontWeight: 600, color: '#7efff5' }}>{fmtR(o.shippingCost ?? 0)}</td>
      <td style={{ ...td, maxWidth: 240, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.4, fontSize: 11, color: '#b0b0b0' }}>
        {produtos || '—'}
      </td>
      <td style={{ ...tdMono, fontWeight: 600, color: '#ffb545' }}>{fmtR(o.subtotal ?? 0)}</td>
      <td style={{ ...tdMono, fontWeight: 700, color: '#fff' }}>{fmtR(o.total ?? 0)}</td>
      <td style={td}>
        {isPaid(o.status)
          ? <span style={{ display:'inline-flex',gap:5,padding:'5px 12px',borderRadius:8,fontSize:11,fontWeight:700,background:'rgba(200,255,0,0.1)',color:'#c8ff00',border:'1px solid rgba(200,255,0,0.2)' }}>✅ Pago</span>
          : o.status === 'CANCELLED'
            ? <span style={{ display:'inline-flex',gap:5,padding:'5px 12px',borderRadius:8,fontSize:11,fontWeight:700,background:'rgba(255,77,77,0.1)',color:'#ff4d4d',border:'1px solid rgba(255,77,77,0.2)' }}>❌ Cancelado</span>
            : <span style={{ display:'inline-flex',gap:5,padding:'5px 12px',borderRadius:8,fontSize:11,fontWeight:700,background:'rgba(255,181,69,0.1)',color:'#ffb545',border:'1px solid rgba(255,181,69,0.2)' }}>⏳ Pendente</span>
        }
      </td>
      <td style={td} onClick={e => e.stopPropagation()}>
        {(() => {
          const motoboyVal = ((o as any).motoboy as MotoboyOption | undefined) ?? '⏳ Pendente';
          const motoboyColor = MOTOBOY_COLOR[motoboyVal] ?? '#ff4d4d';
          return (
            <select
              value={motoboyVal}
              onChange={e => onMotoboyChange(o.id, e.target.value)}
              style={{
                background: 'linear-gradient(135deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))',
                border: `1px solid ${motoboyColor}55`,
                borderRadius: 9, padding: '5px 24px 5px 10px',
                fontFamily: 'Satoshi,sans-serif', fontSize: 11, fontWeight: 600,
                color: motoboyColor, outline: 'none', cursor: 'pointer',
                appearance: 'none', WebkitAppearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238a8a8a' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
              }}
            >
              {MOTOBOY_OPTIONS.map(opt => <option key={opt} value={opt} style={{ background: '#1a1a1a', color: '#f0f0f0' }}>{opt}</option>)}
            </select>
          );
        })()}
      </td>
      <td style={td} onClick={e => e.stopPropagation()}>
        <select
          value={frete}
          onChange={e => onStatusChange(o.id, freteToStatus(e.target.value as FreteOption))}
          style={{
            background: 'linear-gradient(135deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))',
            border: `1px solid ${freteColor}55`,
            borderRadius: 9, padding: '5px 24px 5px 10px',
            fontFamily: 'Satoshi,sans-serif', fontSize: 11, fontWeight: 600,
            color: freteColor, outline: 'none', cursor: 'pointer',
            appearance: 'none', WebkitAppearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238a8a8a' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
          }}
        >
          {FRETE_OPTIONS.map(opt => <option key={opt} value={opt} style={{ background: '#1a1a1a', color: '#f0f0f0' }}>{opt}</option>)}
        </select>
      </td>
    </tr>
  );
}

// ── OrdersTable ──
function OrdersTable({ orders, loading, onRowClick, onStatusChange, onMotoboyChange }: {
  orders: Order[];
  loading: boolean;
  onRowClick: (o: Order) => void;
  onStatusChange: (id: string, status: OrderStatus) => void;
  onMotoboyChange: (id: string, motoboy: string) => void;
}) {
  return (
    <div style={tableCard}>
      <div style={tableHead}>
        <span style={{ fontSize:13,fontWeight:800,color:'#fff' }}>Pedidos</span>
        <span style={tableCount}>{orders.length} pedido{orders.length !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%',borderCollapse:'collapse' }}>
          <thead>
            <tr>
              {['Nº Pedido','Data/Hora','Cliente','WhatsApp','Endereço','Valor Frete','Produtos','Valor Produtos','Total','Pagamento','Motoboy','Frete'].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={12}><StateBox loading /></td></tr>
              : orders.length === 0
                ? <tr><td colSpan={12}><StateBox icon="🔍" text="Nenhum pedido encontrado." /></td></tr>
                : orders.map(o => <OrderRow key={o.id} o={o} onRowClick={onRowClick} onStatusChange={onStatusChange} onMotoboyChange={onMotoboyChange} />)
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── StateBox ──
function StateBox({ icon, text, loading }: { icon?: string; text?: string; loading?: boolean }) {
  return (
    <div style={{ padding:'60px 24px',textAlign:'center' }}>
      {loading ? (
        <>
          <div style={{ display:'inline-flex',gap:6,marginBottom:14 }}>
            {[0,0.2,0.4].map((d,i) => (
              <span key={i} style={{ width:7,height:7,borderRadius:'50%',background:'#c8ff00',display:'inline-block',animation:`dotb 1.2s ease ${d}s infinite` }}></span>
            ))}
          </div>
          <div style={{ fontSize:13,color:'#8a8a8a',fontWeight:500 }}>Carregando pedidos...</div>
        </>
      ) : (
        <>
          <div style={{ fontSize:36,marginBottom:12,opacity:0.5 }}>{icon}</div>
          <div style={{ fontSize:13,color:'#8a8a8a',fontWeight:500 }}>{text}</div>
        </>
      )}
    </div>
  );
}

// ── Order Detail Modal ──
function OrderModal({ order: o, onClose, onStatusChange }: {
  order: Order;
  onClose: () => void;
  onStatusChange: (id: string, status: OrderStatus) => Promise<void>;
}) {
  const produtos = o.items.map(i => `${i.productName} — ${i.variantName} ×${i.quantity}`);
  const frete = statusToFrete(o.status);
  const freteColor =
    frete === '🟢 Entregue' ? '#4cff72' :
    frete === '🟡 A Caminho' ? '#ffe500' :
    frete === '🟠 Solicitado' ? '#ff8c00' :
    frete === '⛔ Cancelado' ? '#ff4d4d' : '#ff4d4d';

  return (
    <div style={{ position:'fixed',inset:0,zIndex:9000,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',padding:24,animation:'fadeIn 0.2s ease' }}
      onClick={onClose}>
      <div style={{ background:'linear-gradient(135deg,rgba(17,17,17,0.99),rgba(22,22,22,0.99))',border:'1px solid rgba(200,255,0,0.2)',borderRadius:24,width:'100%',maxWidth:600,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 40px 80px rgba(0,0,0,0.8)',animation:'modalIn 0.3s ease',position:'relative' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding:'24px 28px 20px',borderBottom:'1px solid rgba(255,255,255,0.07)',display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16 }}>
          <div>
            <div style={{ fontFamily:'JetBrains Mono,monospace',fontSize:10,fontWeight:700,letterSpacing:2,textTransform:'uppercase',color:'#c8ff00',marginBottom:6 }}>Detalhes do Pedido</div>
            <div style={{ fontSize:18,fontWeight:800,color:'#fff',letterSpacing:-0.3 }}>{o.customer?.name}</div>
          </div>
          <button onClick={onClose} style={{ width:32,height:32,borderRadius:8,background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',color:'#b0b0b0',fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s',flexShrink:0 }}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,77,77,0.15)';e.currentTarget.style.color='#ff4d4d';}}
            onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.06)';e.currentTarget.style.color='#b0b0b0';}}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding:'24px 28px',display:'flex',flexDirection:'column',gap:20 }}>

          {/* Identificação */}
          <div>
            <ModalSection label="Identificação" />
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
              <div style={{ gridColumn:'1/-1' }}><ModalField label="Nº Pedido" value={o.orderNumber} mono /></div>
              <ModalField label="Data / Hora" value={fmtDate(o.createdAt)} mono />
              <ModalField label="Payment ID" value={o.mpPaymentId ?? o.mpPreferenceId ?? '—'} mono small />
            </div>
          </div>

          {/* Cliente */}
          <div>
            <ModalSection label="Cliente" />
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
              <ModalField label="Nome" value={o.customer?.name} />
              <ModalField label="WhatsApp" value={o.customer?.phone} mono />
              {o.customer?.email && <div style={{ gridColumn:'1/-1' }}><ModalField label="Email" value={o.customer.email} /></div>}
              <div style={{ gridColumn:'1/-1' }}><ModalField label="Endereço" value={`${o.customer?.address}, ${o.customer?.city}`} /></div>
            </div>
          </div>

          {/* Produtos */}
          <div>
            <ModalSection label="Produtos" />
            <div style={{ background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,overflow:'hidden' }}>
              {produtos.map((p, i) => (
                <div key={i} style={{ padding:'10px 14px',borderBottom: i < produtos.length-1 ? '1px solid rgba(255,255,255,0.07)' : 'none',fontSize:13,color:'#e0e0e0',fontWeight:500,display:'flex',alignItems:'center',gap:8 }}>
                  <div style={{ width:6,height:6,borderRadius:'50%',background:'#c8ff00',flexShrink:0 }}></div>
                  {p}
                </div>
              ))}
            </div>
          </div>

          {/* Valores */}
          <div>
            <ModalSection label="Valores" />
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
              <ModalField label="Subtotal" value={fmtR(o.subtotal)} mono />
              <ModalField label="Frete" value={fmtR(o.shippingCost)} mono />
              <div style={{ gridColumn:'1/-1' }}><ModalField label="Total" value={fmtR(o.total)} mono lime big /></div>
            </div>
          </div>

          {/* Status */}
          <div>
            <ModalSection label="Status" />
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
              <div style={{ background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'12px 14px' }}>
                <div style={{ fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'#8a8a8a',marginBottom:8 }}>Pagamento</div>
                {isPaid(o.status)
                  ? <span style={{ display:'inline-flex',gap:5,padding:'5px 12px',borderRadius:8,fontSize:11,fontWeight:700,background:'rgba(200,255,0,0.1)',color:'#c8ff00',border:'1px solid rgba(200,255,0,0.2)' }}>✅ Pago</span>
                  : <span style={{ display:'inline-flex',gap:5,padding:'5px 12px',borderRadius:8,fontSize:11,fontWeight:700,background:'rgba(255,181,69,0.1)',color:'#ffb545',border:'1px solid rgba(255,181,69,0.2)' }}>⏳ Pendente</span>
                }
              </div>
              <div style={{ background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'12px 14px' }}>
                <div style={{ fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'#8a8a8a',marginBottom:8 }}>Entrega</div>
                <select
                  value={frete}
                  onChange={e => onStatusChange(o.id, freteToStatus(e.target.value as FreteOption))}
                  style={{
                    background:'rgba(255,255,255,0.04)',border:`1px solid ${freteColor}55`,borderRadius:9,
                    padding:'5px 24px 5px 10px',fontFamily:'Satoshi,sans-serif',fontSize:11,fontWeight:600,
                    color:freteColor,outline:'none',cursor:'pointer',appearance:'none',WebkitAppearance:'none',
                    backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238a8a8a' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                    backgroundRepeat:'no-repeat',backgroundPosition:'right 8px center',
                  }}>
                  {FRETE_OPTIONS.map(opt => <option key={opt} value={opt} style={{ background:'#1a1a1a',color:'#f0f0f0' }}>{opt}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:'16px 28px 24px',display:'flex',gap:10,flexWrap:'wrap' }}>
          {o.customer?.phone && (
            <a href={`https://wa.me/55${o.customer.phone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer"
              style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 20px',borderRadius:10,background:'rgba(37,211,102,0.12)',border:'1px solid rgba(37,211,102,0.25)',color:'#25d366',fontFamily:'Satoshi,sans-serif',fontSize:13,fontWeight:700,cursor:'pointer',textDecoration:'none',transition:'all 0.2s' }}>
              💬 WhatsApp
            </a>
          )}
          <button onClick={onClose} style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 20px',borderRadius:10,background:'transparent',border:'1px solid rgba(255,255,255,0.12)',color:'#b0b0b0',fontFamily:'Satoshi,sans-serif',fontSize:13,fontWeight:600,cursor:'pointer',transition:'all 0.2s' }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalSection({ label }: { label: string }) {
  return (
    <div style={{ fontSize:10,fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase',color:'#8a8a8a',marginBottom:12,display:'flex',alignItems:'center',gap:8 }}>
      {label}
      <div style={{ flex:1,height:1,background:'rgba(255,255,255,0.07)' }}></div>
    </div>
  );
}
function ModalField({ label, value, mono, lime, big, small }: {
  label: string; value?: string; mono?: boolean; lime?: boolean; big?: boolean; small?: boolean;
}) {
  return (
    <div style={{ background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'12px 14px' }}>
      <div style={{ fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'#8a8a8a',marginBottom:4 }}>{label}</div>
      <div style={{ fontSize: big ? 18 : small ? 11 : 13,fontWeight:600,color: lime ? '#c8ff00' : '#fff',fontFamily: mono ? 'JetBrains Mono,monospace' : undefined,lineHeight:1.4,wordBreak:'break-word' }}>
        {value ?? '—'}
      </div>
    </div>
  );
}

const adminCSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
  .admin-btn-refresh {
    display:flex; align-items:center; gap:8px;
    background:rgba(255,255,255,0.06);
    border:1px solid rgba(255,255,255,0.12);
    border-radius:12px; padding:9px 18px;
    font-family:Satoshi,sans-serif; font-size:13px; font-weight:700;
    color:#e0e0e0; cursor:pointer; transition:all 0.25s;
  }
  .admin-btn-refresh:hover {
    border-color:rgba(200,255,0,0.35); color:#c8ff00;
    background:rgba(200,255,0,0.05);
  }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
  @keyframes modalIn {
    from{opacity:0;transform:scale(0.92) translateY(20px)}
    to{opacity:1;transform:scale(1) translateY(0)}
  }
  @keyframes dotb {
    0%,100%{opacity:0.15;transform:scale(0.8)}
    50%{opacity:1;transform:scale(1)}
  }
`;
