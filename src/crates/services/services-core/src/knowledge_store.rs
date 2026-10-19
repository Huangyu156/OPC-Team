//! Durable Knowledge Base store schema and synchronous owner access.
//!
//! The live Assistant workflow (tool surface, prompt injection, permission
//! policy) remains in Product Assembly. This module owns the SQLite
//! persistence shape, the additive schema migration path, and the small
//! synchronous API shared by the live runtime and the desktop command layer.
//!
//! Knowledge Bases are user-level data: the caller resolves the database file
//! through `PathManager`, exactly like the durable Memory store. Unlike the
//! Memory store `stage1_outputs` table, knowledge entries are user-authored and
//! cannot be regenerated, so schema evolution here is strictly additive:
//! `initialize_knowledge_schema` migrates with `ALTER TABLE ADD COLUMN` and
//! never drops a table that already holds content.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use thiserror::Error;

/// Schema family marker persisted in `PRAGMA user_version`.
///
/// The Knowledge store owns its own database file, so this is the only
/// consumer of that pragma inside the file.
pub const KNOWLEDGE_STORE_SCHEMA: &str = "opc.knowledge.v1";
pub const KNOWLEDGE_SCHEMA_VERSION: i64 = 1;

/// Default cap for one entry body, measured in bytes.
pub const MAX_ENTRY_BODY_BYTES: usize = 512 * 1024;
/// Hard cap for a single list or search request.
pub const MAX_KNOWLEDGE_QUERY_LIMIT: usize = 200;
pub const DEFAULT_KNOWLEDGE_QUERY_LIMIT: usize = 20;

pub const EXPECTED_KNOWLEDGE_BASES_COLUMNS: &[&str] =
    &["id", "name", "description", "created_at", "updated_at"];

pub const EXPECTED_KNOWLEDGE_ENTRIES_COLUMNS: &[&str] = &[
    "id",
    "knowledge_base_id",
    "title",
    "body",
    "tags",
    "source",
    "content_hash",
    "created_at",
    "updated_at",
];

pub const EXPECTED_KNOWLEDGE_LEDGER_COLUMNS: &[&str] = &[
    "id",
    "knowledge_base_id",
    "entry_id",
    "action",
    "actor_kind",
    "actor_id",
    "session_id",
    "before_hash",
    "after_hash",
    "reason",
    "created_at",
];

const TABLE_KNOWLEDGE_BASES: &str = "knowledge_bases";
const TABLE_KNOWLEDGE_ENTRIES: &str = "knowledge_entries";
const TABLE_KNOWLEDGE_LEDGER: &str = "knowledge_ledger";

/// Minimum token length the trigram tokenizer can match.
///
/// FTS5 `trigram` indexes 3-character runs, so a query whose longest term is
/// shorter than this can never match through MATCH. Chinese terms are often two
/// characters, so the store falls back to a bounded LIKE scan for those.
const TRIGRAM_MIN_TERM_CHARS: usize = 3;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeBaseRecord {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at_unix_secs: i64,
    pub updated_at_unix_secs: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEntryRecord {
    pub id: String,
    pub knowledge_base_id: String,
    pub title: String,
    pub body: String,
    pub tags: String,
    pub source: Option<String>,
    pub content_hash: String,
    pub created_at_unix_secs: i64,
    pub updated_at_unix_secs: i64,
}

/// One append-only content-change record.
///
/// This is deliberately separate from the session Tool event stream: tool
/// events are presentation state and are cleared with the session, while the
/// ledger has to outlive the session that produced the write.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeLedgerRecord {
    pub id: i64,
    pub knowledge_base_id: String,
    pub entry_id: Option<String>,
    pub action: String,
    pub actor_kind: String,
    pub actor_id: Option<String>,
    pub session_id: Option<String>,
    pub before_hash: Option<String>,
    pub after_hash: Option<String>,
    pub reason: Option<String>,
    pub created_at_unix_secs: i64,
}

/// Who is recorded as the author of a knowledge mutation.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct KnowledgeActor {
    /// `user` or `agent`.
    pub kind: String,
    pub id: Option<String>,
    pub session_id: Option<String>,
}

impl KnowledgeActor {
    pub fn user() -> Self {
        Self {
            kind: "user".to_string(),
            id: None,
            session_id: None,
        }
    }

