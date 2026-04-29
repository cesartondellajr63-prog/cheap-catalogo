'use client';

import React, { useState, useEffect } from 'react';
import type { CartItem, ShippingQuoteResult } from '@/types';
import { saveCart, getCartSubtotal } from '@/lib/cart';
import { api, fmtBRLFromDecimal } from '@/lib/api';

interface CheckoutModalProps {
  cart: CartItem[];
  onClose: () => void;
  onUpdateCart: (newCart: CartItem[]) => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

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

export default function CheckoutModal({ cart, onClose, onUpdateCart }: CheckoutModalProps) {
  const [localCart, setLocalCart] = useState<CartItem[]>(cart);
  const [step, setStep] = useState<Step>(1);

  // Carrega dados salvos na sessão (se existirem)
  const savedForm = (() => { try { return JSON.parse(sessionStorage.getItem('checkoutForm') ?? '{}'); } catch { return {}; } })();

  // Step 2 fields
  const [nome, setNome] = useState<string>(savedForm.nome ?? '');
  const [email, setEmail] = useState<string>(savedForm.email ?? '');
  const [tel, setTel] = useState<string>(savedForm.tel ?? '');
  const [dadosError, setDadosError] = useState('');

  // Step 3 fields
  const [cep, setCep] = useState<string>(savedForm.cep ?? '');
  const [numero, setNumero] = useState<string>(savedForm.numero ?? '');
  const [rua, setRua] = useState<string>(savedForm.rua ?? '');
  const [bairro, setBairro] = useState<string>(savedForm.bairro ?? '');
  const [cidade, setCidade] = useState<string>(savedForm.cidade ?? '');
  const [estado, setEstado] = useState<string>(savedForm.estado ?? '');
  const [complemento, setComplemento] = useState<string>(savedForm.complemento ?? '');
  const [freteLoading, setFreteLoading] = useState(false);
  const [freteResult, setFreteResult] = useState<ShippingQuoteResult | null>(null);
  const [freteError, setFreteError] = useState('');
  const [freteTimer, setFreteTimer] = useState<string>('');
  const [freteExpired, setFreteExpired] = useState(false);
  const [freteExpiresAt, setFreteExpiresAt] = useState<number | null>(null);

  // Step 4 — Garantia
  const [termosAceitos, setTermosAceitos] = useState(false);

  // Step 5
  const [pagLoading, setPagLoading] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);
  const [pagError, setPagError] = useState('');

  // Volta ao step 3 automaticamente se o frete expirar no step 4 ou 5
  useEffect(() => {
    if (freteExpired && (step === 4 || step === 5)) {
      setStep(3);
    }
  }, [freteExpired, step]);

  // Persiste os dados do formulário na sessão sempre que mudam
  useEffect(() => {
    sessionStorage.setItem('checkoutForm', JSON.stringify({ nome, email, tel, cep, numero, rua, bairro, cidade, estado, complemento }));
  }, [nome, email, tel, cep, numero, rua, bairro, cidade, estado, complemento]);

  // Sync localCart with prop changes (e.g. external cart updates)
  useEffect(() => {
    setLocalCart(cart);
  }, [cart]);

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Timer de validade da cotação de frete
  useEffect(() => {
    if (!freteExpiresAt) return;
    setFreteExpired(false);
    const tick = () => {
      const remaining = freteExpiresAt - Date.now();
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
  }, [freteExpiresAt]);

  const removeItem = (idx: number) => {
    const newCart = localCart.filter((_, i) => i !== idx);
    setLocalCart(newCart);
    saveCart(newCart);
    onUpdateCart(newCart);
    if (!newCart.length) onClose();
  };

  const changeQty = (idx: number, delta: number) => {
    const newCart = localCart.map((item, i) =>
      i === idx ? { ...item, qty: Math.max(1, item.qty + delta) } : item,
    );
    setLocalCart(newCart);
    saveCart(newCart);
    onUpdateCart(newCart);
  };

  const subtotal = getCartSubtotal(localCart);
  const freteValue = freteResult?.price ?? 0;
  const total = subtotal + freteValue;

  const confirmarDados = () => {
    if (!nome.trim() || nome.trim().split(/\s+/).length < 2) { setDadosError('Informe seu nome e sobrenome.'); return; }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setDadosError('Informe um email válido (ex: nome@email.com).'); return; }
    if (tel.replace(/\D/g, '').length < 10) { setDadosError('Informe um telefone válido.'); return; }
    setDadosError('');
    setStep(3);
  };

