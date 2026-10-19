//! Async product facade over the durable knowledge store.
//!
//! The SQLite schema and all statements are owned by `opc_services_core::knowledge_store`.
//! This module owns the connection lifecycle: each call opens the user-level
//! database, ensures the schema, and runs the blocking work on the blocking pool.

use crate::infrastructure::PathManager;
use crate::util::errors::{OpcTeamError, OpcTeamResult};
use opc_services_core::knowledge_store;
use opc_services_core::knowledge_store::{
    KnowledgeActor, KnowledgeBaseRecord, KnowledgeEntryRecord, KnowledgeEntryUpsert,
    KnowledgeEntryUpsertOutcome, KnowledgeLedgerRecord, KnowledgeSearchOutcome,
    KnowledgeSearchRequest, KnowledgeStoreError,
};
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::task;
use uuid::Uuid;

#[derive(Clone)]
pub struct KnowledgeDatabase {
    db_path: PathBuf,
}

impl KnowledgeDatabase {
    pub fn new(path_manager: Arc<PathManager>) -> Self {
        Self {
            db_path: path_manager.knowledge_database_file(),
        }
    }

    pub fn path(&self) -> &Path {
        &self.db_path
    }

    pub async fn initialize(&self) -> OpcTeamResult<()> {
        let db_path = self.db_path.clone();
        task::spawn_blocking(move || -> OpcTeamResult<()> {
            if let Some(parent) = db_path.parent() {
                std::fs::create_dir_all(parent).map_err(|error| {
                    OpcTeamError::io(format!(
                        "Failed to create knowledge database directory {}: {}",
                        parent.display(),
                        error
                    ))
                })?;
            }

            let conn = open_connection(&db_path)?;
            initialize_schema(&conn)?;
            knowledge_store::validate_knowledge_schema(&conn).map_err(knowledge_error_to_opc)?;
            Ok(())
        })
        .await
        .map_err(|error| OpcTeamError::service(format!("Knowledge init task failed: {}", error)))?
    }

    pub async fn list_knowledge_bases(&self) -> OpcTeamResult<Vec<KnowledgeBaseRecord>> {
        let db_path = self.db_path.clone();
        task::spawn_blocking(move || -> OpcTeamResult<Vec<KnowledgeBaseRecord>> {
            let conn = open_connection(&db_path)?;
            initialize_schema(&conn)?;
            knowledge_store::list_knowledge_bases(&conn).map_err(knowledge_error_to_opc)
        })
        .await
        .map_err(|error| {
            OpcTeamError::service(format!("Knowledge base list task failed: {}", error))
        })?
    }

    pub async fn get_knowledge_base(&self, id: &str) -> OpcTeamResult<Option<KnowledgeBaseRecord>> {
        let db_path = self.db_path.clone();
        let id = id.to_string();
        task::spawn_blocking(move || -> OpcTeamResult<Option<KnowledgeBaseRecord>> {
            let conn = open_connection(&db_path)?;
            initialize_schema(&conn)?;
            knowledge_store::get_knowledge_base(&conn, &id).map_err(knowledge_error_to_opc)
        })
        .await
        .map_err(|error| {
            OpcTeamError::service(format!("Knowledge base read task failed: {}", error))
        })?
    }

    pub async fn create_knowledge_base(
        &self,
        name: &str,
        description: &str,
    ) -> OpcTeamResult<KnowledgeBaseRecord> {
        let db_path = self.db_path.clone();
        let name = name.to_string();
        let description = description.to_string();
        task::spawn_blocking(move || -> OpcTeamResult<KnowledgeBaseRecord> {
            let conn = open_connection(&db_path)?;
            initialize_schema(&conn)?;
            let id = Uuid::new_v4().to_string();
            knowledge_store::create_knowledge_base(&conn, &id, &name, &description, now_unix_secs())
                .map_err(knowledge_error_to_opc)
        })
        .await
        .map_err(|error| {
            OpcTeamError::service(format!("Knowledge base create task failed: {}", error))
        })?
    }

    pub async fn rename_knowledge_base(
        &self,
        id: &str,
        name: &str,
        description: &str,
    ) -> OpcTeamResult<KnowledgeBaseRecord> {
        let db_path = self.db_path.clone();
        let id = id.to_string();
        let name = name.to_string();
        let description = description.to_string();
        task::spawn_blocking(move || -> OpcTeamResult<KnowledgeBaseRecord> {
            let conn = open_connection(&db_path)?;
            initialize_schema(&conn)?;
            knowledge_store::rename_knowledge_base(&conn, &id, &name, &description, now_unix_secs())
                .map_err(knowledge_error_to_opc)
        })
        .await
        .map_err(|error| {
            OpcTeamError::service(format!("Knowledge base rename task failed: {}", error))
        })?
    }

