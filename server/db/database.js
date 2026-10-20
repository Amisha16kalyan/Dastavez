const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL (or DATABASE_URL_POOLED) is not set");
}

const pool = new Pool({ connectionString, max: 10 });

pool.on("error", (err) => {
  console.error("Postgres pool error:", err.message);
});

const ready = pool.query(`
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Untitled Document',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS document_versions (
    id SERIAL PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    created_by_id TEXT,
    created_by_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    change_summary TEXT NOT NULL,
    content_text TEXT NOT NULL,
    crdt_snapshot BYTEA NOT NULL,
    restored_from_version INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_doc_versions_doc_id ON document_versions(document_id);
  CREATE INDEX IF NOT EXISTS idx_doc_versions_created_at ON document_versions(created_at);
  CREATE INDEX IF NOT EXISTS idx_doc_versions_num ON document_versions(document_id, version_number);

  CREATE TABLE IF NOT EXISTS document_chunks (
    id SERIAL PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    section_title TEXT DEFAULT '',
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    word_count INTEGER DEFAULT 0,
    embedding TEXT,
    indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON document_chunks(document_id);
  CREATE INDEX IF NOT EXISTS idx_chunks_hash ON document_chunks(document_id, content_hash);

  CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    document_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    sources TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_chat_doc ON chat_messages(document_id, conversation_id);
`);

async function query(text, params) {
  await ready;
  return pool.query(text, params);
}

async function withTransaction(fn) {
  await ready;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, ready, query, withTransaction };