    pub fn agent(agent_id: impl Into<String>, session_id: Option<String>) -> Self {
        Self {
            kind: "agent".to_string(),
            id: Some(agent_id.into()),
            session_id,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnowledgeEntryUpsert {
    pub id: String,
    pub knowledge_base_id: String,
    pub title: String,
    pub body: String,
    pub tags: String,
    pub source: Option<String>,
    pub actor: KnowledgeActor,
    pub reason: Option<String>,
}

/// Result of one upsert, returned to the desktop command layer.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEntryUpsertOutcome {
    pub entry: KnowledgeEntryRecord,
    pub created: bool,
}

/// One search hit. The body is deliberately absent: callers that need it use
/// the entry read path, so a search never ships whole documents.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSearchHit {
    pub entry_id: String,
    pub knowledge_base_id: String,
    pub title: String,
    pub snippet: String,
    pub updated_at_unix_secs: i64,
}

/// Which retrieval channel answers a search.
///
/// The two channels are deliberately exclusive rather than merged: callers pick
/// one and pay only for that path. `Auto` keeps the historical behaviour where
/// the query text decides, which is what the agent tool uses.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeSearchChannel {
    /// Choose the index path from the query text.
    #[default]
    Auto,
    /// Only the trigram full-text index. A query the index cannot reach is
    /// reported as an error instead of silently degrading to a scan.
    FullText,
    /// Only the bounded LIKE scan, for phrases the trigram index misses.
    Substring,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct KnowledgeSearchRequest {
    /// Restricts the search to these bases. An empty list searches every base.
    pub knowledge_base_ids: Vec<String>,
    pub query: String,
    pub limit: Option<usize>,
    pub channel: KnowledgeSearchChannel,
}

/// How a search was answered. Serialized as the snake_case ids the tool
/// payload and the editor both read (`full_text` / `substring` / `recent`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeSearchMode {
    /// Full-text MATCH through the trigram index.
    FullText,
    /// Bounded LIKE scan used for queries the trigram index cannot match.
    Substring,
    /// No query text: newest entries, used to orient a fresh session.
    Recent,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSearchOutcome {
    pub mode: KnowledgeSearchMode,
    pub hits: Vec<KnowledgeSearchHit>,
}

#[derive(Debug, Error)]
pub enum KnowledgeStoreError {
    #[error("Knowledge store SQLite operation failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Knowledge store schema is unsupported: {0}")]
    UnsupportedSchema(String),
    #[error("Knowledge record is invalid: {0}")]
    InvalidRecord(String),
    #[error("Knowledge entry body exceeds the {0} byte limit")]
    EntryTooLarge(usize),
    #[error("Knowledge search channel cannot answer this query: {0}")]
    SearchChannelUnsupported(String),
}

type Result<T> = std::result::Result<T, KnowledgeStoreError>;

/// Creates the schema, or migrates an existing database forward additively.
///
/// A database written by a newer build is rejected instead of being reset:
/// knowledge entries are user data and must never be destroyed to recover.
pub fn initialize_knowledge_schema(conn: &Connection) -> Result<()> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version > KNOWLEDGE_SCHEMA_VERSION {
        return Err(KnowledgeStoreError::UnsupportedSchema(format!(
            "knowledge store schema version {version} is newer than supported version {KNOWLEDGE_SCHEMA_VERSION}"
        )));
    }

    // Version 0 also covers a database created by an interrupted upgrade, so the
    // table statements stay idempotent and create-only.
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS knowledge_bases (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS knowledge_entries (
            id TEXT PRIMARY KEY NOT NULL,
            knowledge_base_id TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '',
            source TEXT,
            content_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_knowledge_entries_base_updated
            ON knowledge_entries(knowledge_base_id, updated_at DESC, id DESC);

        CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_entries_fts USING fts5(
            entry_id UNINDEXED,
            knowledge_base_id UNINDEXED,
            title,
            body,
            tags,
            tokenize = 'trigram'
        );

        CREATE TABLE IF NOT EXISTS knowledge_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            knowledge_base_id TEXT NOT NULL,
            entry_id TEXT,
            action TEXT NOT NULL,
            actor_kind TEXT NOT NULL,
            actor_id TEXT,
            session_id TEXT,
            before_hash TEXT,
            after_hash TEXT,
            reason TEXT,
            created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_knowledge_ledger_base_created
            ON knowledge_ledger(knowledge_base_id, created_at DESC, id DESC);
        "#,
    )?;

    if version < KNOWLEDGE_SCHEMA_VERSION {
        conn.pragma_update(None, "user_version", KNOWLEDGE_SCHEMA_VERSION)?;
    }
    Ok(())
}

/// Verifies that every column this module reads or writes still exists.
///
/// Older databases are migrated by `initialize_knowledge_schema`, so a missing
/// column here means the migration did not run. Extra columns written by a
/// newer build are tolerated: rejecting them would make a downgrade destructive.
pub fn validate_knowledge_schema(conn: &Connection) -> Result<()> {
    validate_table_contains(
        conn,
        TABLE_KNOWLEDGE_BASES,
        EXPECTED_KNOWLEDGE_BASES_COLUMNS,
    )?;
    validate_table_contains(
        conn,
        TABLE_KNOWLEDGE_ENTRIES,
        EXPECTED_KNOWLEDGE_ENTRIES_COLUMNS,
    )?;
    validate_table_contains(
        conn,
        TABLE_KNOWLEDGE_LEDGER,
        EXPECTED_KNOWLEDGE_LEDGER_COLUMNS,
    )?;
    Ok(())
}

pub fn create_knowledge_base(
    conn: &Connection,
    id: &str,
    name: &str,
    description: &str,
    now_unix_secs: i64,
) -> Result<KnowledgeBaseRecord> {
    let record = KnowledgeBaseRecord {
        id: validate_identifier(id, "knowledge base id")?,
        name: validate_text(name, "knowledge base name")?,
        description: description.to_string(),
        created_at_unix_secs: now_unix_secs,
        updated_at_unix_secs: now_unix_secs,
    };
    conn.execute(
        "INSERT INTO knowledge_bases (id, name, description, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            record.id,
            record.name,
            record.description,
            record.created_at_unix_secs,
            record.updated_at_unix_secs
        ],
    )?;
    Ok(record)
}

pub fn get_knowledge_base(conn: &Connection, id: &str) -> Result<Option<KnowledgeBaseRecord>> {
    let mut statement = conn.prepare(
        "SELECT id, name, description, created_at, updated_at
         FROM knowledge_bases WHERE id = ?1",
    )?;
    Ok(statement.query_row([id], map_knowledge_base).optional()?)
}

