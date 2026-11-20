function getProductIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  return id && id.trim() ? id.trim() : "";
}

function getProductQuantity() {
  const qtyEl = document.getElementById("product-qty");
  if (!qtyEl) return 1;
  const parsed = parseInt(qtyEl.value, 10);
  if (!Number.isFinite(parsed)) return 1;
  const max = parseInt(qtyEl.max, 10);
  const cap = Number.isFinite(max) ? max : 99;
  return Math.min(cap, Math.max(1, parsed));
}

function getSelectedSize() {
  return window.dobetterCart?.getSelectedProductSize?.() || "";
}

function productHasSizes(product) {
  return window.dobetterInventory?.productHasSizes(product);
}

function readSelectedSizeFromDom() {
  const checked = document.querySelector('#product-size input[name="size"]:checked');
  return checked instanceof HTMLInputElement ? checked.value : "";
}

function updateSizeOptionStates(product) {
  if (!productHasSizes(product)) return;
  const container = document.getElementById("product-size-options");
  if (!container) return;

  let selectedStillValid = false;

  for (const row of product.sizes) {
    const input = container.querySelector(`input[name="size"][value="${row.id}"]`);
    if (!(input instanceof HTMLInputElement)) continue;
    const soldOut = window.dobetterInventory?.isSizeSoldOut(product.id, row.id);
    input.disabled = soldOut;
    input.closest(".product-detail__size")?.classList.toggle("product-detail__size--unavailable", soldOut);
    if (input.checked && !soldOut) selectedStillValid = true;
    if (input.checked && soldOut) input.checked = false;
  }

  if (!selectedStillValid) {
    const first = container.querySelector('input[name="size"]:not(:disabled)');
    if (first instanceof HTMLInputElement) first.checked = true;
  }
}

function buildSizeOptions(product) {
  const fieldset = document.getElementById("product-size");
  const container = document.getElementById("product-size-options");
  if (!fieldset || !container) return;

  const previous = readSelectedSizeFromDom();

  container.innerHTML = "";

  if (!productHasSizes(product)) {
    fieldset.hidden = true;
    return;
  }

  fieldset.hidden = false;
  let firstAvailable = null;
  let restore = null;

  for (const row of product.sizes) {
    const soldOut = window.dobetterInventory?.isSizeSoldOut(product.id, row.id);
    const id = `size-opt-${product.id}-${row.id}`;
    const label = document.createElement("label");
    label.className = "product-detail__size";
    if (soldOut) label.classList.add("product-detail__size--unavailable");

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "size";
    input.id = id;
    input.value = row.id;
    input.disabled = Boolean(soldOut);

    const span = document.createElement("span");
    span.textContent = row.label || row.id;

    label.append(input, span);
    container.appendChild(label);

    if (!soldOut && row.id === previous) restore = input;
    if (!soldOut && !firstAvailable) firstAvailable = input;
  }

  const toSelect = restore || firstAvailable;
  if (toSelect) toSelect.checked = true;
}

function setProductPage(product) {
  const loading = document.getElementById("product-loading");
  const content = document.getElementById("product-content");
  const missing = document.getElementById("product-missing");
  if (loading) loading.hidden = true;

  if (!product) {
    if (missing) missing.hidden = false;
    document.title = "Product not found — DO BETTER CO.";
    return;
  }

  const img = document.getElementById("product-image");
  const name = document.getElementById("product-name");
  const price = document.getElementById("product-price");
  const description = document.getElementById("product-description");
  const addBtn = document.getElementById("product-add-cart");

  if (img) {
    img.src = product.image;
    img.alt = product.name;
  }
  if (name) name.textContent = product.name;
  if (price) price.textContent = window.dobetterCart.formatMoney(product.priceCents);
  if (description) {
    const copy = product.description || "Part of the DO BETTER CO. collection — built for people who keep showing up.";
    description.textContent = copy;
  }
  if (addBtn) addBtn.setAttribute("data-product-id", product.id);

  buildSizeOptions(product);

  if (content) content.hidden = false;
  document.title = `${product.name} — DO BETTER CO.`;
}

