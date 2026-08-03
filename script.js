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

const form = document.querySelector(".signup");
const note = document.querySelector(".form-note");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = new FormData(form).get("email");
  if (typeof email !== "string" || !email.trim()) return;

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
    if (note) note.textContent = "You're on the list. We'll be in touch.";
    form.reset();
  } catch {
    if (note) note.textContent = "Something went wrong. Please try again.";
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

const revealItems = document.querySelectorAll(
  ".section-head, .product, .story__copy, .story__media, .signup"
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
