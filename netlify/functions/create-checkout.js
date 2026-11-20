const Stripe = require("stripe");
const products = require("../../data/products.json");
const { validateCartItems } = require("./_lib/inventory");

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

const productById = new Map(products.map((p) => [p.id, p]));

function siteOrigin(event) {
  const fromEnv = process.env.URL || process.env.DEPLOY_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const origin = event.headers.origin;
  if (origin) return origin.replace(/\/$/, "");
  const referer = event.headers.referer;
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      /* ignore */
    }
  }
  return "http://localhost:8888";
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const stripe = getStripe();
  if (!stripe) {
    return json(500, { error: "Checkout is not configured. Add STRIPE_SECRET_KEY in Netlify." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid request body." });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return json(400, { error: "Your cart is empty." });
  }

  const lineItems = [];
  for (const item of items) {
    const id = typeof item.id === "string" ? item.id : "";
    const quantity = Number(item.quantity);
    if (!id || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return json(400, { error: "Invalid cart item." });
    }

    const product = productById.get(id);
    if (!product) {
      return json(400, { error: `Unknown product: ${id}` });
    }
    if (!product.stripePriceId) {
      return json(503, {
        error: `Stripe Price ID missing for “${product.name}”. Add stripePriceId in data/products.json.`,
      });
    }

    lineItems.push({ price: product.stripePriceId, quantity });
  }

  try {
    await validateCartItems(items);
  } catch (err) {
    const status = err.statusCode || 409;
    return json(status, { error: err.message || "Not enough stock." });
  }

  const origin = siteOrigin(event);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: `${origin}/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout-cancel.html`,
      allow_promotion_codes: true,
      shipping_address_collection: { allowed_countries: ["US"] },
      phone_number_collection: { enabled: true },
    });

    return json(200, { url: session.url });
  } catch (err) {
    console.error(err);
    return json(502, { error: "Could not start checkout. Please try again." });
  }
};

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(data),
  };
}