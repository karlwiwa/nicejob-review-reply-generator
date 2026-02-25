const GROQ_API_KEY = process.env.GROQ_API_KEY;

function buildSystemPrompt({ tone, length, reviewerName }) {
  const toneMap = {
    "friendly-professional": "Friendly, professional, and confident.",
    "warm": "Warm, grateful, and personable.",
    "short-direct": "Short, direct, and professional.",
    "empathetic": "Empathetic, calm, and solution-focused."
  };

  const lengthMap = {
    short: "2–3 sentences",
    medium: "4–6 sentences",
    long: "7–10 sentences"
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
- If the review is negative: apologize, stay calm, offer a next step to resolve offline.
- End with an invitation to contact you again.
- Do not mention AI or that this was generated.
`.trim();
}

export default async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), { status: 405 });
    }

    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing GROQ_API_KEY env var" }), { status: 500 });
    }

    const { review, tone = "friendly-professional", length = "medium", reviewerName = "" } = await req.json();

    if (!review || typeof review !== "string" || review.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Missing review text" }), { status: 400 });
    }
    if (review.length > 4000) {
      return new Response(JSON.stringify({ error: "Review too long (max 4000 chars)" }), { status: 400 });
    }

    const system = buildSystemPrompt({ tone, length, reviewerName });

    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // A good default: fast + solid quality
        model: "llama-3.1-8b-instant",
        temperature: 0.6,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Customer review:\n"""${review.trim()}"""\n\nWrite the reply now.` }
        ],
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: data?.error?.message || "Groq request failed" }), { status: 500 });
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return new Response(JSON.stringify({ error: "No reply returned" }), { status: 500 });
    }

    return new Response(JSON.stringify({ reply }), {
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