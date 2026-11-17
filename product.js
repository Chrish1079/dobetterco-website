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
  return Math.min(99, Math.max(1, parsed));
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

  if (content) content.hidden = false;
  document.title = `${product.name} — DO BETTER CO.`;
}

async function initProductPage() {
  const productId = getProductIdFromUrl();
  await window.dobetterCart.ready;
  const product = productId ? window.dobetterCart.getProduct(productId) : null;
  setProductPage(product);

  const buyNowBtn = document.getElementById("product-buy-now");
  const errorEl = document.getElementById("product-error");

  buyNowBtn?.addEventListener("click", async () => {
    if (!product) return;
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }
    const quantity = getProductQuantity();
    buyNowBtn.disabled = true;
    const original = buyNowBtn.textContent;
    buyNowBtn.textContent = "Redirecting…";

    try {
      await window.dobetterCart.checkoutWithItems([{ id: product.id, quantity }]);
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