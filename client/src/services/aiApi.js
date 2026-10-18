/**
 * Client API service for AI Writing Assistant
 */

import { API_BASE_URL as BACKEND_URL } from "./apiConfig.js";

const API_BASE_URL = `${BACKEND_URL}/api/ai`;

/**
 * Send selected text to AI Writing Assistant
 * @param {Object} options
 * @param {string} options.text - Selected text
 * @param {string} options.operation - improve | grammar | professional | concise | expand | summarize | rewrite | tone
 * @param {string} [options.tone] - professional | friendly | formal | simple
 * @param {string} [options.context] - Surrounding context
 * @param {string} [options.documentId] - Current document id
 * @param {AbortSignal} [options.signal] - Abort signal for cancelling
 * @returns {Promise<{success: boolean, result: string, operation: string, isDemo?: boolean}>}
 */
export async function requestAiAssistance({
  text,
  operation,
  tone,
  context,
  documentId,
  signal,
}) {
  if (!text || !text.trim()) {
    throw new Error("Please select some text before using the AI assistant.");
  }

  const response = await fetch(`${API_BASE_URL}/writing-assistant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: text.trim(),
      operation,
      tone,
      context,
      documentId,
    }),
    signal,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.error || `AI assistant request failed with status ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  if (!data.success || !data.result) {
    throw new Error(data.error || "AI returned an empty response. Please try again.");
  }

  return data;
}
