/**
 * Fills stripePriceId in data/products.json from live Stripe Payment Links.
 *
 * Usage (local):
 *   set STRIPE_SECRET_KEY=sk_live_...
 *   node scripts/sync-stripe-prices.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const productsPath = path.join(root, "data", "products.json");

/** Product id → Payment Link URL (from your Stripe Dashboard). */
const paymentLinkByProductId = {
  "tee-olive-statement": "https://buy.stripe.com/5kQaEW95Kgo1dC05LxbV603",
  "tee-black-statement": "https://buy.stripe.com/8x24gya9O0p341q3DpbV604",
  "tee-navy-crest": "https://buy.stripe.com/fZuaEW1Di0p3gOc0rdbV605",
  "tee-black-crest": "https://buy.stripe.com/eVqbJ00ze9ZDfK8fm7bV606",
  "tee-forest-crest": "https://buy.stripe.com/aFa28qa9O0p369y3DpbV607",
  "hat-heather-patch": "https://buy.stripe.com/dRm6oG6XC5Jn1Ti6PBbV608",
  "hat-olive-patch": "https://buy.stripe.com/eVq14meq45Jn8hG5LxbV609",
  "hat-black-patch": "https://buy.stripe.com/cNi7sK2Hm3BffK8a1NbV60a",
  "hat-navy-patch": "https://buy.stripe.com/6oU28q1Di5JngOcddZbV60b",
};

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) {
  console.error("Missing STRIPE_SECRET_KEY. Set it in the shell or Netlify, then re-run.");
  process.exit(1);
}

const stripe = new Stripe(secret);
const products = JSON.parse(fs.readFileSync(productsPath, "utf8"));

const links = await stripe.paymentLinks.list({ limit: 100, active: true });
const urlToLink = new Map(links.data.map((link) => [link.url, link]));

let updated = 0;
const missing = [];

for (const product of products) {
  const wantedUrl = paymentLinkByProductId[product.id];
  if (!wantedUrl) {
    missing.push(`${product.id}: no payment link mapping`);
    continue;
  }

  const link = urlToLink.get(wantedUrl);
  if (!link) {
    missing.push(`${product.id}: payment link not found in Stripe account`);
    continue;
  }

  const detailed = await stripe.paymentLinks.retrieve(link.id, {
    expand: ["line_items.data.price"],
  });

  const line = detailed.line_items?.data?.[0];
  const priceId =
    typeof line?.price === "string" ? line.price : line?.price?.id;

  if (!priceId) {
    missing.push(`${product.id}: could not read price from payment link`);
    continue;
  }

  if (product.stripePriceId !== priceId) {
    product.stripePriceId = priceId;
    updated += 1;
    console.log(`${product.id} → ${priceId}`);
  }
}

fs.writeFileSync(productsPath, `${JSON.stringify(products, null, 2)}\n`);
console.log(`\nUpdated ${updated} product(s). Wrote ${productsPath}`);

if (missing.length) {
  console.warn("\nIssues:");
  for (const line of missing) console.warn(`  - ${line}`);
  process.exitCode = 1;
}