function applyProductStock(product) {
  if (!product) return;

  const buyNowBtn = document.getElementById("product-buy-now");
  const addBtn = document.getElementById("product-add-cart");
  const qtyEl = document.getElementById("product-qty");
  const media = document.querySelector(".product-detail__media");
  const sizeFieldset = document.getElementById("product-size");

  let stockNote = document.getElementById("product-stock-note");
  if (!stockNote) {
    stockNote = document.createElement("p");
    stockNote.id = "product-stock-note";
    stockNote.className = "product-detail__stock";
    const qtyRow = document.querySelector(".product-detail__qty");
    qtyRow?.parentElement?.insertBefore(stockNote, qtyRow);
  }

  if (productHasSizes(product)) {
    updateSizeOptionStates(product);

    const size = getSelectedSize();
    const left = size ? window.dobetterInventory?.getRemaining(product.id, size) : null;
    const productSoldOut = window.dobetterInventory?.isSoldOut(product.id);

    if (productSoldOut) {
      stockNote.textContent = "Sold out";
      media?.classList.add("product-detail__media--sold-out");
      if (qtyEl) qtyEl.max = "0";
      if (buyNowBtn) buyNowBtn.disabled = true;
      if (addBtn) addBtn.disabled = true;
      return;
    }

    media?.classList.remove("product-detail__media--sold-out");
    if (buyNowBtn) buyNowBtn.disabled = false;
    if (addBtn) addBtn.disabled = false;

    if (!size) {
      stockNote.textContent = "Select a size";
      if (qtyEl) qtyEl.max = "99";
      return;
    }

    if (left !== null && left <= 0) {
      stockNote.textContent = "This size is sold out — choose another size";
      if (qtyEl) {
        qtyEl.max = "1";
        qtyEl.value = "1";
      }
      return;
    }

    stockNote.textContent = "";
    if (qtyEl) {
      const maxQ = left === null ? 99 : Math.min(99, left);
      qtyEl.max = String(maxQ);
      const current = parseInt(qtyEl.value, 10);
      if (Number.isFinite(current) && current > maxQ) qtyEl.value = String(maxQ);
    }
    return;
  }

  const left = window.dobetterInventory?.getRemaining(product.id);
  if (left === null) {
    stockNote.textContent = "";
    media?.classList.remove("product-detail__media--sold-out");
    if (qtyEl) qtyEl.max = "99";
    if (buyNowBtn) buyNowBtn.disabled = false;
    if (addBtn) addBtn.disabled = false;
    if (sizeFieldset) sizeFieldset.hidden = true;
    return;
  }

  if (left <= 0) {
    stockNote.textContent = "Sold out";
    media?.classList.add("product-detail__media--sold-out");
    if (buyNowBtn) buyNowBtn.disabled = true;
    if (addBtn) addBtn.disabled = true;
    return;
  }

  stockNote.textContent = "";
  media?.classList.remove("product-detail__media--sold-out");
  if (qtyEl) qtyEl.max = String(Math.min(99, left));
  if (buyNowBtn) buyNowBtn.disabled = false;
  if (addBtn) addBtn.disabled = false;
}

function bindSizeChange(product) {
  const fieldset = document.getElementById("product-size");
  fieldset?.addEventListener("change", () => {
    const errorEl = document.getElementById("product-error");
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }
    applyProductStock(product);
  });
}

async function initProductPage() {
  const productId = getProductIdFromUrl();
  await Promise.all([window.dobetterCart.ready, window.dobetterInventory?.ready ?? Promise.resolve()]);
  const product = productId ? window.dobetterCart.getProduct(productId) : null;
  setProductPage(product);
  applyProductStock(product);
  bindSizeChange(product);

  document.addEventListener("inventory:updated", () => applyProductStock(product));

  const buyNowBtn = document.getElementById("product-buy-now");
  const errorEl = document.getElementById("product-error");

  buyNowBtn?.addEventListener("click", async () => {
    if (!product) return;
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }

    const size = getSelectedSize();
    if (productHasSizes(product) && !size) {
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = "Choose a size before checkout.";
      }
      return;
    }

    if (productHasSizes(product) && window.dobetterInventory?.isSizeSoldOut(product.id, size)) {
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = "That size is sold out.";
      }
      return;
    }

    const quantity = getProductQuantity();
    buyNowBtn.disabled = true;
    const original = buyNowBtn.textContent;
    buyNowBtn.textContent = "Redirecting…";

    try {
      await window.dobetterCart.checkoutWithItems([
        { id: product.id, quantity, ...(size ? { size } : {}) },
      ]);
    } catch (err) {
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = err instanceof Error ? err.message : "Checkout failed.";
      }
      buyNowBtn.disabled = false;
      buyNowBtn.textContent = original;
    }
  });
}

initProductPage();