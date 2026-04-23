'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { BRANDS_DATA, BRAND_GRADIENTS, BRAND_ICONS } from '@/lib/catalog-data';
import { loadCart, saveCart, getCartCount } from '@/lib/cart';
import { fmtBRLFromDecimal, api } from '@/lib/api';
import type { CartItem, Product } from '@/types';
import CheckoutModal from '@/components/catalog/CheckoutModal';

export default function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedFlavor, setSelectedFlavor] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [toast, setToast] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const updateCart = useCallback((newCart: CartItem[]) => {
    setCart(newCart);
    saveCart(newCart);
  }, []);

  useEffect(() => {
    setCart(loadCart());
    api.products.getBySlug(slug)
      .then(p => {
        setProduct(p);
        const active = (p.variants ?? []).filter(v => v.active !== false && (v.stock ?? 1) > 0);
        if (active.length === 1) setSelectedFlavor(active[0].name);
        const urls = new Set<string>();
        (p.images ?? []).forEach(u => u && urls.add(u));
        active.forEach(v => { if (v.image) urls.add(v.image); });
        urls.forEach(u => { const img = new Image(); img.src = u; });
      })
      .catch(() => router.replace('/'))
      .finally(() => setLoading(false));
  }, [slug, router]);

  // Redireciona para home se loja fechar enquanto usuário está na página
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      api.store.get()
        .then(s => { if (!cancelled && !s.isOpen) router.replace('/'); })
        .catch(() => {});
    };
    check();
    const interval = setInterval(check, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [router]);

  if (loading) return null;
  if (!product) return null;

  const brand = BRANDS_DATA.find(b => b.id === product.brandId) ?? BRANDS_DATA[0];
  const activeFlavors = (product.variants ?? []).filter(v => v.active !== false && (v.stock ?? 1) > 0);
  const count = getCartCount(cart);

  const selectedVariant = activeFlavors.find(v => v.name === selectedFlavor);
  const displayImage = selectedVariant?.image || (product.images ?? [])[0] || null;

  const addToCart = () => {
    if (!selectedFlavor) return;
    const variant = activeFlavors.find(v => v.name === selectedFlavor);
    const variantId = variant?.id ?? `${product.slug}__${selectedFlavor}`;
    const price = variant?.priceOverride ?? product.basePrice;
    const newCart = [...cart];
    const existing = newCart.find(i => i.productId === product.slug && i.variantId === variantId);
    if (existing) {
      existing.qty += qty;
    } else {
      newCart.push({
        productId: product.slug,
        productName: product.name,
        brandId: product.brandId,
        variantId,
        variantName: selectedFlavor,
        price,
        qty,
      });
    }
    saveCart(newCart);
    setCart(newCart);
    setToast(`Adicionado: ${product.name} — ${selectedFlavor}`);
    setTimeout(() => setToast(''), 2000);
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <a className="back-btn" href="/">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Voltar
          </a>
          <a className="topbar-logo" href="/" style={{ textDecoration:'none', color:'inherit' }}>Cheap<span>.</span>Pods</a>
          <div className="cart-pill" onClick={() => count > 0 && setCheckoutOpen(true)}>
            🛒 <span className="cart-pill-count">{count}</span>
          </div>
        </div>
      </div>

      <div className="product-page">
        <div className="product-left">
          <div className="product-img" style={{ background: displayImage ? 'transparent' : BRAND_GRADIENTS[product.brandId], transition: 'background 0.3s' }}>
            {displayImage ? (
              <img
                src={displayImage}
                alt={product.name}
                style={{ width:'100%', height:'100%', objectFit:'contain', display:'block', maxWidth:'100%' }}
              />
            ) : (
              <div className="product-img-placeholder">
                <div className="placeholder-big-icon">{BRAND_ICONS[product.brandId]}</div>
              </div>
            )}
            <div className="product-img-overlay" style={{ opacity: displayImage ? 0.15 : 1 }}></div>
            <div className="product-tags">
              <span className="product-brand-tag">
                <span className="product-brand-dot" style={{ background: brand.color }}></span>
                {brand.label}
              </span>
              <span className="product-puffs-tag">{product.puffs} puffs</span>
            </div>
          </div>
          {product.description && (
            <div className="product-description product-description-desktop">{product.description}</div>
          )}
        </div>

        <div className="product-right">
          <div className="product-info">
            <h1 className="product-name">{product.name}</h1>
            {product.description && (
              <div className="product-description-mobile">{product.description}</div>
            )}
            <div className="product-meta">
              <span className="product-brand-label">Marca: <b>{brand.label}</b></span>
              <span className="meta-sep">•</span>
              <span className="product-brand-label">{activeFlavors.length} sabor{activeFlavors.length > 1 ? 'es' : ''}</span>
            </div>
            <div className="product-price">{fmtBRLFromDecimal(product.basePrice)}</div>
            <div className="product-price-note">por unidade · frete calculado no checkout</div>
          </div>

          <div className="flavor-section">
            <div className="flavor-title">Escolha o sabor</div>
            <div className="flavor-subtitle">Selecione uma opção abaixo</div>
            <div className="flavor-grid">
              {activeFlavors.map(v => (
                <div
                  key={v.name}
                  className={`flavor-item${selectedFlavor === v.name ? ' selected' : ''}`}
                  onClick={() => setSelectedFlavor(v.name)}
                >
                  <div className="flavor-radio">
                    <div className="flavor-radio-dot"></div>
                  </div>
                  <span className="flavor-name">{v.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="add-section">
            <div className="qty-row">
              <span className="qty-label">Quantidade</span>
              <div className="qty-control">
                <button className="qty-btn" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
                <span className="qty-num">{qty}</span>
                <button className="qty-btn" onClick={() => setQty(q => q + 1)}>+</button>
              </div>
            </div>
            <button
              className="add-btn"
              disabled={!selectedFlavor}
              onClick={addToCart}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
              {selectedFlavor ? 'Adicionar ao carrinho' : 'Selecione um sabor'}
            </button>
          </div>
        </div>
      </div>

      <div className={`toast${toast ? ' show' : ''}`}>
        <span className="toast-check">✓</span>
        <span>{toast}</span>
      </div>

      {count > 0 && (
        <button className="cart-fab visible" onClick={() => setCheckoutOpen(true)}>
          🛒
          <div className="cart-fab-count">{count}</div>
        </button>
      )}

      {checkoutOpen && (
        <CheckoutModal
          cart={cart}
          onClose={() => setCheckoutOpen(false)}
          onUpdateCart={updateCart}
        />
      )}
    </>
  );
}
