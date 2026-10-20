/**
 * RAG (Retrieval-Augmented Generation) Service for Chat With Document
 *
 * Architecture:
 * 1. Extract text from live Yjs ProseMirror document
 * 2. Split into semantic chunks (paragraph/heading-based)
 * 3. Generate lightweight TF-IDF term-frequency vectors stored in SQLite
 *    (upgrades to Gemini/OpenAI embeddings when an API key is configured)
 * 4. Cosine-similarity retrieval for relevant chunks
 * 5. Send question + retrieved context to LLM for answer generation
 * 6. Return answer with source citations
 */

const db = require("../db/database");

// ──────────────────────────────────────────────────────────────────────────────
// CHUNKING
// ──────────────────────────────────────────────────────────────────────────────
const MAX_CHUNK_WORDS = 300;
const MIN_CHUNK_WORDS = 15;

/**
 * Split document text into semantically meaningful chunks.
 * Detects headings/sections by heuristics and produces overlapping context.
 */
function chunkDocumentText(fullText) {
  if (!fullText || !fullText.trim()) return [];

  const lines = fullText.split(/\r?\n/);
  const chunks = [];

  let currentTitle = "";
  let currentBuffer = [];
  let wordCount = 0;

  function flush() {
    const text = currentBuffer.join("\n").trim();
    if (text.length > 0) {
      const wc = text.split(/\s+/).filter(Boolean).length;
      chunks.push({
        sectionTitle: currentTitle || "General",
        content: text,
        wordCount: wc,
      });
    }
    currentBuffer = [];
    wordCount = 0;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const words = trimmed.split(/\s+/).filter(Boolean);
    const isHeading =
      (trimmed.startsWith("#") ||
        /^Section\s+\d+:/i.test(trimmed) ||
        (words.length <= 8 && !trimmed.endsWith(".") && /^[A-Z]/.test(trimmed))) &&
      trimmed.length < 80;

    if (isHeading) {
      if (currentBuffer.length > 0) {
        flush();
      }
      currentTitle = trimmed.replace(/^#+\s*/, "");
      continue;
    }

    currentBuffer.push(trimmed);
    wordCount += words.length;

    if (wordCount >= MAX_CHUNK_WORDS) {
      flush();
    }
  }

  flush();

  if (chunks.length === 0 && fullText.trim().length > 0) {
    const text = fullText.trim();
    const wc = text.split(/\s+/).filter(Boolean).length;
    chunks.push({
      sectionTitle: "General",
      content: text,
      wordCount: wc,
    });
  }

  return chunks;
}

// ──────────────────────────────────────────────────────────────────────────────
// EMBEDDING — Lightweight TF-IDF or API-based
// ──────────────────────────────────────────────────────────────────────────────

/** Simple hash for content change detection */
function simpleHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    hash = ((hash << 5) - hash + c) | 0;
  }
  return hash.toString(36);
}

/** Tokenize text into normalized terms */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** Common English stop words to ignore */
const STOP_WORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","will","would","shall","should","may","might","can","could",
  "of","in","to","for","with","on","at","by","from","as","into","through","during",
  "before","after","above","below","between","under","again","further","then","once",
  "it","its","this","that","these","those","he","she","they","we","you","i","me",
  "my","your","his","her","our","their","not","no","nor","and","but","or","so",
  "if","than","too","very","just","about","up","out","all","each","every","both",
  "few","more","most","other","some","such","only","own","same","also","how","what",
  "which","who","whom","when","where","why","there","here","am"
]);

/** Build TF vector for a piece of text */
function buildTfVector(text) {
  const tokens = tokenize(text).filter((t) => !STOP_WORDS.has(t));
  const tf = {};
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }
  // Normalize by total tokens
  const total = tokens.length || 1;
  for (const key of Object.keys(tf)) {
    tf[key] /= total;
  }
  return tf;
}

/** Cosine similarity between two sparse TF vectors */
function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  const allKeys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);

  for (const key of allKeys) {
    const a = vecA[key] || 0;
    const b = vecB[key] || 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }

  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag === 0 ? 0 : dot / mag;
}

