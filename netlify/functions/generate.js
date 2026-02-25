// netlify/functions/generate.js
// Groq-powered review reply generator with:
// - Per-IP daily cap (20/day)
// - Per-IP per-minute rate limit (6/min)
// - Optional Cloudflare Turnstile CAPTCHA (enforced only if TURNSTILE_SECRET_KEY is set)

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// CAPTCHA (Cloudflare Turnstile)
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "";

// Limits
const DAILY_CAP = 20;      // per IP per day
const PER_MINUTE_CAP = 6;  // per IP per minute

// In-memory store (basic). May reset on cold starts/scale.
// Still very useful combined with CAPTCHA.
const ipStore = globalThis.__ipStore || (globalThis.__ipStore = new Map());

function getClientIp(req) {
  // Netlify-specific header (often present)
  const nfIp = req.headers.get("x-nf-client-connection-ip");
  if (nfIp) return nfIp;

  // Common proxy header fallback
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();

  return "unknown";
}

function dayKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function ensureIpRecord(ip) {
  const key = `${ip}:${dayKey()}`;
  if (!ipStore.has(key)) {
    ipStore.set(key, {
      day: dayKey(),
      total: 0,
      minuteWindowStart: Date.now(),
      minuteCount: 0,
    });
  }
  return { key, rec: ipStore.get(key) };
}

function applyLimits(ip) {
  const { key, rec } = ensureIpRecord(ip);

  // Reset if day changed
  if (rec.day !== dayKey()) {
    ipStore.delete(key);
    return applyLimits(ip);
  }

  const now = Date.now();

  // Reset minute window
  if (now - rec.minuteWindowStart > 60_000) {
    rec.minuteWindowStart = now;
    rec.minuteCount = 0;
  }

  // Per-minute limit
  if (rec.minuteCount >= PER_MINUTE_CAP) {
    const retryAfterSec = Math.ceil((60_000 - (now - rec.minuteWindowStart)) / 1000);
    return {
      ok: false,
      reason: "rate_limited",
      retryAfterSec,
      remaining: Math.max(0, DAILY_CAP - rec.total),
    };
  }

  // Daily cap
  if (rec.total >= DAILY_CAP) {
    return { ok: false, reason: "daily_cap", remaining: 0 };
  }

  // Consume one request
  rec.minuteCount += 1;
  rec.total += 1;

  return { ok: true, remaining: Math.max(0, DAILY_CAP - rec.total) };
}

async function verifyTurnstile(token, ip) {
  // If you haven't set TURNSTILE_SECRET_KEY, CAPTCHA is not enforced.
  if (!TURNSTILE_SECRET_KEY) return { ok: true, mode: "captcha_disabled" };

  if (!token) return { ok: false, error: "Missing CAPTCHA token." };

  const form = new URLSearchParams();
  form.append("secret", TURNSTILE_SECRET_KEY);
  form.append("response", token);
  if (ip && ip !== "unknown") form.append("remoteip", ip);

  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const data = await resp.json();
  if (!data.success) return { ok: false, error: "CAPTCHA failed. Please try again." };

  return { ok: true, mode: "captcha_enabled" };
}

function buildSystemPrompt({ tone, length, reviewerName }) {
  const toneMap = {
    "friendly-professional": "Friendly, professional, and confident.",
    "warm": "Warm, grateful, and personable.",
    "short-direct": "Short, direct, and professional.",
    "empathetic": "Empathetic, calm, and solution-focused.",
  };

  const lengthMap = {
    short: "2–3 sentences",
    medium: "4–6 sentences",
    long: "7–10 sentences",
  };

  const nameLine = reviewerName
    ? `The reviewer's name is "${reviewerName}". Use it naturally once.`
    : `The reviewer's name is unknown. Do not invent a name.`;

  return `
You write public responses to customer reviews for a home services business.
Tone: ${toneMap[tone] || toneMap["friendly-professional"]}
Length: ${lengthMap[length] || lengthMap.medium}
${nameLine}

Rules:
- Thank them sincerely.
- Reference a specific detail from the review (don’t copy it word-for-word).
- Reinforce trust signals (professionalism, punctuality, clean work, clear communication).
- If the review is negative: apologize, stay calm, and offer a next step to resolve offline.
- End with an invitation to contact you again.
- Do not mention AI or that this was generated.
`.trim();
}

export default async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing GROQ_API_KEY env var" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const ip = getClientIp(req);

    const {
      review,
      tone = "friendly-professional",
      length = "medium",
      reviewerName = "",
      captchaToken = "",
    } = await req.json();

    if (!review || typeof review !== "string" || review.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Missing review text" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (review.length > 4000) {
      return new Response(JSON.stringify({ error: "Review too long (max 4000 chars)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // CAPTCHA (enforced only if TURNSTILE_SECRET_KEY is set)
    const captcha = await verifyTurnstile(captchaToken, ip);
    if (!captcha.ok) {
      return new Response(JSON.stringify({ error: captcha.error, code: "captcha_failed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Rate limit + daily cap (per IP)
    const lim = applyLimits(ip);
    if (!lim.ok) {
      const payload =
        lim.reason === "daily_cap"
          ? { error: "Daily limit reached.", code: "daily_cap", remaining: 0 }
          : {
              error: "Too many requests. Slow down.",
              code: "rate_limited",
              retryAfterSec: lim.retryAfterSec,
              remaining: lim.remaining,
            };

      return new Response(JSON.stringify(payload), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...(lim.retryAfterSec ? { "Retry-After": String(lim.retryAfterSec) } : {}),
        },
      });
    }

    const system = buildSystemPrompt({ tone, length, reviewerName });

    const groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.6,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Customer review:\n"""${review.trim()}"""\n\nWrite the reply now.` },
        ],
      }),
    });

    const data = await groqResp.json();

    if (!groqResp.ok) {
      return new Response(
        JSON.stringify({ error: data?.error?.message || "Groq request failed" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return new Response(JSON.stringify({ error: "No reply returned" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ reply, remaining: lim.remaining }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