pub fn list_knowledge_bases(conn: &Connection) -> Result<Vec<KnowledgeBaseRecord>> {
    let mut statement = conn.prepare(
        "SELECT id, name, description, created_at, updated_at
         FROM knowledge_bases ORDER BY name COLLATE NOCASE, id",
    )?;
    let rows = statement.query_map([], map_knowledge_base)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn rename_knowledge_base(
    conn: &Connection,
    id: &str,
    name: &str,
    description: &str,
    now_unix_secs: i64,
) -> Result<KnowledgeBaseRecord> {
    let name = validate_text(name, "knowledge base name")?;
    let updated = conn.execute(
        "UPDATE knowledge_bases SET name = ?2, description = ?3, updated_at = ?4 WHERE id = ?1",
        params![id, name, description, now_unix_secs],
    )?;
    if updated == 0 {
        return Err(KnowledgeStoreError::InvalidRecord(format!(
            "knowledge base {id} does not exist"
        )));
    }
    get_knowledge_base(conn, id)?.ok_or_else(|| {
        KnowledgeStoreError::InvalidRecord(format!("knowledge base {id} disappeared"))
    })
}

/// Deletes a base together with its entries, index rows, and ledger rows.
pub fn delete_knowledge_base(conn: &Connection, id: &str) -> Result<bool> {
    let transaction = conn.unchecked_transaction()?;
    transaction.execute(
        "DELETE FROM knowledge_entries_fts WHERE knowledge_base_id = ?1",
        params![id],
    )?;
    transaction.execute(
        "DELETE FROM knowledge_entries WHERE knowledge_base_id = ?1",
        params![id],
    )?;
    transaction.execute(
        "DELETE FROM knowledge_ledger WHERE knowledge_base_id = ?1",
        params![id],
    )?;
    let removed = transaction.execute("DELETE FROM knowledge_bases WHERE id = ?1", params![id])?;
    transaction.commit()?;
    Ok(removed > 0)
}

/// Inserts or updates one entry, refreshes the FTS row, and appends the ledger.
pub fn upsert_knowledge_entry(
    conn: &Connection,
    request: &KnowledgeEntryUpsert,
    now_unix_secs: i64,
) -> Result<KnowledgeEntryUpsertOutcome> {
    let id = validate_identifier(&request.id, "knowledge entry id")?;
    let knowledge_base_id = validate_identifier(&request.knowledge_base_id, "knowledge base id")?;
    let title = validate_text(&request.title, "knowledge entry title")?;
    if request.body.len() > MAX_ENTRY_BODY_BYTES {
        return Err(KnowledgeStoreError::EntryTooLarge(MAX_ENTRY_BODY_BYTES));
    }
    let content_hash = knowledge_content_hash(
        &title,
        &request.body,
        &request.tags,
        request.source.as_deref(),
    );

    let transaction = conn.unchecked_transaction()?;
    let existing: Option<(String, i64)> = transaction
        .query_row(
            "SELECT content_hash, created_at FROM knowledge_entries WHERE id = ?1",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    let created = existing.is_none();
    let created_at = existing
        .as_ref()
        .map(|(_, created_at)| *created_at)
        .unwrap_or(now_unix_secs);

    if transaction
        .query_row(
            "SELECT 1 FROM knowledge_bases WHERE id = ?1",
            [&knowledge_base_id],
            |_| Ok(()),
        )
        .optional()?
        .is_none()
    {
        return Err(KnowledgeStoreError::InvalidRecord(format!(
            "knowledge base {knowledge_base_id} does not exist"
        )));
    }

    transaction.execute(
        "INSERT INTO knowledge_entries
            (id, knowledge_base_id, title, body, tags, source, content_hash, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
            knowledge_base_id = excluded.knowledge_base_id,
            title = excluded.title,
            body = excluded.body,
            tags = excluded.tags,
            source = excluded.source,
            content_hash = excluded.content_hash,
            updated_at = excluded.updated_at",
        params![
            id,
            knowledge_base_id,
            title,
            request.body,
            request.tags,
            request.source,
            content_hash,
            created_at,
            now_unix_secs
        ],
    )?;

    transaction.execute(
        "DELETE FROM knowledge_entries_fts WHERE entry_id = ?1",
        [&id],
    )?;
    transaction.execute(
        "INSERT INTO knowledge_entries_fts (entry_id, knowledge_base_id, title, body, tags)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, knowledge_base_id, title, request.body, request.tags],
    )?;

    let before_hash = existing.map(|(hash, _)| hash);
    append_ledger_in_transaction(
        &transaction,
        &knowledge_base_id,
        Some(&id),
        if created {
            "create_entry"
        } else {
            "update_entry"
        },
        &request.actor,
        before_hash.as_deref(),
        Some(&content_hash),
        request.reason.as_deref(),
        now_unix_secs,
    )?;

    transaction.commit()?;

    let entry = get_knowledge_entry(conn, &id)?.ok_or_else(|| {
        KnowledgeStoreError::InvalidRecord(format!("knowledge entry {id} disappeared"))
    })?;
    Ok(KnowledgeEntryUpsertOutcome { entry, created })
}

pub fn get_knowledge_entry(conn: &Connection, id: &str) -> Result<Option<KnowledgeEntryRecord>> {
    let mut statement = conn.prepare(
        "SELECT id, knowledge_base_id, title, body, tags, source, content_hash, created_at, updated_at
         FROM knowledge_entries WHERE id = ?1",
    )?;
    Ok(statement.query_row([id], map_knowledge_entry).optional()?)
}

pub fn list_knowledge_entries(
    conn: &Connection,
    knowledge_base_id: &str,
    limit: Option<usize>,
) -> Result<Vec<KnowledgeEntryRecord>> {
    let limit = clamp_limit(limit);
    let mut statement = conn.prepare(
        "SELECT id, knowledge_base_id, title, body, tags, source, content_hash, created_at, updated_at
         FROM knowledge_entries
         WHERE knowledge_base_id = ?1
         ORDER BY updated_at DESC, id DESC
         LIMIT ?2",
    )?;
    let rows = statement.query_map(
        params![knowledge_base_id, limit as i64],
        map_knowledge_entry,
    )?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn delete_knowledge_entry(
    conn: &Connection,
    id: &str,
    actor: &KnowledgeActor,
    reason: Option<&str>,
    now_unix_secs: i64,
) -> Result<bool> {
    let transaction = conn.unchecked_transaction()?;
    let existing: Option<(String, String)> = transaction
        .query_row(
            "SELECT knowledge_base_id, content_hash FROM knowledge_entries WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    let Some((knowledge_base_id, before_hash)) = existing else {
        transaction.commit()?;
        return Ok(false);
    };
    transaction.execute(
        "DELETE FROM knowledge_entries_fts WHERE entry_id = ?1",
        [id],
    )?;
    transaction.execute("DELETE FROM knowledge_entries WHERE id = ?1", [id])?;
    append_ledger_in_transaction(
        &transaction,
        &knowledge_base_id,
        Some(id),
        "delete_entry",
        actor,
        Some(&before_hash),
        None,
        reason,
        now_unix_secs,
    )?;
    transaction.commit()?;
    Ok(true)
}

/// Search over the trigram index and/or the substring scan.
///
/// `channel` picks the retrieval path. `Auto` keeps the historical behaviour and
/// decides from the query text alone, so the same query keeps hitting the same
/// index path across turns. The explicit channels are exclusive: the caller has
/// chosen to pay for exactly one path, so the other path is never consulted and
/// an unanswerable query is reported instead of silently degrading.
pub fn search_knowledge_entries(
    conn: &Connection,
    request: &KnowledgeSearchRequest,
) -> Result<KnowledgeSearchOutcome> {
    let limit = clamp_limit(request.limit);
    let bases = normalize_base_filter(&request.knowledge_base_ids)?;
    let terms = split_query_terms(&request.query);

    if terms.is_empty() {
        return Ok(KnowledgeSearchOutcome {
            mode: KnowledgeSearchMode::Recent,
            hits: search_recent_entries(conn, &bases, limit)?,
        });
    }

    match request.channel {
        KnowledgeSearchChannel::FullText => {
            if !query_reaches_trigram(&terms) {
                return Err(KnowledgeStoreError::SearchChannelUnsupported(format!(
                    "full-text search needs terms of at least {TRIGRAM_MIN_TERM_CHARS} characters"
                )));
            }
            let expression = fts_expression(&terms);
            Ok(KnowledgeSearchOutcome {
                mode: KnowledgeSearchMode::FullText,
                hits: search_with_fts(conn, &bases, &expression, limit)?,
            })
        }
        KnowledgeSearchChannel::Substring => Ok(KnowledgeSearchOutcome {
            mode: KnowledgeSearchMode::Substring,
            hits: search_with_like(conn, &bases, &terms, limit)?,
        }),
        KnowledgeSearchChannel::Auto => {
            if query_reaches_trigram(&terms) {
                let expression = fts_expression(&terms);
                let hits = search_with_fts(conn, &bases, &expression, limit)?;
                if !hits.is_empty() {
                    return Ok(KnowledgeSearchOutcome {
                        mode: KnowledgeSearchMode::FullText,
                        hits,
                    });
                }
            }

            Ok(KnowledgeSearchOutcome {
                mode: KnowledgeSearchMode::Substring,
                hits: search_with_like(conn, &bases, &terms, limit)?,
            })
        }
    }
}

pub fn list_knowledge_ledger(
    conn: &Connection,
    knowledge_base_id: &str,
    limit: Option<usize>,
) -> Result<Vec<KnowledgeLedgerRecord>> {
    let limit = clamp_limit(limit);
    let mut statement = conn.prepare(
        "SELECT id, knowledge_base_id, entry_id, action, actor_kind, actor_id,
                session_id, before_hash, after_hash, reason, created_at
         FROM knowledge_ledger
         WHERE knowledge_base_id = ?1
         ORDER BY created_at DESC, id DESC
         LIMIT ?2",
    )?;
    let rows = statement.query_map(params![knowledge_base_id, limit as i64], |row| {
        Ok(KnowledgeLedgerRecord {
            id: row.get(0)?,
            knowledge_base_id: row.get(1)?,
            entry_id: row.get(2)?,
            action: row.get(3)?,
            actor_kind: row.get(4)?,
            actor_id: row.get(5)?,
            session_id: row.get(6)?,
            before_hash: row.get(7)?,
            after_hash: row.get(8)?,
            reason: row.get(9)?,
            created_at_unix_secs: row.get(10)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Stable content identity used by the ledger and by change detection.
pub fn knowledge_content_hash(title: &str, body: &str, tags: &str, source: Option<&str>) -> String {
    let mut hasher = Sha256::new();
    hasher.update(title.as_bytes());
    hasher.update([0u8]);
    hasher.update(body.as_bytes());
    hasher.update([0u8]);
    hasher.update(tags.as_bytes());
    hasher.update([0u8]);
    hasher.update(source.unwrap_or_default().as_bytes());
    format!("{:x}", hasher.finalize())
}

fn append_ledger_in_transaction(
    transaction: &rusqlite::Transaction<'_>,
    knowledge_base_id: &str,
    entry_id: Option<&str>,
    action: &str,
    actor: &KnowledgeActor,
    before_hash: Option<&str>,
    after_hash: Option<&str>,
    reason: Option<&str>,
    now_unix_secs: i64,
) -> Result<()> {
    transaction.execute(
        "INSERT INTO knowledge_ledger
            (knowledge_base_id, entry_id, action, actor_kind, actor_id, session_id,
             before_hash, after_hash, reason, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            knowledge_base_id,
            entry_id,
            action,
            actor.kind,
            actor.id,
            actor.session_id,
            before_hash,
            after_hash,
            reason,
            now_unix_secs
        ],
    )?;
    Ok(())
}

fn search_recent_entries(
    conn: &Connection,
    bases: &[String],
    limit: usize,
) -> Result<Vec<KnowledgeSearchHit>> {
    let mut statement = conn.prepare(
        "SELECT id, knowledge_base_id, title, substr(body, 1, 240), updated_at
         FROM knowledge_entries
         WHERE (?1 = 0 OR knowledge_base_id IN (SELECT value FROM json_each(?2)))
         ORDER BY updated_at DESC, id DESC
         LIMIT ?3",
    )?;
    let hits = statement.query_map(
        params![bases.len() as i64, encode_base_filter(bases), limit as i64],
        map_search_hit,
    )?;
    Ok(hits.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn search_with_fts(
    conn: &Connection,
    bases: &[String],
    expression: &str,
    limit: usize,
) -> Result<Vec<KnowledgeSearchHit>> {
    let mut statement = conn.prepare(
        "SELECT e.id, e.knowledge_base_id, e.title,
                snippet(knowledge_entries_fts, 3, '', '', '...', 24),
                e.updated_at
         FROM knowledge_entries_fts f
         JOIN knowledge_entries e ON e.id = f.entry_id
         WHERE knowledge_entries_fts MATCH ?1
           AND (?2 = 0 OR e.knowledge_base_id IN (SELECT value FROM json_each(?3)))
         ORDER BY bm25(knowledge_entries_fts, 0.0, 0.0, 10.0, 4.0, 2.0), e.updated_at DESC
         LIMIT ?4",
    )?;
    let hits = statement.query_map(
        params![
            expression,
            bases.len() as i64,
            encode_base_filter(bases),
            limit as i64
        ],
        map_search_hit,
    )?;
    Ok(hits.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Bounded LIKE scan.
///
/// Every term must appear somewhere in the entry, which is what makes this a
/// usable second channel: a multi-word query matches an entry where the words
/// are not adjacent, exactly the case the trigram index cannot reach. Callers
/// that want the historical "match the whole phrase as one run" behaviour pass a
/// single term.
fn search_with_like(
    conn: &Connection,
    bases: &[String],
    terms: &[String],
    limit: usize,
) -> Result<Vec<KnowledgeSearchHit>> {
    let patterns = terms
        .iter()
        .filter(|term| !term.is_empty())
        .map(|term| like_pattern(term))
        .collect::<Vec<_>>();
    if patterns.is_empty() {
        return Ok(Vec::new());
    }

    let conditions = patterns
        .iter()
        .enumerate()
        .map(|(index, _)| {
            let placeholder = index + 1;
            format!(
                "(title LIKE ?{placeholder} ESCAPE '\\' OR body LIKE ?{placeholder} ESCAPE '\\' \
                 OR tags LIKE ?{placeholder} ESCAPE '\\')"
            )
        })
        .collect::<Vec<_>>()
        .join(" AND ");
    let base_param = patterns.len() + 1;
    let filter_param = base_param + 1;
    let limit_param = filter_param + 1;

    let mut statement = conn.prepare(&format!(
        "SELECT id, knowledge_base_id, title, substr(body, 1, 240), updated_at
         FROM knowledge_entries
         WHERE {conditions}
           AND (?{base_param} = 0 OR knowledge_base_id IN (SELECT value FROM json_each(?{filter_param})))
         ORDER BY updated_at DESC, id DESC
         LIMIT ?{limit_param}"
    ))?;

    let mut values: Vec<rusqlite::types::Value> = patterns
        .into_iter()
        .map(rusqlite::types::Value::Text)
        .collect();
    values.push(rusqlite::types::Value::Integer(bases.len() as i64));
    values.push(match encode_base_filter(bases) {
        Some(encoded) => rusqlite::types::Value::Text(encoded),
        // `?N = 0` already short-circuits the filter, so the bound value is only
        // read when a base list was supplied.
        None => rusqlite::types::Value::Null,
    });
    values.push(rusqlite::types::Value::Integer(limit as i64));

    let hits = statement.query_map(rusqlite::params_from_iter(values.iter()), map_search_hit)?;
    Ok(hits.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn map_knowledge_base(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeBaseRecord> {
    Ok(KnowledgeBaseRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        created_at_unix_secs: row.get(3)?,
        updated_at_unix_secs: row.get(4)?,
    })
}

fn map_knowledge_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeEntryRecord> {
    Ok(KnowledgeEntryRecord {
        id: row.get(0)?,
        knowledge_base_id: row.get(1)?,
        title: row.get(2)?,
        body: row.get(3)?,
        tags: row.get(4)?,
        source: row.get(5)?,
        content_hash: row.get(6)?,
        created_at_unix_secs: row.get(7)?,
        updated_at_unix_secs: row.get(8)?,
    })
}

fn map_search_hit(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeSearchHit> {
    Ok(KnowledgeSearchHit {
        entry_id: row.get(0)?,
        knowledge_base_id: row.get(1)?,
        title: row.get(2)?,
        snippet: row.get(3)?,
        updated_at_unix_secs: row.get(4)?,
    })
}

fn normalize_base_filter(ids: &[String]) -> Result<Vec<String>> {
    let mut unique = BTreeSet::new();
    for id in ids {
        unique.insert(validate_identifier(id, "knowledge base id")?);
    }
    Ok(unique.into_iter().collect())
}

fn encode_base_filter(bases: &[String]) -> Option<String> {
    if bases.is_empty() {
        return None;
    }
    serde_json::to_string(bases).ok()
}

fn validate_identifier(value: &str, field: &str) -> Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(KnowledgeStoreError::InvalidRecord(format!(
            "{field} must not be empty"
        )));
    }
    if trimmed.len() > 200 {
        return Err(KnowledgeStoreError::InvalidRecord(format!(
            "{field} exceeds 200 bytes"
        )));
    }
    if trimmed.chars().any(|character| character.is_control()) {
        return Err(KnowledgeStoreError::InvalidRecord(format!(
            "{field} must not contain control characters"
        )));
    }
    Ok(trimmed.to_string())
}

fn validate_text(value: &str, field: &str) -> Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(KnowledgeStoreError::InvalidRecord(format!(
            "{field} must not be empty"
        )));
    }
    Ok(trimmed.to_string())
}

fn clamp_limit(limit: Option<usize>) -> usize {
    limit
        .unwrap_or(DEFAULT_KNOWLEDGE_QUERY_LIMIT)
        .clamp(1, MAX_KNOWLEDGE_QUERY_LIMIT)
}

fn split_query_terms(query: &str) -> Vec<String> {
    query
        .split_whitespace()
        .filter(|term| !term.is_empty())
        .map(|term| term.to_string())
        .collect()
}

fn query_reaches_trigram(terms: &[String]) -> bool {
    terms
        .iter()
        .all(|term| term.chars().count() >= TRIGRAM_MIN_TERM_CHARS)
}

fn fts_expression(terms: &[String]) -> String {
    terms
        .iter()
        .map(|term| format!("\"{}\"", term.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" AND ")
}

fn like_pattern(query: &str) -> String {
    let escaped = query
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    format!("%{escaped}%")
}

fn validate_table_contains(
    conn: &Connection,
    table_name: &str,
    expected_columns: &[&str],
) -> Result<()> {
    let actual = table_columns(conn, table_name)?;
    if actual.is_empty() {
        return Err(KnowledgeStoreError::UnsupportedSchema(format!(
            "knowledge store table {table_name} is missing"
        )));
    }
    let missing = expected_columns
        .iter()
        .filter(|column| !actual.iter().any(|existing| existing == *column))
        .copied()
        .collect::<Vec<_>>();
    if !missing.is_empty() {
        return Err(KnowledgeStoreError::UnsupportedSchema(format!(
            "table {table_name} is missing columns {missing:?}"
        )));
    }
    Ok(())
}

fn table_columns(conn: &Connection, table_name: &str) -> Result<Vec<String>> {
    let mut statement = conn.prepare(&format!("PRAGMA table_info({table_name})"))?;
    let rows = statement.query_map([], |row| row.get::<_, String>(1))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_store() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory knowledge store");
        initialize_knowledge_schema(&conn).expect("initialize knowledge schema");
        conn
    }

    fn seed_base(conn: &Connection, id: &str) {
        create_knowledge_base(conn, id, "Team Notes", "", 1_000).expect("create base");
    }

    fn upsert(
        conn: &Connection,
        id: &str,
        base: &str,
        title: &str,
        body: &str,
    ) -> KnowledgeEntryUpsertOutcome {
        upsert_knowledge_entry(
            conn,
            &KnowledgeEntryUpsert {
                id: id.to_string(),
                knowledge_base_id: base.to_string(),
                title: title.to_string(),
                body: body.to_string(),
                tags: String::new(),
                source: None,
                actor: KnowledgeActor::agent("assistant-1", Some("session-1".to_string())),
                reason: Some("agent write".to_string()),
            },
            2_000,
        )
        .expect("upsert entry")
    }

    #[test]
    fn schema_initialization_is_idempotent_and_versioned() {
        let conn = open_store();
        initialize_knowledge_schema(&conn).expect("second initialize");
        validate_knowledge_schema(&conn).expect("validate schema");
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read user_version");
        assert_eq!(version, KNOWLEDGE_SCHEMA_VERSION);
    }

    #[test]
    fn newer_schema_version_is_rejected_without_destroying_content() {
        let conn = open_store();
        let version = KNOWLEDGE_SCHEMA_VERSION + 1;
        conn.pragma_update(None, "user_version", version)
            .expect("bump version");
        let error = initialize_knowledge_schema(&conn).expect_err("must reject newer schema");
        assert!(matches!(error, KnowledgeStoreError::UnsupportedSchema(_)));
        // The tables must still be usable for a read-only inspection path.
        validate_knowledge_schema(&conn).expect("tables still present");
    }

    #[test]
    fn existing_entry_survives_additive_schema_growth() {
        let conn = open_store();
        seed_base(&conn, "kb-1");
        upsert(
            &conn,
            "entry-1",
            "kb-1",
            "Deploy notes",
            "Ship the desktop build",
        );

        // Simulate a newer build that added an extra column.
        conn.execute(
            "ALTER TABLE knowledge_entries ADD COLUMN future_flag INTEGER",
            [],
        )
        .expect("add future column");

        validate_knowledge_schema(&conn).expect("extra columns are tolerated");
        let entry = get_knowledge_entry(&conn, "entry-1")
            .expect("read entry")
            .expect("entry still present");
        assert_eq!(entry.title, "Deploy notes");
    }

    #[test]
    fn upsert_creates_then_updates_and_records_ledger() {
        let conn = open_store();
        seed_base(&conn, "kb-1");

        let created = upsert(
            &conn,
            "entry-1",
            "kb-1",
            "Deploy notes",
            "Ship the desktop build",
        );
        assert!(created.created);
        let first_hash = created.entry.content_hash.clone();

        let updated = upsert(
            &conn,
            "entry-1",
            "kb-1",
            "Deploy notes",
            "Ship the CLI build",
        );
        assert!(!updated.created);
        assert_ne!(updated.entry.content_hash, first_hash);
        assert_eq!(updated.entry.created_at_unix_secs, 2_000);

        let ledger = list_knowledge_ledger(&conn, "kb-1", None).expect("ledger");
        assert_eq!(ledger.len(), 2);
        assert_eq!(ledger[0].action, "update_entry");
        assert_eq!(ledger[0].before_hash.as_deref(), Some(first_hash.as_str()));
        assert_eq!(ledger[0].actor_kind, "agent");
        assert_eq!(ledger[0].session_id.as_deref(), Some("session-1"));
        assert_eq!(ledger[1].action, "create_entry");
        assert!(ledger[1].before_hash.is_none());
    }

    #[test]
    fn search_matches_chinese_terms_through_trigram_index() {
        let conn = open_store();
        seed_base(&conn, "kb-1");
        upsert(&conn, "entry-1", "kb-1", "部署流程", "桌面端的打包发布步骤");
        upsert(
            &conn,
            "entry-2",
            "kb-1",
            "测试策略",
            "单元测试与回归测试约定",
        );

        let outcome = search_knowledge_entries(
            &conn,
            &KnowledgeSearchRequest {
                knowledge_base_ids: vec!["kb-1".to_string()],
                query: "打包发布".to_string(),
                limit: None,
                ..Default::default()
            },
        )
        .expect("search");
        assert_eq!(outcome.mode, KnowledgeSearchMode::FullText);
        assert_eq!(outcome.hits.len(), 1);
        assert_eq!(outcome.hits[0].entry_id, "entry-1");
    }

    #[test]
    fn non_contiguous_phrase_falls_back_to_substring_scan() {
        let conn = open_store();
        seed_base(&conn, "kb-1");
        upsert(
            &conn,
            "entry-1",
            "kb-1",
            "部署流程",
            "桌面端的打包与发布步骤",
        );

        // The trigram index only matches contiguous character runs, so a
        // two-term phrase that never appears verbatim must not be reported as a
        // full-text miss without trying the substring path.
        let outcome = search_knowledge_entries(
            &conn,
            &KnowledgeSearchRequest {
                knowledge_base_ids: Vec::new(),
                query: "打包发布".to_string(),
                limit: None,
                ..Default::default()
            },
        )
        .expect("search");
        assert_eq!(outcome.mode, KnowledgeSearchMode::Substring);
        assert!(outcome.hits.is_empty());
    }

    #[test]
    fn explicit_substring_channel_matches_terms_that_are_not_adjacent() {
        let conn = open_store();
        seed_base(&conn, "kb-1");
        upsert(
            &conn,
            "entry-1",
            "kb-1",
            "部署流程",
            "桌面端的打包与发布步骤",
        );

        // The words are present but never adjacent, so matching the query as one
        // contiguous run would miss. The substring channel ANDs the terms.
        let outcome = search_knowledge_entries(
            &conn,
            &KnowledgeSearchRequest {
                knowledge_base_ids: Vec::new(),
                query: "发布 步骤".to_string(),
                limit: None,
                channel: KnowledgeSearchChannel::Substring,
            },
        )
        .expect("substring search");
        assert_eq!(outcome.mode, KnowledgeSearchMode::Substring);
        assert_eq!(outcome.hits.len(), 1);
        assert_eq!(outcome.hits[0].entry_id, "entry-1");
    }

    #[test]
    fn explicit_substring_channel_rejects_an_entry_missing_one_term() {
        let conn = open_store();
        seed_base(&conn, "kb-1");
        upsert(
            &conn,
            "entry-1",
            "kb-1",
            "部署流程",
            "桌面端的打包与发布步骤",
        );

        let outcome = search_knowledge_entries(
            &conn,
            &KnowledgeSearchRequest {
                knowledge_base_ids: Vec::new(),
                query: "发布 缺失".to_string(),
                limit: None,
                channel: KnowledgeSearchChannel::Substring,
            },
        )
        .expect("substring search");
        assert_eq!(outcome.mode, KnowledgeSearchMode::Substring);
        assert!(outcome.hits.is_empty());
    }

    #[test]
    fn explicit_full_text_channel_rejects_a_query_it_cannot_index() {
        let conn = open_store();
        seed_base(&conn, "kb-1");
        upsert(&conn, "entry-1", "kb-1", "Deploy notes", "ship it");

        let error = search_knowledge_entries(
            &conn,
            &KnowledgeSearchRequest {
                knowledge_base_ids: Vec::new(),
                query: "打包".to_string(),
                limit: None,
                channel: KnowledgeSearchChannel::FullText,
            },
        )
        .expect_err("a two-character term cannot reach the trigram index");
        assert!(matches!(
            error,
            KnowledgeStoreError::SearchChannelUnsupported(_)
        ));
    }

    #[test]
    fn short_chinese_query_falls_back_to_substring_scan() {
        let conn = open_store();
        seed_base(&conn, "kb-1");
        upsert(
            &conn,
            "entry-1",
            "kb-1",
            "部署流程",
            "桌面端的打包与发布步骤",
        );

        let outcome = search_knowledge_entries(
            &conn,
            &KnowledgeSearchRequest {
                knowledge_base_ids: Vec::new(),
                query: "打包".to_string(),
                limit: None,
                ..Default::default()
            },
        )
        .expect("search");
        assert_eq!(outcome.mode, KnowledgeSearchMode::Substring);
        assert_eq!(outcome.hits.len(), 1);
        assert_eq!(outcome.hits[0].entry_id, "entry-1");
    }

    #[test]
    fn empty_query_returns_recent_entries() {
        let conn = open_store();
        seed_base(&conn, "kb-1");
        upsert(&conn, "entry-1", "kb-1", "Deploy notes", "body");

        let outcome = search_knowledge_entries(
            &conn,
            &KnowledgeSearchRequest {
                knowledge_base_ids: Vec::new(),
                query: "   ".to_string(),
                limit: None,
                ..Default::default()
            },
        )
        .expect("search");
        assert_eq!(outcome.mode, KnowledgeSearchMode::Recent);
        assert_eq!(outcome.hits.len(), 1);
    }

    #[test]
    fn base_filter_excludes_other_bases() {
        let conn = open_store();
        seed_base(&conn, "kb-1");
        create_knowledge_base(&conn, "kb-2", "Other", "", 1_000).expect("create base");
        upsert(&conn, "entry-1", "kb-1", "Deploy notes", "alpha body");
        upsert(&conn, "entry-2", "kb-2", "Deploy notes", "beta body");

        let outcome = search_knowledge_entries(
            &conn,
            &KnowledgeSearchRequest {
                knowledge_base_ids: vec!["kb-2".to_string()],
                query: String::new(),
                limit: None,
                ..Default::default()
            },
        )
        .expect("search");
        assert_eq!(outcome.hits.len(), 1);
        assert_eq!(outcome.hits[0].entry_id, "entry-2");
    }

    #[test]
    fn like_wildcards_in_query_are_escaped() {
        let conn = open_store();
        seed_base(&conn, "kb-1");
        upsert(&conn, "entry-1", "kb-1", "Percent", "100% complete");

        let outcome = search_knowledge_entries(
            &conn,
            &KnowledgeSearchRequest {
                knowledge_base_ids: Vec::new(),
                query: "%".to_string(),
                limit: None,
                ..Default::default()
            },
        )
        .expect("search");
        assert_eq!(outcome.hits.len(), 1);
    }

    #[test]
    fn deleting_an_entry_removes_its_index_row() {
        let conn = open_store();
        seed_base(&conn, "kb-1");
        upsert(
            &conn,
            "entry-1",
            "kb-1",
            "部署流程",
            "桌面端的打包与发布步骤",
        );
        assert!(
            delete_knowledge_entry(&conn, "entry-1", &KnowledgeActor::user(), None, 3_000)
                .expect("delete")
        );

        let remaining: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM knowledge_entries_fts WHERE entry_id = 'entry-1'",
                [],
                |row| row.get(0),
            )
            .expect("count fts rows");
        assert_eq!(remaining, 0);
        assert!(get_knowledge_entry(&conn, "entry-1")
            .expect("read")
            .is_none());
    }

    #[test]
    fn deleting_a_base_removes_entries_index_and_ledger() {
        let conn = open_store();
        seed_base(&conn, "kb-1");
        upsert(&conn, "entry-1", "kb-1", "Deploy notes", "body");
        assert!(delete_knowledge_base(&conn, "kb-1").expect("delete base"));

        for table in [
            "knowledge_bases",
            "knowledge_entries",
            "knowledge_entries_fts",
            "knowledge_ledger",
        ] {
            let count: i64 = conn
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .expect("count rows");
            assert_eq!(count, 0, "{table} should be empty after base deletion");
        }
    }

    #[test]
    fn upsert_into_missing_base_is_rejected() {
        let conn = open_store();
        let error = upsert_knowledge_entry(
            &conn,
            &KnowledgeEntryUpsert {
                id: "entry-1".to_string(),
                knowledge_base_id: "missing".to_string(),
                title: "Deploy notes".to_string(),
                body: "body".to_string(),
                tags: String::new(),
                source: None,
                actor: KnowledgeActor::user(),
                reason: None,
            },
            1_000,
        )
        .expect_err("missing base must be rejected");
        assert!(matches!(error, KnowledgeStoreError::InvalidRecord(_)));
    }

    #[test]
    fn oversized_body_is_rejected_before_write() {
        let conn = open_store();
        seed_base(&conn, "kb-1");
        let error = upsert_knowledge_entry(
            &conn,
            &KnowledgeEntryUpsert {
                id: "entry-1".to_string(),
                knowledge_base_id: "kb-1".to_string(),
                title: "Huge".to_string(),
                body: "x".repeat(MAX_ENTRY_BODY_BYTES + 1),
                tags: String::new(),
                source: None,
                actor: KnowledgeActor::user(),
                reason: None,
            },
            1_000,
        )
        .expect_err("oversized body must be rejected");
        assert!(matches!(error, KnowledgeStoreError::EntryTooLarge(_)));
    }

    #[test]
    fn content_hash_changes_with_any_indexed_field() {
        let base = knowledge_content_hash("t", "b", "", None);
        assert_eq!(base, knowledge_content_hash("t", "b", "", None));
        assert_ne!(base, knowledge_content_hash("t2", "b", "", None));
        assert_ne!(base, knowledge_content_hash("t", "b2", "", None));
        assert_ne!(base, knowledge_content_hash("t", "b", "tag", None));
        assert_ne!(base, knowledge_content_hash("t", "b", "", Some("src")));
    }
}
