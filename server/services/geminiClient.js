// Models tried in order; overloaded/unavailable ones are skipped automatically
const FALLBACK_MODELS = ["gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-flash-lite-latest"];
const RETRYABLE_STATUSES = new Set([404, 429, 500, 502, 503, 504]);

async function generateGeminiContent(apiKey, body, signal) {
  const models = [...new Set([process.env.LLM_MODEL, ...FALLBACK_MODELS].filter(Boolean))];
  let lastStatus = 502;

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    if (response.ok) {
      const data = await response.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("");
      return { text, model };
    }

    lastStatus = response.status;
    console.warn(`Gemini model ${model} returned ${response.status}`);
    if (!RETRYABLE_STATUSES.has(response.status)) break;
  }

  const err = new Error(`Gemini request failed with status ${lastStatus}`);
  err.status = lastStatus;
  throw err;
}

module.exports = { generateGeminiContent };