    pub async fn delete_knowledge_base(&self, id: &str) -> OpcTeamResult<bool> {
        let db_path = self.db_path.clone();
        let id = id.to_string();
        task::spawn_blocking(move || -> OpcTeamResult<bool> {
            let conn = open_connection(&db_path)?;
            initialize_schema(&conn)?;
            knowledge_store::delete_knowledge_base(&conn, &id).map_err(knowledge_error_to_opc)
        })
        .await
        .map_err(|error| {
            OpcTeamError::service(format!("Knowledge base delete task failed: {}", error))
        })?
    }

    pub async fn list_knowledge_entries(
        &self,
        knowledge_base_id: &str,
        limit: Option<usize>,
    ) -> OpcTeamResult<Vec<KnowledgeEntryRecord>> {
        let db_path = self.db_path.clone();
        let knowledge_base_id = knowledge_base_id.to_string();
        task::spawn_blocking(move || -> OpcTeamResult<Vec<KnowledgeEntryRecord>> {
            let conn = open_connection(&db_path)?;
            initialize_schema(&conn)?;
            knowledge_store::list_knowledge_entries(&conn, &knowledge_base_id, limit)
                .map_err(knowledge_error_to_opc)
        })
        .await
        .map_err(|error| {
            OpcTeamError::service(format!("Knowledge entry list task failed: {}", error))
        })?
    }

    pub async fn get_knowledge_entry(
        &self,
        id: &str,
    ) -> OpcTeamResult<Option<KnowledgeEntryRecord>> {
        let db_path = self.db_path.clone();
        let id = id.to_string();
        task::spawn_blocking(move || -> OpcTeamResult<Option<KnowledgeEntryRecord>> {
            let conn = open_connection(&db_path)?;
            initialize_schema(&conn)?;
            knowledge_store::get_knowledge_entry(&conn, &id).map_err(knowledge_error_to_opc)
        })
        .await
        .map_err(|error| {
            OpcTeamError::service(format!("Knowledge entry read task failed: {}", error))
        })?
    }

    pub async fn upsert_knowledge_entry(
        &self,
        request: KnowledgeEntryUpsert,
    ) -> OpcTeamResult<KnowledgeEntryUpsertOutcome> {
        let db_path = self.db_path.clone();
        task::spawn_blocking(move || -> OpcTeamResult<KnowledgeEntryUpsertOutcome> {
            let conn = open_connection(&db_path)?;
            initialize_schema(&conn)?;
            knowledge_store::upsert_knowledge_entry(&conn, &request, now_unix_secs())
                .map_err(knowledge_error_to_opc)
        })
        .await
        .map_err(|error| {
            OpcTeamError::service(format!("Knowledge entry write task failed: {}", error))
        })?
    }

    pub async fn delete_knowledge_entry(
        &self,
        id: &str,
        actor: KnowledgeActor,
        reason: Option<String>,
    ) -> OpcTeamResult<bool> {
        let db_path = self.db_path.clone();
        let id = id.to_string();
        task::spawn_blocking(move || -> OpcTeamResult<bool> {
            let conn = open_connection(&db_path)?;
            initialize_schema(&conn)?;
            knowledge_store::delete_knowledge_entry(
                &conn,
                &id,
                &actor,
                reason.as_deref(),
                now_unix_secs(),
            )
            .map_err(knowledge_error_to_opc)
        })
        .await
        .map_err(|error| {
            OpcTeamError::service(format!("Knowledge entry delete task failed: {}", error))
        })?
    }

    pub async fn search_knowledge_entries(
        &self,
        request: KnowledgeSearchRequest,
    ) -> OpcTeamResult<KnowledgeSearchOutcome> {
        let db_path = self.db_path.clone();
        task::spawn_blocking(move || -> OpcTeamResult<KnowledgeSearchOutcome> {
            let conn = open_connection(&db_path)?;
            initialize_schema(&conn)?;
            knowledge_store::search_knowledge_entries(&conn, &request)
                .map_err(knowledge_error_to_opc)
        })
        .await
        .map_err(|error| {
            OpcTeamError::service(format!("Knowledge search task failed: {}", error))
        })?
    }

