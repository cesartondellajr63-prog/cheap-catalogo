'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

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

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string; icon: string; description: string }> = {
  PENDING:   { label: 'Aguardando Pagamento', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-300', icon: '⏳', description: 'Seu pagamento ainda está sendo processado.' },
  PAID:      { label: 'Pagamento Confirmado',  color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-300',   icon: '✅', description: 'Pagamento aprovado! Estamos preparando seu pedido.' },
  SHIPPED:   { label: 'Em Entrega',            color: 'text-orange-700', bg: 'bg-orange-50 border-orange-300', icon: '🚚', description: 'Seu pedido está a caminho!' },
  DELIVERED: { label: 'Entregue',              color: 'text-green-700',  bg: 'bg-green-50 border-green-300',  icon: '📦', description: 'Pedido entregue com sucesso. Aproveite!' },
  CANCELLED: { label: 'Cancelado',             color: 'text-red-700',    bg: 'bg-red-50 border-red-300',     icon: '❌', description: 'Este pedido foi cancelado.' },
  REFUNDED:  { label: 'Reembolsado',           color: 'text-gray-700',   bg: 'bg-gray-50 border-gray-300',   icon: '↩️', description: 'O valor foi estornado para você.' },
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
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/orders/track/${numero}`,
        { cache: 'no-store' },
      );
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

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Polling a cada 30s para atualizar status em tempo real
  useEffect(() => {
    const interval = setInterval(fetchOrder, 30_000);
    return () => clearInterval(interval);
  }, [fetchOrder]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 animate-pulse">Buscando seu pedido...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <p className="text-4xl mb-4">😕</p>
          <p className="text-gray-700 font-medium">{error}</p>
          <a href="/" className="mt-4 inline-block text-sm text-blue-600 underline">
            Voltar ao catálogo
          </a>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PENDING;

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Cabeçalho */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Cheap Pods</h1>
          <p className="text-sm text-gray-500 mt-1">Acompanhamento de Pedido</p>
        </div>

        {/* Identificação */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Número do pedido</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{order.orderNumber}</p>
          <p className="text-sm text-gray-500 mt-1">Realizado em {formatDate(order.createdAt)}</p>
          <p className="text-sm text-gray-700 mt-2">
            Olá, <span className="font-medium">{order.customerName}</span>!
          </p>
        </div>

        {/* Itens do pedido */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Itens do pedido</p>
          <ul className="space-y-2">
            {order.items.map((item, i) => (
              <li key={i} className="flex justify-between text-sm">
                <span className="text-gray-700">
                  {item.quantity}x {item.productName}
                  {item.variantName && (
                    <span className="text-gray-400"> — {item.variantName}</span>
                  )}
                </span>
                <span className="text-gray-900 font-medium">
                  {formatCurrency(item.unitPrice * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t border-gray-100 mt-3 pt-3 space-y-1">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>Frete</span>
              <span>{formatCurrency(order.shippingCost)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-gray-900">
              <span>Total</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Endereço */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Endereço de entrega</p>
          <p className="text-sm text-gray-800">{order.address}</p>
          <p className="text-sm text-gray-500">{order.city}</p>
        </div>

        {/* Status — destaque */}
        <div className={`rounded-2xl border-2 p-5 ${statusCfg.bg}`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{statusCfg.icon}</span>
            <div>
              <p className={`text-xs uppercase tracking-wider font-semibold ${statusCfg.color}`}>
                Status do pedido
              </p>
              <p className={`text-lg font-bold ${statusCfg.color}`}>{statusCfg.label}</p>
            </div>
          </div>
          <p className={`text-sm mt-3 ${statusCfg.color} opacity-80`}>{statusCfg.description}</p>

          {(order.motoboy || order.shippingStatus || order.trackingLink) && (
            <div className="mt-4 pt-4 border-t border-current border-opacity-20 space-y-2">
              {order.shippingStatus && (
                <p className={`text-sm ${statusCfg.color}`}>
                  <span className="font-medium">Entrega:</span> {order.shippingStatus}
                </p>
              )}
              {order.motoboy && (
                <p className={`text-sm ${statusCfg.color}`}>
                  <span className="font-medium">Entregador:</span> {order.motoboy}
                </p>
              )}
              {order.trackingLink && (
                <a
                  href={order.trackingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 text-sm font-semibold underline ${statusCfg.color}`}
                >
                  🔗 Rastrear entrega em tempo real
                </a>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400">
          Esta página atualiza automaticamente a cada 30 segundos.
        </p>

        <a href="/" className="block text-center text-sm text-blue-600 underline pb-8">
          Voltar ao catálogo
        </a>

      </div>
    </main>
  );
}
