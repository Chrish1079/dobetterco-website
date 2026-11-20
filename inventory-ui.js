const INVENTORY_ENDPOINT = "/.netlify/functions/inventory";

/** @type {Record<string, number | null>} */
let stockLevels = {};
let inventoryReady = loadInventory();

function applyLocalInventoryDemo() {
  const host = window.location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return false;

  const params = new URLSearchParams(window.location.search);
  const demo = params.get("demoStock");
  if (!demo) return false;

  for (const pair of demo.split(",")) {
    const [id, raw] = pair.split(":").map((s) => s.trim());
    if (!id || raw === undefined) continue;
    const value = parseInt(raw, 10);
    stockLevels[id] = Number.isFinite(value) ? value : null;
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
    for (const product of products) {
      stockLevels[product.id] = typeof product.stock === "number" ? product.stock : null;
    }
  } catch {
    /* ignore */
  }
}

async function loadInventory() {
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

function getRemaining(productId) {
  if (!(productId in stockLevels)) return null;
  return stockLevels[productId];
}

function isSoldOut(productId) {
  const left = getRemaining(productId);
  return left !== null && left <= 0;
}

function applySoldOutUi() {
  document.querySelectorAll('.product__card[href*="product.html?id="]').forEach((card) => {
    const id = new URL(card.href, window.location.origin).searchParams.get("id");
    if (!id) return;

    const li = card.closest(".product");
    const left = getRemaining(id);
    if (left === null) return;

    const imgWrap = card.querySelector(".product__img");
    if (!imgWrap) return;

    let badge = imgWrap.querySelector(".product__badge--stock");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "product__badge product__badge--stock";
      imgWrap.appendChild(badge);
    }

    if (left <= 0) {
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
  refresh: loadInventory,
};