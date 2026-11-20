const CART_KEY = "dobetterco-cart";
const CHECKOUT_ENDPOINT = "/.netlify/functions/create-checkout";

/** @type {Map<string, { id: string, name: string, priceCents: number, image: string, sizes?: Array<{ id: string, label: string }> }>} */
let catalog = new Map();

function formatMoney(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function cartRowKey(id, size) {
  return size ? `${id}::${size}` : id;
}

function productRequiresSize(product) {
  return product && Array.isArray(product.sizes) && product.sizes.length > 0;
}

function sizeLabel(product, sizeId) {
  if (!product || !sizeId) return "";
  const row = product.sizes?.find((s) => s.id === sizeId);
  return row ? row.label || row.id : sizeId;
}

function readCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row) => {
      if (!row || typeof row.id !== "string" || !Number.isInteger(row.quantity) || row.quantity <= 0) {
        return false;
      }
      const product = catalog.get(row.id);
      if (productRequiresSize(product)) {
        return typeof row.size === "string" && row.size.length > 0;
      }
      return true;
    });
  } catch {
    return [];
  }
}

function writeCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

function cartCount(items) {
  return items.reduce((sum, row) => sum + row.quantity, 0);
}

function cartSubtotal(items) {
  return items.reduce((sum, row) => {
    const product = catalog.get(row.id);
    return sum + (product ? product.priceCents * row.quantity : 0);
  }, 0);
}

function setCartOpen(open) {
  const drawer = document.getElementById("cart-drawer");
  const backdrop = document.getElementById("cart-backdrop");
  const toggle = document.querySelector(".cart-toggle");
  if (!drawer || !backdrop) return;

  drawer.hidden = !open;
  backdrop.hidden = !open;
  document.body.classList.toggle("cart-open", open);
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close cart" : "Open cart");
  }
  if (open) {
    const closeBtn = drawer.querySelector(".cart-drawer__close");
    closeBtn?.focus();
  }
}

function renderCart() {
  const items = readCart();
  const countEl = document.querySelector("[data-cart-count]");
  const linesEl = document.getElementById("cart-lines");
  const emptyEl = document.getElementById("cart-empty");
  const footerEl = document.getElementById("cart-footer");
  const subtotalEl = document.getElementById("cart-subtotal");
  const count = cartCount(items);

  if (countEl) {
    countEl.textContent = String(count);
    countEl.hidden = count === 0;
  }

  if (!linesEl || !emptyEl || !footerEl) return;

  linesEl.innerHTML = "";

  if (items.length === 0) {
    emptyEl.hidden = false;
    footerEl.hidden = true;
    return;
  }

  emptyEl.hidden = true;
  footerEl.hidden = false;

  for (const row of items) {
    const product = catalog.get(row.id);
    if (!product) continue;

    const sizeText = row.size ? sizeLabel(product, row.size) : "";
    const metaLine = sizeText ? `<p class="cart-line__size">Size ${sizeText}</p>` : "";
    const lineKey = cartRowKey(row.id, row.size || "");

    const li = document.createElement("li");
    li.className = "cart-line";
    li.innerHTML = `
      <img class="cart-line__thumb" src="${product.image}" alt="" width="64" height="80" loading="lazy" />
      <div class="cart-line__body">
        <p class="cart-line__name">${product.name}</p>
        ${metaLine}
        <p class="cart-line__price">${formatMoney(product.priceCents)}</p>
        <div class="cart-line__qty" role="group" aria-label="Quantity for ${product.name}${sizeText ? `, size ${sizeText}` : ""}">
          <button type="button" class="cart-line__qty-btn" data-cart-action="dec" data-line-key="${lineKey}" aria-label="Decrease quantity">−</button>
          <span class="cart-line__qty-val">${row.quantity}</span>
          <button type="button" class="cart-line__qty-btn" data-cart-action="inc" data-line-key="${lineKey}" aria-label="Increase quantity">+</button>
        </div>
      </div>
      <button type="button" class="cart-line__remove" data-cart-action="remove" data-line-key="${lineKey}" aria-label="Remove ${product.name}">Remove</button>
    `;
    linesEl.appendChild(li);
  }

  if (subtotalEl) subtotalEl.textContent = formatMoney(cartSubtotal(items));
}

function maxQuantityFor(productId, size) {
  if (!window.dobetterInventory) return 99;
  const left = window.dobetterInventory.getRemaining(productId, size || undefined);
  if (left === null) return 99;
  return Math.max(0, Math.min(99, left));
}

