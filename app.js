const LIMIT = 20;
const STORAGE_KEY = "nj_review_gen_count_v1";

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
const LIMIT = 20;
const STORAGE_KEY = "nj_review_gen_count_v1";

function getCount() {
  return Number(localStorage.getItem(STORAGE_KEY) || "0");
}

function incrementCount() {
  const next = getCount() + 1;
  localStorage.setItem(STORAGE_KEY, String(next));
  return next;
}

function showLimitModal() {
  document.getElementById("limitOverlay").classList.remove("hidden");
}

function hideLimitModal() {
  document.getElementById("limitOverlay").classList.add("hidden");
}

function getTurnstileToken() {
  // Cloudflare Turnstile injects a hidden input named "cf-turnstile-response"
  const el = document.querySelector('input[name="cf-turnstile-response"]');
  return el ? el.value : "";
}

document.getElementById("closeModal").addEventListener("click", hideLimitModal);

// CTA buttons (we’ll add links later)
document.getElementById("ctaStart").addEventListener("click", () => {
  // placeholder
  alert("CTA: Start free (we’ll add the link later)");
});
document.getElementById("ctaDemo").addEventListener("click", () => {
  // placeholder
  alert("CTA: Book a demo (we’ll add the link later)");
});

// Show CAPTCHA block (we’ll “enforce” it server-side by setting TURNSTILE_SECRET_KEY)
document.getElementById("captchaWrap").classList.remove("hidden");

async function generateReply() {
  // Front-end usage cap (per browser)
  if (getCount() >= LIMIT) {
    showLimitModal();
    return;
  }

  const review = document.getElementById("review").value.trim();
  const name = document.getElementById("name").value.trim();
  const tone = document.getElementById("tone").value;
  const length = document.getElementById("length").value;

  if (!review) {
    alert("Paste a review first");
    return;
  }

  const output = document.getElementById("output");
  output.textContent = "Generating…";

  try {
    const captchaToken = getTurnstileToken(); // may be empty if not completed

    const res = await fetch("/.netlify/functions/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        review,
        tone,
        length,
        reviewerName: name,
        captchaToken,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      // If backend says daily cap reached, show modal
      if (data?.code === "daily_cap") {
        showLimitModal();
        return;
      }
      // If captcha failed, show message
      if (data?.code === "captcha_failed") {
        output.textContent = "Please complete the CAPTCHA and try again.";
        return;
      }
      output.textContent = "Error: " + (data?.error || "Request failed");
      return;
    }

    // Success: count it
    const countNow = incrementCount();

    output.textContent = data.reply;

    // If they just hit the limit, show modal next click (or immediately if you prefer)
    if (countNow >= LIMIT) {
      // Optional: show immediately after generating the 20th reply
      // showLimitModal();
    }
  } catch (err) {
    output.textContent = "Error: " + (err.message || "Something went wrong");
  }
}

document.getElementById("generateBtn").addEventListener("click", generateReply);
