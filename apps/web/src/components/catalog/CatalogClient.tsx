'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { CartItem, Product } from '@/types';
import { loadCart, saveCart, getCartCount } from '@/lib/cart';
import { fmtBRLFromDecimal, api } from '@/lib/api';
import { BRANDS_DATA, BRAND_GRADIENTS, BRAND_ICONS } from '@/lib/catalog-data';
import CheckoutModal from './CheckoutModal';

function toDisplay(p: Product) {
  return {
    id: p.slug,
    brand: p.brandId,
    model: p.name,
    puffs: p.puffs ?? '',
    price: p.basePrice,
    flavors: (p.variants ?? []).filter(v => v.active !== false).map(v => v.name),
  };
}
type DisplayProduct = ReturnType<typeof toDisplay>;

export default function CatalogClient() {
  const router = useRouter();
  const [products, setProducts] = useState<DisplayProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBrand, setActiveBrand] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState<boolean | null>(null);
  const [storeStatus, setStoreStatus] = useState<{ isOpen: boolean; closedMessage: string } | null>(null);

  const brandFilterRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ dragging: false, startX: 0, scrollLeft: 0 });

  const onFilterMouseDown = useCallback((e: React.MouseEvent) => {
    const el = brandFilterRef.current;
    if (!el) return;
    dragState.current = { dragging: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft };
    el.style.cursor = 'grabbing';
  }, []);

  const onFilterMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState.current.dragging || !brandFilterRef.current) return;
    e.preventDefault();
    const x = e.pageX - brandFilterRef.current.offsetLeft;
    brandFilterRef.current.scrollLeft = dragState.current.scrollLeft - (x - dragState.current.startX);
  }, []);

  const onFilterMouseUp = useCallback(() => {
    dragState.current.dragging = false;
    if (brandFilterRef.current) brandFilterRef.current.style.cursor = 'grab';
  }, []);

  useEffect(() => {
    setCart(loadCart());
    const confirmed = sessionStorage.getItem('age_confirmed');
    if (confirmed === 'true') setAgeConfirmed(true);
    else if (confirmed === 'false') setAgeConfirmed(false);
    else setAgeConfirmed(null);
  }, []);

  useEffect(() => {
    api.products.list()
      .then(data => setProducts(data.map(toDisplay)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      // Fallback: se a API não responder em 4s, assume loja aberta
      const fallback = setTimeout(() => {
        if (!cancelled) setStoreStatus(prev => prev ?? { isOpen: true, closedMessage: '' });
      }, 4000);
      api.store.get()
        .then(s => { clearTimeout(fallback); if (!cancelled) setStoreStatus(s); })
        .catch(() => { clearTimeout(fallback); if (!cancelled) setStoreStatus(prev => prev ?? { isOpen: true, closedMessage: '' }); });
    };
    check();
    const interval = setInterval(check, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const updateCart = useCallback((newCart: CartItem[]) => {
    setCart(newCart);
    saveCart(newCart);
  }, []);

  const addToCart = useCallback((item: CartItem) => {
    setCart(prev => {
      const existing = prev.find(
        i => i.productId === item.productId && i.variantId === item.variantId,
      );
      const next = existing
        ? prev.map(i =>
            i.productId === item.productId && i.variantId === item.variantId
              ? { ...i, qty: i.qty + 1 }
              : i,
          )
        : [...prev, item];
      saveCart(next);
      return next;
    });
    showNotification(`${item.productName} — ${item.variantName} adicionado! 🛒`);
  }, []);

  const [notification, setNotification] = useState('');
  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 2000);
  };

  const confirmAge = (yes: boolean) => {
    sessionStorage.setItem('age_confirmed', yes ? 'true' : 'false');
    setAgeConfirmed(yes);
  };

  const filtered = products.filter(p => {
    if (activeBrand !== 'all' && p.brand !== activeBrand) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.model.toLowerCase().includes(q) || p.flavors.some(f => f.toLowerCase().includes(q));
    }
    return true;
  });

  const brandsToShow = activeBrand === 'all' ? BRANDS_DATA.map(b => b.id) : [activeBrand];

  const count = getCartCount(cart);

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

      <header>
        <div className="header-inner">
          <div className="header-top">
            <div className="logo">Cheap<span>.</span>Pods</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {storeStatus && !storeStatus.isOpen
                ? <div className="header-badge" style={{ background:'rgba(255,60,60,0.12)', borderColor:'rgba(255,60,60,0.3)', color:'#ff6060' }}><span className="badge-dot" style={{ background:'#ff4444' }}></span> Loja fechada</div>
                : <div className="header-badge"><span className="badge-dot"></span> Online agora</div>
              }
              {count > 0 && !(storeStatus && !storeStatus.isOpen) && (
                <button
                  onClick={() => setCheckoutOpen(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: '99px', padding: '8px 18px',
                    fontFamily: 'var(--font-inter),Inter,sans-serif',
                    fontSize: '13px', fontWeight: 600, color: '#fff',
                    cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
                  }}
                >
                  🛒 Carrinho
                  <span style={{
                    background: 'var(--accent)', color: '#000', borderRadius: '99px',
                    padding: '2px 10px', fontSize: '13px', fontWeight: 800,
                    fontFamily: 'var(--font-syne),Syne,sans-serif',
                  }}>{count}</span>
                </button>
              )}
            </div>
          </div>
          <div className="header-body">
            <div>
              <h1 className="hero-title">Os melhores<br /><em>pods</em> do rolê.</h1>
              <p className="hero-sub">Ignite, Elf Bar, Lost Mary, Oxbar e Black Sheep. Escolha o seu sabor.</p>
            </div>
            <div className="stats-strip">
              <div className="stat-item"><div className="stat-num">18</div><div className="stat-label">Modelos</div></div>
              <div className="stat-item"><div className="stat-num">5</div><div className="stat-label">Marcas</div></div>
              <div className="stat-item"><div className="stat-num">150+</div><div className="stat-label">Sabores</div></div>
              <div className="stat-item"><div className="stat-num">⚡</div><div className="stat-label">Rápido</div></div>
            </div>
          </div>
        </div>
      </header>

      <div className="toolbar">
        <div className="toolbar-inner">
          <div className="search-inner">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              type="text"
              placeholder="Buscar modelo ou sabor..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div
            className="brand-filter"
            ref={brandFilterRef}
            style={{ cursor: 'grab' }}
            onMouseDown={onFilterMouseDown}
            onMouseMove={onFilterMouseMove}
            onMouseUp={onFilterMouseUp}
            onMouseLeave={onFilterMouseUp}
          >
            <button
              className={`brand-btn${activeBrand === 'all' ? ' active' : ''}`}
              onClick={() => setActiveBrand('all')}
            >
              Todas
            </button>
            {BRANDS_DATA.map(b => (
              <button
                key={b.id}
                className={`brand-btn${activeBrand === b.id ? ' active' : ''}`}
                onClick={() => setActiveBrand(b.id)}
              >
                <span className="dot" style={{ background: b.color }}></span>
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="catalog">
        {storeStatus && !storeStatus.isOpen ? (
          <>
            <style>{`
              @keyframes storeFadeIn {
                from { opacity: 0; transform: translateY(24px) scale(0.97); }
                to   { opacity: 1; transform: translateY(0)    scale(1);    }
              }
              @keyframes storeLockFloat {
                0%, 100% { transform: translateY(0px) rotate(-4deg); }
                50%       { transform: translateY(-10px) rotate(4deg); }
              }
              @keyframes storeGlow {
                0%, 100% { box-shadow: 0 0 0 0 rgba(255,60,60,0); }
                50%       { box-shadow: 0 0 40px 6px rgba(255,60,60,0.12); }
              }
              @keyframes storeBorderSpin {
                0%   { background-position: 0% 50%; }
                50%  { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
              }
              @keyframes storeDotPulse {
                0%, 100% { opacity: 0.5; transform: scale(1); }
                50%       { opacity: 1;   transform: scale(1.4); }
              }
            `}</style>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '80px 24px',
            }}>
              {/* gradient border wrapper */}
              <div style={{
                position: 'relative', maxWidth: 460, width: '100%',
                borderRadius: 28, padding: 2,
                background: 'linear-gradient(135deg, rgba(255,80,80,0.5) 0%, rgba(120,0,0,0.3) 40%, rgba(255,80,80,0.4) 100%)',
                backgroundSize: '200% 200%',
                animation: 'storeFadeIn 0.6s cubic-bezier(.22,.68,0,1.2) both, storeGlow 3s ease-in-out 0.6s infinite, storeBorderSpin 4s linear infinite',
              }}>
                <div style={{
                  textAlign: 'center', width: '100%',
                  background: 'linear-gradient(160deg, rgba(28,8,8,0.96) 0%, rgba(18,18,18,0.98) 100%)',
                  borderRadius: 26, padding: '56px 44px 48px',
                  backdropFilter: 'blur(20px)',
                }}>
                  {/* icon */}
                  <div style={{
                    fontSize: 60, lineHeight: 1, marginBottom: 24,
                    display: 'inline-block',
                    animation: 'storeLockFloat 3.2s ease-in-out 0.6s infinite',
                    filter: 'drop-shadow(0 0 16px rgba(255,60,60,0.5))',
                  }}>🔒</div>

                  {/* red dots row */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
                    {[0, 0.3, 0.6].map((delay, i) => (
                      <div key={i} style={{
                        width: 6, height: 6, borderRadius: '50%', background: '#ff4444',
                        animation: `storeDotPulse 1.6s ease-in-out ${delay}s infinite`,
                      }} />
                    ))}
                  </div>

                  <div style={{
                    fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 6,
                    letterSpacing: -0.5, fontFamily: 'var(--font-syne),Syne,sans-serif',
                  }}>
                    Loja Fechada
                  </div>
                  <div style={{
                    fontSize: 12, fontWeight: 600, letterSpacing: 2,
                    color: '#ff6060', textTransform: 'uppercase',
                    marginBottom: 24, fontFamily: 'var(--font-inter),Inter,sans-serif',
                  }}>
                    Temporariamente indisponível
                  </div>

                  <div style={{
                    width: 40, height: 1,
                    background: 'linear-gradient(90deg, transparent, rgba(255,60,60,0.4), transparent)',
                    margin: '0 auto 24px',
                  }} />

                  {storeStatus.closedMessage && (
                    <div style={{
                      fontSize: 14, color: '#9a9a9a', lineHeight: 1.75,
                      whiteSpace: 'pre-wrap', fontFamily: 'var(--font-inter),Inter,sans-serif',
                    }}>
                      {storeStatus.closedMessage}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : loading ? (
          <div className="brand-section">
            <div className="brand-section-header">
              <span className="skeleton-line" style={{ width: 80, height: 14, borderRadius: 6 }}></span>
            </div>
            <div className="model-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="model-card skeleton-card">
                  <div className="model-img skeleton-img"></div>
                  <div className="model-body" style={{ gap: 10 }}>
                    <div className="skeleton-line" style={{ width: '70%', height: 14 }}></div>
                    <div className="skeleton-line" style={{ width: '45%', height: 12 }}></div>
                    <div className="skeleton-line" style={{ width: '35%', height: 16 }}></div>
                    <div className="skeleton-line" style={{ width: '60%', height: 32, borderRadius: 8 }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {brandsToShow.map(brandId => {
              const brand = BRANDS_DATA.find(b => b.id === brandId)!;
              const items = filtered.filter(p => p.brand === brandId);
              if (!items.length) return null;
              return (
                <div key={brandId} className="brand-section">
                  <div className="brand-section-header">
                    <span className="brand-section-dot" style={{ background: brand.color }}></span>
                    <span className="brand-section-name">{brand.label}</span>
                    <span className="brand-section-count">{items.length} modelo{items.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="model-grid">
                    {items.map((p, i) => (
                      <div
                        key={p.id}
                        className="model-card"
                        style={{ animationDelay: `${Math.min(i * 0.05, 0.5)}s` }}
                        onClick={() => router.push(`/produto/${p.id}`)}
                      >
                        <div className="model-img" style={{ background: BRAND_GRADIENTS[p.brand] }}>
                          <div className="model-img-placeholder">
                            <div className="placeholder-icon">{BRAND_ICONS[p.brand]}</div>
                            <div className="placeholder-line" style={{ background: brand.color }}></div>
                          </div>
                          <div className="model-img-overlay"></div>
                          <div className="model-img-tags">
                            <span className="brand-tag">
                              <span className="brand-tag-dot" style={{ background: brand.color }}></span>
                              {brand.label}
                            </span>
                            <span className="puffs-tag">{p.puffs}</span>
                          </div>
                        </div>
                        <div className="model-body">
                          <div className="model-name">{p.model}</div>
                          <div className="model-flavors">{p.flavors.length} sabor{p.flavors.length > 1 ? 'es' : ''}</div>
                          <div className="model-price">{fmtBRLFromDecimal(p.price)}</div>
                          <div className="model-cta">
                            <span className="cta-btn">Ver sabores</span>
                            <span className="cta-arrow">›</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">🔍</div>
                <p>Nenhum produto encontrado</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Cart FAB */}
      {count > 0 && !(storeStatus && !storeStatus.isOpen) && (
        <button className="cart-fab visible" onClick={() => setCheckoutOpen(true)}>
          🛒
          <div className="cart-fab-count">{count}</div>
        </button>
      )}

      {/* Notification */}
      {notification && (
        <div className="notification">
          <span className="notification-icon">✅</span>
          <span className="notification-text">{notification}</span>
        </div>
      )}

      {/* Checkout Modal */}
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
