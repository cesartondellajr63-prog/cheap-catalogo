import type {
  Product,
  ShippingQuoteResult,
  PaymentResult,
  PaymentStatus,
  LoginResult,
  Order,
} from '@/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  products: {
    list: (): Promise<Product[]> =>
      request('/products'),
    getBySlug: (slug: string): Promise<Product> =>
      request(`/products/${slug}`),
  },

  shipping: {
    quote: (body: { zipCode: string; address: string }): Promise<ShippingQuoteResult> =>
      request('/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
  },

  payments: {
    createPix: (body: {
      orderId: string;
      items: { model: string; flavor: string; price: number; qty: number }[];
      shippingPrice: number;
      customerEmail: string;
      customerName: string;
      customerPhone: string;
      address: string;
      city: string;
    }): Promise<PaymentResult> =>
      request('/payments/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    getStatus: (orderId: string, accessToken: string): Promise<PaymentStatus> =>
      request(`/payments/status/${orderId}?accessToken=${encodeURIComponent(accessToken)}`),
    getCardStatus: (orderId: string): Promise<{ status: string; orderNumber: string }> =>
      request(`/payments/card-status/${orderId}`),
    createCard: (body: {
      items: { name: string; flavor: string; price: number; qty: number }[];
      shippingPrice: number;
      customerName: string;
      customerEmail: string;
      customerPhone: string;
      rua: string;
      numero: string;
      complemento?: string;
      bairro: string;
      cidade: string;
      estado: string;
      cep: string;
    }): Promise<{ checkoutUrl: string; orderId: string; orderNumber: string }> =>
      request('/payments/card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
  },

  orders: {
    create: (body: {
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      address: string;
      city: string;
      shippingCost: number;
      items: { productId: string; variantId: string; quantity: number }[];
    }): Promise<Order> =>
      request('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    getById: (id: string): Promise<Order> =>
      request(`/orders/${id}`),
    list: (token: string): Promise<Order[]> =>
      request('/orders', { headers: { 'x-auth-token': token } }),
    updateStatus: (id: string, status: string, token: string): Promise<Order> =>
      request(`/orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ status }),
      }),
  },

  admin: {
    login: (body: { usuario: string; senha: string }): Promise<LoginResult> =>
      request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
  },
};

export function fmtBRL(centavos: number): string {
  return 'R$ ' + (centavos / 100).toFixed(2).replace('.', ',');
}

export function fmtBRLFromDecimal(value: number): string {
  return 'R$ ' + value.toFixed(2).replace('.', ',');
}