/**
 * Try to generate embeddings via Gemini embedding API.
 * Falls back to TF-IDF if no API key.
 */
async function generateEmbedding(text) {
  const apiKey = (process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || "").trim();

  if (!apiKey) {
    // Use local TF-IDF
    return { type: "tfidf", vector: buildTfVector(text) };
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text: text.slice(0, 2000) }] },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const data = await response.json();
      const values = data?.embedding?.values;
      if (values && values.length > 0) {
        return { type: "api", vector: values };
      }
    }
  } catch (e) {
    // Silently fall back to TF-IDF
  }

  return { type: "tfidf", vector: buildTfVector(text) };
}

/**
 * Cosine similarity for dense API vectors
 */
function denseCosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag === 0 ? 0 : dot / mag;
}

// ──────────────────────────────────────────────────────────────────────────────
// INDEXING — Store chunks + embeddings in SQLite
// ──────────────────────────────────────────────────────────────────────────────

/** Index a document: chunk it, compute embeddings, store in DB */
async function indexDocument(documentId, fullText) {
  if (!fullText || !fullText.trim()) {
    console.log(`📭 Empty document ${documentId}, skipping indexing.`);
    return { indexed: 0 };
  }

  const chunks = chunkDocumentText(fullText);
  if (chunks.length === 0) return { indexed: 0 };

  // Ensure document row exists (chunks reference documents via FK)
  await db.query(
    "INSERT INTO documents (id, title) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
    [documentId, documentId]
  );

  // Load existing chunk hashes for this document
  const { rows: existing } = await db.query(
    "SELECT chunk_index, content_hash FROM document_chunks WHERE document_id = $1",
    [documentId]
  );

  const existingMap = new Map(existing.map((r) => [r.chunk_index, r.content_hash]));

  let indexed = 0;
  let skipped = 0;

  // Delete chunks beyond current count (document got shorter)
  if (existing.length > chunks.length) {
    await db.query(
      "DELETE FROM document_chunks WHERE document_id = $1 AND chunk_index >= $2",
      [documentId, chunks.length]
    );
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const hash = simpleHash(chunk.content);

    // Skip if this chunk hasn't changed
    if (existingMap.get(i) === hash) {
      skipped++;
      continue;
    }

    const embedding = await generateEmbedding(chunk.content);
    const embeddingJson = JSON.stringify(embedding);

    // Upsert: delete old + insert new
    await db.withTransaction(async (client) => {
      await client.query(
        "DELETE FROM document_chunks WHERE document_id = $1 AND chunk_index = $2",
        [documentId, i]
      );
      await client.query(
        `INSERT INTO document_chunks (document_id, chunk_index, section_title, content, content_hash, word_count, embedding, indexed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [documentId, i, chunk.sectionTitle, chunk.content, hash, chunk.wordCount, embeddingJson]
      );
    });

    indexed++;
  }

  console.log(`🔍 Indexed document ${documentId}: ${indexed} chunks updated, ${skipped} unchanged.`);
  return { indexed, skipped, total: chunks.length };
}

// ──────────────────────────────────────────────────────────────────────────────
// RETRIEVAL — Find relevant chunks for a question
// ──────────────────────────────────────────────────────────────────────────────

async function retrieveRelevantChunks(documentId, question, topK = 5) {
  const { rows: chunks } = await db.query(
    "SELECT id, chunk_index, section_title, content, word_count, embedding FROM document_chunks WHERE document_id = $1 ORDER BY chunk_index",
    [documentId]
  );

  if (chunks.length === 0) return [];

  // Generate question embedding
  const questionEmbedding = await generateEmbedding(question);

  // Score each chunk
  const scored = chunks.map((chunk) => {
    let embedding;
    try {
      embedding = JSON.parse(chunk.embedding);
    } catch {
      return { ...chunk, score: 0 };
    }

    let score = 0;
    if (embedding.type === "api" && questionEmbedding.type === "api") {
      score = denseCosineSimilarity(questionEmbedding.vector, embedding.vector);
    } else if (embedding.type === "tfidf" && questionEmbedding.type === "tfidf") {
      score = cosineSimilarity(questionEmbedding.vector, embedding.vector);
    } else {
      // Mismatched types — use TF-IDF fallback for comparison
      const chunkTf = buildTfVector(chunk.content);
      const questionTf = buildTfVector(question);
      score = cosineSimilarity(questionTf, chunkTf);
    }

    return { ...chunk, score };
  });

  // Sort by score descending and take top K
  scored.sort((a, b) => b.score - a.score);

  // Filter out very low scores
  const minScore = 0.02;
  const results = scored.filter((c) => c.score >= minScore).slice(0, topK);

  return results.map((c) => ({
    chunkId: c.id,
    chunkIndex: c.chunk_index,
    section: c.section_title || `Chunk ${c.chunk_index + 1}`,
    content: c.content,
    wordCount: c.word_count,
    score: Math.round(c.score * 1000) / 1000,
  }));
}

// ──────────────────────────────────────────────────────────────────────────────
// ANSWER GENERATION — LLM or local fallback
// ──────────────────────────────────────────────────────────────────────────────

const CHAT_SYSTEM_PROMPT = `You are an AI Document Assistant embedded in a collaborative document editor called Dastavez.
Your job is to answer the user's question using ONLY the provided document context.

CRITICAL RULES:
1. Answer ONLY based on the provided document context sections.
2. If the answer cannot be found in the provided context, clearly say: "I couldn't find information about that in this document."
3. Do NOT make up or invent information. Do NOT use your general training knowledge to answer unless the document context explicitly supports it.
4. When referencing information, mention which section it came from (e.g., "According to the Architecture section...").
5. Be concise but thorough. Use bullet points for lists when appropriate.
6. If the user asks to summarize, provide a structured summary using only the document content.
7. Format your response in clean markdown when helpful (bold, lists, headers).`;

async function generateAnswer(question, relevantChunks, chatHistory = []) {
  const apiKey = (process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  const provider = (process.env.LLM_PROVIDER || "gemini").toLowerCase();

  // Build context from chunks
  let contextBlock = "";
  if (relevantChunks.length === 0) {
    contextBlock = "(No relevant sections were found in the document for this question.)";
  } else {
    contextBlock = relevantChunks
      .map((c, i) => {
        const header = c.section ? `[Section: ${c.section}]` : `[Chunk ${i + 1}]`;
        return `${header}\n${c.content}`;
      })
      .join("\n\n---\n\n");
  }

  const userMessage = `DOCUMENT CONTEXT:\n\"\"\"\n${contextBlock}\n\"\"\"\n\nUSER QUESTION: ${question}`;

  // Build conversation messages (keep last 6 exchanges for context window)
  const recentHistory = chatHistory.slice(-12);

  // ── Fallback: local keyword-based answer ──────────────────────────────────
  if (!apiKey) {
    return generateLocalAnswer(question, relevantChunks);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  try {
    let answer = "";

    if (provider === "openai" || apiKey.startsWith("sk-")) {
      const model = process.env.LLM_MODEL || "gpt-4o-mini";
      const messages = [
        { role: "system", content: CHAT_SYSTEM_PROMPT },
        ...recentHistory.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userMessage },
      ];

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 2000 }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`OpenAI returned ${response.status}`);
      const data = await response.json();
      answer = data.choices?.[0]?.message?.content || "";
    } else {
      // Gemini
      const model = process.env.LLM_MODEL || "gemini-3.1-flash-lite";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const contents = [
        ...recentHistory.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        { role: "user", parts: [{ text: userMessage }] },
      ];

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: CHAT_SYSTEM_PROMPT }] },
          contents,
          generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`Gemini returned ${response.status}`);
      const data = await response.json();
      answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }

    clearTimeout(timeoutId);
    return answer.trim() || "I couldn't generate an answer. Please try again.";
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("LLM answer generation error:", error.message);
    if (error.name === "AbortError") {
      return "The AI request timed out. Please try again.";
    }
    throw new Error(`AI Provider Error: ${error.message}`);
  }
}

