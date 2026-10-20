const Y = require("yjs");
const db = require("../db/database");

/**
 * Extract clean human-readable text from Yjs ProseMirror XML fragment
 */
function extractDocText(ydoc) {
  try {
    const fragment = ydoc.getXmlFragment("prosemirror");
    const rawXml = fragment.toString();
    return rawXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  } catch (err) {
    console.error("Error extracting doc text:", err);
    return "";
  }
}

/**
 * Ensure document entry exists in documents table
 */
async function ensureDocument(documentId, title = "Untitled Document", client = db) {
  await client.query(
    "INSERT INTO documents (id, title) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
    [documentId, title || "Untitled Document"]
  );
}

/**
 * Generate a smart, deterministic change summary between two text states
 */
function generateDeterministicSummary(oldText = "", newText = "") {
  const oldWords = oldText ? oldText.trim().split(/\s+/).filter(Boolean) : [];
  const newWords = newText ? newText.trim().split(/\s+/).filter(Boolean) : [];

  if (oldWords.length === 0 && newWords.length > 0) {
    return `Initial draft created (~${newWords.length} words)`;
  }

  const diff = newWords.length - oldWords.length;
  if (diff > 0) {
    return `Added ~${diff} word${diff === 1 ? "" : "s"}`;
  } else if (diff < 0) {
    return `Removed ~${Math.abs(diff)} word${Math.abs(diff) === 1 ? "" : "s"}`;
  } else {
    return `Updated content and formatting`;
  }
}

/**
 * Simple word-level LCS diff algorithm
 */
