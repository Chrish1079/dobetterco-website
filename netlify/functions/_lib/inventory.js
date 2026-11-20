const { connectLambda, getStore } = require("@netlify/blobs");
const products = require("../../../data/products.json");

const productById = new Map(products.map((p) => [p.id, p]));
const priceToProductId = new Map(
  products.filter((p) => p.stripePriceId).map((p) => [p.stripePriceId, p.id])
);

const SIZE_SEP = "::";

function productSizes(product) {
  if (!product || !Array.isArray(product.sizes) || product.sizes.length === 0) return null;
  return product.sizes;
}

function inventoryKey(productId, sizeId) {
  if (!sizeId) return productId;
  return `${productId}${SIZE_SEP}${sizeId}`;
}

function parseInventoryKey(key) {
  const idx = key.indexOf(SIZE_SEP);
  if (idx === -1) return { productId: key, sizeId: "" };
  return { productId: key.slice(0, idx), sizeId: key.slice(idx + SIZE_SEP.length) };
}

function sizeCatalogStock(product) {
  const sizes = productSizes(product);
  if (!sizes) {
    if (typeof product.stock === "number" && product.stock >= 0) {
      return { [product.id]: product.stock };
    }
    return { [product.id]: null };
  }

  const out = {};
  for (const row of sizes) {
    const tracked = typeof row.stock === "number" && row.stock >= 0;
    out[inventoryKey(product.id, row.id)] = tracked ? row.stock : null;
  }
  return out;
}

function isTrackedKey(product, sizeId) {
  const sizes = productSizes(product);
  if (!sizes) {
    return typeof product.stock === "number" && product.stock >= 0;
  }
  const row = sizes.find((s) => s.id === sizeId);
  return row && typeof row.stock === "number" && row.stock >= 0;
}

function catalogFallbackForKey(product, sizeId) {
  const sizes = productSizes(product);
  if (!sizes) {
    return typeof product.stock === "number" ? product.stock : 0;
  }
  const row = sizes.find((s) => s.id === sizeId);
  return row && typeof row.stock === "number" ? row.stock : 0;
}

function catalogStock() {
  const out = {};
  for (const product of products) {
    Object.assign(out, sizeCatalogStock(product));
  }
  return out;
}

function connectBlobs(event) {
  if (event) connectLambda(event);
}

function getStoreInstance() {
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) {
    return getStore({
      name: "product-inventory",
      siteID,
      token,
      consistency: "strong",
    });
  }
  return getStore("product-inventory");
}

async function readRemaining(store, stockKey, fallback) {
  const row = await store.get(stockKey, { type: "json" });
  if (row && typeof row.remaining === "number") return Math.max(0, row.remaining);
  return Math.max(0, fallback);
}

/** @returns {Record<string, number | null>} null = unlimited */
async function getPublicStock() {
  let store;
  try {
    store = getStoreInstance();
  } catch (err) {
    console.error("Blobs store unavailable:", err.message);
    return catalogStock();
  }

  try {
    const out = {};
    for (const product of products) {
      const sizes = productSizes(product);
      if (!sizes) {
        const tracked = typeof product.stock === "number" && product.stock >= 0;
        if (!tracked) {
          out[product.id] = null;
          continue;
        }
        const remaining = await readRemaining(store, product.id, product.stock);
        if (!(await store.get(product.id))) {
          await store.setJSON(product.id, { remaining });
        }
        out[product.id] = remaining;
        continue;
      }

      for (const sizeRow of sizes) {
        const key = inventoryKey(product.id, sizeRow.id);
        const tracked = typeof sizeRow.stock === "number" && sizeRow.stock >= 0;
        if (!tracked) {
          out[key] = null;
          continue;
        }
        const remaining = await readRemaining(store, key, sizeRow.stock);
        if (!(await store.get(key))) {
          await store.setJSON(key, { remaining });
        }
        out[key] = remaining;
      }
    }
    return out;
  } catch (err) {
    console.error("Blobs read failed:", err.message);
    return catalogStock();
  }
}

function normalizeCartItem(item) {
  const id = typeof item.id === "string" ? item.id : "";
  const size = typeof item.size === "string" ? item.size.trim() : "";
  const quantity = Number(item.quantity);
  return { id, size, quantity };
}

function resolveItemStockKey(product, size) {
  const sizes = productSizes(product);
  if (!sizes) return product.id;
  if (!size) return null;
  if (!sizes.some((s) => s.id === size)) return null;
  return inventoryKey(product.id, size);
}

function sizeLabel(product, sizeId) {
  const sizes = productSizes(product);
  if (!sizes) return "";
  const row = sizes.find((s) => s.id === sizeId);
  return row ? row.label || row.id : sizeId;
}

async function validateCartItems(items) {
  const stock = await getPublicStock();
  const problems = [];

  for (const raw of items) {
    const item = normalizeCartItem(raw);
    const product = productById.get(item.id);
    if (!product) continue;

    const stockKey = resolveItemStockKey(product, item.size);
    if (stockKey === null) {
      problems.push(`Choose a size for ${product.name}.`);
      continue;
    }

    const cap = stock[stockKey];
    if (cap === null) continue;
    if (cap <= 0) {
      const label = item.size ? `${product.name} (${sizeLabel(product, item.size)})` : product.name;
      problems.push(`${label} is sold out.`);
    } else if (item.quantity > cap) {
      const label = item.size ? `${product.name} (${sizeLabel(product, item.size)})` : product.name;
      problems.push(`Only ${cap} left for ${label}.`);
    }
  }

  if (problems.length) {
    const err = new Error(problems.join(" "));
    err.statusCode = 409;
    throw err;
  }
}

async function decrementForOrder(decrements) {
  let store;
  try {
    store = getStoreInstance();
  } catch (err) {
    console.error("Blobs store unavailable for decrement:", err.message);
    return;
  }

  try {
    for (const [stockKey, quantity] of Object.entries(decrements)) {
      if (quantity < 1) continue;

      const { productId, sizeId } = parseInventoryKey(stockKey);
      const product = productById.get(productId);
      if (!product || !isTrackedKey(product, sizeId)) continue;

      const fallback = catalogFallbackForKey(product, sizeId);
      const remaining = await readRemaining(store, stockKey, fallback);
      await store.setJSON(stockKey, { remaining: Math.max(0, remaining - quantity) });
    }
  } catch (err) {
    console.error("Blobs decrement failed:", err.message);
  }
}

function productIdFromStripePrice(priceId) {
  return priceId ? priceToProductId.get(priceId) : undefined;
}

/** Overwrite blob counts from data/products.json (admin reset). */
async function resetInventoryFromCatalog() {
  const store = getStoreInstance();
  const out = {};

  for (const product of products) {
    const sizes = productSizes(product);
    if (!sizes) {
      const tracked = typeof product.stock === "number" && product.stock >= 0;
      if (!tracked) continue;
      await store.setJSON(product.id, { remaining: product.stock });
      out[product.id] = product.stock;
      continue;
    }

    for (const sizeRow of sizes) {
      if (typeof sizeRow.stock !== "number" || sizeRow.stock < 0) continue;
      const key = inventoryKey(product.id, sizeRow.id);
      await store.setJSON(key, { remaining: sizeRow.stock });
      out[key] = sizeRow.stock;
    }
  }

  return out;
}

module.exports = {
  connectBlobs,
  getPublicStock,
  validateCartItems,
  decrementForOrder,
  resetInventoryFromCatalog,
  productIdFromStripePrice,
  inventoryKey,
  resolveItemStockKey,
  normalizeCartItem,
  productSizes,
  products,
};