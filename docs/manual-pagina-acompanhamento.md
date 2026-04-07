# Manual de Implementação — Página de Acompanhamento de Pedido

## Visão Geral

O cliente, após confirmar o pagamento, recebe um link para `/acompanhar/[numeroPedido]`.
Essa página exibe em tempo real: itens do pedido, endereço de entrega e o status atual —
incluindo informações de frete (motoboy, link de rastreio) vindas diretamente do banco de dados.

---

## O que será criado

| # | O quê | Onde |
|---|-------|------|
| 1 | Endpoint público de rastreio | `apps/api/src/modules/orders/orders.controller.ts` |
| 2 | Página de acompanhamento | `apps/web/src/app/acompanhar/[numero]/page.tsx` |
| 3 | Link na tela de confirmação | `apps/web/src/app/pedido/[id]/page.tsx` |

---

## Parte 1 — Backend

### 1.1 Novo endpoint: `GET /orders/track/:orderNumber`

**Arquivo:** `apps/api/src/modules/orders/orders.controller.ts`

Adicionar após os endpoints existentes:

```typescript
@Get('track/:orderNumber')
async trackOrder(@Param('orderNumber') orderNumber: string) {
  const order = await this.ordersService.findByOrderNumber(orderNumber);

  // Retorna apenas os campos necessários — sem dados internos sensíveis
  return {
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    address: order.address,
    city: order.city,
    items: order.items,
    subtotal: order.subtotal,
    shippingCost: order.shippingCost,
    total: order.total,
    status: order.status,
    shippingStatus: order.shippingStatus ?? null,
    trackingLink: order.trackingLink ?? null,
    motoboy: order.motoboy ?? null,
    createdAt: order.createdAt,
  };
}
```

**Importante:**
- Este endpoint é **público** (sem guard JWT) — o número do pedido `CP-XXXXXXXX` já funciona como token de acesso por ser imprevisível.
- Não retornar: `id`, `mpPaymentId`, `mpPreferenceId`, `customerPhone`, `customerEmail`.
- O método `findByOrderNumber` já existe em `orders.service.ts` — não precisa criar nada novo no service.

**Onde adicionar no controller:** Antes dos endpoints que exigem autenticação (JwtAuthGuard), para que o guard não bloqueie esta rota.

---

## Parte 2 — Frontend

### 2.1 Nova página: `/acompanhar/[numero]`

**Criar arquivo:** `apps/web/src/app/acompanhar/[numero]/page.tsx`

#### Estrutura da página

```
┌─────────────────────────────────────┐
│  Logo / Cheap Pods                  │
├─────────────────────────────────────┤
│  Pedido #CP-XXXXXXXX                │
│  Feito em: 07/04/2026 às 14:32      │
├─────────────────────────────────────┤
│  ITENS DO PEDIDO                    │
│  ┌────────────────────────────────┐ │
│  │ 2x Pod XPTO — R$ 59,90         │ │
│  │ 1x Pod ABC  — R$ 39,90         │ │
│  └────────────────────────────────┘ │
│  Subtotal: R$ 159,70                │
│  Frete:    R$ 15,00                 │
│  Total:    R$ 174,70                │
├─────────────────────────────────────┤
│  ENDEREÇO DE ENTREGA                │
│  Rua das Flores, 123 — Vila Nova    │
│  São Paulo / SP                     │
├─────────────────────────────────────┤
│  ╔═══════════════════════════════╗  │
│  ║  STATUS: EM ENTREGA  🚚       ║  │
│  ║  Motoboy: João                ║  │
│  ║  [🔗 Rastrear entrega]        ║  │
│  ╚═══════════════════════════════╝  │
└─────────────────────────────────────┘
```

#### Código completo

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

// ─── Tipos ───────────────────────────────────────────────────────────────────

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

