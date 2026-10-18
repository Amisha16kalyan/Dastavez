/**
 * Client API service for Document Chat (RAG)
 */

import { API_BASE_URL as BACKEND_URL } from "./apiConfig.js";

const API_BASE_URL = `${BACKEND_URL}/api/ai`;

/**
 * Ask a question about the document
 */
export async function askDocumentQuestion({
  documentId,
  question,
  conversationId,
  topK = 5,
  signal,
}) {
  const response = await fetch(`${API_BASE_URL}/document-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId, question, conversationId, topK }),
    signal,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Chat request failed (${response.status})`);
  }
  return data;
}

/**
 * Trigger manual document indexing
 */
export async function indexDocument(documentId) {
  const response = await fetch(`${API_BASE_URL}/document-index`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Indexing failed");
  }
  return data;
}

/**
 * Get indexing status
 */
export async function getIndexStatus(documentId) {
  const response = await fetch(`${API_BASE_URL}/document-index/${documentId}`);
  const data = await response.json().catch(() => ({}));
  return data;
}

/**
 * Get chat history
 */
export async function getChatHistory(documentId, conversationId) {
  const response = await fetch(`${API_BASE_URL}/chat-history/${documentId}/${conversationId}`);
  const data = await response.json().catch(() => ({}));
  return data.messages || [];
}

/**
 * Clear chat history
 */
export async function clearChatHistoryApi(documentId, conversationId) {
  await fetch(`${API_BASE_URL}/chat-history/${documentId}/${conversationId}`, {
    method: "DELETE",
  });
}
