function guessSentiment(reviewText) {
  const t = reviewText.toLowerCase();

  // super simple “good vs bad” detection (placeholder)
  const positive = ["great", "amazing", "awesome", "excellent", "recommend", "friendly", "professional", "helpful", "on time", "quick"];
  const negative = ["bad", "terrible", "awful", "late", "rude", "refund", "poor", "disappointed", "issue", "problem", "worst"];

  let score = 0;
  for (const w of positive) if (t.includes(w)) score += 1;
  for (const w of negative) if (t.includes(w)) score -= 1;

  return score >= 0 ? "positive" : "negative";
}

function lengthHints(length) {
  if (length === "short") return "Keep it to 2–3 sentences.";
  if (length === "long") return "Write 7–10 sentences with a bit more detail.";
  return "Write 4–6 sentences.";
}

function toneStyle(tone) {
  switch (tone) {
    case "warm":
      return "Warm, grateful, and personable.";
    case "short-direct":
      return "Short, direct, and professional.";
    case "empathetic":
      return "Empathetic, calm, and solution-focused.";
    default:
      return "Friendly, professional, and confident.";
  }
}

function generatePlaceholderReply({ review, name, tone, length }) {
  const sentiment = guessSentiment(review);
  const namePart = name ? `${name}, ` : "";
  const toneLine = toneStyle(tone);

  if (sentiment === "positive") {
    const short = `Thanks ${namePart}for the kind review! We really appreciate it and we’re glad the experience was a great one. If you ever need us again, we’re here to help.`;

    const medium = `Thanks ${namePart}for taking the time to leave this review — we really appreciate it! We’re glad the service felt smooth from start to finish. Our team works hard to show up on time, communicate clearly, and deliver quality work you can trust. If you ever need anything down the road, we’d love to help again.`;

    const long = `Thanks ${namePart}for sharing this review — it means a lot to our team! We’re really happy to hear the experience felt professional and that everything was handled the way you expected. We take pride in being punctual, keeping the work area tidy, and communicating clearly so there are no surprises. Your feedback helps other homeowners feel confident choosing us, and we truly appreciate it. If you ever have questions or need help again, we’d love to assist — just reach out anytime.`;

    return { reply: (length === "short" ? short : length === "long" ? long : medium), sentiment, toneLine };
  }

  // negative / mixed review reply template
  const short = `Thanks ${namePart}for your feedback — we’re sorry this wasn’t the experience you expected. We’d like to make it right, so please reach out and we’ll help resolve this.`;

  const medium = `Thanks ${namePart}for taking the time to share this feedback. We’re sorry to hear this didn’t meet expectations — that’s not what we aim for. We’d like to learn more about what happened and see how we can make things right. Please contact us directly so we can help resolve this as quickly as possible.`;

  const long = `Thanks ${namePart}for sharing your feedback. We’re genuinely sorry to hear this wasn’t the experience you expected — that’s not the standard we want for our customers. We take concerns like this seriously and would like to understand what happened so we can address it and improve. If you’re willing, please contact us directly with any details (date, address, or job info) so we can look into it and work toward a fair resolution.`;

  return { reply: (length === "short" ? short : length === "long" ? long : medium), sentiment, toneLine };
}

function generateReply() {
  const review = document.getElementById("review").value.trim();
  const name = document.getElementById("name").value.trim();
  const tone = document.getElementById("tone").value;
  const length = document.getElementById("length").value;

  if (!review) {
    alert("Paste a review first");
    return;
  }

  const result = generatePlaceholderReply({ review, name, tone, length });

  document.getElementById("output").textContent =
    `${result.reply}\n\n(Placeholder mode • ${result.sentiment} • ${result.toneLine} ${lengthHints(length)})`;
}

document.getElementById("generateBtn").addEventListener("click", generateReply);