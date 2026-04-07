'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { CartItem } from '@/types';
import { loadCart, saveCart, getCartCount } from '@/lib/cart';
import { fmtBRLFromDecimal } from '@/lib/api';
import { CATALOG, BRANDS_DATA, BRAND_GRADIENTS, BRAND_ICONS } from '@/lib/catalog-data';
import CheckoutModal from './CheckoutModal';

export default function CatalogClient() {
  const router = useRouter();
  const [activeBrand, setActiveBrand] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState<boolean | null>(null);

  useEffect(() => {
    setCart(loadCart());
    const confirmed = sessionStorage.getItem('age_confirmed');
    if (confirmed === 'true') setAgeConfirmed(true);
    else if (confirmed === 'false') setAgeConfirmed(false);
    else setAgeConfirmed(null);
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
    setTimeout(() => setNotification(''), 3000);
  };

  const confirmAge = (yes: boolean) => {
    sessionStorage.setItem('age_confirmed', yes ? 'true' : 'false');
    setAgeConfirmed(yes);
  };

  const filtered = CATALOG.filter(p => {
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
              <div className="header-badge"><span className="badge-dot"></span> Online agora</div>
              {count > 0 && (
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
          <div className="brand-filter">
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
      </div>

      {/* Cart FAB */}
      {count > 0 && (
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
