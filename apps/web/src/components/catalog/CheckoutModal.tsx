'use client';

import React, { useState, useEffect } from 'react';
import type { CartItem } from '@/types';
import { saveCart, getCartSubtotal } from '@/lib/cart';
import { api, fmtBRLFromDecimal } from '@/lib/api';

interface CheckoutModalProps {
  cart: CartItem[];
  onClose: () => void;
  onUpdateCart: (newCart: CartItem[]) => void;
}

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

export default function CheckoutModal({ cart, onClose, onUpdateCart }: CheckoutModalProps) {
  const [localCart, setLocalCart] = useState<CartItem[]>(cart);
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
  const [freteTimer, setFreteTimer] = useState<string>('');
  const [freteExpired, setFreteExpired] = useState(false);
  const [freteExpiresAt, setFreteExpiresAt] = useState<number | null>(null);

  // Step 4
  const [pagLoading, setPagLoading] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);
  const [pagError, setPagError] = useState('');

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
      }
    } catch {}
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
    if (cep.replace(/\D/g, '').length !== 8) { setFreteError('CEP inválido.'); return; }
    if (!rua.trim()) { setFreteError('Informe a rua.'); return; }
    setFreteError('');
    setFreteLoading(true);
    try {
      const result = await api.shipping.quote({
        zipCode: cep,
        address: `${rua}, ${numero}, ${bairro}, ${cidade}`,
      });
      setFreteResult(result);
      setFreteExpired(false);
      setFreteTimer('');
      setFreteExpiresAt(Date.now() + 5 * 60 * 1000);
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
        items: localCart.map(i => ({
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
      sessionStorage.setItem('pedidoAtual', JSON.stringify({
        orderId: result.orderId,
        accessToken: result.accessToken,
      }));
      onUpdateCart([]);
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
          name:   i.productName,
          flavor: i.variantName,
          price:  i.price,
          qty:    i.qty,
        })),
        shippingPrice: freteValue,
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
                  <label>CEP</label>
                  <input
                    type="text"
                    value={cep}
                    onChange={e => { setCep(maskCEP(e.target.value)); resetFrete(); }}
                    onBlur={fetchCEP}
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
                  placeholder="Preenchido pelo CEP"
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
                <button className="btn-primary" onClick={() => goToStep(4)}>Confirmar e ir para pagamento →</button>
              )}
              <button className="btn-secondary" onClick={() => goToStep(2)}>← Voltar aos dados</button>
            </div>
          </>
        )}

        {/* Step 4: Payment */}
        {step === 4 && (
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
            </div>
            <div className="secure-badge">
              🔒 Pagamento seguro via <strong style={{ color: '#fff', marginLeft: 4 }}>Mercado Pago / Cielo</strong>
            </div>
            {pagError && <div className="error-msg visible">{pagError}</div>}
            <div className="modal-actions">
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
                style={{ background: '#1a56db' }}
              >
                {cardLoading
                  ? <><span className="spinner"></span> Aguarde...</>
                  : '💳 Pagar com Cartão'
                }
              </button>
              <button className="btn-secondary" onClick={() => goToStep(3)}>← Voltar à entrega</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
