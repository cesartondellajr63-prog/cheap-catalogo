'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { CartItem } from '@/types';
import { loadCart, saveCart, getCartSubtotal, getCartCount } from '@/lib/cart';
import { api, fmtBRLFromDecimal } from '@/lib/api';

type Step = 1 | 2 | 3 | 4;

function maskTel(v: string) {
  v = v.replace(/\D/g, '');
  if (v.length <= 10) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  else v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
  return v.slice(0, 15);
}

function maskCEP(v: string) {
  v = v.replace(/\D/g, '').slice(0, 8);
  if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
  return v;
}

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [step, setStep] = useState<Step>(1);

  // Step 2 fields
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [tel, setTel] = useState('');
  const [dadosError, setDadosError] = useState('');

  // Step 3 fields
  const [cep, setCep] = useState('');
  const [numero, setNumero] = useState('');
  const [rua, setRua] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [complemento, setComplemento] = useState('');
  const [freteLoading, setFreteLoading] = useState(false);
  const [freteResult, setFreteResult] = useState<{ price: number; priceFormatted: string; expiresAt?: number } | null>(null);
  const [freteError, setFreteError] = useState('');
  const [freteConfirmed, setFreteConfirmed] = useState(false);
  const [freteTimer, setFreteTimer] = useState<string>('');
  const [freteExpired, setFreteExpired] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepHint, setCepHint] = useState('');

  // Step 4
  const [pagLoading, setPagLoading] = useState(false);
  const [pagError, setPagError] = useState('');

  // Volta ao step 3 automaticamente se o frete expirar enquanto estiver no step 4
  useEffect(() => {
    if (freteExpired && step === 4) {
      setStep(3);
    }
  }, [freteExpired, step]);

  useEffect(() => {
    const c = loadCart();
    if (!c.length) { router.replace('/'); return; }
    setCart(c);
  }, [router]);

  // Timer de validade da cotação de frete
  useEffect(() => {
    if (!freteResult?.expiresAt) return;
    setFreteExpired(false);
    const tick = () => {
      const remaining = (freteResult.expiresAt as number) - Date.now();
      if (remaining <= 0) {
        setFreteTimer('⏰ Cotação expirada!');
        setFreteExpired(true);
        setFreteResult(null);
        clearInterval(id);
        return;
      }
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setFreteTimer(`${m}:${s < 10 ? '0' : ''}${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [freteResult?.expiresAt]);

  const removeItem = (idx: number) => {
    const newCart = cart.filter((_, i) => i !== idx);
    setCart(newCart);
    saveCart(newCart);
    if (!newCart.length) router.replace('/');
  };

  const changeQty = (idx: number, delta: number) => {
    const newCart = cart.map((item, i) =>
      i === idx ? { ...item, qty: Math.max(1, item.qty + delta) } : item,
    );
    setCart(newCart);
    saveCart(newCart);
  };

  const subtotal = getCartSubtotal(cart);
  const freteValue = freteResult?.price ?? 0;
  const total = subtotal + freteValue;

  const confirmarDados = () => {
    if (!nome.trim()) { setDadosError('Informe seu nome completo.'); return; }
    if (!email.trim() || !email.includes('@')) { setDadosError('Informe um email válido.'); return; }
    if (tel.replace(/\D/g, '').length < 10) { setDadosError('Informe um telefone válido.'); return; }
    setDadosError('');
    setStep(3);
  };

  const fetchCEP = async () => {
    const raw = cep.replace(/\D/g, '');
    if (raw.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setRua(data.logradouro ?? '');
        setBairro(data.bairro ?? '');
        setCidade(data.localidade ?? '');
        setEstado(data.uf ?? '');
        setCepHint('');
      }
    } catch {}
  };

  const geocodeEndereco = async (addr: string): Promise<{ lat: string; lng: string } | null> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1`,
      );
      const data = await res.json() as any[];
      if (data.length) return { lat: data[0].lat, lng: data[0].lon };
    } catch {}
    return null;
  };

  const reverseLookupCEP = async () => {
    if (cep.replace(/\D/g, '').length === 8) return;
    if (!rua.trim() || !cidade.trim() || !estado.trim()) return;
    setCepLoading(true);
    setCepHint('');
    try {
      const uf = estado.trim().toUpperCase().slice(0, 2);
      const res = await fetch(`https://viacep.com.br/ws/${uf}/${encodeURIComponent(cidade.trim())}/${encodeURIComponent(rua.trim())}/json/`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const found = data[0].cep as string;
        setCep(maskCEP(found));
        setCepHint(`CEP encontrado: ${found}`);
      } else {
        setCepHint('CEP não encontrado — prossiga sem ele.');
      }
    } catch {
      setCepHint('');
    } finally {
      setCepLoading(false);
    }
  };

  const calcularFrete = async () => {
    if (!rua.trim()) { setFreteError('Informe a rua.'); return; }
    if (!cidade.trim()) { setFreteError('Informe a cidade.'); return; }
    setFreteError('');
    setFreteLoading(true);
    try {
      const addrCompleto = `${rua}, ${numero}, ${bairro}, ${cidade}, ${estado || 'SP'}, Brasil`;
      let geo = await geocodeEndereco(addrCompleto);
      if (!geo) geo = await geocodeEndereco(`${cidade}, ${estado || 'SP'}, Brasil`);
      if (!geo) throw new Error('Endereço não encontrado. Verifique a cidade e tente novamente.');

      const cepRaw = cep.replace(/\D/g, '');
      const result = await api.shipping.quote({
        lat: geo.lat,
        lng: geo.lng,
        address: `${rua}, ${numero}, ${bairro}, ${cidade}, ${estado || 'SP'}, Brasil`,
        zipCode: cepRaw.length === 8 ? cep : undefined,
      });
      setFreteResult(result);
      setFreteExpired(false);
      setFreteTimer('');
      setFreteConfirmed(false);
    } catch (e: unknown) {
      setFreteError(e instanceof Error ? e.message : 'Erro ao calcular frete.');
    } finally {
      setFreteLoading(false);
    }
  };

  const iniciarPagamento = async () => {
    setPagError('');
    setPagLoading(true);
    try {
      const orderId = crypto.randomUUID();
      const result = await api.payments.createPix({
        orderId,
        items: cart.map(i => ({
          model: i.productName,
          flavor: i.variantName,
          price: i.price,
          qty: i.qty,
        })),
        shippingPrice: freteValue,
        customerEmail: email,
        customerName: nome,
        customerPhone: tel.replace(/\D/g, ''),
        address: `${rua}, ${numero}${complemento ? ', ' + complemento : ''}, ${bairro}`,
        city: cidade,
      });
      const pedidoData = JSON.stringify({
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        accessToken: result.accessToken,
      });
      sessionStorage.setItem('pedidoAtual', pedidoData);
      localStorage.setItem('pedidoAtual', pedidoData);
      saveCart([]);
      window.location.href = result.checkoutUrl;
    } catch (e: unknown) {
      setPagError(e instanceof Error ? e.message : 'Erro ao iniciar pagamento.');
    } finally {
      setPagLoading(false);
    }
  };

  const goToStep = (s: Step) => setStep(s);

  const stepLabel = (n: number) => {
    if (step > n) return 'done';
    if (step === n) return 'active';
    return '';
  };

  const count = getCartCount(cart);

  return (
    <>
      <div className="topbar" style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(10,10,10,0.9)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)', padding: '12px var(--pad)' }}>
        <div className="topbar-inner">
          <a className="back-btn" href="/">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
            Catálogo
          </a>
          <div className="topbar-logo">Cheaps<span style={{ color: 'var(--accent)' }}>.</span>Pods</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{count} {count === 1 ? 'item' : 'itens'}</div>
        </div>
      </div>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: 'clamp(20px,3vw,32px) var(--pad) 120px', position: 'relative', zIndex: 1 }}>

        {/* Stepper */}
        <div className="stepper" style={{ marginBottom: 24 }}>
          {[1, 2, 3, 4].map((n, i) => (
            <React.Fragment key={n}>
              <div className={`step ${stepLabel(n)}`}>
                <div className="step-circle">{step > n ? '✓' : n}</div>
                <div className="step-label">{['Pedido', 'Seus dados', 'Entrega', 'Pagamento'][i]}</div>
              </div>
              {i < 3 && <div className={`step-line${step > n ? ' done' : ''}`}></div>}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Order review */}
        {step === 1 && (
          <>
            <h2 style={{ fontFamily: 'var(--font-syne),Syne,sans-serif', fontSize: 'clamp(18px,3vw,22px)', fontWeight: 800, marginBottom: 16, color: '#fff', letterSpacing: '-0.5px' }}>Seu Pedido</h2>
            <ul className="order-list">
              {cart.map((item, i) => (
                <li key={i}>
                  <div className="order-item-info">
                    <div className="order-item-name">{item.productName}</div>
                    <div className="order-item-flavor">{item.variantName}</div>
                  </div>
                  <div className="order-item-controls">
                    <div className="qty-control">
                      <button className="qty-btn remove" onClick={() => { if (item.qty === 1) removeItem(i); else changeQty(i, -1); }}>
                        {item.qty === 1 ? '🗑' : '−'}
                      </button>
                      <span className="qty-display">{item.qty}</span>
                      <button className="qty-btn" onClick={() => changeQty(i, 1)}>+</button>
                    </div>
                    <div className="order-item-price">{fmtBRLFromDecimal(item.price * item.qty)}</div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="order-subtotal">
              <span>Subtotal</span>
              <span>{fmtBRLFromDecimal(subtotal)}</span>
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => goToStep(2)}>Informar seus dados →</button>
              <button className="btn-secondary" onClick={() => router.push('/')}>Continuar comprando</button>
            </div>
          </>
        )}

        {/* Step 2: Customer data */}
        {step === 2 && (
          <>
            <h2 style={{ fontFamily: 'var(--font-syne),Syne,sans-serif', fontSize: 'clamp(18px,3vw,22px)', fontWeight: 800, marginBottom: 16, color: '#fff', letterSpacing: '-0.5px' }}>Seus Dados</h2>
            <div className="address-form">
              <div className="form-group">
                <label>Nome completo</label>
                <input type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome" autoComplete="name" />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" autoComplete="email" />
              </div>
              <div className="form-group">
                <label>WhatsApp</label>
                <input
                  type="tel"
                  value={tel}
                  onChange={e => setTel(maskTel(e.target.value))}
                  placeholder="(11) 99999-9999"
                  maxLength={15}
                  inputMode="numeric"
                />
              </div>
            </div>
            {dadosError && <div className="error-msg visible">{dadosError}</div>}
            <div className="modal-actions">
              <button className="btn-primary" onClick={confirmarDados}>Informar endereço de entrega →</button>
              <button className="btn-secondary" onClick={() => goToStep(1)}>← Voltar ao pedido</button>
            </div>
          </>
        )}

        {/* Step 3: Shipping */}
        {step === 3 && (
          <>
            <h2 style={{ fontFamily: 'var(--font-syne),Syne,sans-serif', fontSize: 'clamp(18px,3vw,22px)', fontWeight: 800, marginBottom: 16, color: '#fff', letterSpacing: '-0.5px' }}>Entrega</h2>
            <div className="address-form">
              <div className="form-row">
                <div className="form-group">
                  <label>CEP <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.8em' }}>(opcional)</span></label>
                  <input
                    type="text"
                    value={cep}
                    onChange={e => { setCep(maskCEP(e.target.value)); setCepHint(''); }}
                    onBlur={fetchCEP}
                    placeholder="00000-000"
                    maxLength={9}
                    inputMode="numeric"
                  />
                </div>
                <div className="form-group">
                  <label>Número</label>
                  <input type="text" value={numero} onChange={e => setNumero(e.target.value)} placeholder="123" inputMode="numeric" />
                </div>
              </div>
              {(cepLoading || cepHint) && (
                <div style={{ fontSize: 12, marginTop: -8, marginBottom: 4, color: cepHint.startsWith('CEP encontrado') ? 'var(--accent)' : 'var(--muted)' }}>
                  {cepLoading ? '🔍 Buscando CEP automaticamente...' : cepHint}
                </div>
              )}
              <div className="form-group">
                <label>Rua</label>
                <input type="text" value={rua} onChange={e => setRua(e.target.value)} onBlur={reverseLookupCEP} placeholder="Nome da rua" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Bairro</label>
                  <input type="text" value={bairro} onChange={e => setBairro(e.target.value)} onBlur={reverseLookupCEP} placeholder="Bairro" />
                </div>
                <div className="form-group">
                  <label>Cidade</label>
                  <input type="text" value={cidade} onChange={e => setCidade(e.target.value)} onBlur={reverseLookupCEP} placeholder="Cidade" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Estado <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.8em' }}>(UF)</span></label>
                  <input
                    type="text"
                    value={estado}
                    onChange={e => setEstado(e.target.value.toUpperCase().slice(0, 2))}
                    onBlur={reverseLookupCEP}
                    placeholder="SP"
                    maxLength={2}
                  />
                </div>
                <div className="form-group">
                  <label>Complemento</label>
                  <input type="text" value={complemento} onChange={e => setComplemento(e.target.value)} placeholder="Apto, bloco... (opcional)" />
                </div>
              </div>
            </div>
            {freteError && <div className="error-msg visible">{freteError}</div>}
            {freteExpired && (
              <div className="error-msg visible">⏰ Cotação expirada. Recalcule o frete.</div>
            )}
            {freteResult && (
              <div className="frete-result visible">
                <div className="frete-row"><span className="lbl">🚚 Frete Lalamove</span><span className="val">{freteResult.priceFormatted}</span></div>
                <div className="frete-row"><span className="lbl">📦 Produtos</span><span className="val">{fmtBRLFromDecimal(subtotal)}</span></div>
                <div className="frete-row total-row"><span className="lbl">Total</span><span className="val">{fmtBRLFromDecimal(subtotal + freteResult.price)}</span></div>
                {freteTimer && (
                  <div className="frete-eta">
                    ⏰ Válido por: <b style={{ color: freteTimer.startsWith('0:') ? '#ff9900' : 'var(--accent2)' }}>{freteTimer}</b>
                  </div>
                )}
              </div>
            )}
            <div className="modal-actions">
              {(!freteResult || freteExpired) ? (
                <button className="btn-primary" onClick={calcularFrete} disabled={freteLoading}>
                  {freteLoading ? <><span className="spinner"></span> Calculando...</> : freteExpired ? '🔄 Recalcular frete' : 'Calcular frete'}
                </button>
              ) : (
                <button className="btn-primary" onClick={() => goToStep(4)}>Confirmar e ir para pagamento →</button>
              )}
              <button className="btn-secondary" onClick={() => goToStep(2)}>← Voltar aos dados</button>
            </div>
          </>
        )}

        {/* Step 4: Payment */}
        {step === 4 && (
          <>
            <h2 style={{ fontFamily: 'var(--font-syne),Syne,sans-serif', fontSize: 'clamp(18px,3vw,22px)', fontWeight: 800, marginBottom: 16, color: '#fff', letterSpacing: '-0.5px' }}>Pagamento</h2>
            <div className="payment-summary">
              <div className="pay-row"><span className="l">Produtos</span><span className="v">{fmtBRLFromDecimal(subtotal)}</span></div>
              <div className="pay-row"><span className="l">Frete</span><span className="v">{freteResult ? freteResult.priceFormatted : '—'}</span></div>
              <div className="pay-row grand"><span className="l">Total a pagar</span><span className="v">{fmtBRLFromDecimal(total)}</span></div>
            </div>
            {freteTimer && !freteExpired && (
              <div className="frete-eta" style={{ marginBottom: 12 }}>
                ⏰ Cotação válida por: <b style={{ color: freteTimer.startsWith('0:') ? '#ff9900' : 'var(--accent2)' }}>{freteTimer}</b>
              </div>
            )}
            {freteExpired && (
              <div className="error-msg visible">⏰ Cotação expirada. Recalcule o frete para continuar.</div>
            )}
            <div className="secure-badge">
              🔒 Pagamento seguro via <strong style={{ color: '#fff', marginLeft: 4 }}>Mercado Pago</strong>
            </div>
            {pagError && <div className="error-msg visible">{pagError}</div>}
            <div className="modal-actions">
              {freteExpired ? (
                <button className="btn-primary" onClick={() => goToStep(3)}>🔄 Recalcular frete</button>
              ) : (
                <button
                  className="btn-primary"
                  onClick={iniciarPagamento}
                  disabled={pagLoading}
                  style={{ background: '#FF8C00' }}
                >
                  {pagLoading
                    ? <><span className="spinner"></span> Aguarde...</>
                    : '🔷 Pagar com PIX'
                  }
                </button>
              )}
              <button className="btn-secondary" onClick={() => router.push('/')}>← Voltar à loja</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
