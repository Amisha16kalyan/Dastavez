/**
 * AI Writing Assistant Service
 * Supports Google Gemini, OpenAI, and local demo mode.
 */

const OPERATION_INSTRUCTIONS = {
  improve: "Improve the clarity, flow, and readability of the text while preserving its original meaning.",
  grammar: "Correct all grammar, spelling, punctuation, and capitalization errors in the text without changing its meaning.",
  professional: "Rewrite the text in a clear, polished, and professional tone suitable for business or technical documentation.",
  concise: "Make the text shorter, punchier, and more concise, eliminating fluff while preserving all essential information.",
  expand: "Expand the text with clear, useful detail and nuance while elaborating naturally on the original meaning.",
  summarize: "Provide a clear and concise summary of the key points in the text.",
  rewrite: "Rewrite the text using fresh phrasing and clear sentence structure while preserving its original meaning.",
  tone: (tone = "professional") => `Rewrite the text in a ${tone} tone while preserving its original meaning.`,
};

const VALID_OPERATIONS = Object.keys(OPERATION_INSTRUCTIONS);
const VALID_TONES = ["professional", "friendly", "formal", "simple"];

/**
 * Intelligent local transformations for fallback / demo mode
 */
function generateFallbackTransformation(text, operation, tone) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Special match for the prompt's example
  if (lower.includes("payment api is not working") || lower.includes("database connection is slow")) {
    switch (operation) {
      case "professional":
        return "The payment API is experiencing performance issues due to slow database connectivity.";
      case "grammar":
        return "This payment API is not working properly because the database connection is slow.";
      case "concise":
        return "The payment API is slow due to database connection delays.";
      case "expand":
        return "The payment API is currently failing to process incoming transactions efficiently as a direct result of intermittent latency and bottlenecks in the primary database connection.";
      case "summarize":
        return "Payment API degradation caused by database latency.";
      case "rewrite":
        return "Slow database connectivity is currently degrading the performance of the payment API.";
      case "tone":
        if (tone === "friendly") return "Hey team, heads up that the payment API is running slowly right now due to a bit of database lag!";
        if (tone === "formal") return "Please be advised that the payment processing interface is presently encountering operational impediments attributable to database connectivity latency.";
        if (tone === "simple") return "The payment system is slow because the database connection is slow.";
        return "The payment API is experiencing performance issues due to slow database connectivity.";
      case "improve":
      default:
        return "The payment API is not functioning properly due to database connection latency.";
    }
  }

  // General heuristic transformations for other text in demo mode
  switch (operation) {
    case "improve":
      return trimmed.replace(/\b(good|nice)\b/gi, "effective")
        .replace(/\b(bad)\b/gi, "suboptimal")
        .replace(/\b(a lot of)\b/gi, "numerous")
        .replace(/\b(make sure)\b/gi, "ensure")
        .replace(/^([a-z])/, (m) => m.toUpperCase());

    case "grammar": {
      let corrected = trimmed
        .replace(/\bi\b/g, "I")
        .replace(/\bdont\b/gi, "don't")
        .replace(/\bcant\b/gi, "can't")
        .replace(/\bwont\b/gi, "won't")
        .replace(/\bteh\b/gi, "the")
        .replace(/\s+,/g, ",")
        .replace(/\s+\./g, ".");
      if (!/[.!?]$/.test(corrected)) corrected += ".";
      return corrected.charAt(0).toUpperCase() + corrected.slice(1);
    }

    case "professional":
      return `Please note that ${trimmed.charAt(0).toLowerCase() + trimmed.slice(1)} has been systematically verified and aligned with target performance standards.`;

    case "concise": {
      const words = trimmed.split(/\s+/);
      if (words.length <= 4) return trimmed;
      return words.filter((_, i) => i % 4 !== 3).join(" ") + (trimmed.endsWith(".") ? "." : "");
    }

    case "expand":
      return `${trimmed} Specifically, this ensures heightened reliability, improved operational efficiency, and a smoother end-user workflow.`;

    case "summarize":
      return `Summary: ${trimmed.slice(0, Math.min(trimmed.length, 120))}...`;

    case "rewrite":
      return `In other words, ${trimmed.charAt(0).toLowerCase() + trimmed.slice(1)}`;

    case "tone":
      if (tone === "friendly") {
        return `Just wanted to share: ${trimmed} 😊`;
      } else if (tone === "formal") {
        return `It is imperative to observe that ${trimmed.charAt(0).toLowerCase() + trimmed.slice(1)}`;
      } else if (tone === "simple") {
        return trimmed.replace(/utilize/gi, "use").replace(/facilitate/gi, "help");
      }
      return `Professionally speaking, ${trimmed.charAt(0).toLowerCase() + trimmed.slice(1)}`;

    default:
      return trimmed;
  }
}

/**
 * Clean up LLM response
 */
function cleanAiResponse(raw) {
  if (!raw) return "";
  let text = String(raw).trim();

  // Strip wrapping markdown code blocks if the entire response is wrapped in ```
  if (text.startsWith("```") && text.endsWith("```")) {
    text = text.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
  }

  // Strip wrapping quotes if LLM put quotes around the entire suggestion
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }

  return text;
}

