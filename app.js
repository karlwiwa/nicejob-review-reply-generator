async function generateReply() {
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
    const res = await fetch("/.netlify/functions/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        review,
        tone,
        length,
        reviewerName: name
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Request failed");

    output.textContent = data.reply;
  } catch (err) {
    output.textContent = "Error: " + (err.message || "Something went wrong");
  }
}

document.getElementById("generateBtn").addEventListener("click", generateReply);
