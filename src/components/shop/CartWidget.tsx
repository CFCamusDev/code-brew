import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';
import { cartCount, cartLines, cartOpen, describeSku, removeFromCart, setQuantity } from '../../lib/shop/cart';
import { MAX_QUANTITY } from '../../lib/shop/limits';
import { formatPEN } from '../../lib/shop/format';
import '../../styles/shop.css';

export default function CartWidget() {
  const storedLines = useStore(cartLines);
  const storedCount = useStore(cartCount);
  const open = useStore(cartOpen);
  const dialog = useRef<HTMLDialogElement>(null);
  // El carrito vive en localStorage: hasta montar en el navegador se pinta vacío, igual que en el HTML del servidor.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const lines = mounted ? storedLines : [];
  const count = mounted ? storedCount : 0;

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const subtotal = lines.reduce((sum, line) => sum + Math.round((describeSku(line.sku)?.price ?? 0) * 100) * line.quantity, 0);

  return (
    <>
      <button
        type="button"
        className="cart-button"
        onClick={() => cartOpen.set(true)}
        aria-label={count ? `Abrir carrito, ${count} ${count === 1 ? 'producto' : 'productos'}` : 'Abrir carrito, vacío'}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M5 8h14l-1.2 11.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 8Z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </svg>
        {count > 0 && <span className="cart-badge">{count}</span>}
      </button>

      <dialog
        ref={dialog}
        className="cart-drawer"
        aria-labelledby="cart-title"
        onClose={() => cartOpen.set(false)}
        onClick={event => event.target === dialog.current && cartOpen.set(false)}
      >
        <div className="cart-panel">
          <header className="cart-head">
            <h2 id="cart-title">Tu carrito</h2>
            <button type="button" className="cart-close" onClick={() => cartOpen.set(false)} aria-label="Cerrar carrito">
              ×
            </button>
          </header>

          {lines.length === 0 ? (
            <div className="cart-empty">
              <p className="cart-code">// carrito vacío</p>
              <p>Aún no agregas ningún café.</p>
              <a className="button primary" href="/#productos" onClick={() => cartOpen.set(false)}>
                Elegir mi café <span aria-hidden="true">↗</span>
              </a>
            </div>
          ) : (
            <>
              <ul className="cart-lines">
                {lines.map(line => {
                  const info = describeSku(line.sku);
                  return (
                    <li key={`${line.sku}|${line.grind}`} className="cart-line">
                      <div>
                        <p className="cart-line-name">{info?.productName ?? line.sku}</p>
                        <p className="cart-line-meta">
                          {info?.format} · {line.grind}
                        </p>
                        <div className="qty" role="group" aria-label={`Cantidad de ${info?.productName ?? line.sku}`}>
                          <button type="button" onClick={() => setQuantity(line.sku, line.grind, line.quantity - 1)} aria-label="Quitar uno">
                            −
                          </button>
                          <span aria-live="polite">{line.quantity}</span>
                          <button
                            type="button"
                            onClick={() => setQuantity(line.sku, line.grind, line.quantity + 1)}
                            disabled={line.quantity >= MAX_QUANTITY}
                            aria-label="Agregar uno"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="cart-line-side">
                        <span>{info ? formatPEN(Math.round(info.price * 100) * line.quantity) : '—'}</span>
                        <button type="button" className="cart-remove" onClick={() => removeFromCart(line.sku, line.grind)}>
                          Quitar
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <footer className="cart-foot">
                <div className="cart-subtotal">
                  <span>Subtotal</span>
                  <strong>{formatPEN(subtotal)}</strong>
                </div>
                <p className="cart-hint">El envío se calcula en el siguiente paso.</p>
                <a className="button primary cart-checkout" href="/checkout">
                  Continuar con mi pedido <span aria-hidden="true">↗</span>
                </a>
              </footer>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
