const Stripe = require("stripe");
const { connectBlobs, decrementForOrder, productIdFromStripePrice, inventoryKey } = require("./_lib/inventory");

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    console.error("Webhook not configured");
    return { statusCode: 500, body: "Webhook not configured" };
  }

  const signature = event.headers["stripe-signature"];
  if (!signature) {
    return { statusCode: 400, body: "Missing signature" };
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature error", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type !== "checkout.session.completed") {
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  try {
    const sessionObject = stripeEvent.data.object;
    const decrements = {};

    let orderRows = [];
    const rawMeta = sessionObject.metadata?.dobetter_order;
    if (rawMeta) {
      try {
        const parsed = JSON.parse(rawMeta);
        if (Array.isArray(parsed)) orderRows = parsed;
      } catch {
        /* fall back to line items */
      }
    }

    if (orderRows.length) {
      for (const row of orderRows) {
        const id = typeof row.id === "string" ? row.id : "";
        const size = typeof row.size === "string" ? row.size : "";
        const qty = Number(row.qty);
        if (!id || !Number.isInteger(qty) || qty < 1) continue;
        const key = size ? inventoryKey(id, size) : id;
        decrements[key] = (decrements[key] || 0) + qty;
      }
    } else {
      const sessionId = sessionObject.id;
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["line_items.data.price"],
      });

      const lines = session.line_items?.data || [];
      for (const line of lines) {
        const priceId = typeof line.price === "string" ? line.price : line.price?.id;
        const productId = productIdFromStripePrice(priceId);
        if (!productId) continue;
        decrements[productId] = (decrements[productId] || 0) + (line.quantity || 0);
      }
    }

    connectBlobs(event);
    await decrementForOrder(decrements);
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Webhook handler failed" };
  }
};