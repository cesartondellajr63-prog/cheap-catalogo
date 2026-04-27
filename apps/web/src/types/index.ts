export interface Brand {
  id: string;
  name: string;
  slug: string;
  color: string;
  logoUrl?: string;
  active: boolean;
}

export interface ProductVariant {
  id: string;
  name: string;
  stock: number;
  priceOverride?: number;
  active: boolean;
  image?: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  brandId: string;
  brand?: Brand;
  description: string;
  basePrice: number;
  images: string[];
  active: boolean;
  variants: ProductVariant[];
  puffs?: string;
  dual?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CartItem {
  productId: string;
  productName: string;
  brandId: string;
  variantId: string;
  variantName: string;
  price: number;
  qty: number;
}

export type OrderStatus = 'PENDING' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';

export interface OrderItem {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId?: string;
  status: OrderStatus;
  customer: {
    name: string;
    phone: string;
    email?: string;
    address: string;
    city: string;
    lat?: number;
    lng?: number;
  };
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  total: number;
  mpPreferenceId?: string;
  mpPaymentId?: string;
  paidAmount?: number;
  paymentMethod: 'PIX' | 'CARD' | 'BOLETO';
  createdAt: string;
  updatedAt: string;
}

export interface ShippingQuoteResult {
  price: number;
  priceFormatted: string;
  expiresAt: number;
  shippingToken: string;
}

export interface PaymentResult {
  checkoutUrl: string;
  preferenceId: string;
  accessToken: string;
  orderId: string;
  orderNumber: string;
}

export interface PaymentStatus {
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  orderId: string;
  orderNumber?: string;
}

export interface LoginResult {
  token: string;
  user: { usuario: string; role: string };
}

// Static data matching existing catalog
export const BRANDS_STATIC: Brand[] = [
  { id: 'ignite',     name: 'Ignite',      slug: 'ignite',      color: '#ff6a00', active: true },
  { id: 'elfbar',     name: 'Elfbar',      slug: 'elfbar',      color: '#3b9eff', active: true },
  { id: 'lostmary',   name: 'Lost Mary',   slug: 'lostmary',    color: '#ff4e6a', active: true },
  { id: 'blacksheep', name: 'Black Sheep', slug: 'blacksheep',  color: '#888888', active: true },
  { id: 'oxbar',      name: 'Oxbar',       slug: 'oxbar',       color: '#a855f7', active: true },
  { id: 'hqd',        name: 'HQD',         slug: 'hqd',         color: '#00c9a7', active: true },
  { id: 'nikbar',     name: 'Nikbar',      slug: 'nikbar',      color: '#e040fb', active: true },
  { id: 'dinnerlady', name: 'Dinner Lady', slug: 'dinnerlady',  color: '#f06292', active: true },
  { id: 'rabbeats',   name: 'Rabbeats',    slug: 'rabbeats',    color: '#ffca28', active: true },
];

export const BRAND_GRADIENTS: Record<string, string> = {
  elfbar:     'linear-gradient(135deg,#0a1628 0%,#1a3a6e 100%)',
  lostmary:   'linear-gradient(135deg,#1a0a0a 0%,#5a1a2a 100%)',
  blacksheep: 'linear-gradient(135deg,#111 0%,#2a2a2a 100%)',
  oxbar:      'linear-gradient(135deg,#120a1a 0%,#3a1a6e 100%)',
  ignite:     'linear-gradient(135deg,#1a0a00 0%,#5a2000 100%)',
};

export const BRAND_ICONS: Record<string, string> = {
  elfbar: '⚡', lostmary: '💀', blacksheep: '🖤', oxbar: '🟣', ignite: '🔥',
};
