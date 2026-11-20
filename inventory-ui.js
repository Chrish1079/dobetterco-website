const INVENTORY_ENDPOINT = "/.netlify/functions/inventory";
const SIZE_SEP = "::";

/** @type {Record<string, number | null>} */
let stockLevels = {};
let catalogProducts = [];
let inventoryReady = loadInventory();

function stockKey(productId, sizeId) {
  if (!sizeId) return productId;
  return `${productId}${SIZE_SEP}${sizeId}`;
}

function getProductFromCatalog(productId) {
  return catalogProducts.find((p) => p.id === productId);
}

function productHasSizes(product) {
  return product && Array.isArray(product.sizes) && product.sizes.length > 0;
}

function applyLocalInventoryDemo() {
  const host = window.location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return false;

  const params = new URLSearchParams(window.location.search);
  const demo = params.get("demoStock");
  if (!demo) return false;

  for (const pair of demo.split(",")) {
    const parts = pair.split(":").map((s) => s.trim());
    if (!parts[0]) continue;

    if (parts.length >= 3) {
      const [id, size, raw] = parts;
      const value = parseInt(raw, 10);
      stockLevels[stockKey(id, size)] = Number.isFinite(value) ? value : null;
    } else if (parts.length === 2) {
      const [id, raw] = parts;
      const value = parseInt(raw, 10);
      const product = getProductFromCatalog(id);
      if (productHasSizes(product)) {
        for (const row of product.sizes) {
          stockLevels[stockKey(id, row.id)] = Number.isFinite(value) ? value : null;
        }
      } else {
        stockLevels[id] = Number.isFinite(value) ? value : null;
      }
    }
  }

  applySoldOutUi();
  document.dispatchEvent(new CustomEvent("inventory:updated"));
  return true;
}

async function loadInventoryFromCatalog() {
  try {
    const response = await fetch("/data/products.json", { cache: "no-store" });
    if (!response.ok) return;
    const products = await response.json();
    if (!Array.isArray(products)) return;
    catalogProducts = products;
    for (const product of products) {
      if (productHasSizes(product)) {
        for (const row of product.sizes) {
          const tracked = typeof row.stock === "number";
          stockLevels[stockKey(product.id, row.id)] = tracked ? row.stock : null;
        }
      } else if (typeof product.stock === "number") {
        stockLevels[product.id] = product.stock;
      } else {
        stockLevels[product.id] = null;
      }
    }
  } catch {
    /* ignore */
  }
}

async function loadInventory() {
  try {
    const response = await fetch("/data/products.json", { cache: "no-store" });
    if (response.ok) {
      const list = await response.json();
      if (Array.isArray(list)) catalogProducts = list;
    }
  } catch {
    /* ignore */
  }

  try {
    const response = await fetch(INVENTORY_ENDPOINT, { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      stockLevels = data.stock && typeof data.stock === "object" ? data.stock : {};
    } else {
      await loadInventoryFromCatalog();
    }
  } catch {
    await loadInventoryFromCatalog();
  }

  if (applyLocalInventoryDemo()) return;
  applySoldOutUi();
  document.dispatchEvent(new CustomEvent("inventory:updated"));
}

function getRemainingForKey(key) {
  if (!(key in stockLevels)) return null;
  return stockLevels[key];
}

function getRemaining(productId, sizeId) {
  const product = getProductFromCatalog(productId);
  if (productHasSizes(product)) {
    if (sizeId) return getRemainingForKey(stockKey(productId, sizeId));
    let tracked = false;
    let total = 0;
    for (const row of product.sizes) {
      const left = getRemainingForKey(stockKey(productId, row.id));
      if (left === null) return null;
      tracked = true;
      total += left;
    }
    return tracked ? total : null;
  }
  return getRemainingForKey(productId);
}

function isSizeSoldOut(productId, sizeId) {
  const left = getRemaining(productId, sizeId);
  return left !== null && left <= 0;
}

function isSoldOut(productId) {
  const product = getProductFromCatalog(productId);
  if (productHasSizes(product)) {
    let anyTracked = false;
    let anyAvailable = false;
    for (const row of product.sizes) {
      const left = getRemaining(productId, row.id);
      if (left === null) return false;
      anyTracked = true;
      if (left > 0) anyAvailable = true;
    }
    return anyTracked && !anyAvailable;
  }
  const left = getRemaining(productId);
  return left !== null && left <= 0;
}

function applySoldOutUi() {
  document.querySelectorAll('.product__card[href*="product.html?id="]').forEach((card) => {
    const id = new URL(card.href, window.location.origin).searchParams.get("id");
    if (!id) return;

    const li = card.closest(".product");
    const soldOut = isSoldOut(id);

    const imgWrap = card.querySelector(".product__img");
    if (!imgWrap) return;

    let badge = imgWrap.querySelector(".product__badge--stock");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "product__badge product__badge--stock";
      imgWrap.appendChild(badge);
    }

    if (soldOut) {
      li?.classList.add("product--sold-out");
      badge.textContent = "Sold out";
      badge.classList.add("product__badge--sold-out");
      if (!card.dataset.productHref) {
        const href = card.getAttribute("href");
        if (href) card.dataset.productHref = href;
      }
      card.removeAttribute("href");
      card.classList.add("product__card--unavailable");
      card.setAttribute("aria-disabled", "true");
    } else {
      li?.classList.remove("product--sold-out");
      badge.remove();
      if (card.dataset.productHref) card.setAttribute("href", card.dataset.productHref);
      card.classList.remove("product__card--unavailable");
      card.removeAttribute("aria-disabled");
    }
  });
}

window.dobetterInventory = {
  ready: inventoryReady,
  getRemaining,
  isSoldOut,
  isSizeSoldOut,
  getProductFromCatalog,
  productHasSizes,
  refresh: loadInventory,
};