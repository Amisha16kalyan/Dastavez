const express = require("express");
const aiService = require("../services/aiService");

const router = express.Router();

function sanitizeDocId(id) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128) || "default-room";
}

/**
 * POST /api/ai/writing-assistant
 * Transform selected text using AI
 */
router.post("/writing-assistant", async (req, res) => {
  try {
    const { text, operation, tone, context, documentId } = req.body;

    // Validate text
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Text is required and cannot be empty.",
      });
    }

    if (text.length > 4000) {
      return res.status(400).json({
        success: false,
        error: "Selected text exceeds maximum limit of 4,000 characters.",
      });
    }

    // Validate operation
    const safeOp = String(operation || "").toLowerCase().trim();
    if (!aiService.VALID_OPERATIONS.includes(safeOp)) {
      return res.status(400).json({
        success: false,
        error: `Invalid operation '${operation}'. Supported operations: ${aiService.VALID_OPERATIONS.join(", ")}`,
      });
    }

    // Validate optional tone
    let safeTone = "professional";
    if (tone) {
      const lowerTone = String(tone).toLowerCase().trim();
      if (!aiService.VALID_TONES.includes(lowerTone)) {
        return res.status(400).json({
          success: false,
          error: `Invalid tone '${tone}'. Supported tones: ${aiService.VALID_TONES.join(", ")}`,
        });
      }
      safeTone = lowerTone;
    }

    // Validate documentId if provided
    let safeDocId = null;
    if (documentId) {
      safeDocId = sanitizeDocId(documentId);
      if (!safeDocId) {
        return res.status(400).json({
          success: false,
          error: "Invalid document identifier provided.",
        });
      }
    }

    // Validate context length
    const safeContext = typeof context === "string" ? context.slice(0, 600) : "";

    // Execute transformation
    const response = await aiService.transformText({
      text,
      operation: safeOp,
      tone: safeTone,
      context: safeContext,
      documentId: safeDocId,
    });

    return res.json({
      success: true,
      result: response.result,
      operation: response.operation,
      tone: response.tone,
      isDemo: response.isDemo || false,
    });
  } catch (err) {
    console.error("AI Writing Assistant Error:", err.message);

    const statusCode = err.status || 500;
    const userMessage = err.message || "An error occurred while processing your request. Please try again.";

    return res.status(statusCode).json({
      success: false,
      error: userMessage,
    });
  }
});

module.exports = router;