/**
 * Local keyword-matching fallback when no API key is configured.
 * Provides reasonable answers using document content directly.
 */
function generateLocalAnswer(question, relevantChunks) {
  if (relevantChunks.length === 0) {
    return "I couldn't find information about that in this document. The document may not cover this topic, or you can try rephrasing your question.";
  }

  const q = question.toLowerCase();

  // Summarize
  if (q.includes("summarize") || q.includes("summary") || q.includes("what is this document about") || q.includes("overview")) {
    const summary = relevantChunks
      .slice(0, 4)
      .map((c) => {
        const snippet = c.content.slice(0, 200).trim();
        const label = c.section ? `**${c.section}**: ` : "";
        return `- ${label}${snippet}${c.content.length > 200 ? "..." : ""}`;
      })
      .join("\n");
    return `Based on the document content, here's a summary:\n\n${summary}`;
  }

  // Build answer from most relevant chunks
  const topChunks = relevantChunks.slice(0, 3);
  const answerParts = topChunks.map((c) => {
    const label = c.section ? `According to the **${c.section}** section` : "The document states";
    const snippet = c.content.slice(0, 400).trim();
    return `${label}:\n\n> ${snippet}${c.content.length > 400 ? "..." : ""}`;
  });

  return answerParts.join("\n\n") + "\n\n*(Demo mode — set LLM_API_KEY for AI-powered answers)*";
}

