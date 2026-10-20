const express = require("express");
const { getYDoc, docs } = require("y-websocket/bin/utils");
const ragService = require("../services/ragService");
const versionService = require("../services/versionService");

const router = express.Router();

function sanitizeDocId(id) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128) || "default-room";
}

/**
 * POST /api/ai/document-chat
 * Ask a question about a document using RAG
 */
router.post("/document-chat", async (req, res) => {
  try {
    const { documentId, question, conversationId } = req.body;

    // ── Validate inputs ───────────────────────────────────────────────
    if (!documentId || typeof documentId !== "string") {
      return res.status(400).json({ success: false, error: "documentId is required." });
    }

    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return res.status(400).json({ success: false, error: "question is required." });
    }

    if (question.length > 1000) {
      return res.status(400).json({ success: false, error: "Question is too long (max 1,000 characters)." });
    }

    const safeDocId = sanitizeDocId(documentId);
    const safeConvoId = typeof conversationId === "string" ? conversationId.slice(0, 128) : `chat-${safeDocId}`;
    const safeQuestion = question.trim();

    // ── Ensure document is indexed ────────────────────────────────────
    const stats = await ragService.getIndexStats(safeDocId);

    if (stats.chunkCount === 0) {
      // Try to index from live Yjs document
      const ydoc = docs.get(safeDocId);
      if (ydoc) {
        const text = versionService.extractDocText(ydoc);
        if (text && text.trim().length > 5) {
          await ragService.indexDocument(safeDocId, text);
        }
      } else {
        return res.status(404).json({
          success: false,
          error: "Document not found or has no content. Start typing in the editor first.",
        });
      }
    }

    // ── Retrieve relevant chunks ──────────────────────────────────────
    const topK = Math.min(parseInt(req.body.topK) || 5, 10);
    const relevantChunks = await ragService.retrieveRelevantChunks(safeDocId, safeQuestion, topK);

    // ── Get chat history for context ──────────────────────────────────
    const history = await ragService.getChatHistory(safeDocId, safeConvoId, 12);

    // ── Generate answer via LLM ───────────────────────────────────────
    const answer = await ragService.generateAnswer(safeQuestion, relevantChunks, history);

    // ── Build source citations ────────────────────────────────────────
    const sources = relevantChunks.map((c) => ({
      chunkId: c.chunkId,
      chunkIndex: c.chunkIndex,
      section: c.section,
      text: c.content.slice(0, 200) + (c.content.length > 200 ? "..." : ""),
      score: c.score,
    }));

    // ── Persist chat messages ─────────────────────────────────────────
    await ragService.saveChatMessage(safeDocId, safeConvoId, "user", safeQuestion);
    await ragService.saveChatMessage(safeDocId, safeConvoId, "assistant", answer, sources);

    return res.json({
      success: true,
      answer,
      sources,
      isDemo: !(process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || "").trim(),
    });
  } catch (err) {
    console.error("Document Chat Error:", err);
    return res.status(err.status || 500).json({
      success: false,
      error: err.message || "An error occurred while processing your question.",
    });
  }
});

/**
 * POST /api/ai/document-index
 * Manually trigger document indexing
 */
router.post("/document-index", async (req, res) => {
  try {
    const { documentId } = req.body;
    if (!documentId) {
      return res.status(400).json({ success: false, error: "documentId is required." });
    }

    const safeDocId = sanitizeDocId(documentId);

    // Get text from live Yjs document
    const ydoc = docs.get(safeDocId);
    if (!ydoc) {
      return res.status(404).json({ success: false, error: "Document not found on server." });
    }

    const text = versionService.extractDocText(ydoc);
    if (!text || text.trim().length < 5) {
      return res.status(400).json({ success: false, error: "Document is empty or too short to index." });
    }

    const result = await ragService.indexDocument(safeDocId, text);
    const stats = await ragService.getIndexStats(safeDocId);

    return res.json({
      success: true,
      ...result,
      ...stats,
    });
  } catch (err) {
    console.error("Document Index Error:", err);
    return res.status(500).json({ success: false, error: "Failed to index document." });
  }
});

/**
 * GET /api/ai/document-index/:documentId
 * Get indexing status for a document
 */
router.get("/document-index/:documentId", async (req, res) => {
  const safeDocId = sanitizeDocId(req.params.documentId);
  const stats = await ragService.getIndexStats(safeDocId);
  return res.json({ success: true, ...stats });
});

/**
 * GET /api/ai/chat-history/:documentId/:conversationId
 * Get chat history
 */
router.get("/chat-history/:documentId/:conversationId", async (req, res) => {
  const safeDocId = sanitizeDocId(req.params.documentId);
  const safeConvoId = String(req.params.conversationId).slice(0, 128);
  const messages = await ragService.getChatHistory(safeDocId, safeConvoId, 50);
  return res.json({ success: true, messages });
});

/**
 * DELETE /api/ai/chat-history/:documentId/:conversationId
 * Clear chat history
 */
router.delete("/chat-history/:documentId/:conversationId", async (req, res) => {
  const safeDocId = sanitizeDocId(req.params.documentId);
  const safeConvoId = String(req.params.conversationId).slice(0, 128);
  await ragService.clearChatHistory(safeDocId, safeConvoId);
  return res.json({ success: true });
});

module.exports = router;
