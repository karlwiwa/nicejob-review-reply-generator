const LIMIT = 20;
const STORAGE_KEY = "nj_review_gen_count_v1";

const reviewEl = document.getElementById("review");
const toneEl = document.getElementById("tone");
const lengthEl = document.getElementById("length");
const nameEl = document.getElementById("name");
const outputEl = document.getElementById("output");
const statusEl = document.getElementById("status");
const overlayEl = document.getElementById("limitOverlay");

function setStatus(msg){
  statusEl.textContent = msg || "";
}

function getCount() {
  return Number(localStorage.getItem(STORAGE_KEY) || "0");
}

function setCount(n) {
  localStorage.setItem(STORAGE_KEY, String(n));
}

function incrementCount() {
  const next = getCount() + 1;
  setCount(next);
  return next;
}

function updateUsageDisplay() {
  const el = document.getElementById("usageCounter");
  if (!el) return;
  const remaining = Math.max(0, LIMIT - getCount());
  el.textContent = `Free uses remaining: ${remaining}`;
}

function showLimitModal(){
  overlayEl.classList.remove("hidden");
}

function hideLimitModal(){
  overlayEl.classList.add("hidden");
}

document.getElementById("closeModal").addEventListener("click", hideLimitModal);

// CTA placeholders
document.getElementById("ctaStart").addEventListener("click", () => {
  alert('CTA: "Start free" (we’ll link later)');
});

document.getElementById("ctaDemo").addEventListener("click", () => {
  alert('CTA: "Book a demo" (we’ll link later)');
});

function getTurnstileToken() {
  const el = document.querySelector('input[name="cf-turnstile-response"]');
  return el ? el.value : "";
}

async function generateReply() {
  if (getCount() >= LIMIT) {
    showLimitModal();
    return;
  }

  const review = reviewEl.value.trim();
  const tone = toneEl.value;
  const length = lengthEl.value;
  const reviewerName = nameEl.value.trim();

  if (!review) {
    alert("Paste a review first");
    return;
  }

  outputEl.textContent = "Generating…";
  setStatus("");

  try {
    const captchaToken = getTurnstileToken();

    const res = await fetch("/.netlify/functions/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        review,
        tone,
        length,
        reviewerName,
        captchaToken
      })
    });

    const data = await res.json();

    if (!res.ok) {

      if (data?.code === "daily_cap") {
        showLimitModal();
        return;
      }

      if (data?.code === "rate_limited") {
        setStatus("You're generating too fast. Try again in a moment.");
        outputEl.textContent = "Rate limit reached.";
        return;
      }

      if (data?.code === "captcha_failed") {
        setStatus("Please complete CAPTCHA and try again.");
        outputEl.textContent = "CAPTCHA required.";
        return;
      }

      setStatus("Error: " + (data?.error || "Request failed"));
      outputEl.textContent = "Something went wrong.";
      return;
    }

    // SUCCESS

    outputEl.textContent = data.reply;

    const countNow = incrementCount();
    updateUsageDisplay();

    if (countNow >= LIMIT) {
      showLimitModal();
    }

  } catch (err) {
    setStatus("Error: " + (err.message || "Something went wrong"));
    outputEl.textContent = "Network error.";
  }
}

document.getElementById("generateBtn").addEventListener("click", generateReply);

// Initialize counter on load
updateUsageDisplay();