async function addToCart(productId, quantity = 1, size = "") {
  const product = catalog.get(productId);
  if (!product) return;
  if (productRequiresSize(product)) {
    if (!size) return;
    if (!product.sizes.some((s) => s.id === size)) return;
  }

  if (window.dobetterInventory) {
    await window.dobetterInventory.ready;
    if (productRequiresSize(product)) {
      if (window.dobetterInventory.isSizeSoldOut(productId, size)) return;
    } else if (window.dobetterInventory.isSoldOut(productId)) return;
    const cap = maxQuantityFor(productId, size);
    if (quantity > cap) return;
  }

  const items = readCart();
  const existing = items.find((row) => row.id === productId && (row.size || "") === (size || ""));
  const cap = maxQuantityFor(productId, size);
  if (existing) {
    existing.quantity = Math.min(cap || 99, Math.min(99, existing.quantity + quantity));
  } else {
    items.push({ id: productId, size: size || undefined, quantity: Math.min(cap || 99, quantity) });
  }
  writeCart(items);
  renderCart();
  setCartOpen(true);
}

function findLineIndex(items, lineKey) {
  return items.findIndex((row) => cartRowKey(row.id, row.size || "") === lineKey);
}

function updateCart(lineKey, action) {
  let items = readCart();
  const index = findLineIndex(items, lineKey);
  if (index === -1) return;

  const row = items[index];

  if (action === "remove") {
    items.splice(index, 1);
  } else if (action === "inc") {
    const cap = maxQuantityFor(row.id, row.size || "");
    if (cap <= 0) return;
    items[index].quantity = Math.min(cap, Math.min(99, items[index].quantity + 1));
  } else if (action === "dec") {
    items[index].quantity -= 1;
    if (items[index].quantity <= 0) items.splice(index, 1);
  }

  writeCart(items);
  renderCart();
}

async function checkoutWithItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Nothing to checkout.");
  }

  const response = await fetch(CHECKOUT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.url) {
    throw new Error(data.error || "Checkout could not be started.");
  }
  window.location.href = data.url;
}

async function startCheckout() {
  const items = readCart();
  if (items.length === 0) return;

  const btn = document.querySelector("[data-cart-checkout]");
  const errEl = document.getElementById("cart-error");
  if (errEl) errEl.textContent = "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Redirecting…";
  }

  try {
    await checkoutWithItems(
      items.map((row) => ({
        id: row.id,
        quantity: row.quantity,
        ...(row.size ? { size: row.size } : {}),
      }))
    );
  } catch (err) {
    if (errEl) errEl.textContent = err instanceof Error ? err.message : "Checkout failed.";
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Checkout";
    }
  }
}

async function loadCatalog() {
  try {
    const response = await fetch("/data/products.json");
    if (!response.ok) throw new Error("catalog");
    const list = await response.json();
    if (!Array.isArray(list)) return;
    catalog = new Map(list.map((p) => [p.id, p]));
  } catch {
    console.warn("Could not load product catalog.");
  }
}

function getSelectedProductSize() {
  const fieldset = document.getElementById("product-size");
  if (!fieldset) return "";
  const checked = fieldset.querySelector('input[name="size"]:checked');
  return checked instanceof HTMLInputElement ? checked.value : "";
}

function bindCartUi() {
  document.querySelector(".cart-toggle")?.addEventListener("click", () => {
    const expanded = document.querySelector(".cart-toggle")?.getAttribute("aria-expanded") === "true";
    setCartOpen(!expanded);
  });

  document.getElementById("cart-backdrop")?.addEventListener("click", () => setCartOpen(false));
  document.querySelector(".cart-drawer__close")?.addEventListener("click", () => setCartOpen(false));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setCartOpen(false);
  });

  document.body.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.classList.contains("add-to-cart") || target.closest(".add-to-cart")) {
      const btn = target.classList.contains("add-to-cart") ? target : target.closest(".add-to-cart");
      const id = btn?.getAttribute("data-product-id");
      const qtyEl = document.getElementById("product-qty");
      let quantity = 1;
      if (qtyEl) {
        const parsed = parseInt(qtyEl.value, 10);
        if (Number.isFinite(parsed)) quantity = Math.min(99, Math.max(1, parsed));
      }
      const size = getSelectedProductSize();
      const product = id ? catalog.get(id) : null;
      if (productRequiresSize(product) && !size) {
        const errEl = document.getElementById("product-error");
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = "Choose a size before adding to cart.";
        }
        return;
      }
      if (id) addToCart(id, quantity, size);
      return;
    }

    if (target.closest("[data-buy-now]")) {
      return;
    }

    const actionEl = target.closest("[data-cart-action]");
    if (!actionEl) return;
    const lineKey = actionEl.getAttribute("data-line-key");
    const action = actionEl.getAttribute("data-cart-action");
    if (lineKey && action) updateCart(lineKey, action);
  });

  document.querySelector("[data-cart-checkout]")?.addEventListener("click", startCheckout);
}

const catalogReady = loadCatalog().then(() => {
  renderCart();
  bindCartUi();
});

window.dobetterCart = {
  ready: catalogReady,
  formatMoney,
  getProduct: (id) => catalog.get(id),
  addToCart,
  checkoutWithItems,
  getSelectedProductSize,
  productRequiresSize,
};