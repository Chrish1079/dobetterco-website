const { getStore } = require("@netlify/blobs");
const products = require("../../../data/products.json");

const productById = new Map(products.map((p) => [p.id, p]));
const priceToProductId = new Map(
  products.filter((p) => p.stripePriceId).map((p) => [p.stripePriceId, p.id])
);

function isTracked(product) {
  return product && typeof product.stock === "number" && product.stock >= 0;
}

async function getStoreInstance() {
  return getStore({ name: "product-inventory", consistency: "strong" });
}

async function readRemaining(store, productId, fallback) {
  const row = await store.get(productId, { type: "json" });
  if (row && typeof row.remaining === "number") return Math.max(0, row.remaining);
  return Math.max(0, fallback);
}

/** @returns {Record<string, number | null>} null = unlimited */
async function getPublicStock() {
  const store = await getStoreInstance();
  const out = {};

  for (const product of products) {
    if (!isTracked(product)) {
      out[product.id] = null;
      continue;
    }
    const remaining = await readRemaining(store, product.id, product.stock);
    if (!(await store.get(product.id))) {
      await store.setJSON(product.id, { remaining });
    }
    out[product.id] = remaining;
  }

  return out;
}

async function validateCartItems(items) {
  const stock = await getPublicStock();
  const problems = [];

  for (const item of items) {
    const product = productById.get(item.id);
    if (!product) continue;
    const cap = stock[item.id];
    if (cap === null) continue;
    if (cap <= 0) {
      problems.push(`${product.name} is sold out.`);
    } else if (item.quantity > cap) {
      problems.push(`Only ${cap} left for ${product.name}.`);
    }
  }

  if (problems.length) {
    const err = new Error(problems.join(" "));
    err.statusCode = 409;
    throw err;
  }
}

async function decrementForOrder(decrements) {
  const store = await getStoreInstance();

  for (const [productId, quantity] of Object.entries(decrements)) {
    const product = productById.get(productId);
    if (!product || !isTracked(product) || quantity < 1) continue;

    const remaining = await readRemaining(store, productId, product.stock);
    await store.setJSON(productId, { remaining: Math.max(0, remaining - quantity) });
  }
}

function productIdFromStripePrice(priceId) {
  return priceId ? priceToProductId.get(priceId) : undefined;
}

module.exports = {
  getPublicStock,
  validateCartItems,
  decrementForOrder,
  productIdFromStripePrice,
  products,
};