// ─── Helpers de status ───────────────────────────────────────────────────────

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string; icon: string; description: string }> = {
  PENDING:   { label: 'Aguardando Pagamento', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-300', icon: '⏳', description: 'Seu pagamento ainda está sendo processado.' },
  PAID:      { label: 'Pagamento Confirmado', color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-300',   icon: '✅', description: 'Pagamento aprovado! Estamos preparando seu pedido.' },
  SHIPPED:   { label: 'Em Entrega',           color: 'text-orange-700', bg: 'bg-orange-50 border-orange-300', icon: '🚚', description: 'Seu pedido está a caminho!' },
  DELIVERED: { label: 'Entregue',             color: 'text-green-700',  bg: 'bg-green-50 border-green-300',  icon: '📦', description: 'Pedido entregue com sucesso. Aproveite!' },
  CANCELLED: { label: 'Cancelado',            color: 'text-red-700',    bg: 'bg-red-50 border-red-300',     icon: '❌', description: 'Este pedido foi cancelado.' },
  REFUNDED:  { label: 'Reembolsado',          color: 'text-gray-700',   bg: 'bg-gray-50 border-gray-300',   icon: '↩️', description: 'O valor foi estornado para você.' },
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
        { cache: 'no-store' }
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

  // Busca inicial
  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Polling a cada 30s para atualizar status em tempo real
  useEffect(() => {
    const interval = setInterval(fetchOrder, 30_000);
    return () => clearInterval(interval);
  }, [fetchOrder]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 animate-pulse">Buscando seu pedido...</p>
      </div>
    );
  }

  // ── Erro ──
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
          <p className="text-sm text-gray-700 mt-2">Olá, <span className="font-medium">{order.customerName}</span>!</p>
        </div>

        {/* Itens do pedido */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Itens do pedido</p>
          <ul className="space-y-2">
            {order.items.map((item, i) => (
              <li key={i} className="flex justify-between text-sm">
                <span className="text-gray-700">
                  {item.quantity}x {item.productName}
                  {item.variantName && <span className="text-gray-400"> — {item.variantName}</span>}
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
              <p className={`text-xs uppercase tracking-wider font-semibold ${statusCfg.color}`}>Status do pedido</p>
              <p className={`text-lg font-bold ${statusCfg.color}`}>{statusCfg.label}</p>
            </div>
          </div>
          <p className={`text-sm mt-3 ${statusCfg.color} opacity-80`}>{statusCfg.description}</p>

          {/* Informações de frete (quando disponíveis) */}
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

        {/* Atualização automática */}
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
```

---

### 2.2 Link na tela de confirmação de pagamento

**Arquivo:** `apps/web/src/app/pedido/[id]/page.tsx`

Quando o status do pagamento for `approved`, adicionar o link de acompanhamento.

Localizar o bloco que renderiza o estado de pagamento aprovado e inserir:

```typescript
// Dentro do bloco de status "approved", após o título de confirmação:
{status === 'approved' && pedidoData?.orderNumber && (
  <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-center">
    <p className="text-sm text-blue-700 font-medium mb-2">
      Acompanhe o seu pedido em tempo real:
    </p>
    <a
      href={`/acompanhar/${pedidoData.orderNumber}`}
      className="inline-block bg-blue-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors"
    >
      📦 Acompanhar Pedido {pedidoData.orderNumber}
    </a>
  </div>
)}
```

**O campo `orderNumber`** já é salvo em `pedidoData` (vindo do `sessionStorage/localStorage` como `pedidoAtual.orderNumber`). Confirme que está sendo lido corretamente na página antes de renderizar o link.

---

## Parte 3 — Variáveis de ambiente

Verificar que o frontend tem acesso à URL da API:

**Arquivo:** `apps/web/.env.local`

```env
NEXT_PUBLIC_API_URL=https://cheap-catalogo.onrender.com
```

Em desenvolvimento local:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## Resumo de arquivos a criar/editar

| Ação | Arquivo |
|------|---------|
| **Criar** | `apps/web/src/app/acompanhar/[numero]/page.tsx` |
| **Editar** | `apps/api/src/modules/orders/orders.controller.ts` (novo endpoint) |
| **Editar** | `apps/web/src/app/pedido/[id]/page.tsx` (link de rastreio) |
| **Verificar** | `apps/web/.env.local` (variável `NEXT_PUBLIC_API_URL`) |

---

## Ordem de implementação recomendada

1. Adicionar o endpoint `GET /orders/track/:orderNumber` no backend
2. Testar o endpoint manualmente: `GET /orders/track/CP-XXXXXXXX`
3. Criar a página `/acompanhar/[numero]/page.tsx`
4. Testar a página em desenvolvimento com um número de pedido real
5. Adicionar o link na tela de confirmação (`/pedido/[id]`)
6. Deploy (push → Render/Vercel fazem o resto automaticamente)

---

## Comportamento esperado por status

| Status do pedido | O que o cliente vê |
|------------------|--------------------|
| `PENDING` | ⏳ Aguardando Pagamento — sem info de frete |
| `PAID` | ✅ Pagamento Confirmado — sem info de frete ainda |
| `SHIPPED` | 🚚 Em Entrega — exibe motoboy, shippingStatus e link de rastreio se disponíveis |
| `DELIVERED` | 📦 Entregue |
| `CANCELLED` | ❌ Cancelado |
| `REFUNDED` | ↩️ Reembolsado |

---

## Segurança

- O número do pedido (`CP-XXXXXXXX`) tem **8 caracteres alfanuméricos** — ~2,8 trilhões de combinações. Suficientemente imprevisível para uso público.
- O endpoint não expõe telefone, e-mail, IDs internos de pagamento nem chaves do Firebase.
- Não há sessão ou autenticação necessária — o número do pedido é o "token".
- Caso queira adicionar uma camada extra no futuro: solicitar os últimos 4 dígitos do telefone para confirmar identidade.
