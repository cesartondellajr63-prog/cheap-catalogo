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
    image: (p.images ?? [])[0] ?? '',
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
  const [visibleBrands, setVisibleBrands] = useState<string[] | null>(null);
  const [customBrands, setCustomBrands] = useState<{ id: string; label: string; color: string }[]>([]);

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

  // Busca marcas visíveis e customizadas
  useEffect(() => {
    api.brandsFilter.get()
      .then(r => { setVisibleBrands(r.visibleBrands); setCustomBrands(r.customBrands ?? []); })
      .catch(() => setVisibleBrands(null)); // null = mostra todas
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

  const allBrandsData = [...BRANDS_DATA, ...customBrands.filter(c => !BRANDS_DATA.find(b => b.id === c.id))];
  const activeBrandsData = visibleBrands
    ? allBrandsData.filter(b => visibleBrands.includes(b.id))
    : allBrandsData;

  const brandsToShow = activeBrand === 'all' ? activeBrandsData.map(b => b.id) : [activeBrand];

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
                <button className="header-cart-btn" onClick={() => setCheckoutOpen(true)}>
                  🛒 Carrinho
                  <span className="header-cart-count">{count}</span>
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
            {activeBrandsData.map(b => (
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
                      marginBottom: 28,
                    }}>
                      {storeStatus.closedMessage}
                    </div>
                  )}

                  {/* WhatsApp CTA */}
                  <a
                    href={`https://wa.me/5511951047070?text=${encodeURIComponent('Olá! Tenho interesse em comprar na loja. Pode me avisar assim que abrir?')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      padding: '13px 28px', borderRadius: 14, textDecoration: 'none',
                      background: '#c8ff00',
                      color: '#0a0a0a', fontSize: 14, fontWeight: 700,
                      fontFamily: 'var(--font-inter),Inter,sans-serif',
                      boxShadow: '0 4px 24px rgba(200,255,0,0.28)',
                      transition: 'transform 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)';
                      (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 8px 32px rgba(200,255,0,0.45)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
                      (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 4px 24px rgba(200,255,0,0.28)';
                    }}
                  >
                    {/* WhatsApp icon */}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    Avisar quando abrir
                  </a>
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
              const brand = allBrandsData.find(b => b.id === brandId)!;
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
                        <div className="model-img" style={{ background: p.image ? 'transparent' : BRAND_GRADIENTS[p.brand] }}>
                          {p.image ? (
                            <img
                              src={p.image}
                              alt={p.model}
                              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                              loading="lazy"
                            />
                          ) : (
                            <div className="model-img-placeholder">
                              <div className="placeholder-icon">{BRAND_ICONS[p.brand]}</div>
                              <div className="placeholder-line" style={{ background: brand.color }}></div>
                            </div>
                          )}
                          <div className="model-img-overlay" style={{ opacity: p.image ? 0.3 : 1 }}></div>
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
