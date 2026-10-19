//! Durable knowledge base facade.
//!
//! The SQLite shape and statements live in `opc_services_core::knowledge_store`.
//! This module adds the product-side pieces: the async connection facade, the
//! per-agent access scope, and the tool-facing helpers.

pub mod access;
pub mod reminder;
pub mod service;

pub use access::{resolve_knowledge_access, KnowledgeAccess, KnowledgeAccessError};
pub use reminder::{build_knowledge_base_index_reminder, render_knowledge_base_index};
pub use service::KnowledgeDatabase;

pub use opc_services_core::knowledge_store::{
    KnowledgeActor, KnowledgeBaseRecord, KnowledgeEntryRecord, KnowledgeEntryUpsert,
    KnowledgeEntryUpsertOutcome, KnowledgeLedgerRecord, KnowledgeSearchChannel, KnowledgeSearchHit,
    KnowledgeSearchMode, KnowledgeSearchOutcome, KnowledgeSearchRequest,
    DEFAULT_KNOWLEDGE_QUERY_LIMIT, MAX_ENTRY_BODY_BYTES, MAX_KNOWLEDGE_QUERY_LIMIT,
};
