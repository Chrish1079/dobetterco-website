/**
 * Live Stripe Payment Link URLs (Dashboard → Payment links).
 * Paste each buy.stripe.com/... URL after creating the link for that product.
 */
const stripePaymentLinks = {
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

document.querySelectorAll("[data-stripe-product]").forEach((productEl) => {
  const key = productEl.getAttribute("data-stripe-product");
  const url = key ? stripePaymentLinks[key] : "";
  if (!url) return;
  const anchor = productEl.querySelector("a");
  if (!anchor) return;
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
});

const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());

const toggle = document.querySelector(".nav-toggle");
const mobileNav = document.getElementById("mobile-nav");

function setMenuOpen(open) {
  if (!toggle || !mobileNav) return;
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  mobileNav.hidden = !open;
  document.body.style.overflow = open ? "hidden" : "";
}

toggle?.addEventListener("click", () => {
  const open = toggle.getAttribute("aria-expanded") !== "true";
  setMenuOpen(open);
});

mobileNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => setMenuOpen(false));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenuOpen(false);
});

document.querySelectorAll(".signup, .contact-form").forEach((form) => {
  const note = form.parentElement?.querySelector(".form-note");
  const defaultSuccess = form.classList.contains("contact-form")
    ? "Thanks — we received your message and will get back to you soon."
    : "You're on the list. We'll be in touch.";
  const successMessage = form.getAttribute("data-success") || defaultSuccess;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    if (note) note.textContent = "";

    try {
      const response = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(new FormData(form)).toString(),
      });
      if (!response.ok) throw new Error("Submit failed");
      if (note) note.textContent = successMessage;
      form.reset();
    } catch {
      if (note) note.textContent = "Something went wrong. Please try again.";
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
});

const revealItems = document.querySelectorAll(
  ".section-head, .product, .story__inner, .signup"
);

revealItems.forEach((el) => el.classList.add("reveal"));

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
);

revealItems.forEach((el) => observer.observe(el));
