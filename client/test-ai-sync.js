import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import WebSocket from "ws";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForSync(provider, timeout = 3000) {
  return new Promise((resolve) => {
    if (provider.synced) return resolve();
    const timer = setTimeout(() => resolve(), timeout);
    provider.once("sync", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function getDocText(ydoc) {
  const fragment = ydoc.getXmlFragment("prosemirror");
  return fragment.toString().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function runAiCrdtTests() {
  console.log("=================================================");
  console.log("🚀 Testing AI Suggestion Flow & Yjs CRDT Broadcast");
  console.log("=================================================\n");

  const WS_URL = "ws://localhost:1234";
  const docId = `ai-test-doc-${Date.now()}`;

  // 1. Client A and Client B connect to document room
  const ydocA = new Y.Doc();
  const providerA = new WebsocketProvider(WS_URL, docId, ydocA, { WebSocketPolyfill: WebSocket });

  const ydocB = new Y.Doc();
  const providerB = new WebsocketProvider(WS_URL, docId, ydocB, { WebSocketPolyfill: WebSocket });

  await Promise.all([waitForSync(providerA), waitForSync(providerB)]);

  // 2. Client A writes initial sentence
  const fragA = ydocA.getXmlFragment("prosemirror");
  const pA = new Y.XmlElement("paragraph");
  const originalText = "this payment api is not working properly because database connection is slow";
  const textNodeA = new Y.XmlText(originalText);
  pA.insert(0, [textNodeA]);
  fragA.insert(0, [pA]);

  await delay(300);
  console.log("Client A typed:", getDocText(ydocA));
  console.log("Client B sees:", getDocText(ydocB));

  if (getDocText(ydocB) !== originalText) {
    console.error("❌ Client B did not receive initial text via WebSocket!");
    process.exit(1);
  }
  console.log("✅ Step 1: Initial document synced to Client B via Yjs WebSocket.");

  // 3. User requests AI transformation
  console.log("\nSimulating user selecting text and requesting 'professional' from AI...");
  const aiRes = await fetch("http://localhost:1234/api/ai/writing-assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: originalText,
      operation: "professional",
      documentId: docId,
    }),
  });

  const aiData = await aiRes.json();
  console.log("AI returned suggestion:", aiData.result);

  if (!aiData.success || !aiData.result.includes("payment API")) {
    console.error("❌ AI did not return expected suggestion:", aiData);
    process.exit(1);
  }
  console.log("✅ Step 2: AI returned suggestion without directly modifying Yjs or database.");

  // 4. Verify Client B STILL sees original text before user clicks 'Accept'
  console.log("Client B text before Accept:", getDocText(ydocB));
  if (getDocText(ydocB) !== originalText) {
    console.error("❌ Document changed prematurely before Accept!");
    process.exit(1);
  }
  console.log("✅ Step 3: Yjs was NOT modified prematurely before user clicks Accept.");

  // 5. User clicks 'Accept' -> Frontend applies replacement through transaction
  console.log("\nUser clicks 'Accept' -> Applying replacement via Yjs/ProseMirror transaction...");
  ydocA.transact(() => {
    // Delete old text and insert AI suggestion
    textNodeA.delete(0, textNodeA.length);
    textNodeA.insert(0, aiData.result);
  }, "ai-assistant");

  await delay(300);
  console.log("Client A text after Accept:", getDocText(ydocA));
  console.log("Client B text after Accept:", getDocText(ydocB));

  if (getDocText(ydocB) !== aiData.result) {
    console.error("❌ Client B did not receive AI edit via Yjs CRDT!");
    process.exit(1);
  }
  console.log("✅ Step 4: Client B received AI suggestion cleanly over Yjs WebSocket broadcast!");

  // Clean up
  providerA.destroy();
  providerB.destroy();
  ydocA.destroy();
  ydocB.destroy();

  console.log("\n=================================================");
  console.log("🎉 ALL AI WRITING ASSISTANT CRDT TESTS PASSED!");
  console.log("=================================================\n");
  process.exit(0);
}

runAiCrdtTests().catch((err) => {
  console.error("Test Error:", err);
  process.exit(1);
});
