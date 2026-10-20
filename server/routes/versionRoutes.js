const express = require("express");
const { getYDoc } = require("y-websocket/bin/utils");
const versionService = require("../services/versionService");

const router = express.Router({ mergeParams: true });

function sanitizeDocId(id) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128) || "default-room";
}

/**
 * GET /api/documents/:documentId/versions
 * List all historical versions
 */
router.get("/:documentId/versions", async (req, res) => {
  try {
    const documentId = sanitizeDocId(req.params.documentId);
    const versions = await versionService.listVersions(documentId);
    res.json(versions);
  } catch (err) {
    console.error("Error listing versions:", err);
    res.status(500).json({ error: "Failed to list versions" });
  }
});

/**
 * GET /api/documents/:documentId/versions/compare?from=:v1&to=:v2
 * Compare two versions (Diff View)
 */
router.get("/:documentId/versions/compare", async (req, res) => {
  try {
    const documentId = sanitizeDocId(req.params.documentId);
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: "Query parameters 'from' and 'to' are required" });
    }

    const diffData = await versionService.compareVersions(documentId, Number(from), Number(to));
    res.json(diffData);
  } catch (err) {
    console.error("Error comparing versions:", err);
    res.status(404).json({ error: err.message || "Failed to compare versions" });
  }
});

/**
 * GET /api/documents/:documentId/versions/:versionId
 * Get specific version details & content
 */
router.get("/:documentId/versions/:versionId", async (req, res) => {
  try {
    const documentId = sanitizeDocId(req.params.documentId);
    const versionId = Number(req.params.versionId);

    const version = await versionService.getVersion(documentId, versionId);
    if (!version) {
      return res.status(404).json({ error: "Version not found" });
    }

    res.json(version);
  } catch (err) {
    console.error("Error getting version:", err);
    res.status(500).json({ error: "Failed to fetch version" });
  }
});

/**
 * POST /api/documents/:documentId/versions
 * Create a manual checkpoint / version
 */
router.post("/:documentId/versions", async (req, res) => {
  try {
    const documentId = sanitizeDocId(req.params.documentId);
    const { description, user = {} } = req.body;

    const ydoc = getYDoc(documentId);
    const newVersion = await versionService.createVersion({
      documentId,
      createdById: user.id || "user",
      createdByName: user.name || "Collaborator",
      description: typeof description === "string" ? description.trim() : null,
      ydoc,
    });

    res.status(201).json(newVersion);
  } catch (err) {
    console.error("Error creating version:", err);
    res.status(500).json({ error: "Failed to create version checkpoint" });
  }
});

/**
 * POST /api/documents/:documentId/versions/:versionId/restore
 * Restore an older version into the active document
 */
router.post("/:documentId/versions/:versionId/restore", async (req, res) => {
  try {
    const documentId = sanitizeDocId(req.params.documentId);
    const versionId = Number(req.params.versionId);
    const { user = {} } = req.body;

    const activeYDoc = getYDoc(documentId);

    const result = await versionService.restoreVersion({
      documentId,
      versionId,
      user,
      activeYDoc,
    });

    res.json(result);
  } catch (err) {
    console.error("Error restoring version:", err);
    res.status(500).json({ error: err.message || "Failed to restore version" });
  }
});

module.exports = router;