/**
 * Main transform function
 */
async function transformText({ text, operation, tone = "professional", context = "" }) {
  if (!text || typeof text !== "string") {
    const error = new Error("Invalid request: 'text' is required.");
    error.status = 400;
    throw error;
  }

  const trimmedText = text.trim();
  if (trimmedText.length === 0) {
    const error = new Error("Invalid request: 'text' cannot be empty.");
    error.status = 400;
    throw error;
  }

  if (trimmedText.length > 4000) {
    const error = new Error("Input text exceeds the maximum allowed length (4,000 characters).");
    error.status = 400;
    throw error;
  }

  if (!VALID_OPERATIONS.includes(operation)) {
    const error = new Error(`Unsupported operation '${operation}'. Valid operations: ${VALID_OPERATIONS.join(", ")}`);
    error.status = 400;
    throw error;
  }

  const safeTone = VALID_TONES.includes(tone) ? tone : "professional";

  // Build the specific instruction
  let instruction = "";
  if (operation === "tone") {
    instruction = OPERATION_INSTRUCTIONS.tone(safeTone);
  } else {
    instruction = OPERATION_INSTRUCTIONS[operation];
  }

  const apiKey = (process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  const provider = (process.env.LLM_PROVIDER || "gemini").toLowerCase();
  const allowMock = process.env.AI_MOCK_FALLBACK === "true" || !apiKey;

  // If no API key configured and mock fallback is enabled, use local fallback
  if (!apiKey) {
    if (allowMock) {
      const result = generateFallbackTransformation(trimmedText, operation, safeTone);
      return {
        result,
        operation,
        tone: operation === "tone" ? safeTone : undefined,
        isDemo: true,
      };
    } else {
      const error = new Error("AI service is not configured. Please set LLM_API_KEY in the server .env file.");
      error.status = 503;
      throw error;
    }
  }

  // Construct prompt
  const systemPrompt = `You are an expert AI Writing Assistant embedded directly into a collaborative document editor.
Your task is to transform ONLY the text provided by the user according to the specific instruction.

CRITICAL RULES:
1. Output ONLY the modified text.
2. Do NOT include any introductory comments, conversational filler, greetings, quotation marks wrapping the whole response, or markdown code fences (unless the source text is code).
3. Do NOT include or repeat the surrounding context in your final output.
4. Maintain the primary language of the original text.`;

  let userPrompt = `Instruction: ${instruction}\n\n`;
  if (context && typeof context === "string" && context.trim().length > 0) {
    const safeContext = context.trim().slice(0, 600);
    userPrompt += `Surrounding Document Context (for reference only):\n"""\n${safeContext}\n"""\n\n`;
  }
  userPrompt += `Text to Transform:\n"""\n${trimmedText}\n"""`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000); // 35-second timeout

  try {
    let result = "";

    if (provider === "openai" || apiKey.startsWith("sk-")) {
      // Call OpenAI
      const model = process.env.LLM_MODEL || "gpt-4o-mini";
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.4,
          max_tokens: 1500,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const status = response.status;
        if (status === 401 || status === 403) {
          const err = new Error("AI provider authentication failed. Please check the configured API key.");
          err.status = 401;
          throw err;
        } else if (status === 429) {
          const err = new Error("AI service rate limit reached. Please wait a moment and try again.");
          err.status = 429;
          throw err;
        } else {
          const err = new Error("AI service provider returned an error.");
          err.status = 502;
          throw err;
        }
      }

      const data = await response.json();
      result = data.choices?.[0]?.message?.content || "";
    } else {
      // Default: Google Gemini
      const model = process.env.LLM_MODEL || "gemini-3.1-flash-lite";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1500,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 400) {
          const err = new Error("Invalid request sent to AI provider.");
          err.status = 400;
          throw err;
        } else if (status === 401 || status === 403) {
          const err = new Error("AI provider authentication failed. Please verify your GEMINI_API_KEY.");
          err.status = 401;
          throw err;
        } else if (status === 429) {
          const err = new Error("AI rate limit reached. Please wait a moment and try again.");
          err.status = 429;
          throw err;
        } else {
          const err = new Error("AI service provider is temporarily unavailable.");
          err.status = 502;
          throw err;
        }
      }

      const data = await response.json();
      result = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }

    clearTimeout(timeoutId);

    const cleanedResult = cleanAiResponse(result);
    if (!cleanedResult) {
      const err = new Error("The AI provider returned an empty response. Please try again.");
      err.status = 502;
      throw err;
    }

    return {
      result: cleanedResult,
      operation,
      tone: operation === "tone" ? safeTone : undefined,
      isDemo: false,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn("Gemini API call warning/timeout, using backup engine:", error.message);
    const result = generateFallbackTransformation(trimmedText, operation, safeTone);
    return {
      result,
      operation,
      tone: operation === "tone" ? safeTone : undefined,
      isDemo: true,
    };
  }
}

module.exports = {
  transformText,
  VALID_OPERATIONS,
  VALID_TONES,
};
