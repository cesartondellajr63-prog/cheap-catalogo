'use client';

import { useState, useEffect, use, useCallback, useRef } from 'react';
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

  const [ageConfirmed, setAgeConfirmed] = useState<boolean | null>(null);
  const [selectedFlavor, setSelectedFlavor] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [toast, setToast] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const flavorGridRef = useRef<HTMLDivElement>(null);

  const updateCart = useCallback((newCart: CartItem[]) => {
    setCart(newCart);
    saveCart(newCart);
  }, []);

  useEffect(() => {
    setCart(loadCart());
    const confirmed = sessionStorage.getItem('age_confirmed');
    if (confirmed === 'true') setAgeConfirmed(true);
    else if (confirmed === 'false') setAgeConfirmed(false);
    else setAgeConfirmed(null);
  }, []);

  useEffect(() => {
    api.products.getBySlug(slug)
      .then(p => {
        setProduct(p);
        const active = (p.variants ?? []).filter(v => v.active !== false && (v.stock ?? 1) > 0);
        if (active.length === 1) setSelectedFlavor(active[0].name);
        const urls: string[] = [];
        const seen = new Set<string>();
        const add = (u: string) => { if (u && !seen.has(u)) { seen.add(u); urls.push(u); } };
        active.forEach(v => { if (v.image) add(v.image); });
        (p.images ?? []).forEach(u => add(u));
        const preloadNext = (i: number) => {
          if (i >= urls.length) return;
          const img = new Image();
          img.onload = img.onerror = () => preloadNext(i + 1);
          img.src = urls[i];
        };
        preloadNext(0);
      })
      .catch(() => router.replace('/'))
      .finally(() => setLoading(false));
  }, [slug, router]);

  useEffect(() => {
    const grid = flavorGridRef.current;
    if (!grid) return;
    const measure = () => {
      if (window.innerWidth <= 699) {
        grid.style.removeProperty('--flavor-min-width');
        return;
      }
      grid.style.removeProperty('--flavor-min-width');
      requestAnimationFrame(() => {
        const items = grid.querySelectorAll<HTMLElement>('.flavor-item');
        let max = 0;
        items.forEach(it => { if (it.offsetWidth > max) max = it.offsetWidth; });
        if (max > 0) grid.style.setProperty('--flavor-min-width', `${max}px`);
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [product]);

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

  const confirmAge = (yes: boolean) => {
    sessionStorage.setItem('age_confirmed', yes ? 'true' : 'false');
    setAgeConfirmed(yes);
  };

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
      {/* Age Gate */}
      {ageConfirmed === null && (
        <div className="age-gate">
          <div className="age-gate-box">
            <div className="age-gate-icon">🔞</div>
            <div className="age-gate-title">Verificação de Idade</div>
            <div className="age-gate-text">
              Este site vende <b>pods e cigarros eletrônicos</b>, produtos destinados exclusivamente a maiores de 18 anos.<br /><br />
              Você tem 18 anos ou mais?
            </div>
            <div className="age-gate-btns">
              <button className="age-gate-yes" onClick={() => confirmAge(true)}>✅ Sim, tenho 18 anos ou mais</button>
              <button className="age-gate-no" onClick={() => confirmAge(false)}>Não, sou menor de idade</button>
            </div>
            <div className="age-gate-note">Ao continuar, você confirma ter idade legal para adquirir estes produtos.</div>
          </div>
        </div>
      )}

      {ageConfirmed === false && (
        <div className="age-blocked show">
          <div className="age-blocked-box">
            <div className="age-blocked-icon">🚫</div>
            <div className="age-blocked-title">Acesso Restrito</div>
            <div className="age-blocked-text">
              Desculpe, este site é exclusivo para maiores de 18 anos.<br /><br />
              A venda de pods e cigarros eletrônicos para menores de idade é proibida por lei.
            </div>
          </div>
        </div>
      )}

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
        <div className="product-info-mobile-top">
          <h1 className="product-name">{product.name}</h1>
          <div className="product-meta">
            <span className="product-brand-label">Marca: <b>{brand.label}</b></span>
            <span className="meta-sep">•</span>
            <span className="product-brand-label">{activeFlavors.length} sabor{activeFlavors.length > 1 ? 'es' : ''}</span>
          </div>
        </div>

        <div className="product-left">
          <div className="product-img" style={{ background: displayImage ? 'transparent' : BRAND_GRADIENTS[product.brandId], transition: 'background 0.3s' }}>
            {imgLoading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                <div style={{ width: 36, height: 36, border: '3px solid rgba(200,255,0,0.2)', borderTop: '3px solid #c8ff00', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              </div>
            )}
            {displayImage ? (
              <img
                src={displayImage}
                alt={product.name}
                style={{ width:'100%', height:'100%', objectFit:'contain', display:'block', maxWidth:'100%', filter: imgLoading ? 'blur(6px)' : 'none', transition: 'filter 0.3s' }}
                onLoad={() => setImgLoading(false)}
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
          <p style={{ fontSize: '0.65rem', color: '#666', marginTop: '0px', marginBottom: '20px', lineHeight: 1.5, textAlign: 'left', paddingLeft: '10px' }}>
            *As imagens são meramente ilustrativas e podem<br />não condizer fielmente com os produtos reais.
          </p>
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
            <div ref={flavorGridRef} className="flavor-grid" style={{ ['--flavor-cols' as string]: String(Math.min(Math.max(1, Math.ceil(activeFlavors.length / 10)), 4)) } as React.CSSProperties}>
              {activeFlavors.map(v => (
                <div
                  key={v.name}
                  className={`flavor-item${selectedFlavor === v.name ? ' selected' : ''}`}
                  onClick={() => { setImgLoading(true); setSelectedFlavor(v.name); }}
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
