'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AppleSelect } from '@/components/AppleSelect';
import { useRouter } from 'next/navigation';
import type { Order, OrderStatus, Product } from '@/types';
import { BRANDS_STATIC } from '@/types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function getAdminToken(): string {
  try { return localStorage.getItem('admin-token') ?? ''; } catch { return ''; }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAdminToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { 'x-auth-token': token } : {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Redimensiona imagens 4K para no máximo 2048px antes do upload, mantendo proporção
async function compressImage(file: File, maxPx = 2048, quality = 0.85): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;
      if (w <= maxPx && h <= maxPx) { resolve(file); return; }
      const scale = maxPx / Math.max(w, h);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao carregar imagem')); };
    img.src = url;
  });
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  createdAt: number;
}

type Page = 'dashboard' | 'pedidos' | 'clientes' | 'produtos' | 'loja' | 'config';

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingClients, setLoadingClients] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const [lastUpdate, setLastUpdate] = useState('—');
  const [usuario, setUsuario] = useState('');

  // Filters — dashboard
  const [filtro, setFiltro] = useState<'todos' | 'aguardando' | 'pendente' | 'concluido' | 'arquivado'>('todos');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Filters — pedidos page
  const [pSearch, setPSearch] = useState('');
  const [pFiltro, setPFiltro] = useState<'todos' | 'aguardando' | 'pendente' | 'concluido' | 'arquivado'>('todos');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [dashFilterMenuOpen, setDashFilterMenuOpen] = useState(false);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const dashFilterBtnRef = useRef<HTMLButtonElement>(null);
  const [filterMenuPos, setFilterMenuPos] = useState({ top: 0, right: 0 });
  const [filterMenuMobile, setFilterMenuMobile] = useState(false);
  const [pFilterPagamento, setPFilterPagamento] = useState<'pendente' | 'pago' | null>(null);
  const [pFilterMetodo, setPFilterMetodo] = useState<'mp' | 'cielo' | null>(null);
  const [pFilterMotoboy, setPFilterMotoboy] = useState<string | null>(null);
  const [pFilterFrete, setPFilterFrete] = useState<string | null>(null);

  // Filters — clientes
  const [cSearch, setCSearch] = useState('');

  // Funcionamento da loja
  const [storeIsOpen, setStoreIsOpen] = useState(true);       // estado salvo (badge)
  const [storeIsOpenDraft, setStoreIsOpenDraft] = useState(true); // estado do toggle (antes de salvar)
  const [storeMessage, setStoreMessage] = useState('Loja temporariamente fechada. Voltamos em breve!');
  const [storeMessageBot, setStoreMessageBot] = useState('Hoje não estamos mais funcionando. Te avisaremos quando estivermos funcionando!');
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeSaving, setStoreSaving] = useState(false);

  // Produtos
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [prodModal, setProdModal] = useState<{ mode: 'create' | 'edit'; product?: Product } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ product: Product; loading: boolean } | null>(null);

  // Filtros de marcas
  const ALL_BRANDS = [
    { id: 'ignite',     label: 'Ignite',      color: '#ff6a00' },
    { id: 'elfbar',     label: 'Elf Bar',     color: '#3b9eff' },
    { id: 'lostmary',   label: 'Lost Mary',   color: '#ff4e6a' },
    { id: 'oxbar',      label: 'Oxbar',       color: '#a855f7' },
    { id: 'hqd',        label: 'HQD',         color: '#00c9a7' },
    { id: 'nikbar',     label: 'Nikbar',      color: '#e040fb' },
    { id: 'dinnerlady', label: 'Dinner Lady', color: '#f06292' },
    { id: 'rabbeats',   label: 'Rabbeats',    color: '#ffca28' },
  ];
  const [visibleBrandsAdmin, setVisibleBrandsAdmin] = useState<string[]>(ALL_BRANDS.map(b => b.id));
  const [customBrandsAdmin, setCustomBrandsAdmin] = useState<{ id: string; label: string; color: string }[]>([]);
  const [brandsSaving, setBrandsSaving] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandColor, setNewBrandColor] = useState('#c8ff00');
  const [showNewBrandForm, setShowNewBrandForm] = useState(false);

  // Modal
  const [modalOrder, setModalOrder] = useState<Order | null>(null);

  // Paste tracking toast
  const [pasteTrackingMsg, setPasteTrackingMsg] = useState('');

  // Mobile
  const [isMobile, setIsMobile] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  useEffect(() => {
    const check = () => { setIsMobile(window.innerWidth < 768); if (window.innerWidth >= 768) setSidebarOpen(false); };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loginTimeRef = useRef<number>(0);

  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const raw = await apiFetch<any[]>('/orders');
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

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const data = await apiFetch<Product[]>('/products/admin');
      setProducts(data);
    } catch {
      // ignore
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    setLoadingClients(true);
    try {
      const data = await apiFetch<Customer[]>('/customers');
      setCustomers(data);
    } catch {
      // ignore
    } finally {
      setLoadingClients(false);
    }
  }, []);

  useEffect(() => {
    const token = getAdminToken();
    fetch(`${BASE}/auth/verify`, {
      credentials: 'include',
      headers: token ? { 'x-auth-token': token } : {},
    })
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(payload => {
        setUsuario(payload.u || payload.sub || 'admin');
        loginTimeRef.current = Date.now();
        setAuthChecked(true);
        loadOrders();
      })
      .catch(() => router.replace('/admin/login'));
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

  // Auto-logout after 2 hours
  useEffect(() => {
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const check = () => {
      if (loginTimeRef.current && Date.now() - loginTimeRef.current >= TWO_HOURS) {
        fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
        try { localStorage.removeItem('admin-token'); } catch {}
        router.push('/admin/login');
      }
    };
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [router]);

  // Load customers when navigating to clientes
  useEffect(() => {
    if (page === 'clientes' && customers.length === 0) {
      loadCustomers();
    }
  }, [page, customers.length, loadCustomers]);

  // Load products when navigating to produtos
  useEffect(() => {
    if (page === 'produtos' && products.length === 0) {
      loadProducts();
    }
    if (page === 'produtos') {
      apiFetch<{ visibleBrands: string[]; customBrands: { id: string; label: string; color: string }[] }>('/config/brands-filter')
        .then(r => { setVisibleBrandsAdmin(r.visibleBrands); setCustomBrandsAdmin(r.customBrands ?? []); })
        .catch(() => {});
    }
  }, [page, products.length, loadProducts]);

  const saveBrandsFilter = useCallback(async () => {
    setBrandsSaving(true);
    try {
      await apiFetch<any>('/config/brands-filter', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibleBrands: visibleBrandsAdmin, customBrands: customBrandsAdmin }),
      });
    } catch (e) {
      alert('Erro ao salvar: ' + (e instanceof Error ? e.message : 'desconhecido'));
    } finally {
      setBrandsSaving(false);
    }
  }, [visibleBrandsAdmin, customBrandsAdmin]);

  const addCustomBrand = useCallback(() => {
    const name = newBrandName.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const allExisting = [...ALL_BRANDS, ...customBrandsAdmin];
    if (allExisting.find(b => b.id === id)) {
      alert('Já existe uma marca com esse nome.');
      return;
    }
    const newBrand = { id, label: name, color: newBrandColor };
    setCustomBrandsAdmin(prev => [...prev, newBrand]);
    setVisibleBrandsAdmin(prev => [...prev, id]);
    setNewBrandName('');
    setNewBrandColor('#c8ff00');
    setShowNewBrandForm(false);
  }, [newBrandName, newBrandColor, customBrandsAdmin]);

  const removeCustomBrand = useCallback((id: string) => {
    setCustomBrandsAdmin(prev => prev.filter(b => b.id !== id));
    setVisibleBrandsAdmin(prev => prev.filter(bid => bid !== id));
  }, []);

  // Sync modal with latest orders data
  useEffect(() => {
    if (modalOrder) {
      const updated = orders.find(o => o.id === modalOrder.id);
      if (updated) setModalOrder(updated);
    }
  }, [orders]);

  // Draw chart
  useEffect(() => {
    if (!canvasRef.current || loading) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    const concluidos = orders.filter(o => (o as any).shippingStatus === '🟢 Entregue').length;
    const pendentes = orders.filter(o => (o as any).shippingStatus !== '🟢 Entregue').length;
    drawDonut(ctx, w, h,
      [concluidos, pendentes].filter((_, i) => [concluidos, pendentes][i] > 0),
      ['#c8ff00', '#ff4d4d'].filter((_, i) => [concluidos, pendentes][i] > 0)
    );
  }, [orders, loading, page]);

  useEffect(() => {
    if (page !== 'loja') return;
    setStoreLoading(true);
    apiFetch<{ isOpen: boolean; closedMessage: string; closedMessageBot: string }>('/config/store')
      .then(s => { setStoreIsOpen(s.isOpen); setStoreIsOpenDraft(s.isOpen); setStoreMessage(s.closedMessage); setStoreMessageBot(s.closedMessageBot ?? 'Hoje não estamos mais funcionando. Te avisaremos quando estivermos funcionando!'); })
      .catch(() => {})
      .finally(() => setStoreLoading(false));
  }, [page]);

  const saveStoreConfig = useCallback(async () => {
    setStoreSaving(true);
    try {
      await apiFetch<any>('/config/store', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOpen: storeIsOpenDraft, closedMessage: storeMessage, closedMessageBot: storeMessageBot }),
      });
      setStoreIsOpen(storeIsOpenDraft); // só atualiza o badge após salvar com sucesso
    } catch (e) {
      alert('Erro ao salvar: ' + (e instanceof Error ? e.message : 'desconhecido'));
    } finally {
      setStoreSaving(false);
    }
  }, [storeIsOpenDraft, storeMessage, storeMessageBot]);

  const updateTrackingLink = useCallback(async (id: string, trackingLink: string) => {
    const idsToUpdate = selectedIds.has(id) && selectedIds.size > 1 ? [...selectedIds] : [id];
    setOrders(list => list.map(o => idsToUpdate.includes(o.id) ? { ...o, trackingLink } as any : o));
    if (modalOrder && idsToUpdate.includes(modalOrder.id)) setModalOrder(m => m ? { ...m, trackingLink } as any : m);
    try {
      await Promise.all(idsToUpdate.map(tid =>
        apiFetch<any>(`/orders/${tid}/tracking`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackingLink }),
        })
      ));
    } catch (e) {
      alert('Erro ao salvar link de rastreio: ' + (e instanceof Error ? e.message : 'desconhecido'));
    }
  }, [modalOrder, selectedIds]);

  const updateShippingStatus = useCallback(async (id: string, shippingStatus: string) => {
    const idsToUpdate = selectedIds.has(id) && selectedIds.size > 1 ? [...selectedIds] : [id];
    const prevMap = new Map(orders.filter(o => idsToUpdate.includes(o.id)).map(o => [o.id, o]));
    setOrders(list => list.map(o => idsToUpdate.includes(o.id) ? { ...o, shippingStatus } : o));
    if (modalOrder && idsToUpdate.includes(modalOrder.id)) setModalOrder(m => m ? { ...m, shippingStatus } as any : m);
    try {
      await Promise.all(idsToUpdate.map(tid =>
        apiFetch<any>(`/orders/${tid}/shipping-status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shippingStatus }),
        })
      ));
    } catch (e) {
      setOrders(list => list.map(o => prevMap.has(o.id) ? prevMap.get(o.id)! : o));
      alert('Erro ao atualizar frete: ' + (e instanceof Error ? e.message : 'desconhecido'));
    }
  }, [orders, modalOrder, selectedIds]);

  const updateMotoboy = useCallback(async (id: string, motoboy: string) => {
    const idsToUpdate = selectedIds.has(id) && selectedIds.size > 1 ? [...selectedIds] : [id];
    const prevMap = new Map(orders.filter(o => idsToUpdate.includes(o.id)).map(o => [o.id, o]));
    setOrders(list => list.map(o => idsToUpdate.includes(o.id) ? { ...o, motoboy } as any : o));
    if (modalOrder && idsToUpdate.includes(modalOrder.id)) setModalOrder(m => m ? { ...m, motoboy } as any : m);
    try {
      await Promise.all(idsToUpdate.map(tid =>
        apiFetch<any>(`/orders/${tid}/motoboy`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motoboy }),
        })
      ));
    } catch (e) {
      setOrders(list => list.map(o => prevMap.has(o.id) ? prevMap.get(o.id)! : o));
      alert('Erro ao atualizar motoboy: ' + (e instanceof Error ? e.message : 'desconhecido'));
    }
  }, [orders, modalOrder, selectedIds]);

  const updateOrderStatus = useCallback(async (id: string, status: OrderStatus) => {
    const prev = orders.find(o => o.id === id);
    // Optimistic update
    setOrders(list => list.map(o => o.id === id ? { ...o, status } : o));
    if (modalOrder?.id === id) setModalOrder(m => m ? { ...m, status } : m);
    try {
      await apiFetch<any>(`/orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch (e) {
      // Revert on error
      if (prev) {
        setOrders(list => list.map(o => o.id === id ? prev : o));
        if (modalOrder?.id === id) setModalOrder(prev);
      }
      alert('Erro ao atualizar: ' + (e instanceof Error ? e.message : 'desconhecido'));
    }
  }, [orders, modalOrder]);

  const updatePaymentMethod = useCallback(async (id: string, method: 'mp' | 'cielo') => {
    const prev = orders.find(o => o.id === id);
    setOrders(list => list.map(o => o.id === id ? { ...o, status: 'PAID' as OrderStatus, mpPaymentId: method === 'mp' ? 'manual' : null } as any : o));
    if (modalOrder?.id === id) setModalOrder(m => m ? { ...m, status: 'PAID' as OrderStatus, mpPaymentId: method === 'mp' ? 'manual' : null } as any : m);
    try {
      await apiFetch<any>(`/orders/${id}/payment-method`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method }),
      });
    } catch (e) {
      if (prev) {
        setOrders(list => list.map(o => o.id === id ? prev : o));
        if (modalOrder?.id === id) setModalOrder(prev);
      }
      alert('Erro ao atualizar pagamento: ' + (e instanceof Error ? e.message : 'desconhecido'));
    }
  }, [orders, modalOrder]);

  const archiveOrder = useCallback(async (id: string, archived: boolean) => {
    setOrders(list => list.map(o => o.id === id ? { ...o, archived } as any : o));
    try {
      await apiFetch(`/orders/${id}/${archived ? 'archive' : 'unarchive'}`, { method: 'PATCH' });
    } catch (e) {
      setOrders(list => list.map(o => o.id === id ? { ...o, archived: !archived } as any : o));
      alert('Erro ao arquivar pedido.');
    }
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Ctrl+V com pedidos selecionados → cola o link da área de transferência em todos
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'v') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (selectedIds.size === 0) return;
      e.preventDefault();
      navigator.clipboard.readText().then(text => {
        text = text.trim();
        if (!text) return;
        const ids = [...selectedIds];
        setOrders(list => list.map(o => ids.includes(o.id) ? { ...o, trackingLink: text } as any : o));
        Promise.all(ids.map(tid =>
          apiFetch<any>(`/orders/${tid}/tracking`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackingLink: text }),
          })
        )).then(() => {
          setPasteTrackingMsg(`✅ Link colado em ${ids.length} pedido${ids.length > 1 ? 's' : ''}`);
          setTimeout(() => setPasteTrackingMsg(''), 3000);
        }).catch(err => {
          alert('Erro ao colar link de rastreio: ' + (err instanceof Error ? err.message : 'desconhecido'));
        });
      }).catch(() => {
        alert('Não foi possível ler a área de transferência. Verifique as permissões do navegador.');
      });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds]);

  const logout = () => {
    fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    try { localStorage.removeItem('admin-token'); } catch {}
    router.push('/admin/login');
  };

  // ── Filtered lists ──
  function filterOrders(list: Order[], f: typeof filtro, dFrom: string, dTo: string) {
    let r = [...list];
    if (f === 'arquivado') r = r.filter(o => (o as any).archived);
    else {
      r = r.filter(o => !(o as any).archived);
      if (f === 'aguardando') r = r.filter(o => o.status === 'PENDING');
      else if (f === 'pendente') r = r.filter(o => o.status !== 'PENDING' && (o as any).shippingStatus !== '🟢 Entregue');
      else if (f === 'concluido') r = r.filter(o => (o as any).shippingStatus === '🟢 Entregue');
    }
    if (dFrom) r = r.filter(o => new Date(o.createdAt) >= new Date(dFrom));
    if (dTo) r = r.filter(o => new Date(o.createdAt) <= new Date(dTo + 'T23:59:59'));
    if (pFilterPagamento === 'pendente') r = r.filter(o => o.status === 'PENDING');
    else if (pFilterPagamento === 'pago') r = r.filter(o => o.status !== 'PENDING');
    if (pFilterMetodo === 'mp') r = r.filter(o => !!(o as any).mpPaymentId);
    else if (pFilterMetodo === 'cielo') r = r.filter(o => !(o as any).mpPaymentId);
    if (pFilterMotoboy) r = r.filter(o => {
      const val = (o as any).motoboy;
      const effective = (!val || val === '') ? '⏳ Pendente' : val;
      return effective === pFilterMotoboy;
    });
    if (pFilterFrete) r = r.filter(o => {
      const val = (o as any).shippingStatus;
      const effective = (!val || val === '') ? '🔴 Pendente' : val;
      return effective === pFilterFrete;
    });
    return r;
  }

  function filterPedidos(list: Order[], f: typeof pFiltro, search: string) {
    let r = [...list];
    if (f === 'arquivado') r = r.filter(o => (o as any).archived);
    else {
      r = r.filter(o => !(o as any).archived);
      if (f === 'aguardando') r = r.filter(o => o.status === 'PENDING');
      else if (f === 'pendente') r = r.filter(o => o.status !== 'PENDING' && (o as any).shippingStatus !== '🟢 Entregue');
      else if (f === 'concluido') r = r.filter(o => (o as any).shippingStatus === '🟢 Entregue');
    }
    if (pFilterPagamento === 'pendente') r = r.filter(o => o.status === 'PENDING');
    else if (pFilterPagamento === 'pago') r = r.filter(o => o.status !== 'PENDING');
    if (pFilterMetodo === 'mp') r = r.filter(o => !!(o as any).mpPaymentId);
    else if (pFilterMetodo === 'cielo') r = r.filter(o => !(o as any).mpPaymentId);
    if (pFilterMotoboy) r = r.filter(o => {
      const val = (o as any).motoboy;
      const effective = (!val || val === '') ? '⏳ Pendente' : val;
      return effective === pFilterMotoboy;
    });
    if (pFilterFrete) r = r.filter(o => {
      const val = (o as any).shippingStatus;
      const effective = (!val || val === '') ? '🔴 Pendente' : val;
      return effective === pFilterFrete;
    });
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(o =>
        o.orderNumber?.toLowerCase().includes(q) ||
        o.customer?.name?.toLowerCase().includes(q) ||
        o.customer?.phone?.includes(q) ||
        o.items?.some(i => i.productName?.toLowerCase().includes(q))
      );
    }
    return r;
  }

  // KPIs
  const totalVendido = orders.filter(o => isPaid(o.status)).reduce((s, o) => s + o.total, 0);
  const totalPedidos = orders.length;
  const aguardando = orders.filter(o => o.status === 'PENDING').length;
  const concluidos = orders.filter(o => (o as any).shippingStatus === '🟢 Entregue').length;
  const pendentes = orders.filter(o => (o as any).shippingStatus !== '🟢 Entregue' && o.status !== 'PENDING').length;
  const pctConcluidos = totalPedidos ? Math.round((concluidos / totalPedidos) * 100) : 0;

  const chartConcluidos = orders.filter(o => (o as any).shippingStatus === '🟢 Entregue').length;
  const chartPendentes = orders.filter(o => (o as any).shippingStatus !== '🟢 Entregue').length;

  // ── Render ──
  if (!authChecked) return <div style={{ background:'#080808', minHeight:'100vh' }} />;

  return (
    <>
      <style>{adminCSS}</style>

      {/* Hamburger (mobile only) */}
      {isMobile && (
        <button onClick={() => setSidebarOpen(o => !o)} style={{
          position:'fixed',top:14,left:14,zIndex:300,
          background:'rgba(20,20,20,0.92)',border:'1px solid rgba(255,255,255,0.15)',
          borderRadius:10,padding:'8px 11px',cursor:'pointer',fontSize:18,lineHeight:1,color:'#fff',
        }}>☰</button>
      )}

      {/* Overlay (mobile sidebar open) */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',zIndex:150,backdropFilter:'blur(2px)' }} />
      )}

      {/* Sidebar */}
      <aside style={{
        position: 'fixed', top: 0, bottom: 0, width: 232,
        left: isMobile ? (sidebarOpen ? 0 : -240) : 0,
        transition: 'left 0.28s cubic-bezier(0.4,0,0.2,1)',
        background: 'rgba(8,8,8,0.98)', backdropFilter: 'blur(30px)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column',
        zIndex: 200, padding: '28px 16px',
      }}>
        <div style={{ display:'flex',alignItems:'center',gap:12,padding:'0 10px',marginBottom:40 }}>
          <div style={{ width:40,height:40,background:'linear-gradient(135deg,rgba(200,255,0,0.18),rgba(126,255,245,0.12))',border:'1px solid rgba(200,255,0,0.25)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:17 }}>⚡</div>
          <div>
            <div style={{ fontFamily:'Satoshi,sans-serif',fontSize:15,fontWeight:800,color:'#fff' }}>CheapPods</div>
            <div style={{ fontFamily:'JetBrains Mono,monospace',fontSize:9,fontWeight:600,letterSpacing:'1.5px',textTransform:'uppercase',color:'#8a8a8a',marginTop:2 }}>Admin Panel</div>
          </div>
        </div>

        <nav style={{ flex:1,display:'flex',flexDirection:'column',gap:4 }}>
          {([
            { id:'dashboard', icon:'📊', label:'Dashboard' },
            { id:'pedidos',   icon:'📦', label:'Pedidos' },
            { id:'clientes',  icon:'👥', label:'Clientes' },
            { id:'produtos',  icon:'🛍️', label:'Produtos' },
            { id:'loja',      icon:'🏪', label:'Funcionamento da Loja' },
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
      <div style={{ marginLeft: isMobile ? 0 : 232, minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>

        {/* ── DASHBOARD PAGE ── */}
        {page === 'dashboard' && (
          <>
            <header className="admin-topbar" style={{ ...topbar, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:15,fontWeight:700,color:'#fff',letterSpacing:-0.3 }}>
                Dashboard <span style={{ color:'#6a6a6a',fontWeight:400 }}>/ Visão Geral</span>
              </div>
              <a
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display:'flex', alignItems:'center', gap:6,
                  background:'#c8ff00', color:'#0a0a0a',
                  fontWeight:700, fontSize:13, padding:'7px 16px',
                  borderRadius:8, textDecoration:'none', letterSpacing:-0.2,
                  transition:'opacity .15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                ↗ Ver Loja
              </a>
            </header>

            <div style={{ padding: isMobile ? '16px' : '28px 32px', flex:1 }}>
              {/* KPI Cards */}
              <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : '2fr 1fr 1fr 1fr 1fr', gap:14, marginBottom:24 }}>
                <div style={{ gridColumn: isMobile ? '1 / -1' : undefined }}>
                  <StatCard label="Total Vendido" value={fmtR(totalVendido)} sub="pagos + enviados" color="#c8ff00" icon="💰" featured />
                </div>
                <StatCard label="Total Pedidos" value={String(totalPedidos)} sub="todos os status" color="#7efff5" icon="📦" onClick={() => setFiltro('todos')} active={filtro === 'todos'} />
                <StatCard label="Aguardando Pagamento" value={String(aguardando)} sub="pagamento pendente" color="#7efff5" icon="💳" onClick={() => setFiltro(filtro === 'aguardando' ? 'todos' : 'aguardando')} active={filtro === 'aguardando'} />
                <StatCard label="Aguardando Entrega" value={String(pendentes)} sub="pagos, não entregues" color="#ffb545" icon="🏍️" onClick={() => setFiltro(filtro === 'pendente' ? 'todos' : 'pendente')} active={filtro === 'pendente'} />
                <StatCard label="Concluídos" value={String(concluidos)} sub={`${pctConcluidos}% do total`} color="#c8ff00" icon="✅" onClick={() => setFiltro(filtro === 'concluido' ? 'todos' : 'concluido')} active={filtro === 'concluido'} />
              </div>

              {/* Chart + Filters row */}
              <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '290px 1fr', gap:16, marginBottom:24, alignItems:'start' }}>
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
                      { label:'🟢 Entregues', val:chartConcluidos, color:'#c8ff00' },
                      { label:'⏳ Pendentes', val:chartPendentes, color:'#ff4d4d' },
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
                        { key:'todos',     label:'Todos',          cls:'green' },
                        { key:'aguardando', label:'💳 Aguard. Pagamento', cls:'cyan'  },
                        { key:'pendente',   label:'🏍️ Aguard. Entrega',  cls:'amber' },
                        { key:'concluido', label:'✅ Concluídos',  cls:'green' },
                        { key:'arquivado',  label:'📦 Arquivados',        cls:'gray'  },
                      ] as const).map(f => (
                        <button key={f.key} onClick={() => setFiltro(f.key)}
                          style={{ padding:'7px 16px',borderRadius:10,border:'1px solid',fontFamily:'Satoshi,sans-serif',fontSize:12,fontWeight:700,cursor:'pointer',transition:'all 0.2s',whiteSpace:'nowrap',
                            ...(filtro === f.key
                              ? f.cls==='amber' ? { background:'rgba(255,181,69,0.1)',borderColor:'rgba(255,181,69,0.3)',color:'#ffb545' }
                              : f.cls==='cyan'  ? { background:'rgba(126,255,245,0.1)',borderColor:'rgba(126,255,245,0.3)',color:'#7efff5' }
                              : f.cls==='gray'  ? { background:'rgba(160,160,160,0.1)',borderColor:'rgba(160,160,160,0.3)',color:'#b0b0b0' }
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
                onShippingChange={updateShippingStatus}
                onMotoboyChange={updateMotoboy}
                onPaymentMethodChange={updatePaymentMethod}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onClearSelection={() => setSelectedIds(new Set())}
                filterButton={
                  <button ref={dashFilterBtnRef}
                    onClick={() => {
                      const mobile = window.innerWidth < 600;
                      setFilterMenuMobile(mobile);
                      if (!mobile) {
                        const r = dashFilterBtnRef.current?.getBoundingClientRect();
                        if (r) setFilterMenuPos({ top: r.bottom + 10, right: window.innerWidth - r.right });
                      }
                      setFilterMenuOpen(v => !v);
                    }}
                    style={{ display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:8,border:'1px solid',fontFamily:'Satoshi,sans-serif',fontSize:12,fontWeight:700,cursor:'pointer',transition:'all 0.2s',
                      background: !!(pFilterPagamento || pFilterMetodo || pFilterMotoboy || pFilterFrete) ? 'rgba(200,255,0,0.1)' : 'rgba(255,255,255,0.04)',
                      borderColor: !!(pFilterPagamento || pFilterMetodo || pFilterMotoboy || pFilterFrete) ? 'rgba(200,255,0,0.35)' : 'rgba(255,255,255,0.12)',
                      color: !!(pFilterPagamento || pFilterMetodo || pFilterMotoboy || pFilterFrete) ? '#c8ff00' : '#b0b0b0',
                    }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                    </svg>
                    Filtros
                    {!!(pFilterPagamento || pFilterMetodo || pFilterMotoboy || pFilterFrete) && (
                      <span style={{ background:'#c8ff00',color:'#000',borderRadius:'50%',width:15,height:15,fontSize:9,fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center' }}>
                        {[pFilterPagamento, pFilterMetodo, pFilterMotoboy, pFilterFrete].filter(Boolean).length}
                      </span>
                    )}
                  </button>
                }
              />
            </div>
          </>
        )}

        {/* ── PEDIDOS PAGE ── */}
        {page === 'pedidos' && (
          <>
            <header className="admin-topbar" style={topbar}>
              <div style={{ fontSize:15,fontWeight:700,color:'#fff',letterSpacing:-0.3 }}>
                Pedidos <span style={{ color:'#6a6a6a',fontWeight:400 }}>/ Lista Completa</span>
              </div>
              {!isMobile && (
                <div style={{ flex:1,display:'flex',justifyContent:'center',maxWidth:400,margin:'0 auto' }}>
                  <div style={{ display:'flex',alignItems:'center',gap:10,flex:1,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:12,padding:'9px 16px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6a6a6a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <input value={pSearch} onChange={e => setPSearch(e.target.value)} placeholder="Buscar por nome, produto, nº pedido..." style={{ background:'transparent',border:'none',outline:'none',fontFamily:'Satoshi,sans-serif',fontSize:13,color:'#fff',width:'100%' }} />
                  </div>
                </div>
              )}
              <button className="admin-btn-refresh" onClick={() => loadOrders()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                  <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                </svg>
                {!isMobile && 'Atualizar'}
              </button>
            </header>

            <div style={{ padding: isMobile ? '16px' : '28px 32px', flex:1 }}>
              {isMobile && (
                <div style={{ display:'flex',alignItems:'center',gap:10,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:12,padding:'10px 14px',marginBottom:12 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6a6a6a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input value={pSearch} onChange={e => setPSearch(e.target.value)} placeholder="Buscar pedido, nome..." style={{ background:'transparent',border:'none',outline:'none',fontFamily:'Satoshi,sans-serif',fontSize:13,color:'#fff',width:'100%' }} />
                  {pSearch && <button onClick={() => setPSearch('')} style={{ background:'none',border:'none',color:'#6a6a6a',fontSize:16,cursor:'pointer',padding:0,lineHeight:1,flexShrink:0 }}>×</button>}
                </div>
              )}
              <OrdersTable
                orders={filterPedidos(orders, pFiltro, pSearch)}
                loading={loading}
                onRowClick={setModalOrder}
                onStatusChange={updateOrderStatus}
                onShippingChange={updateShippingStatus}
                onMotoboyChange={updateMotoboy}
                onPaymentMethodChange={updatePaymentMethod}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onClearSelection={() => setSelectedIds(new Set())}
                filterButton={
                  <button ref={filterBtnRef}
                    onClick={() => {
                      const mobile = window.innerWidth < 600;
                      setFilterMenuMobile(mobile);
                      if (!mobile) {
                        const r = filterBtnRef.current?.getBoundingClientRect();
                        if (r) setFilterMenuPos({ top: r.bottom + 10, right: window.innerWidth - r.right });
                      }
                      setFilterMenuOpen(v => !v);
                    }}
                    style={{ display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:8,border:'1px solid',fontFamily:'Satoshi,sans-serif',fontSize:12,fontWeight:700,cursor:'pointer',transition:'all 0.2s',
                      background: !!(pFilterPagamento || pFilterMetodo || pFilterMotoboy || pFilterFrete) ? 'rgba(200,255,0,0.1)' : 'rgba(255,255,255,0.04)',
                      borderColor: !!(pFilterPagamento || pFilterMetodo || pFilterMotoboy || pFilterFrete) ? 'rgba(200,255,0,0.35)' : 'rgba(255,255,255,0.12)',
                      color: !!(pFilterPagamento || pFilterMetodo || pFilterMotoboy || pFilterFrete) ? '#c8ff00' : '#b0b0b0',
                    }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                    </svg>
                    Filtros
                    {!!(pFilterPagamento || pFilterMetodo || pFilterMotoboy || pFilterFrete) && (
                      <span style={{ background:'#c8ff00',color:'#000',borderRadius:'50%',width:15,height:15,fontSize:9,fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center' }}>
                        {[pFilterPagamento, pFilterMetodo, pFilterMotoboy, pFilterFrete].filter(Boolean).length}
                      </span>
                    )}
                  </button>
                }
              />
            </div>
          </>
        )}

        {/* ── CLIENTES PAGE ── */}
        {page === 'clientes' && (
          <>
            <header className="admin-topbar" style={topbar}>
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

            <div style={{ padding: isMobile ? '16px' : '28px 32px', flex:1 }}>
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

        {/* ── PRODUTOS PAGE ── */}
        {page === 'produtos' && (
          <>
            <header className="admin-topbar" style={topbar}>
              <div style={{ fontSize:15,fontWeight:700,color:'#fff',letterSpacing:-0.3 }}>
                Produtos <span style={{ color:'#6a6a6a',fontWeight:400 }}>/ Catálogo</span>
              </div>
              <div style={{ display:'flex',gap:10 }}>
                <button className="admin-btn-refresh" onClick={loadProducts}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                    <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                  </svg>
                  Atualizar
                </button>
                <button
                  onClick={() => setProdModal({ mode: 'create' })}
                  style={{ display:'flex',alignItems:'center',gap:8,padding:'9px 18px',borderRadius:12,background:'rgba(200,255,0,0.12)',border:'1px solid rgba(200,255,0,0.3)',color:'#c8ff00',fontFamily:'Satoshi,sans-serif',fontSize:13,fontWeight:700,cursor:'pointer',transition:'all 0.2s' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(200,255,0,0.22)')}
                  onMouseLeave={e=>(e.currentTarget.style.background='rgba(200,255,0,0.12)')}>
                  + Novo Produto
                </button>
              </div>
            </header>

            <div style={{ padding: isMobile ? '16px' : '28px 32px', flex:1 }}>
              <div style={tableCard}>
                <div style={tableHead}>
                  <span style={{ fontSize:13,fontWeight:800,color:'#fff' }}>🛍️ Produtos Cadastrados</span>
                  <span style={tableCount}>{products.length} produto{products.length !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%',borderCollapse:'collapse' }}>
                    <thead>
                      <tr>
                        {['Nome','Marca','Preço Base','Sabores','Status','Ações'].map(h => (
                          <th key={h} style={th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loadingProducts ? (
                        <tr><td colSpan={6}><StateBox loading /></td></tr>
                      ) : products.length === 0 ? (
                        <tr><td colSpan={6}><StateBox icon="🛍️" text="Nenhum produto cadastrado ainda." /></td></tr>
                      ) : [...products].sort((a, b) => {
                          const order = ['elfbar','ignite','lostmary','oxbar','blacksheep'];
                          return (order.indexOf(a.brandId) ?? 99) - (order.indexOf(b.brandId) ?? 99);
                        }).map(p => {
                        const brand = BRANDS_STATIC.find(b => b.id === p.brandId);
                        return (
                          <tr key={p.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.07)',transition:'background 0.15s' }}
                            onMouseEnter={e=>(e.currentTarget.style.background='rgba(200,255,0,0.02)')}
                            onMouseLeave={e=>(e.currentTarget.style.background='')}>
                            <td style={{ ...td,fontWeight:700,color:'#fff',maxWidth:200,whiteSpace:'normal' }}>{p.name}</td>
                            <td style={td}>
                              <span style={{ display:'inline-flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:8,background:`${brand?.color ?? '#888'}22`,border:`1px solid ${brand?.color ?? '#888'}44`,fontSize:11,fontWeight:600,color:brand?.color ?? '#888' }}>
                                {brand?.name ?? p.brandId}
                              </span>
                            </td>
                            <td style={{ ...tdMono,color:'#c8ff00',fontWeight:600 }}>R$ {(p.basePrice ?? 0).toFixed(2).replace('.',',')}</td>
                            <td style={tdMono}>
                              {(() => {
                                const all = p.variants ?? [];
                                const outOfStock = all.filter((v: any) => v.active !== false && (v.stock ?? 1) <= 0);
                                return (
                                  <span style={{ display:'flex',alignItems:'center',gap:6 }}>
                                    <span>{all.length}</span>
                                    {outOfStock.length > 0 && (
                                      <span style={{ padding:'2px 8px',borderRadius:6,background:'rgba(255,77,77,0.12)',border:'1px solid rgba(255,77,77,0.35)',color:'#ff4d4d',fontSize:10,fontWeight:700 }} title={`${outOfStock.length} sabor(es) sem estoque`}>
                                        {outOfStock.length} sem estoque
                                      </span>
                                    )}
                                  </span>
                                );
                              })()}
                            </td>
                            <td style={td}>
                              {p.active
                                ? <span style={{ padding:'4px 10px',borderRadius:8,background:'rgba(200,255,0,0.1)',border:'1px solid rgba(200,255,0,0.3)',color:'#c8ff00',fontSize:11,fontWeight:700 }}>Ativo</span>
                                : <span style={{ padding:'4px 10px',borderRadius:8,background:'rgba(255,77,77,0.1)',border:'1px solid rgba(255,77,77,0.3)',color:'#ff4d4d',fontSize:11,fontWeight:700 }}>Inativo</span>
                              }
                            </td>
                            <td style={{ ...td,whiteSpace:'nowrap' }}>
                              <div style={{ display:'flex',gap:6 }}>
                                <button onClick={() => setProdModal({ mode:'edit', product: p })}
                                  style={{ padding:'5px 12px',borderRadius:8,background:'rgba(126,255,245,0.08)',border:'1px solid rgba(126,255,245,0.2)',color:'#7efff5',fontFamily:'Satoshi,sans-serif',fontSize:11,fontWeight:700,cursor:'pointer',transition:'all 0.2s' }}
                                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(126,255,245,0.18)')}
                                  onMouseLeave={e=>(e.currentTarget.style.background='rgba(126,255,245,0.08)')}>
                                  Editar
                                </button>
                                {p.active ? (
                                  <button onClick={async () => {
                                    if (!confirm('Desativar "' + p.name + '"?')) return;
                                    try {
                                      await apiFetch(`/products/${p.id}`, { method: 'DELETE' });
                                      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, active: false } : x));
                                    } catch { alert('Erro ao desativar produto.'); }
                                  }} style={{ padding:'5px 12px',borderRadius:8,background:'rgba(255,77,77,0.08)',border:'1px solid rgba(255,77,77,0.2)',color:'#ff4d4d',fontFamily:'Satoshi,sans-serif',fontSize:11,fontWeight:700,cursor:'pointer',transition:'all 0.2s' }}
                                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,77,77,0.18)')}
                                  onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,77,77,0.08)')}>
                                    Desativar
                                  </button>
                                ) : (
                                  <button onClick={async () => {
                                    try {
                                      const updated = await apiFetch<Product>(`/products/${p.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ active: true }) });
                                      setProducts(prev => prev.map(x => x.id === p.id ? updated : x));
                                    } catch { alert('Erro ao reativar produto.'); }
                                  }} style={{ padding:'5px 12px',borderRadius:8,background:'rgba(200,255,0,0.08)',border:'1px solid rgba(200,255,0,0.2)',color:'#c8ff00',fontFamily:'Satoshi,sans-serif',fontSize:11,fontWeight:700,cursor:'pointer',transition:'all 0.2s' }}
                                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(200,255,0,0.18)')}
                                  onMouseLeave={e=>(e.currentTarget.style.background='rgba(200,255,0,0.08)')}>
                                    Reativar
                                  </button>
                                )}
                                <button onClick={() => setDeleteModal({ product: p, loading: false })}
                                  style={{ padding:'5px 12px',borderRadius:8,background:'rgba(255,40,40,0.1)',border:'1px solid rgba(255,40,40,0.35)',color:'#ff4040',fontFamily:'Satoshi,sans-serif',fontSize:11,fontWeight:700,cursor:'pointer',transition:'all 0.2s' }}
                                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,40,40,0.22)')}
                                  onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,40,40,0.1)')}>
                                  Deletar
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Filtros de Marcas ── */}
              <div style={{ padding: isMobile ? '16px 16px 24px' : '24px 32px 32px' }}>
                <div style={{ ...glassCard }}>
                  {/* Header */}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18, flexWrap:'wrap', gap:10 }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:'#fff', marginBottom:3 }}>Filtros de marcas</div>
                      <div style={{ fontSize:12, color:'#6a6a6a' }}>Controle quais marcas aparecem na barra de filtros da loja</div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button
                        onClick={() => setShowNewBrandForm(v => !v)}
                        style={{ padding:'9px 16px', borderRadius:10, border:'1px solid rgba(200,255,0,0.3)', cursor:'pointer', fontFamily:'Satoshi,sans-serif', fontSize:12, fontWeight:700, background:'rgba(200,255,0,0.08)', color:'#c8ff00', transition:'all 0.2s' }}
                      >
                        + Nova marca
                      </button>
                      <button
                        onClick={saveBrandsFilter}
                        disabled={brandsSaving}
                        style={{ padding:'9px 20px', borderRadius:10, border:'none', cursor:'pointer', fontFamily:'Satoshi,sans-serif', fontSize:12, fontWeight:700, background: brandsSaving ? 'rgba(200,255,0,0.4)' : '#c8ff00', color:'#0a0a0a', transition:'all 0.2s', opacity: brandsSaving ? 0.7 : 1 }}
                      >
                        {brandsSaving ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </div>

                  {/* Formulário nova marca */}
                  {showNewBrandForm && (
                    <div style={{ marginBottom:16, padding:'16px', borderRadius:12, background:'rgba(200,255,0,0.04)', border:'1px solid rgba(200,255,0,0.15)' }}>
                      <div style={{ fontSize:12, fontWeight:700, color:'#c8ff00', marginBottom:12, textTransform:'uppercase', letterSpacing:1 }}>Nova marca</div>
                      <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                        <input
                          value={newBrandName}
                          onChange={e => setNewBrandName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addCustomBrand()}
                          placeholder="Nome da marca"
                          style={{ flex:1, minWidth:160, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'9px 12px', color:'#fff', fontFamily:'Satoshi,sans-serif', fontSize:13, outline:'none' }}
                        />
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:12, color:'#8a8a8a' }}>Cor:</span>
                          <input
                            type="color"
                            value={newBrandColor}
                            onChange={e => setNewBrandColor(e.target.value)}
                            style={{ width:36, height:36, borderRadius:8, border:'1px solid rgba(255,255,255,0.15)', cursor:'pointer', padding:2, background:'transparent' }}
                          />
                        </div>
                        <button
                          onClick={addCustomBrand}
                          style={{ padding:'9px 18px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'Satoshi,sans-serif', fontSize:12, fontWeight:700, background:'#c8ff00', color:'#0a0a0a' }}
                        >
                          Adicionar
                        </button>
                        <button
                          onClick={() => setShowNewBrandForm(false)}
                          style={{ padding:'9px 14px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', cursor:'pointer', fontFamily:'Satoshi,sans-serif', fontSize:12, fontWeight:600, background:'transparent', color:'#6a6a6a' }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Lista de marcas */}
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {/* Marcas padrão */}
                    {ALL_BRANDS.map(brand => {
                      const visible = visibleBrandsAdmin.includes(brand.id);
                      return (
                        <div key={brand.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderRadius:12, background:'rgba(255,255,255,0.03)', border:`1px solid ${visible ? brand.color + '33' : 'rgba(255,255,255,0.07)'}`, transition:'all 0.2s' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <span style={{ width:10, height:10, borderRadius:'50%', background: visible ? brand.color : '#3a3a3a', flexShrink:0, transition:'background 0.2s', boxShadow: visible ? `0 0 8px ${brand.color}88` : 'none' }} />
                            <span style={{ fontSize:13, fontWeight:600, color: visible ? '#fff' : '#5a5a5a', transition:'color 0.2s' }}>{brand.label}</span>
                          </div>
                          <button
                            onClick={() => setVisibleBrandsAdmin(prev =>
                              prev.includes(brand.id) ? prev.filter(id => id !== brand.id) : [...prev, brand.id]
                            )}
                            style={{ position:'relative', width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', transition:'background 0.25s', flexShrink:0, background: visible ? '#c8ff00' : 'rgba(255,255,255,0.12)' }}
                          >
                            <span style={{ position:'absolute', top:2, left: visible ? 22 : 2, width:20, height:20, borderRadius:'50%', background: visible ? '#0a0a0a' : '#6a6a6a', transition:'left 0.25s, background 0.25s' }} />
                          </button>
                        </div>
                      );
                    })}

                    {/* Marcas customizadas */}
                    {customBrandsAdmin.length > 0 && (
                      <>
                        <div style={{ fontSize:11, color:'#4a4a4a', fontWeight:600, textTransform:'uppercase', letterSpacing:1, padding:'6px 4px 2px' }}>Marcas personalizadas</div>
                        {customBrandsAdmin.map(brand => {
                          const visible = visibleBrandsAdmin.includes(brand.id);
                          return (
                            <div key={brand.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderRadius:12, background:'rgba(255,255,255,0.03)', border:`1px solid ${visible ? brand.color + '33' : 'rgba(255,255,255,0.07)'}`, transition:'all 0.2s' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                <span style={{ width:10, height:10, borderRadius:'50%', background: visible ? brand.color : '#3a3a3a', flexShrink:0, transition:'background 0.2s', boxShadow: visible ? `0 0 8px ${brand.color}88` : 'none' }} />
                                <span style={{ fontSize:13, fontWeight:600, color: visible ? '#fff' : '#5a5a5a', transition:'color 0.2s' }}>{brand.label}</span>
                                <span style={{ fontSize:10, color:'#4a4a4a', fontWeight:600, padding:'2px 6px', borderRadius:4, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}>custom</span>
                              </div>
                              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <button
                                  onClick={() => setVisibleBrandsAdmin(prev =>
                                    prev.includes(brand.id) ? prev.filter(id => id !== brand.id) : [...prev, brand.id]
                                  )}
                                  style={{ position:'relative', width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', transition:'background 0.25s', flexShrink:0, background: visible ? '#c8ff00' : 'rgba(255,255,255,0.12)' }}
                                >
                                  <span style={{ position:'absolute', top:2, left: visible ? 22 : 2, width:20, height:20, borderRadius:'50%', background: visible ? '#0a0a0a' : '#6a6a6a', transition:'left 0.25s, background 0.25s' }} />
                                </button>
                                <button
                                  onClick={() => removeCustomBrand(brand.id)}
                                  title="Remover marca"
                                  style={{ width:28, height:28, borderRadius:8, border:'1px solid rgba(255,77,77,0.2)', background:'rgba(255,77,77,0.06)', color:'#ff4d4d', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── LOJA PAGE ── */}
        {page === 'loja' && (
          <>
            <header className="admin-topbar" style={topbar}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ fontSize:15,fontWeight:700,color:'#fff',letterSpacing:-0.3 }}>
                  Funcionamento da Loja
                </div>
                <div style={{
                  display:'flex', alignItems:'center', gap:6,
                  padding:'4px 12px', borderRadius:99,
                  background: storeIsOpen ? 'rgba(100,255,100,0.08)' : 'rgba(255,60,60,0.10)',
                  border: storeIsOpen ? '1px solid rgba(100,255,100,0.25)' : '1px solid rgba(255,60,60,0.28)',
                  fontSize:12, fontWeight:600,
                  color: storeIsOpen ? '#7dff7d' : '#ff6060',
                  letterSpacing:0.2,
                }}>
                  <span style={{
                    width:7, height:7, borderRadius:'50%',
                    background: storeIsOpen ? '#44ff44' : '#ff4444',
                    boxShadow: storeIsOpen ? '0 0 6px #44ff44' : '0 0 6px #ff4444',
                    flexShrink:0,
                  }} />
                  {storeIsOpen ? 'Online agora' : 'Loja fechada'}
                </div>
              </div>
            </header>

            <div style={{ padding: isMobile ? '16px' : '28px 32px', flex:1, maxWidth: 560 }}>
              {storeLoading ? (
                <div style={{ color:'#8a8a8a',fontSize:13 }}>Carregando...</div>
              ) : (
                <>
                  {/* Toggle */}
                  <div style={{ ...glassCard, marginBottom:20 }}>
                    <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:16 }}>
                      <div>
                        <div style={{ fontSize:15,fontWeight:700,color:'#fff',marginBottom:4 }}>Status da loja</div>
                        <div style={{ fontSize:13,color:'#8a8a8a' }}>
                          {storeIsOpenDraft ? 'Loja aberta — clientes podem comprar normalmente.' : 'Loja fechada — nenhuma compra pode ser realizada.'}
                        </div>
                      </div>
                      <button
                        onClick={() => setStoreIsOpenDraft(v => !v)}
                        style={{
                          position:'relative', width:56, height:30, borderRadius:15,
                          border:'none', cursor:'pointer', transition:'background 0.25s', flexShrink:0,
                          background: storeIsOpenDraft ? '#c8ff00' : 'rgba(255,255,255,0.12)',
                        }}
                      >
                        <span style={{
                          position:'absolute', top:3, left: storeIsOpenDraft ? 28 : 3,
                          width:24, height:24, borderRadius:'50%',
                          background: storeIsOpenDraft ? '#0a0a0a' : '#6a6a6a',
                          transition:'left 0.25s, background 0.25s',
                        }} />
                      </button>
                    </div>
                  </div>

                  {/* Mensagem Site */}
                  <div style={{ ...glassCard, marginBottom:16 }}>
                    <div style={{ fontSize:13,fontWeight:700,color:'#fff',marginBottom:4 }}>
                      🌐 Mensagem exibida no site
                    </div>
                    <div style={{ fontSize:11, color:'#6a6a6a', marginBottom:10 }}>
                      Aparece na página da loja quando ela está fechada
                    </div>
                    <textarea
                      value={storeMessage}
                      onChange={e => setStoreMessage(e.target.value)}
                      rows={3}
                      style={{
                        width:'100%', boxSizing:'border-box',
                        background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.12)',
                        borderRadius:10, padding:'12px 14px', color:'#fff',
                        fontFamily:'Satoshi,sans-serif', fontSize:13, resize:'vertical', outline:'none',
                      }}
                      placeholder="Ex: Estamos fechados hoje. Voltamos amanhã às 9h!"
                    />
                  </div>

                  {/* Mensagem WhatsApp Bot */}
                  <div style={{ ...glassCard, marginBottom:20 }}>
                    <div style={{ fontSize:13,fontWeight:700,color:'#fff',marginBottom:4 }}>
                      💬 Mensagem enviada pelo bot (WhatsApp)
                    </div>
                    <div style={{ fontSize:11, color:'#6a6a6a', marginBottom:10 }}>
                      Enviada automaticamente quando alguém contactar o WhatsApp fora do horário
                    </div>
                    <textarea
                      value={storeMessageBot}
                      onChange={e => setStoreMessageBot(e.target.value)}
                      rows={3}
                      style={{
                        width:'100%', boxSizing:'border-box',
                        background:'rgba(255,255,255,0.04)', border:'1px solid rgba(64,196,255,0.2)',
                        borderRadius:10, padding:'12px 14px', color:'#fff',
                        fontFamily:'Satoshi,sans-serif', fontSize:13, resize:'vertical', outline:'none',
                      }}
                      placeholder="Ex: Hoje não estamos mais funcionando. Te avisaremos quando estivermos funcionando!"
                    />
                  </div>

                  {/* Botão salvar */}
                  <button
                    onClick={saveStoreConfig}
                    disabled={storeSaving}
                    style={{
                      padding:'11px 28px', borderRadius:10, border:'none', cursor:'pointer',
                      fontFamily:'Satoshi,sans-serif', fontSize:13, fontWeight:700,
                      background: storeSaving ? 'rgba(200,255,0,0.4)' : '#c8ff00',
                      color:'#0a0a0a', transition:'all 0.2s',
                    }}
                  >
                    {storeSaving ? 'Salvando...' : 'Salvar alterações'}
                  </button>
                </>
              )}
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
        <OrderModal order={modalOrder} onClose={() => setModalOrder(null)} onStatusChange={updateOrderStatus} onShippingChange={updateShippingStatus} onMotoboyChange={updateMotoboy} onTrackingChange={updateTrackingLink} onArchive={archiveOrder} />
      )}

      {/* ── PRODUCT MODAL ── */}
      {prodModal && (
        <ProductModal
          mode={prodModal.mode}
          product={prodModal.product}
          onSaved={(p) => {
            if (prodModal.mode === 'create') setProducts(prev => [p, ...prev]);
            else setProducts(prev => prev.map(x => x.id === p.id ? p : x));
            setProdModal(null);
          }}
          onClose={() => setProdModal(null)}
        />
      )}

      {/* ── DELETE PRODUCT CONFIRM MODAL ── */}
      {deleteModal && (
        <div
          onClick={() => { if (!deleteModal.loading) setDeleteModal(null); }}
          style={{ position:'fixed', inset:0, zIndex:250, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width:'100%', maxWidth:460, background:'linear-gradient(160deg,rgba(20,20,20,0.98),rgba(14,14,14,0.98))', border:'1px solid rgba(255,40,40,0.35)', borderRadius:18, padding:28, boxShadow:'0 20px 60px rgba(0,0,0,0.7)' }}
          >
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:'rgba(255,40,40,0.12)', border:'1px solid rgba(255,40,40,0.3)', display:'flex', alignItems:'center', justifyContent:'center', color:'#ff4040', fontSize:22, fontWeight:700 }}>!</div>
              <div style={{ fontSize:17, fontWeight:800, color:'#fff', fontFamily:'Satoshi,sans-serif' }}>Deletar produto</div>
            </div>
            <div style={{ fontSize:13, color:'#bdbdbd', lineHeight:1.5, fontFamily:'Satoshi,sans-serif', marginBottom:8 }}>
              Tem certeza que deseja deletar permanentemente <strong style={{ color:'#fff' }}>&quot;{deleteModal.product.name}&quot;</strong>?
            </div>
            <div style={{ fontSize:12, color:'#ff6a6a', fontFamily:'Satoshi,sans-serif', marginBottom:22 }}>
              Esta ação não pode ser desfeita. Se você só quer esconder o produto da loja, use &quot;Desativar&quot;.
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button
                onClick={() => setDeleteModal(null)}
                disabled={deleteModal.loading}
                style={{ padding:'10px 18px', borderRadius:10, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.14)', color:'#fff', fontFamily:'Satoshi,sans-serif', fontSize:12, fontWeight:700, cursor: deleteModal.loading ? 'not-allowed' : 'pointer', opacity: deleteModal.loading ? 0.5 : 1 }}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (deleteModal.loading) return;
                  setDeleteModal(m => m ? { ...m, loading: true } : m);
                  try {
                    await apiFetch(`/products/${deleteModal.product.id}/permanent`, { method: 'DELETE' });
                    setProducts(prev => prev.filter(x => x.id !== deleteModal.product.id));
                    setDeleteModal(null);
                  } catch {
                    alert('Erro ao deletar produto.');
                    setDeleteModal(m => m ? { ...m, loading: false } : m);
                  }
                }}
                disabled={deleteModal.loading}
                style={{ padding:'10px 18px', borderRadius:10, background:'rgba(255,40,40,0.18)', border:'1px solid rgba(255,40,40,0.5)', color:'#ff4040', fontFamily:'Satoshi,sans-serif', fontSize:12, fontWeight:800, cursor: deleteModal.loading ? 'not-allowed' : 'pointer', opacity: deleteModal.loading ? 0.6 : 1 }}
              >
                {deleteModal.loading ? 'Deletando…' : 'Deletar permanentemente'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Filter Menu Portal ── */}
      {filterMenuOpen && typeof document !== 'undefined' && createPortal(
        <>
          <div onClick={() => setFilterMenuOpen(false)} style={{ position:'fixed',inset:0,zIndex:199,background: filterMenuMobile ? 'rgba(0,0,0,0.5)' : 'transparent' }} />
          <div style={filterMenuMobile ? {
            position:'fixed', bottom:0, left:0, right:0, zIndex:200,
            background:'#141414', border:'1px solid rgba(255,255,255,0.12)',
            borderRadius:'20px 20px 0 0', padding:'20px 20px 32px',
            boxShadow:'0 -8px 40px rgba(0,0,0,0.6)',
            maxHeight:'80vh', overflowY:'auto',
          } : {
            position:'fixed', top:filterMenuPos.top, right:filterMenuPos.right, zIndex:200,
            background:'#141414', border:'1px solid rgba(255,255,255,0.12)',
            borderRadius:16, padding:20, minWidth:280,
            boxShadow:'0 16px 40px rgba(0,0,0,0.6)',
            maxHeight:'calc(100vh - 80px)', overflowY:'auto',
          }}>

            {filterMenuMobile && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
                <div style={{ width:36, height:4, borderRadius:99, background:'rgba(255,255,255,0.15)', margin:'0 auto 0 0' }} />
                <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>Filtros</div>
                <button onClick={() => setFilterMenuOpen(false)} style={{ background:'none', border:'none', color:'#6a6a6a', fontSize:20, cursor:'pointer', lineHeight:1, padding:0 }}>×</button>
              </div>
            )}

            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:11,fontWeight:700,color:'#6a6a6a',letterSpacing:0.8,textTransform:'uppercase',marginBottom:8 }}>Pagamento</div>
              <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
                {([['pendente','Pendente'],['pago','Pago']] as const).map(([val, label]) => (
                  <button key={val} onClick={() => setPFilterPagamento(v => v === val ? null : val)}
                    style={{ padding:'6px 14px',borderRadius:8,border:'1px solid',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'Satoshi,sans-serif',transition:'all 0.15s',
                      background: pFilterPagamento === val ? 'rgba(200,255,0,0.12)' : 'rgba(255,255,255,0.04)',
                      borderColor: pFilterPagamento === val ? 'rgba(200,255,0,0.4)' : 'rgba(255,255,255,0.1)',
                      color: pFilterPagamento === val ? '#c8ff00' : '#9a9a9a',
                    }}>{label}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:11,fontWeight:700,color:'#6a6a6a',letterSpacing:0.8,textTransform:'uppercase',marginBottom:8 }}>Método de pagamento</div>
              <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
                {([['mp','Mercado Pago'],['cielo','Cielo']] as const).map(([val, label]) => (
                  <button key={val} onClick={() => setPFilterMetodo(v => v === val ? null : val)}
                    style={{ padding:'6px 14px',borderRadius:8,border:'1px solid',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'Satoshi,sans-serif',transition:'all 0.15s',
                      background: pFilterMetodo === val ? 'rgba(200,255,0,0.12)' : 'rgba(255,255,255,0.04)',
                      borderColor: pFilterMetodo === val ? 'rgba(200,255,0,0.4)' : 'rgba(255,255,255,0.1)',
                      color: pFilterMetodo === val ? '#c8ff00' : '#9a9a9a',
                    }}>{label}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:11,fontWeight:700,color:'#6a6a6a',letterSpacing:0.8,textTransform:'uppercase',marginBottom:8 }}>Motoboy</div>
              <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
                {['⏳ Pendente','🛵 Lala Move','🏍️ Motoboy Próprio'].map(opt => (
                  <button key={opt} onClick={() => setPFilterMotoboy(v => v === opt ? null : opt)}
                    style={{ padding:'6px 14px',borderRadius:8,border:'1px solid',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'Satoshi,sans-serif',transition:'all 0.15s',
                      background: pFilterMotoboy === opt ? 'rgba(200,255,0,0.12)' : 'rgba(255,255,255,0.04)',
                      borderColor: pFilterMotoboy === opt ? 'rgba(200,255,0,0.4)' : 'rgba(255,255,255,0.1)',
                      color: pFilterMotoboy === opt ? '#c8ff00' : '#9a9a9a',
                    }}>{opt}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11,fontWeight:700,color:'#6a6a6a',letterSpacing:0.8,textTransform:'uppercase',marginBottom:8 }}>Status do frete</div>
              <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
                {FRETE_OPTIONS.map(opt => (
                  <button key={opt} onClick={() => setPFilterFrete(v => v === opt ? null : opt)}
                    style={{ padding:'6px 14px',borderRadius:8,border:'1px solid',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'Satoshi,sans-serif',transition:'all 0.15s',
                      background: pFilterFrete === opt ? 'rgba(200,255,0,0.12)' : 'rgba(255,255,255,0.04)',
                      borderColor: pFilterFrete === opt ? 'rgba(200,255,0,0.4)' : 'rgba(255,255,255,0.1)',
                      color: pFilterFrete === opt ? '#c8ff00' : '#9a9a9a',
                    }}>{opt}</button>
                ))}
              </div>
            </div>

            {(pFilterPagamento || pFilterMetodo || pFilterMotoboy || pFilterFrete) && (
              <button onClick={() => { setPFilterPagamento(null); setPFilterMetodo(null); setPFilterMotoboy(null); setPFilterFrete(null); }}
                style={{ width:'100%',padding:'8px',borderRadius:8,border:'1px solid rgba(255,80,80,0.3)',background:'rgba(255,80,80,0.08)',color:'#ff6060',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'Satoshi,sans-serif' }}>
                Limpar filtros
              </button>
            )}
          </div>
        </>,
        document.body
      )}

      {/* Toast: Ctrl+V em pedidos selecionados */}
      {pasteTrackingMsg && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(20,20,20,0.95)', border: '1px solid rgba(200,255,0,0.35)',
          borderRadius: 12, padding: '12px 22px',
          color: '#c8ff00', fontSize: 13, fontWeight: 700,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 9999, pointerEvents: 'none',
          animation: 'fadeUp 0.25s ease both',
        }}>
          {pasteTrackingMsg}
        </div>
      )}
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
function StatCard({ label, value, sub, color, icon, featured, onClick, active }: {
  label: string; value: string; sub: string; color: string; icon: string; featured?: boolean; onClick?: () => void; active?: boolean;
}) {
  return (
    <div onClick={onClick} style={{
      background: featured
        ? `linear-gradient(135deg,rgba(200,255,0,0.10),rgba(200,255,0,0.04),rgba(255,255,255,0.05))`
        : active
          ? `linear-gradient(135deg,${color}18,${color}08,rgba(255,255,255,0.05))`
          : 'linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03),rgba(255,255,255,0.06))',
      backdropFilter: 'blur(32px)',
      border: featured ? '1px solid rgba(200,255,0,0.18)' : active ? `1px solid ${color}44` : '1px solid rgba(255,255,255,0.13)',
      borderTop: featured ? '1px solid rgba(200,255,0,0.35)' : active ? `1px solid ${color}88` : '1px solid rgba(255,255,255,0.22)',
      borderRadius: 16, padding: 22,
      position: 'relative', overflow: 'hidden',
      boxShadow: active ? `0 8px 32px ${color}22` : '0 8px 32px rgba(0,0,0,0.35)',
      transition: 'all 0.2s',
      cursor: onClick ? 'pointer' : 'default',
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
function OrderRow({ o, onRowClick, onStatusChange, onShippingChange, onMotoboyChange, onPaymentMethodChange, isSelected, onToggleSelect }: {
  o: Order;
  onRowClick: (o: Order) => void;
  onStatusChange: (id: string, status: OrderStatus) => void;
  onShippingChange: (id: string, shippingStatus: string) => void;
  onMotoboyChange: (id: string, motoboy: string) => void;
  onPaymentMethodChange: (id: string, method: 'mp' | 'cielo') => void;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const produtos = (o.items ?? []).map(i => `${i.productName ?? ''} — ${i.variantName ?? ''} ×${i.quantity ?? 0}`).join(' | ');
  const phone = o.customer?.phone?.replace(/\D/g, '');
  const frete = ((o as any).shippingStatus as FreteOption | undefined) ?? '🔴 Pendente';
  const freteColor =
    frete === '🟢 Entregue' ? '#4cff72' :
    frete === '🟡 A Caminho' ? '#ffe500' :
    frete === '🟠 Solicitado' ? '#ff8c00' :
    frete === '⛔ Cancelado' ? '#ff4d4d' : '#ff4d4d';

  return (
    <tr
      onClick={e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); onToggleSelect(o.id); } else { onRowClick(o); } }}
      style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', transition: 'background 0.15s', background: isSelected ? 'rgba(200,255,0,0.10)' : '', outline: isSelected ? '1px solid rgba(200,255,0,0.3)' : '' }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(200,255,0,0.06)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'rgba(200,255,0,0.10)' : ''; }}
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
      <td style={{ ...tdMono, fontWeight: 700, color: o.paidAmount != null ? '#4cff72' : '#4a4a4a' }}>
        {o.paidAmount != null ? fmtR(o.paidAmount) : '—'}
      </td>
      <td style={td} onClick={e => e.stopPropagation()}>
        {isPaid(o.status)
          ? (() => {
              const isMp = !!o.mpPaymentId;
              return (
                <span style={{ display:'inline-flex',flexDirection:'column',gap:2,padding:'5px 12px',borderRadius:8,fontSize:11,fontWeight:700,background:'rgba(200,255,0,0.1)',color:'#c8ff00',border:'1px solid rgba(200,255,0,0.2)',lineHeight:1.4 }}>
                  <span>✅ Pago</span>
                  <span style={{ fontSize:10,fontWeight:500,color:'#8a8a8a' }}>{isMp ? '🟡 Mercado Pago' : '🔵 Cielo'}</span>
                </span>
              );
            })()
          : o.status === 'CANCELLED'
            ? <span style={{ display:'inline-flex',gap:5,padding:'5px 12px',borderRadius:8,fontSize:11,fontWeight:700,background:'rgba(255,77,77,0.1)',color:'#ff4d4d',border:'1px solid rgba(255,77,77,0.2)' }}>❌ Cancelado</span>
            : (
              <div style={{ display:'flex',flexDirection:'column',gap:5 }}>
                <span style={{ fontSize:10,fontWeight:600,color:'#ffb545',marginBottom:2 }}>⏳ Pendente</span>
                <div style={{ display:'flex',gap:5 }}>
                  <button
                    onClick={() => onPaymentMethodChange(o.id, 'mp')}
                    style={{ padding:'4px 9px',borderRadius:7,background:'rgba(255,193,7,0.1)',border:'1px solid rgba(255,193,7,0.3)',color:'#ffc107',fontFamily:'Satoshi,sans-serif',fontSize:10,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',transition:'all 0.2s' }}
                    onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,193,7,0.22)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,193,7,0.1)')}>
                    🟡 Mercado Pago
                  </button>
                  <button
                    onClick={() => onPaymentMethodChange(o.id, 'cielo')}
                    style={{ padding:'4px 9px',borderRadius:7,background:'rgba(30,136,229,0.1)',border:'1px solid rgba(30,136,229,0.3)',color:'#42a5f5',fontFamily:'Satoshi,sans-serif',fontSize:10,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',transition:'all 0.2s' }}
                    onMouseEnter={e=>(e.currentTarget.style.background='rgba(30,136,229,0.22)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='rgba(30,136,229,0.1)')}>
                    🔵 Cielo
                  </button>
                </div>
              </div>
            )
        }
      </td>
      <td style={td} onClick={e => e.stopPropagation()}>
        {(() => {
          const motoboyVal = ((o as any).motoboy as MotoboyOption | undefined) ?? '⏳ Pendente';
          const motoboyColor = MOTOBOY_COLOR[motoboyVal] ?? '#ff4d4d';
          return (
            <AppleSelect
              value={motoboyVal}
              onChange={v => onMotoboyChange(o.id, v)}
              options={MOTOBOY_OPTIONS}
              color={motoboyColor}
            />
          );
        })()}
      </td>
      <td style={td} onClick={e => e.stopPropagation()}>
        <AppleSelect
          value={frete}
          onChange={v => onShippingChange(o.id, v)}
          options={FRETE_OPTIONS}
          color={freteColor}
        />
      </td>
      <td style={td} onClick={e => e.stopPropagation()}>
        {isPaid(o.status) && phone ? (() => {
          const waUrl = `https://wa.me/55${phone}?text=Que%20bom%20que%20concluiu%20seu%20pedido%20conosco!%0A%0ASegue%20o%20link%20para%20acompanhamento%3A%0A%0Ahttps%3A%2F%2Fwww.cheapcatalogo.com%2Facompanhar%2F${o.orderNumber}`;
          return (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 9,
                background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)',
                color: '#25d366', fontFamily: 'Satoshi,sans-serif', fontSize: 11, fontWeight: 700,
                textDecoration: 'none', whiteSpace: 'nowrap', transition: 'all 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(37,211,102,0.22)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(37,211,102,0.12)')}
            >
              💬 Notificar
            </a>
          );
        })() : <span style={{ color:'#6a6a6a',fontSize:11 }}>—</span>}
      </td>
    </tr>
  );
}

// ── Export CSV ──
function exportCSV(orders: Order[]) {
  const headers = ['Nº Pedido','Data/Hora','Nome','WhatsApp','Endereço','Produtos + Sabores','Valor Produtos (R$)','Frete (R$)','Total (R$)','Metodo de pagamento','Pagamento','Frete'];
  const rows = orders.map(o => {
    const produtos = (o.items ?? []).map(i => `${i.productName} - ${i.variantName} x${i.quantity}`).join(' | ');
    const metodo = o.mpPaymentId ? 'Mercado Pago' : 'Cielo';
    const pagamento = isPaid(o.status) ? 'Pago' : o.status === 'CANCELLED' ? 'Cancelado' : 'Pendente';
    const entrega = (o as any).shippingStatus ?? 'Pendente';
    return [
      o.orderNumber ?? '',
      o.createdAt ? fmtDate(o.createdAt) : '',
      o.customer?.name ?? '',
      o.customer?.phone ?? '',
      `${o.customer?.address ?? ''} ${o.customer?.city ?? ''}`.trim(),
      produtos,
      (o.subtotal ?? 0).toFixed(2).replace('.', ','),
      (o.shippingCost ?? 0).toFixed(2).replace('.', ','),
      (o.total ?? 0).toFixed(2).replace('.', ','),
      metodo,
      pagamento,
      entrega,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`);
  });

  const csv = [headers.map(h => `"${h}"`), ...rows].map(r => r.join(';')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pedidos_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── OrdersTable ──
function OrdersTable({ orders, loading, onRowClick, onStatusChange, onShippingChange, onMotoboyChange, onPaymentMethodChange, selectedIds, onToggleSelect, onClearSelection, filterButton }: {
  orders: Order[];
  loading: boolean;
  onRowClick: (o: Order) => void;
  onStatusChange: (id: string, status: OrderStatus) => void;
  onShippingChange: (id: string, shippingStatus: string) => void;
  onMotoboyChange: (id: string, motoboy: string) => void;
  onPaymentMethodChange: (id: string, method: 'mp' | 'cielo') => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onClearSelection: () => void;
  filterButton?: React.ReactNode;
}) {
  return (
    <div style={tableCard}>
      <div style={tableHead}>
        <span style={{ fontSize:13,fontWeight:800,color:'#fff' }}>Pedidos</span>
        <div style={{ display:'flex',alignItems:'center',gap:10 }}>
          {filterButton}
          {selectedIds.size > 0 && (
            <span style={{ display:'flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:8,background:'rgba(200,255,0,0.12)',border:'1px solid rgba(200,255,0,0.3)',fontSize:11,fontWeight:700,color:'#c8ff00' }}>
              {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
              <button onClick={onClearSelection} style={{ background:'none',border:'none',color:'#c8ff00',cursor:'pointer',fontSize:13,lineHeight:1,padding:0,marginLeft:2 }}>✕</button>
            </span>
          )}
          <span style={tableCount}>{orders.length} pedido{orders.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
      <div className="admin-table-wrap" style={{ overflowX:'auto',WebkitOverflowScrolling:'touch' } as any}>
        <table style={{ width:'100%',borderCollapse:'collapse' }}>
          <thead>
            <tr>
              {['Nº Pedido','Data/Hora','Cliente','WhatsApp','Endereço','Valor Frete','Produtos','Valor Produtos','Total','Valor Pago','Pagamento','Motoboy','Frete','Notificar'].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={14}><StateBox loading /></td></tr>
              : orders.length === 0
                ? <tr><td colSpan={14}><StateBox icon="🔍" text="Nenhum pedido encontrado." /></td></tr>
                : orders.map(o => <OrderRow key={o.id} o={o} onRowClick={onRowClick} onStatusChange={onStatusChange} onShippingChange={onShippingChange} onMotoboyChange={onMotoboyChange} onPaymentMethodChange={onPaymentMethodChange} isSelected={selectedIds.has(o.id)} onToggleSelect={onToggleSelect} />)
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
function OrderModal({ order: o, onClose, onStatusChange, onShippingChange, onMotoboyChange, onTrackingChange, onArchive }: {
  order: Order;
  onClose: () => void;
  onStatusChange: (id: string, status: OrderStatus) => Promise<void>;
  onShippingChange: (id: string, shippingStatus: string) => void;
  onMotoboyChange: (id: string, motoboy: string) => void;
  onTrackingChange: (id: string, trackingLink: string) => void;
  onArchive: (id: string, archived: boolean) => void;
}) {
  const [trackingInput, setTrackingInput] = React.useState<string>((o as any).trackingLink ?? '');
  const [trackingSaved, setTrackingSaved] = React.useState(false);

  const saveTracking = () => {
    if (trackingInput !== ((o as any).trackingLink ?? '')) {
      onTrackingChange(o.id, trackingInput);
      setTrackingSaved(true);
      setTimeout(() => setTrackingSaved(false), 2000);
    }
  };

  const produtos = o.items.map(i => `${i.productName} — ${i.variantName} ×${i.quantity}`);
  const frete = ((o as any).shippingStatus as FreteOption | undefined) ?? '🔴 Pendente';
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
        <div className="admin-modal-body" style={{ padding:'24px 28px',display:'flex',flexDirection:'column',gap:20 }}>

          {/* Identificação */}
          <div>
            <ModalSection label="Identificação" />
            <div className="admin-modal-grid2" style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
              <div style={{ gridColumn:'1/-1' }}><ModalField label="Nº Pedido" value={o.orderNumber} mono /></div>
              <ModalField label="Data / Hora" value={fmtDate(o.createdAt)} mono />
              <ModalField label="Pagamento via" value={o.mpPaymentId ? '🟡 Mercado Pago' : '🔵 Cielo'} />
            </div>
          </div>

          {/* Cliente */}
          <div>
            <ModalSection label="Cliente" />
            <div className="admin-modal-grid2" style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
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
            <div className="admin-modal-grid2" style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
              <ModalField label="Subtotal" value={fmtR(o.subtotal)} mono />
              <ModalField label="Frete" value={fmtR(o.shippingCost)} mono />
              <div style={{ gridColumn:'1/-1' }}><ModalField label="Total" value={fmtR(o.total)} mono lime big /></div>
            </div>
          </div>

          {/* Status */}
          <div>
            <ModalSection label="Status" />
            <div className="admin-modal-grid2" style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
              <div style={{ background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'12px 14px' }}>
                <div style={{ fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'#8a8a8a',marginBottom:8 }}>Motoboy</div>
                {(() => {
                  const motoboyVal = ((o as any).motoboy as MotoboyOption | undefined) ?? '⏳ Pendente';
                  const motoboyColor = MOTOBOY_COLOR[motoboyVal] ?? '#ff4d4d';
                  return (
                    <AppleSelect
                      value={motoboyVal}
                      onChange={v => onMotoboyChange(o.id, v)}
                      options={MOTOBOY_OPTIONS}
                      color={motoboyColor}
                    />
                  );
                })()}
              </div>
              <div style={{ background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'12px 14px' }}>
                <div style={{ fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'#8a8a8a',marginBottom:8 }}>Entrega</div>
                <AppleSelect
                  value={frete}
                  onChange={v => onShippingChange(o.id, v)}
                  options={FRETE_OPTIONS}
                  color={freteColor}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Link de Rastreio */}
        <div style={{ padding:'0 28px 20px' }}>
          <ModalSection label="Link de Rastreio" />
          <div style={{ display:'flex',gap:8,alignItems:'center' }}>
            <input
              type="text"
              value={trackingInput}
              onChange={e => setTrackingInput(e.target.value)}
              onBlur={saveTracking}
              onKeyDown={e => e.key === 'Enter' && saveTracking()}
              placeholder="Cole o link de rastreio aqui..."
              style={{
                flex:1, background:'rgba(255,255,255,0.04)',
                border:'1px solid rgba(255,255,255,0.12)', borderRadius:10,
                padding:'10px 14px', fontFamily:'Satoshi,sans-serif',
                fontSize:13, color:'#e0e0e0', outline:'none',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,255,0,0.4)')}
            />
            <button
              onClick={saveTracking}
              style={{ padding:'10px 16px',borderRadius:10,background:'rgba(200,255,0,0.1)',border:'1px solid rgba(200,255,0,0.25)',color:'#c8ff00',fontFamily:'Satoshi,sans-serif',fontSize:12,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',transition:'all 0.2s' }}
            >
              {trackingSaved ? '✅ Salvo' : 'Salvar'}
            </button>
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
          <button onClick={() => { onArchive(o.id, !(o as any).archived); onClose(); }}
            style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 20px',borderRadius:10,
              background:(o as any).archived ? 'rgba(200,255,0,0.08)' : 'rgba(255,181,69,0.08)',
              border:(o as any).archived ? '1px solid rgba(200,255,0,0.25)' : '1px solid rgba(255,181,69,0.25)',
              color:(o as any).archived ? '#c8ff00' : '#ffb545',
              fontFamily:'Satoshi,sans-serif',fontSize:13,fontWeight:700,cursor:'pointer',transition:'all 0.2s' }}>
            {(o as any).archived ? '📤 Desarquivar' : '📦 Arquivar'}
          </button>
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

// ── ProductModal ──
interface ProdVariantForm { _key: string; name: string; stock: string; priceOverride: string; active: boolean; image: string; }

function ProductModal({ mode, product, onSaved, onClose }: {
  mode: 'create' | 'edit';
  product?: Product;
  onSaved: (p: Product) => void;
  onClose: () => void;
}) {
  const emptyForm = { name:'', slug:'', brandId:'ignite', description:'', basePrice:'', puffs:'', images:'', active:true, variants:[] as ProdVariantForm[] };
  const [form, setForm] = React.useState(() => product ? {
    name: product.name,
    slug: product.slug,
    brandId: product.brandId,
    description: product.description,
    basePrice: String(product.basePrice),
    images: (product.images ?? []).join('\n'),
    puffs: product.puffs ?? '',
    active: product.active,
    variants: (product.variants ?? []).map(v => ({ _key: v.id || String(Math.random()), name: v.name, stock: String(v.stock), priceOverride: v.priceOverride != null ? String(v.priceOverride) : '', active: v.active, image: v.image ?? '' })),
  } : emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const [uploadingVariant, setUploadingVariant] = React.useState<Record<string, boolean>>({});
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const variantFileRefs = React.useRef<Record<string, HTMLInputElement | null>>({});
  const [brands, setBrands] = React.useState<{ id: string; name: string; color: string }[]>([...BRANDS_STATIC]);
  const [newBrand, setNewBrand] = React.useState<{ name: string; color: string } | null>(null);
  const [savingBrand, setSavingBrand] = React.useState(false);

  React.useEffect(() => {
    Promise.allSettled([
      apiFetch<{ id: string; name: string; color: string }[]>('/brands'),
      apiFetch<{ visibleBrands: string[]; customBrands: { id: string; label: string; color: string }[] }>('/config/brands-filter'),
    ]).then(([brandsRes, filterRes]) => {
      const staticIds = new Set(BRANDS_STATIC.map(b => b.id));

      // marcas do /brands (Firestore brands collection)
      const fromBrands: { id: string; name: string; color: string }[] =
        brandsRes.status === 'fulfilled' && brandsRes.value.length > 0
          ? brandsRes.value.filter(b => !staticIds.has(b.id))
          : [];

      // marcas customizadas do /config/brands-filter
      const fromFilter: { id: string; name: string; color: string }[] =
        filterRes.status === 'fulfilled'
          ? (filterRes.value.customBrands ?? [])
              .filter(b => !staticIds.has(b.id))
              .map(b => ({ id: b.id, name: b.label, color: b.color }))
          : [];

      // merge: fromFilter tem prioridade sobre fromBrands para evitar duplicatas
      const allExtraIds = new Set<string>();
      const allExtra: { id: string; name: string; color: string }[] = [];
      [...fromFilter, ...fromBrands].forEach(b => {
        if (!allExtraIds.has(b.id)) { allExtraIds.add(b.id); allExtra.push(b); }
      });

      setBrands([...BRANDS_STATIC, ...allExtra]);
    });
  }, []);

  async function saveNewBrand() {
    if (!newBrand?.name) return;
    setSavingBrand(true);
    try {
      const slug = newBrand.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const created = await apiFetch<{ id: string; name: string; color: string }>(
        '/brands',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newBrand.name, slug, color: newBrand.color, active: true }) }
      );
      setBrands(prev => [...prev, created]);
      setForm(f => ({ ...f, brandId: created.id }));
      setNewBrand(null);
    } catch { alert('Erro ao criar marca.'); }
    finally { setSavingBrand(false); }
  }

  const inp: React.CSSProperties = { width:'100%',boxSizing:'border-box',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:10,padding:'9px 12px',fontFamily:'Satoshi,sans-serif',fontSize:13,color:'#e0e0e0',outline:'none' };

  function autoSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function addVariant() {
    setForm(f => ({ ...f, variants: [...f.variants, { _key: String(Date.now()), name:'', stock:'0', priceOverride:'', active:true, image:'' }] }));
  }
  function removeVariant(key: string) {
    setForm(f => ({ ...f, variants: f.variants.filter(v => v._key !== key) }));
  }
  function updateVariant(key: string, field: keyof ProdVariantForm, value: string | boolean) {
    setForm(f => ({ ...f, variants: f.variants.map(v => v._key === key ? { ...v, [field]: value } : v) }));
  }

  async function save() {
    if (!form.name || !form.slug || !form.basePrice) { alert('Preencha nome, slug e preço.'); return; }
    setSaving(true);
    try {
      const images = form.images.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
      const variants = form.variants.map(v => ({ id: v._key, name: v.name, stock: parseInt(v.stock) || 0, priceOverride: v.priceOverride ? parseFloat(v.priceOverride) : undefined, active: v.active, image: v.image || undefined }));
      const body = { name: form.name, slug: form.slug, brandId: form.brandId, description: form.description, basePrice: parseFloat(form.basePrice) || 0, puffs: form.puffs || undefined, images, active: form.active, variants };
      const result = mode === 'create'
        ? await apiFetch<Product>('/products', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
        : await apiFetch<Product>(`/products/${product!.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      onSaved(result);
    } catch (e) {
      alert('Erro ao salvar: ' + (e instanceof Error ? e.message : 'desconhecido'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position:'fixed',inset:0,zIndex:200,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:24 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'linear-gradient(160deg,rgba(20,20,20,0.98),rgba(12,12,12,0.98))',border:'1px solid rgba(255,255,255,0.12)',borderRadius:20,width:'100%',maxWidth:680,maxHeight:'90vh',overflowY:'auto',animation:'modalIn 0.25s ease',boxShadow:'0 24px 80px rgba(0,0,0,0.6)' }}>
        {/* Header */}
        <div style={{ padding:'22px 28px 18px',borderBottom:'1px solid rgba(255,255,255,0.07)',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <div style={{ fontSize:15,fontWeight:800,color:'#fff' }}>{mode === 'create' ? '+ Novo Produto' : 'Editar Produto'}</div>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'#6a6a6a',fontSize:20,cursor:'pointer',lineHeight:1 }}>×</button>
        </div>

        <div style={{ padding:'22px 28px',display:'flex',flexDirection:'column',gap:16 }}>
          {/* Name + Slug */}
          <div className="admin-modal-grid2" style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
            <div>
              <label style={{ fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'#8a8a8a',display:'block',marginBottom:6 }}>Nome *</label>
              <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: mode === 'create' ? autoSlug(e.target.value) : f.slug }))} placeholder="ex: Ignite V600" />
            </div>
            <div>
              <label style={{ fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'#8a8a8a',display:'block',marginBottom:6 }}>Slug *</label>
              <input style={inp} value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="ex: ignite-v600" />
            </div>
          </div>

          {/* Brand + Price + Active */}
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,alignItems:'end' }}>
            <div>
              <label style={{ fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'#8a8a8a',display:'block',marginBottom:6 }}>Marca *</label>
              <AppleSelect
                value={form.brandId}
                onChange={v => {
                  if (v === '__nova__') { setNewBrand({ name:'', color:'#ffffff' }); }
                  else { setForm(f => ({ ...f, brandId: v })); setNewBrand(null); }
                }}
                options={[
                  ...brands.map(b => ({ value: b.id, label: b.name })),
                  { value: '__nova__', label: '➕ Nova marca...' },
                ]}
                triggerStyle={{ ...inp, cursor:'pointer', width:'100%' }}
              />
              {newBrand !== null && (
                <div style={{ marginTop:8,padding:'10px 12px',background:'rgba(200,255,0,0.05)',border:'1px solid rgba(200,255,0,0.2)',borderRadius:10,display:'flex',flexDirection:'column',gap:8 }}>
                  <div style={{ fontSize:10,fontWeight:700,color:'#c8ff00',letterSpacing:1,textTransform:'uppercase' }}>Nova Marca</div>
                  <input style={{ ...inp,padding:'8px 12px',fontSize:13 }} value={newBrand.name} onChange={e => setNewBrand(n => n ? { ...n, name: e.target.value } : n)} placeholder="Nome da marca" autoFocus />
                  <div style={{ display:'flex',gap:8,alignItems:'center' }}>
                    <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                      <span style={{ fontSize:10,color:'#8a8a8a',whiteSpace:'nowrap' }}>Cor</span>
                      <input type="color" value={newBrand.color} onChange={e => setNewBrand(n => n ? { ...n, color: e.target.value } : n)} style={{ width:36,height:32,padding:2,borderRadius:8,border:'1px solid rgba(255,255,255,0.12)',background:'transparent',cursor:'pointer' }} />
                    </div>
                    <button onClick={saveNewBrand} disabled={savingBrand || !newBrand.name} style={{ flex:1,padding:'8px 14px',borderRadius:8,background:'rgba(200,255,0,0.15)',border:'1px solid rgba(200,255,0,0.3)',color:'#c8ff00',fontFamily:'Satoshi,sans-serif',fontSize:12,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',opacity:!newBrand.name?0.5:1 }}>
                      {savingBrand ? '...' : 'Criar marca'}
                    </button>
                    <button onClick={() => setNewBrand(null)} style={{ background:'none',border:'none',color:'#6a6a6a',fontSize:18,cursor:'pointer',lineHeight:1 }}>×</button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'#8a8a8a',display:'block',marginBottom:6 }}>Preço Base (R$) *</label>
              <input style={inp} type="number" min="0" step="0.01" value={form.basePrice} onChange={e => setForm(f => ({ ...f, basePrice: e.target.value }))} placeholder="0.00" />
            </div>
            <div style={{ display:'flex',alignItems:'center',gap:10,paddingBottom:2 }}>
              <label style={{ fontSize:12,fontWeight:600,color:'#b0b0b0',cursor:'pointer',display:'flex',alignItems:'center',gap:8 }}>
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                Ativo
              </label>
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'#8a8a8a',display:'block',marginBottom:6 }}>Descrição</label>
            <textarea style={{ ...inp,minHeight:72,resize:'vertical' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição do produto..." />
          </div>

          {/* Puffs */}
          <div>
            <label style={{ fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'#8a8a8a',display:'block',marginBottom:6 }}>Puffs <span style={{ color:'#6a6a6a',fontWeight:400,textTransform:'none',letterSpacing:0 }}>(ex: 20K, 30.000 puffs)</span></label>
            <input style={inp} value={form.puffs} onChange={e => setForm(f => ({ ...f, puffs: e.target.value }))} placeholder="ex: 20K" />
          </div>

          {/* Images */}
          <div>
            <label style={{ fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'#8a8a8a',display:'block',marginBottom:6 }}>Imagem do Produto</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadingImage(true);
                try {
                  const compressed = await compressImage(file);
                  const fd = new FormData();
                  fd.append('file', compressed);
                  const res = await fetch(`${BASE}/upload/image`, {
                    method: 'POST',
                    headers: { 'x-auth-token': getAdminToken() },
                    body: fd,
                  });
                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                  const data: { url: string } = await res.json();
                  setForm(f => ({ ...f, images: data.url }));
                } catch {
                  alert('Erro ao fazer upload da imagem. Tente novamente.');
                } finally {
                  setUploadingImage(false);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              style={{ padding:'8px 16px',borderRadius:10,background:'rgba(200,255,0,0.08)',border:'1px solid rgba(200,255,0,0.25)',color:'#c8ff00',fontFamily:'Satoshi,sans-serif',fontSize:12,fontWeight:700,cursor:uploadingImage?'not-allowed':'pointer',opacity:uploadingImage?0.6:1,marginBottom:8 }}
            >
              {uploadingImage ? '⏳ Enviando...' : '📷 Upload de imagem'}
            </button>
            {form.images && (
              <img
                src={form.images}
                alt="Preview"
                style={{ width:'100%',maxHeight:200,objectFit:'contain',borderRadius:10,marginTop:4,marginBottom:8,background:'rgba(255,255,255,0.04)',display:'block' }}
              />
            )}
            <input
              style={{ ...inp,fontSize:11 }}
              value={form.images}
              onChange={e => setForm(f => ({ ...f, images: e.target.value }))}
              placeholder="Ou cole uma URL aqui..."
            />
          </div>

          {/* Variants */}
          <div>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10 }}>
              <label style={{ fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'#8a8a8a' }}>Sabores / Variantes ({form.variants.length})</label>
              <button onClick={addVariant} style={{ padding:'5px 12px',borderRadius:8,background:'rgba(200,255,0,0.1)',border:'1px solid rgba(200,255,0,0.25)',color:'#c8ff00',fontFamily:'Satoshi,sans-serif',fontSize:11,fontWeight:700,cursor:'pointer' }}>+ Adicionar</button>
            </div>
            {form.variants.length === 0 && (
              <div style={{ padding:'14px',textAlign:'center',fontSize:12,color:'#6a6a6a',background:'rgba(255,255,255,0.02)',borderRadius:10,border:'1px dashed rgba(255,255,255,0.1)' }}>Nenhum sabor ainda. Clique em "+ Adicionar".</div>
            )}
            <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
              {form.variants.map(v => {
                const isOutOfStock = v.active && parseInt(v.stock) <= 0;
                return (
                <div key={v._key} style={{ display:'flex',flexDirection:'column',gap:6,padding:'10px 12px',background: isOutOfStock ? 'rgba(255,77,77,0.06)' : 'rgba(255,255,255,0.03)',borderRadius:10,border: isOutOfStock ? '1px solid rgba(255,77,77,0.4)' : '1px solid rgba(255,255,255,0.07)' }}>
                  {isOutOfStock && (
                    <div style={{ fontSize:10,fontWeight:700,color:'#ff4d4d',letterSpacing:0.5 }}>SEM ESTOQUE</div>
                  )}
                  <div style={{ display:'grid',gridTemplateColumns:'2fr 80px 100px 60px 28px',gap:8,alignItems:'center' }}>
                    <input style={{ ...inp,padding:'6px 10px',fontSize:12 }} value={v.name} onChange={e => updateVariant(v._key,'name',e.target.value)} placeholder="Nome do sabor" />
                    <input style={{ ...inp,padding:'6px 10px',fontSize:12 }} type="number" min="0" value={v.stock} onChange={e => updateVariant(v._key,'stock',e.target.value)} placeholder="Estoque" />
                    <input style={{ ...inp,padding:'6px 10px',fontSize:12 }} type="number" min="0" step="0.01" value={v.priceOverride} onChange={e => updateVariant(v._key,'priceOverride',e.target.value)} placeholder="Preço (R$)" />
                    <label style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:5,fontSize:11,color:'#b0b0b0',cursor:'pointer' }}>
                      <input type="checkbox" checked={v.active} onChange={e => updateVariant(v._key,'active',e.target.checked)} />
                      Ativo
                    </label>
                    <button onClick={() => removeVariant(v._key)} style={{ background:'none',border:'none',color:'#ff4d4d',fontSize:16,cursor:'pointer',padding:0,lineHeight:1 }}>×</button>
                  </div>
                  <div style={{ display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' }}>
                    <span style={{ fontSize:10,color:'#6a6a6a',whiteSpace:'nowrap',fontWeight:600 }}>📷 Foto do sabor:</span>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display:'none' }}
                      ref={el => { variantFileRefs.current[v._key] = el; }}
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingVariant(prev => ({ ...prev, [v._key]: true }));
                        try {
                          const compressed = await compressImage(file);
                          const fd = new FormData();
                          fd.append('file', compressed);
                          const res = await fetch(`${BASE}/upload/image`, {
                            method: 'POST',
                            headers: { 'x-auth-token': getAdminToken() },
                            body: fd,
                          });
                          if (!res.ok) throw new Error(`HTTP ${res.status}`);
                          const data: { url: string } = await res.json();
                          updateVariant(v._key, 'image', data.url);
                        } catch {
                          alert('Erro ao fazer upload. Tente novamente.');
                        } finally {
                          setUploadingVariant(prev => ({ ...prev, [v._key]: false }));
                          const ref = variantFileRefs.current[v._key];
                          if (ref) ref.value = '';
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => variantFileRefs.current[v._key]?.click()}
                      disabled={uploadingVariant[v._key]}
                      style={{ padding:'4px 12px',borderRadius:8,background:'rgba(200,255,0,0.06)',border:'1px solid rgba(200,255,0,0.2)',color:'#c8ff00',fontFamily:'Satoshi,sans-serif',fontSize:11,fontWeight:700,cursor:uploadingVariant[v._key]?'not-allowed':'pointer',opacity:uploadingVariant[v._key]?0.6:1,whiteSpace:'nowrap' }}
                    >
                      {uploadingVariant[v._key] ? '⏳ Enviando...' : '📷 Upload'}
                    </button>
                    {v.image && (
                      <>
                        <img src={v.image} alt="" style={{ width:36,height:36,borderRadius:8,objectFit:'contain',border:'1px solid rgba(255,255,255,0.12)',flexShrink:0,background:'rgba(255,255,255,0.04)' }} onError={e => (e.currentTarget.style.display='none')} />
                        <button type="button" onClick={() => updateVariant(v._key,'image','')} style={{ background:'none',border:'none',color:'#ff4d4d',fontSize:16,cursor:'pointer',padding:0,lineHeight:1,flexShrink:0 }} title="Remover foto">×</button>
                      </>
                    )}
                  </div>
                </div>
              );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:'16px 28px 24px',display:'flex',gap:10,justifyContent:'flex-end',borderTop:'1px solid rgba(255,255,255,0.07)' }}>
          <button onClick={onClose} style={{ padding:'10px 20px',borderRadius:10,background:'transparent',border:'1px solid rgba(255,255,255,0.12)',color:'#b0b0b0',fontFamily:'Satoshi,sans-serif',fontSize:13,fontWeight:600,cursor:'pointer' }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ padding:'10px 24px',borderRadius:10,background:'rgba(200,255,0,0.12)',border:'1px solid rgba(200,255,0,0.3)',color:'#c8ff00',fontFamily:'Satoshi,sans-serif',fontSize:13,fontWeight:700,cursor:'pointer',opacity:saving?0.6:1 }}>
            {saving ? 'Salvando...' : mode === 'create' ? 'Criar Produto' : 'Salvar Alterações'}
          </button>
        </div>
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

  /* ── MOBILE ── */
  @media (max-width: 767px) {
    /* Topbar: recuo para hamburger + esconde texto secundário */
    .admin-topbar {
      padding: 0 14px 0 56px !important;
      gap: 8px !important;
    }
    .admin-topbar .admin-btn-refresh span,
    .admin-topbar .admin-btn-refresh svg + * { display:none; }
    .admin-btn-refresh { padding: 9px 12px !important; border-radius:10px !important; }

    /* Busca no topbar da página Pedidos: esconder em telas muito pequenas */
    .admin-topbar > div[style*="maxWidth:400"] { display:none !important; }

    /* Modal: padding reduzido */
    .admin-modal-body { padding: 14px 14px !important; }

    /* Modal grids: colapsar para 1 coluna */
    .admin-modal-grid2 { grid-template-columns: 1fr !important; }

    /* Tabelas: scroll horizontal suave */
    .admin-table-wrap { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
  }
`;