    pub async fn list_knowledge_ledger(
        &self,
        knowledge_base_id: &str,
        limit: Option<usize>,
    ) -> OpcTeamResult<Vec<KnowledgeLedgerRecord>> {
        let db_path = self.db_path.clone();
        let knowledge_base_id = knowledge_base_id.to_string();
        task::spawn_blocking(move || -> OpcTeamResult<Vec<KnowledgeLedgerRecord>> {
            let conn = open_connection(&db_path)?;
            initialize_schema(&conn)?;
            knowledge_store::list_knowledge_ledger(&conn, &knowledge_base_id, limit)
                .map_err(knowledge_error_to_opc)
        })
        .await
        .map_err(|error| {
            OpcTeamError::service(format!("Knowledge ledger list task failed: {}", error))
        })?
    }
}

fn open_connection(path: &Path) -> OpcTeamResult<Connection> {
    Connection::open(path).map_err(|error| {
        OpcTeamError::io(format!(
            "Failed to open knowledge database {}: {}",
            path.display(),
            error
        ))
    })
}

fn initialize_schema(conn: &Connection) -> OpcTeamResult<()> {
    knowledge_store::initialize_knowledge_schema(conn).map_err(knowledge_error_to_opc)
}

fn knowledge_error_to_opc(error: KnowledgeStoreError) -> OpcTeamError {
    OpcTeamError::service(error.to_string())
}

fn now_unix_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn test_database() -> (tempfile::TempDir, Arc<PathManager>, KnowledgeDatabase) {
        let base = tempdir().expect("create temp directory");
        // Product home derives from the user root's parent, so keep the user root
        // one level below the directory the fixture owns.
        let user_root = base.path().join("user");
        let path_manager = Arc::new(PathManager::with_user_root_for_tests(user_root));
        let database = KnowledgeDatabase::new(path_manager.clone());
        (base, path_manager, database)
    }

    #[test]
    fn knowledge_database_path_lands_under_the_user_data_root() {
        let (_base, path_manager, database) = test_database();

        assert!(database
            .path()
            .ends_with(Path::new("knowledge").join("knowledge.sqlite")));
        assert_eq!(
            database.path(),
            path_manager
                .user_data_dir()
                .join("knowledge")
                .join("knowledge.sqlite")
        );
    }

    #[tokio::test]
    async fn knowledge_database_round_trips_bases_entries_and_ledger() {
        let (_base, _path_manager, database) = test_database();

        database
            .initialize()
            .await
            .expect("initialize knowledge database");
        assert!(
            database.path().exists(),
            "the knowledge database file should exist after initialize"
        );

        let created_base = database
            .create_knowledge_base("Research", "Session notes")
            .await
            .expect("create knowledge base");
        assert_eq!(created_base.name, "Research");

        let bases = database.list_knowledge_bases().await.expect("list bases");
        assert_eq!(bases.len(), 1);

        let outcome = database
            .upsert_knowledge_entry(KnowledgeEntryUpsert {
                id: "entry-1".to_string(),
                knowledge_base_id: created_base.id.clone(),
                title: "Deploy notes".to_string(),
                body: "Ship the desktop build".to_string(),
                tags: "deploy".to_string(),
                source: None,
                actor: KnowledgeActor::user(),
                reason: None,
            })
            .await
            .expect("upsert knowledge entry");
        assert!(outcome.created);

        let stored = database
            .get_knowledge_entry("entry-1")
            .await
            .expect("read knowledge entry")
            .expect("entry should exist");
        assert_eq!(stored.title, "Deploy notes");

        let search = database
            .search_knowledge_entries(KnowledgeSearchRequest {
                knowledge_base_ids: vec![created_base.id.clone()],
                query: "desktop".to_string(),
                limit: None,
                ..Default::default()
            })
            .await
            .expect("search knowledge entries");
        assert_eq!(search.hits.len(), 1);
        assert_eq!(search.hits[0].entry_id, "entry-1");

        let ledger = database
            .list_knowledge_ledger(&created_base.id, None)
            .await
            .expect("list knowledge ledger");
        assert_eq!(ledger.len(), 1);
        assert_eq!(ledger[0].action, "create_entry");

        assert!(database
            .delete_knowledge_base(&created_base.id)
            .await
            .expect("delete knowledge base"));
        assert!(database
            .list_knowledge_bases()
            .await
            .expect("list bases after delete")
            .is_empty());
        assert!(
            database.path().exists(),
            "deleting a base must not remove the database file"
        );
    }
}
