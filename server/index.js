const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { setupWSConnection, docs, getYDoc } = require("y-websocket/bin/utils");
const versionRoutes = require("./routes/versionRoutes");
const versionService = require("./services/versionService");
const aiRoutes = require("./routes/aiRoutes");
const chatRoutes = require("./routes/chatRoutes");
const ragService = require("./services/ragService");

const documentMetadata = new Map();

function sanitizeDocId(id) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128) || "default-room";
}

const app = express();

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
  : ["http://localhost:3000", "http://localhost:5173", "http://localhost:3001"];

app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, true); // Allow during local development
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

// Version History APIs
app.use("/api/documents", versionRoutes);

// AI Writing Assistant APIs
app.use("/api/ai", aiRoutes);

// Document Chat (RAG) APIs
app.use("/api/ai", chatRoutes);

// REST API endpoints
app.get("/api/documents", (req, res) => {
  const docList = Array.from(documentMetadata.entries()).map(([id, metadata]) => ({
    id,
    title: metadata.title,
    lastModified: metadata.lastModified,
    collaboratorCount: metadata.collaborators.size,
  }));

  res.json(docList);
});

app.get("/api/documents/:docId", (req, res) => {
  const docId = sanitizeDocId(req.params.docId);
  const metadata = documentMetadata.get(docId);

  if (!metadata) {
    return res.status(404).json({ error: "Document not found" });
  }

  res.json({
    id: docId,
    title: metadata.title,
    lastModified: metadata.lastModified,
    collaboratorCount: metadata.collaborators.size,
  });
});

app.post("/api/documents", (req, res) => {
  const docId = uuidv4();
  const { title = "Untitled Document" } = req.body;
  const safeTitle = typeof title === "string" ? title.slice(0, 200) : "Untitled Document";

  const ydoc = getYDoc(docId);
  ydoc.getMap("metadata").set("title", safeTitle);

  documentMetadata.set(docId, {
    title: safeTitle,
    lastModified: new Date(),
    collaborators: new Set(),
  });

  res.json({
    id: docId,
    title: safeTitle,
    url: `${req.protocol}://${req.get("host")}/doc/${docId}`,
  });
});

app.put("/api/documents/:docId/title", (req, res) => {
  const docId = sanitizeDocId(req.params.docId);
  const { title } = req.body;

  const metadata = documentMetadata.get(docId);
  if (!metadata) {
    return res.status(404).json({ error: "Document not found" });
  }

  const safeTitle = typeof title === "string" ? title.slice(0, 200) : "Untitled Document";
  metadata.title = safeTitle;
  metadata.lastModified = new Date();

  const ydoc = docs.get(docId);
  if (ydoc) {
    ydoc.getMap("metadata").set("title", safeTitle);
  }

  res.json({ success: true });
});

app.delete("/api/documents/:docId", (req, res) => {
  const docId = sanitizeDocId(req.params.docId);

  const ydoc = docs.get(docId);
  if (ydoc) {
    ydoc.destroy();
    docs.delete(docId);
  }
  documentMetadata.delete(docId);

  res.json({ success: true });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    documents: docs.size,
    uptime: process.uptime(),
  });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Enhanced WebSocket connection handler
wss.on("connection", (ws, req) => {
  const rawUrl = req.url || "";
  const rawDocName = rawUrl.slice(1).split("?")[0] || "default-room";
  const docName = sanitizeDocId(rawDocName);

  console.log(`📝 New connection to document: ${docName}`);

  const ydoc = getYDoc(docName);

  if (!documentMetadata.has(docName)) {
    documentMetadata.set(docName, {
      title: "Untitled Document",
      lastModified: new Date(),
      collaborators: new Set(),
    });
  }

  const metadata = documentMetadata.get(docName);
  const collaboratorId = uuidv4();
  metadata.collaborators.add(collaboratorId);

  const updateListener = (update, origin) => {
    metadata.lastModified = new Date();
    if (origin !== "version-restore") {
      // Schedule RAG re-indexing (debounced 30s after last edit)
      ragService.scheduleReindex(docName, () => versionService.extractDocText(ydoc), 30000);
    }
  };
  ydoc.on("update", updateListener);

  ws.on("close", () => {
    metadata.collaborators.delete(collaboratorId);
    ydoc.off("update", updateListener);
    console.log(`👋 User left document: ${docName}`);
  });

  try {
    setupWSConnection(ws, req, { docName });
  } catch (error) {
    console.error("Error setting up WebSocket connection:", error);
    ws.close();
  }
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down server...`);

  wss.clients.forEach((ws) => {
    ws.close();
  });

  docs.forEach((doc) => {
    doc.destroy();
  });

  server.close(() => {
    console.log("✅ Server closed gracefully");
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

const PORT = process.env.PORT || 1234;

server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server running at ws://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

module.exports = server;
