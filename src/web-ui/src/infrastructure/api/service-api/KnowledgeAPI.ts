import { invokePrepared } from './invokePrepared';

/**
 * Human-facing knowledge base CRUD.
 *
 * Knowledge bases are user-level local resources, so these requests never carry
 * a workspace reference. Agents reach the same store through the
 * `KnowledgeSearch` / `KnowledgeRead` / `KnowledgeWrite` tools instead.
 */
export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  createdAtUnixSecs: number;
  updatedAtUnixSecs: number;
}

export interface KnowledgeEntry {
  id: string;
  knowledgeBaseId: string;
  title: string;
  body: string;
  tags: string;
  source?: string | null;
  contentHash: string;
  createdAtUnixSecs: number;
  updatedAtUnixSecs: number;
}

export interface KnowledgeLedgerRecord {
  id: number;
  knowledgeBaseId: string;
  entryId?: string | null;
  action: string;
  actorKind: string;
  actorId?: string | null;
  sessionId?: string | null;
  beforeHash?: string | null;
  afterHash?: string | null;
  reason?: string | null;
  createdAtUnixSecs: number;
}

export interface KnowledgeSearchHit {
  entryId: string;
  knowledgeBaseId: string;
  title: string;
  snippet: string;
  updatedAtUnixSecs: number;
}

export type KnowledgeSearchMode = 'full_text' | 'substring' | 'recent';

/**
 * Retrieval channel for a search. The two indexed paths are exclusive, so the
 * scene picks one instead of paying for both and merging the results.
 *
 * - `auto` lets the store choose from the query text (what the agent tool uses).
 * - `full_text` uses only the trigram index.
 * - `substring` uses only the bounded LIKE scan.
 */
export type KnowledgeSearchChannel = 'auto' | 'full_text' | 'substring';

export interface KnowledgeSearchOutcome {
  mode: KnowledgeSearchMode;
  hits: KnowledgeSearchHit[];
}

export interface KnowledgeEntryUpsertOutcome {
  entry: KnowledgeEntry;
  created: boolean;
}

export const KnowledgeAPI = {
  async listKnowledgeBases(): Promise<KnowledgeBase[]> {
    return invokePrepared<KnowledgeBase[]>('list_knowledge_bases', async () => ({
      request: {},
    }));
  },

  async createKnowledgeBase(request: {
    name: string;
    description?: string;
  }): Promise<KnowledgeBase> {
    return invokePrepared<KnowledgeBase>('create_knowledge_base', async () => ({ request }));
  },

  async updateKnowledgeBase(request: {
    knowledgeBaseId: string;
    name: string;
    description?: string;
  }): Promise<KnowledgeBase> {
    return invokePrepared<KnowledgeBase>('update_knowledge_base', async () => ({ request }));
  },

  async deleteKnowledgeBase(knowledgeBaseId: string): Promise<boolean> {
    return invokePrepared<boolean>('delete_knowledge_base', async () => ({
      request: { knowledgeBaseId },
    }));
  },

  async listKnowledgeEntries(request: {
    knowledgeBaseId: string;
    limit?: number;
  }): Promise<KnowledgeEntry[]> {
    return invokePrepared<KnowledgeEntry[]>('list_knowledge_entries', async () => ({ request }));
  },

  async getKnowledgeEntry(entryId: string): Promise<KnowledgeEntry | null> {
    return invokePrepared<KnowledgeEntry | null>('get_knowledge_entry', async () => ({
      request: { entryId },
    }));
  },

  async upsertKnowledgeEntry(request: {
    entryId?: string;
    knowledgeBaseId: string;
    title: string;
    body: string;
    tags?: string;
    source?: string;
    reason?: string;
  }): Promise<KnowledgeEntryUpsertOutcome> {
    return invokePrepared<KnowledgeEntryUpsertOutcome>('upsert_knowledge_entry', async () => ({
      request,
    }));
  },

  async deleteKnowledgeEntry(request: {
    entryId: string;
    reason?: string;
  }): Promise<boolean> {
    return invokePrepared<boolean>('delete_knowledge_entry', async () => ({ request }));
  },

  async searchKnowledgeEntries(request: {
    knowledgeBaseIds?: string[];
    query?: string;
    limit?: number;
    channel?: KnowledgeSearchChannel;
  }): Promise<KnowledgeSearchOutcome> {
    return invokePrepared<KnowledgeSearchOutcome>('search_knowledge_entries', async () => ({
      request,
    }));
  },

  async listKnowledgeLedger(request: {
    knowledgeBaseId: string;
    limit?: number;
  }): Promise<KnowledgeLedgerRecord[]> {
    return invokePrepared<KnowledgeLedgerRecord[]>('list_knowledge_ledger', async () => ({
      request,
    }));
  },
};