  useEffect(() => {
    const raw = cep.replace(/\D/g, '');
    if (raw.length !== 8) return;
    fetch(`https://viacep.com.br/ws/${raw}/json/`)
      .then(r => r.json())
      .then(data => {
        if (!data.erro) {
          setRua(data.logradouro ?? '');
          setBairro(data.bairro ?? '');
          setCidade(data.localidade ?? '');
          setEstado(data.uf ?? '');
        }
      })
      .catch(() => {});
  }, [cep]);

  // Geocodifica endereço via Nominatim (browser → sem necessidade de proxy)
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

  const resetFrete = () => {
    if (freteResult) {
      setFreteResult(null);
      setFreteExpiresAt(null);
      setFreteTimer('');
      setFreteExpired(false);
      setFreteError('');
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
      if (!geo) {
        geo = await geocodeEndereco(`${cidade}, ${estado || 'SP'}, Brasil`);
      }
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
      setFreteExpiresAt(Date.now() + 5 * 60 * 1000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao calcular frete.';
      // Tenta extrair mensagem legível de JSON de erro (ex: NestJS { message: "..." })
      try {
        const json = JSON.parse(msg);
        setFreteError(json?.message ?? msg);
      } catch {
        setFreteError(msg);
      }
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
        items: localCart.map(i => ({
          productId: i.productId,
          model: i.productName,
          flavor: i.variantName,
          qty: i.qty,
        })),
        shippingPrice: freteValue,
        shippingToken: freteResult!.shippingToken,
        customerEmail: email,
        customerName: nome,
        customerPhone: tel.replace(/\D/g, ''),
        address: `${rua}, ${numero}${complemento ? ', ' + complemento : ''}, ${bairro}`,
        city: cidade,
      });
      const pedidoPix = JSON.stringify({
        paymentType: 'pix',
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        accessToken: result.accessToken,
        items: localCart.map(i => `${i.productName} (${i.variantName})`),
        address: `${rua}, ${numero}${complemento ? ', ' + complemento : ''}, ${bairro}, ${cidade} - ${estado}`,
      });
      sessionStorage.setItem('pedidoAtual', pedidoPix);
      localStorage.setItem('pedidoAtual', pedidoPix);
      saveCart(localCart);
      window.location.href = result.checkoutUrl;
    } catch (e: unknown) {
      setPagError(e instanceof Error ? e.message : 'Erro ao iniciar pagamento.');
    } finally {
      setPagLoading(false);
    }
  };

  const pagarCartao = async () => {
    setPagError('');
    setCardLoading(true);
    try {
      const result = await api.payments.createCard({
        items: localCart.map(i => ({
          productId: i.productId,
          name:   i.productName,
          flavor: i.variantName,
          qty:    i.qty,
        })),
        shippingPrice: freteValue,
        shippingToken: freteResult!.shippingToken,
        customerName:  nome,
        customerEmail: email,
        customerPhone: tel.replace(/\D/g, ''),
        rua,
        numero,
        complemento: complemento || undefined,
        bairro,
        cidade,
        estado,
        cep,
      });
      const pedidoCard = JSON.stringify({
        paymentType: 'card',
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        items: localCart.map(i => `${i.productName} (${i.variantName})`),
        address: `${rua}, ${numero}${complemento ? ', ' + complemento : ''}, ${bairro}, ${cidade} - ${estado}`,
      });
      sessionStorage.setItem('pedidoAtual', pedidoCard);
      localStorage.setItem('pedidoAtual', pedidoCard);
      window.location.href = result.checkoutUrl;
    } catch (e: unknown) {
      setPagError(e instanceof Error ? e.message : 'Erro ao iniciar pagamento com cartão.');
    } finally {
      setCardLoading(false);
    }
  };

  const goToStep = (s: Step) => setStep(s);

  const stepLabel = (n: number) => {
    if (step > n) return 'done';
    if (step === n) return 'active';
    return '';
  };

  return (
    <div className="modal-bg open">
      <div className="modal" style={{ position: 'relative' }}>
        {/* Close button — top left */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: '50%',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--muted)',
            fontSize: 16,
            lineHeight: 1,
            transition: 'all 0.2s',
            zIndex: 10,
          }}
          aria-label="Fechar"
        >
          ✕
        </button>

        {/* Stepper */}
        <div className="stepper">
          {[1, 2, 3, 4, 5].map((n, i) => (
            <React.Fragment key={n}>
              <div className={`step ${stepLabel(n)}`}>
                <div className="step-circle">{step > n ? '✓' : n}</div>
                <div className="step-label">{['Pedido', 'Seus dados', 'Entrega', 'Garantia', 'Pagamento'][i]}</div>
              </div>
              {i < 4 && <div className={`step-line${step > n ? ' done' : ''}`}></div>}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Order review */}
        {step === 1 && (
          <>
            <h2>Seu Pedido</h2>
            <ul className="order-list">
              {localCart.map((item, i) => (
                <li key={i}>
                  <div className="order-item-info">
                    <div className="order-item-name">{item.productName}</div>
                    <div className="order-item-flavor">{item.variantName}</div>
                  </div>
                  <div className="order-item-controls">
                    <div className="qty-control">
                      <button
                        className="qty-btn remove"
                        onClick={() => { if (item.qty === 1) removeItem(i); else changeQty(i, -1); }}
                      >
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
              <button className="btn-secondary" onClick={onClose}>Continuar comprando</button>
            </div>
          </>
        )}

        {/* Step 2: Customer data */}
        {step === 2 && (
          <>
            <h2>Seus Dados</h2>
            <div className="address-form">
              <div className="form-group">
                <label>Nome completo</label>
                <input
                  type="text"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Seu nome"
                  autoComplete="name"
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  autoComplete="email"
                />
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
            <h2>Entrega</h2>
            <div className="address-form">
              <div className="form-row">
                <div className="form-group">
                  <label>CEP <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.8em' }}>(opcional)</span></label>
                  <input
                    type="text"
                    value={cep}
                    onChange={e => { setCep(maskCEP(e.target.value)); resetFrete(); }}
                    placeholder="00000-000"
                    maxLength={9}
                    inputMode="numeric"
                  />
                </div>
                <div className="form-group">
                  <label>Número</label>
                  <input
                    type="text"
                    value={numero}
                    onChange={e => { setNumero(e.target.value); resetFrete(); }}
                    placeholder="123"
                    inputMode="numeric"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Rua</label>
                <input
                  type="text"
                  value={rua}
                  onChange={e => { setRua(e.target.value); resetFrete(); }}
                  placeholder="Nome da rua"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Bairro</label>
                  <input
                    type="text"
                    value={bairro}
                    onChange={e => { setBairro(e.target.value); resetFrete(); }}
                    placeholder="Bairro"
                  />
                </div>
                <div className="form-group">
                  <label>Cidade</label>
                  <input
                    type="text"
                    value={cidade}
                    onChange={e => { setCidade(e.target.value); resetFrete(); }}
                    placeholder="Cidade"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Estado <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.8em' }}>(UF)</span></label>
                  <input
                    type="text"
                    value={estado}
                    onChange={e => { setEstado(e.target.value.toUpperCase().slice(0, 2)); resetFrete(); }}
                    placeholder="SP"
                    maxLength={2}
                  />
                </div>
                <div className="form-group">
                  <label>Complemento</label>
                  <input
                    type="text"
                    value={complemento}
                    onChange={e => setComplemento(e.target.value)}
                    placeholder="Apto, bloco... (opcional)"
                  />
                </div>
              </div>
            </div>
            {freteError && <div className="error-msg visible">{freteError}</div>}
            {freteExpired && (
              <div className="error-msg visible">⏰ Cotação expirada. Recalcule o frete.</div>
            )}
            {freteResult && (
              <div className="frete-result visible">
                <div className="frete-row">
                  <span className="lbl">🚚 Frete Lalamove</span>
                  <span className="val">{freteResult.priceFormatted}</span>
                </div>
                <div className="frete-row">
                  <span className="lbl">📦 Produtos</span>
                  <span className="val">{fmtBRLFromDecimal(subtotal)}</span>
                </div>
                <div className="frete-row total-row">
                  <span className="lbl">Total</span>
                  <span className="val">{fmtBRLFromDecimal(subtotal + freteResult.price)}</span>
                </div>
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
                  {freteLoading
                    ? <><span className="spinner"></span> Calculando...</>
                    : freteExpired ? '🔄 Recalcular frete' : 'Calcular frete'
                  }
                </button>
              ) : (
                <button className="btn-primary" onClick={() => goToStep(4)}>Confirmar endereço →</button>
              )}
              <button className="btn-secondary" onClick={() => goToStep(2)}>← Voltar aos dados</button>
            </div>
          </>
        )}

        {/* Step 4: Garantia */}
        {step === 4 && (
          <>
            <h2>Garantia</h2>
            <div style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '16px 18px',
              marginBottom: 20,
              color: 'var(--fg)',
              fontSize: '0.92rem',
              lineHeight: 1.6,
            }}>
              <strong style={{ display: 'block', marginBottom: 10, color: '#fff' }}>Leia com atenção antes de continuar:</strong>
              Lembre-se: pods são produtos consumíveis. Por esse motivo, não conseguimos oferecer uma garantia abrangente. O prazo de garantia é de <strong style={{ color: 'var(--accent)' }}>4 dias</strong>. Ao concluir a compra, você estará ciente e de acordo com essas condições.
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', marginBottom: 20 }}>
              <input
                type="checkbox"
                checked={termosAceitos}
                onChange={e => setTermosAceitos(e.target.checked)}
                style={{ marginTop: 3, accentColor: 'var(--accent)', width: 18, height: 18, flexShrink: 0, cursor: 'pointer' }}
              />
              <span style={{ color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.5 }}>
                Li e estou ciente das condições de garantia descritas acima.
              </span>
            </label>
            <div className="modal-actions">
              <button
                className="btn-primary"
                onClick={() => goToStep(5)}
                disabled={!termosAceitos}
                style={{ opacity: termosAceitos ? 1 : 0.4 }}
              >
                Ir para pagamento →
              </button>
              <button className="btn-secondary" onClick={() => goToStep(3)}>← Voltar à entrega</button>
            </div>
          </>
        )}

        {/* Step 5: Payment */}
        {step === 5 && (
          <>
            <h2>Pagamento</h2>
            <div className="payment-summary">
              <div className="pay-row">
                <span className="l">Produtos</span>
                <span className="v">{fmtBRLFromDecimal(subtotal)}</span>
              </div>
              <div className="pay-row">
                <span className="l">Frete</span>
                <span className="v">{freteResult ? freteResult.priceFormatted : '—'}</span>
              </div>
              <div className="pay-row grand">
                <span className="l">Total a pagar</span>
                <span className="v">{fmtBRLFromDecimal(total)}</span>
              </div>
              {freteTimer && !freteExpired && (
                <div className="frete-eta" style={{ marginTop: 10 }}>
                  ⏰ Válido por: <b style={{ color: freteTimer.startsWith('0:') ? '#ff9900' : 'var(--accent2)' }}>{freteTimer}</b>
                </div>
              )}
              {freteExpired && (
                <div className="frete-eta" style={{ marginTop: 10, color: '#ff4d4d' }}>
                  ⏰ Cotação expirada. Recalcule o frete para continuar.
                </div>
              )}
            </div>
            <div className="secure-badge">
              🚚 Prazo de entrega <strong style={{ color: '#fff', marginLeft: 4 }}>45 a 150 minutos</strong>
            </div>
            <div className="secure-badge">
              🔒 Pagamento seguro via <strong style={{ color: '#fff', marginLeft: 4 }}>Mercado Pago / Cielo</strong>
            </div>
            {pagError && <div className="error-msg visible">{pagError}</div>}
            <div className="modal-actions">
              {freteExpired ? (
                <button className="btn-primary" onClick={() => goToStep(3)}>🔄 Recalcular frete</button>
              ) : (
                <>
                  <button
                    className="btn-primary"
                    onClick={iniciarPagamento}
                    disabled={pagLoading || cardLoading}
                    style={{ background: '#FF8C00' }}
                  >
                    {pagLoading
                      ? <><span className="spinner"></span> Aguarde...</>
                      : '🔷 Pagar com PIX'
                    }
                  </button>
                  <button
                    className="btn-primary"
                    onClick={pagarCartao}
                    disabled={pagLoading || cardLoading}
                    style={{ background: '#1a56db', flexDirection: 'column', gap: 2, padding: '14px 16px' }}
                  >
                    {cardLoading
                      ? <><span className="spinner"></span> Aguarde...</>
                      : <><span>💳 Pagar com Cartão</span><span style={{ fontSize: '0.7rem', opacity: 0.8, fontWeight: 400 }}>Taxa de 5,2% será aplicada</span></>
                    }
                  </button>
                </>
              )}
              <button className="btn-secondary" onClick={() => goToStep(4)}>← Voltar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