// ──────────────────────────────────────────────────────────────────────────────
// CHAT HISTORY
// ──────────────────────────────────────────────────────────────────────────────

async function saveChatMessage(documentId, conversationId, role, content, sources = null) {
  await db.query(
    `INSERT INTO chat_messages (document_id, conversation_id, role, content, sources)
     VALUES ($1, $2, $3, $4, $5)`,
    [documentId, conversationId, role, content, sources ? JSON.stringify(sources) : null]
  );
}

async function getChatHistory(documentId, conversationId, limit = 20) {
  const { rows } = await db.query(
    `SELECT role, content, sources, created_at AS "createdAt"
     FROM chat_messages
     WHERE document_id = $1 AND conversation_id = $2
     ORDER BY created_at DESC, id DESC
     LIMIT $3`,
    [documentId, conversationId, limit]
  );
  return rows
    .reverse()
    .map((row) => ({
      ...row,
      sources: row.sources ? JSON.parse(row.sources) : null,
    }));
}

async function clearChatHistory(documentId, conversationId) {
  await db.query(
    "DELETE FROM chat_messages WHERE document_id = $1 AND conversation_id = $2",
    [documentId, conversationId]
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// DEBOUNCED INDEXING — for use by Yjs update listeners
// ──────────────────────────────────────────────────────────────────────────────
const indexTimers = new Map();

function scheduleReindex(documentId, getTextFn, debounceMs = 30000) {
  if (indexTimers.has(documentId)) {
    clearTimeout(indexTimers.get(documentId));
  }
  const timer = setTimeout(async () => {
    indexTimers.delete(documentId);
    try {
      const text = getTextFn();
      if (text && text.trim().length > 10) {
        await indexDocument(documentId, text);
      }
    } catch (e) {
      console.error(`Re-index error for ${documentId}:`, e.message);
    }
  }, debounceMs);
  indexTimers.set(documentId, timer);
}

async function getIndexStats(documentId) {
  const { rows } = await db.query(
    "SELECT COUNT(*)::int AS cnt, MAX(indexed_at) AS latest FROM document_chunks WHERE document_id = $1",
    [documentId]
  );
  return {
    chunkCount: rows[0]?.cnt || 0,
    lastIndexed: rows[0]?.latest || null,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ──────────────────────────────────────────────────────────────────────────────
module.exports = {
  chunkDocumentText,
  indexDocument,
  retrieveRelevantChunks,
  generateAnswer,
  saveChatMessage,
  getChatHistory,
  clearChatHistory,
  scheduleReindex,
  getIndexStats,
};