function computeWordDiff(textA, textB) {
  const wordsA = textA ? textA.split(/(\s+)/) : [];
  const wordsB = textB ? textB.split(/(\s+)/) : [];

  const n = wordsA.length;
  const m = wordsB.length;

  // Matrix for Longest Common Subsequence
  // Use 1D arrays if very large, but typical doc sections fit well
  const maxWords = 1500;
  const aSlice = wordsA.slice(0, maxWords);
  const bSlice = wordsB.slice(0, maxWords);
  const lenA = aSlice.length;
  const lenB = bSlice.length;

  const dp = Array.from({ length: lenA + 1 }, () => new Int32Array(lenB + 1));

  for (let i = 0; i < lenA; i++) {
    for (let j = 0; j < lenB; j++) {
      if (aSlice[i] === bSlice[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const diff = [];
  let i = lenA;
  let j = lenB;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aSlice[i - 1] === bSlice[j - 1]) {
      diff.unshift({ type: "unchanged", text: aSlice[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({ type: "added", text: bSlice[j - 1] });
      j--;
    } else if (i > 0) {
      diff.unshift({ type: "removed", text: aSlice[i - 1] });
      i--;
    }
  }

  // Merge consecutive same-type chunks
  const merged = [];
  for (const item of diff) {
    if (merged.length > 0 && merged[merged.length - 1].type === item.type) {
      merged[merged.length - 1].text += item.text;
    } else {
      merged.push({ ...item });
    }
  }

  return merged;
}

/**
 * Create a new document version checkpoint
 */
async function createVersion({
  documentId,
  createdById = "system",
  createdByName = "Collaborator",
  description,
  ydoc,
  restoredFromVersion = null,
  title,
}) {
  const contentText = extractDocText(ydoc);
  const binarySnapshot = Buffer.from(Y.encodeStateAsUpdate(ydoc));

  const { row, nextVersionNum, summary } = await db.withTransaction(async (client) => {
    await ensureDocument(documentId, title, client);

    // Serialize version numbering per document across concurrent requests
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [documentId]);

    const { rows: lastRows } = await client.query(
      "SELECT version_number, content_text FROM document_versions WHERE document_id = $1 ORDER BY version_number DESC LIMIT 1",
      [documentId]
    );
    const lastVer = lastRows[0];
    const nextVersionNum = (lastVer?.version_number || 0) + 1;

    let summary = description?.trim();
    if (!summary) {
      if (restoredFromVersion) {
        summary = `Restored from Version ${restoredFromVersion}`;
      } else {
        summary = generateDeterministicSummary(lastVer?.content_text || "", contentText);
      }
    }

    const { rows } = await client.query(
      `INSERT INTO document_versions (
        document_id,
        version_number,
        created_by_id,
        created_by_name,
        change_summary,
        content_text,
        crdt_snapshot,
        restored_from_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, created_at`,
      [
        documentId,
        nextVersionNum,
        createdById,
        createdByName,
        summary,
        contentText,
        binarySnapshot,
        restoredFromVersion,
      ]
    );

    await client.query("UPDATE documents SET updated_at = NOW() WHERE id = $1", [documentId]);

    return { row: rows[0], nextVersionNum, summary };
  });

  return {
    id: row.id,
    documentId,
    versionNumber: nextVersionNum,
    createdById,
    createdByName,
    createdAt: new Date(row.created_at).toISOString(),
    changeSummary: summary,
    restoredFromVersion,
    wordCount: contentText.split(/\s+/).filter(Boolean).length,
  };
}

/**
 * List all historical versions for a document
 */
async function listVersions(documentId) {
  await ensureDocument(documentId);

  const { rows } = await db.query(
    `SELECT
      id,
      document_id AS "documentId",
      version_number AS "versionNumber",
      created_by_id AS "createdById",
      created_by_name AS "createdByName",
      created_at AS "createdAt",
      change_summary AS "changeSummary",
      restored_from_version AS "restoredFromVersion",
      length(content_text) AS "textLength"
    FROM document_versions
    WHERE document_id = $1
    ORDER BY version_number DESC`,
    [documentId]
  );

  return rows;
}

/**
 * Get a specific version by ID
 */
async function getVersion(documentId, versionId) {
  if (!Number.isInteger(versionId)) return null;

  const { rows } = await db.query(
    `SELECT
      id,
      document_id AS "documentId",
      version_number AS "versionNumber",
      created_by_id AS "createdById",
      created_by_name AS "createdByName",
      created_at AS "createdAt",
      change_summary AS "changeSummary",
      content_text AS "contentText",
      crdt_snapshot AS "crdtSnapshot",
      restored_from_version AS "restoredFromVersion"
    FROM document_versions
    WHERE document_id = $1 AND id = $2`,
    [documentId, versionId]
  );
  const row = rows[0];

  if (!row) return null;

  return {
    ...row,
    crdtSnapshotBase64: row.crdtSnapshot.toString("base64"),
  };
}

/**
 * Compare two versions and return diff
 */
async function compareVersions(documentId, versionIdA, versionIdB) {
  const [vA, vB] = await Promise.all([
    getVersion(documentId, versionIdA),
    getVersion(documentId, versionIdB),
  ]);

  if (!vA || !vB) {
    throw new Error("One or both versions not found");
  }

  const diffChunks = computeWordDiff(vA.contentText, vB.contentText);

  const addedWords = diffChunks
    .filter((c) => c.type === "added")
    .reduce((acc, c) => acc + (c.text.trim().split(/\s+/).filter(Boolean).length), 0);

  const removedWords = diffChunks
    .filter((c) => c.type === "removed")
    .reduce((acc, c) => acc + (c.text.trim().split(/\s+/).filter(Boolean).length), 0);

  return {
    versionA: {
      id: vA.id,
      versionNumber: vA.versionNumber,
      createdByName: vA.createdByName,
      createdAt: vA.createdAt,
      changeSummary: vA.changeSummary,
    },
    versionB: {
      id: vB.id,
      versionNumber: vB.versionNumber,
      createdByName: vB.createdByName,
      createdAt: vB.createdAt,
      changeSummary: vB.changeSummary,
    },
    diff: diffChunks,
    statistics: {
      addedWords,
      removedWords,
    },
  };
}

/**
 * Deep copy children from one Y.XmlFragment/Element to another
 */
function cloneXmlNodes(sourceFragment, targetFragment) {
  const sourceLen = sourceFragment.length;
  for (let i = 0; i < sourceLen; i++) {
    const child = sourceFragment.get(i);
    if (child instanceof Y.XmlText) {
      const newText = new Y.XmlText(child.toString());
      targetFragment.push([newText]);
    } else if (child instanceof Y.XmlElement) {
      const newElem = new Y.XmlElement(child.nodeName);
      // Copy attributes
      const attrs = child.getAttributes();
      for (const [k, v] of Object.entries(attrs)) {
        newElem.setAttribute(k, v);
      }
      targetFragment.push([newElem]);
      cloneXmlNodes(child, newElem);
    }
  }
}

/**
 * Restore an older version into the active CRDT document
 */
async function restoreVersion({
  documentId,
  versionId,
  user = { name: "User", id: "user" },
  activeYDoc,
}) {
  const targetVer = await getVersion(documentId, versionId);
  if (!targetVer) {
    throw new Error("Target version not found");
  }

  // Reconstruct target document in a sandbox Y.Doc
  const tempDoc = new Y.Doc();
  Y.applyUpdate(tempDoc, targetVer.crdtSnapshot);

  const tempFragment = tempDoc.getXmlFragment("prosemirror");
  const activeFragment = activeYDoc.getXmlFragment("prosemirror");

  // Perform clean restoration inside a Yjs transaction
  // This broadcasts to all connected WebSocket clients instantly!
  activeYDoc.transact(() => {
    // Clear active fragment
    const activeLen = activeFragment.length;
    if (activeLen > 0) {
      activeFragment.delete(0, activeLen);
    }

    // Clone target nodes into active fragment
    cloneXmlNodes(tempFragment, activeFragment);

    // Also sync title if metadata exists
    const tempMeta = tempDoc.getMap("metadata");
    if (tempMeta && tempMeta.has("title")) {
      activeYDoc.getMap("metadata").set("title", tempMeta.get("title"));
    }
  }, "version-restore");

  tempDoc.destroy();

  // Create a brand NEW version record marking the restoration (History is NEVER deleted!)
  const newVersion = await createVersion({
    documentId,
    createdById: user.id || "user",
    createdByName: user.name || "Collaborator",
    description: `Restored from Version ${targetVer.versionNumber}`,
    ydoc: activeYDoc,
    restoredFromVersion: targetVer.versionNumber,
  });

  return {
    success: true,
    restoredFrom: targetVer.versionNumber,
    newVersion,
  };
}

module.exports = {
  extractDocText,
  createVersion,
  listVersions,
  getVersion,
  compareVersions,
  restoreVersion,
};
