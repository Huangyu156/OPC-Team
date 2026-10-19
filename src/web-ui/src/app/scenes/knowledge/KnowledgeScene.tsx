import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogHeading,
  DialogTitle,
  Empty,
  Icon,
  Input,
  LoadingState,
  NavigationPanel,
  NavigationPanelBody,
  NavigationPanelContent,
  NavigationPanelItem,
  NavigationPanelSection,
  ScrollArea,
  SearchField,
  SegmentedControl,
  StatusPill,
  Textarea,
} from '@opc-team/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/infrastructure/i18n/hooks/useI18n';
import {
  KnowledgeAPI,
  type KnowledgeBase,
  type KnowledgeEntry,
  type KnowledgeLedgerRecord,
  type KnowledgeSearchMode,
} from '@/infrastructure/api/service-api/KnowledgeAPI';
import { confirmDanger } from '@/infrastructure/confirm-dialog';
import { usePeerDeviceModeOptional } from '@/infrastructure/peer-device/peerDeviceContextState';
import { isTauriRuntime } from '@/infrastructure/runtime';
import { useNotification } from '@/shared/notification-system';
import { createLogger } from '@/shared/utils/logger';
import './KnowledgeScene.scss';

const log = createLogger('KnowledgeScene');

type KnowledgeView = 'entries' | 'ledger';

/**
 * Retrieval channel the operator picked.
 *
 * The two channels are exclusive: each answers with exactly one index path, so
 * the operator pays for one retrieval per search instead of both. `auto` is
 * deliberately not offered here; it stays the wire default so the agent tool and
 * older callers keep their behaviour.
 */
type KnowledgeSearchChannelChoice = 'full_text' | 'substring';

/**
 * Mirrors the store's own trigram floor. Checking it here turns a query the
 * chosen channel cannot answer into an immediate explanation instead of a failed
 * round trip.
 */
const TRIGRAM_MIN_TERM_CHARS = 3;

interface BaseDraft {
  id?: string;
  name: string;
  description: string;
}

interface EntryDraft {
  id?: string;
  title: string;
  body: string;
  tags: string;
  source: string;
}

/**
 * Listing limit for one knowledge base. The store clamps to its own maximum, so
 * this only has to be large enough that the entry list is not silently cut off
 * at the default page size.
 */
const ENTRY_LIST_LIMIT = 200;

const EMPTY_BASE_DRAFT: BaseDraft = { name: '', description: '' };
const EMPTY_ENTRY_DRAFT: EntryDraft = { title: '', body: '', tags: '', source: '' };

function stateTokens(...values: (string | false)[]): string | undefined {
  return values.filter(Boolean).join(' ') || undefined;
}

export default function KnowledgeScene() {
  const { t, formatRelativeTime } = useI18n('scenes/knowledge');
  const { error: notifyError } = useNotification();
  const peerDevice = usePeerDeviceModeOptional();
  const remoteConnectionActive = peerDevice?.peerMode.active === true;
  const desktopAvailable = isTauriRuntime() && !remoteConnectionActive;

  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [basesLoading, setBasesLoading] = useState(false);
  const [basesError, setBasesError] = useState<string | null>(null);
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);

  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<KnowledgeLedgerRecord[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const [view, setView] = useState<KnowledgeView>('entries');
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [channel, setChannel] = useState<KnowledgeSearchChannelChoice>('substring');
  const [answeredMode, setAnsweredMode] = useState<KnowledgeSearchMode | null>(null);

  const [baseDraft, setBaseDraft] = useState<BaseDraft | null>(null);
  const [entryDraft, setEntryDraft] = useState<EntryDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedBase = useMemo(
    () => bases.find((candidate) => candidate.id === selectedBaseId) ?? null,
    [bases, selectedBaseId],
  );

  const loadBases = useCallback(async () => {
    if (!desktopAvailable) return;
    setBasesLoading(true);
    setBasesError(null);
    try {
      const next = await KnowledgeAPI.listKnowledgeBases();
      setBases(next);
      setSelectedBaseId((previous) => {
        if (previous && next.some((candidate) => candidate.id === previous)) return previous;
        return next[0]?.id ?? null;
      });
    } catch (cause) {
      log.error('Failed to load knowledge bases', cause);
      setBasesError(t('sidebar.error'));
    } finally {
      setBasesLoading(false);
    }
  }, [desktopAvailable, t]);

  const loadEntries = useCallback(
    async (knowledgeBaseId: string) => {
      setEntriesLoading(true);
      setEntriesError(null);
      try {
        const trimmedQuery = submittedQuery.trim();
        if (trimmedQuery.length > 0) {
          // The full-text channel is exclusive, so a query the trigram index
          // cannot reach is refused here rather than silently answered by the
          // substring scan.
          if (
            channel === 'full_text' &&
            trimmedQuery
              .split(/\s+/)
              .some((term) => term.length > 0 && Array.from(term).length < TRIGRAM_MIN_TERM_CHARS)
          ) {
            setEntries([]);
            setEntriesError(t('entries.fullTextNeedsLongerTerms', { min: TRIGRAM_MIN_TERM_CHARS }));
            return;
          }
        }
        if (trimmedQuery.length > 0) {
          const outcome = await KnowledgeAPI.searchKnowledgeEntries({
            knowledgeBaseIds: [knowledgeBaseId],
            query: trimmedQuery,
            channel,
          });
          setAnsweredMode(outcome.mode);
          const hitIds = new Set(outcome.hits.map((hit) => hit.entryId));
          const listed = await KnowledgeAPI.listKnowledgeEntries({
            knowledgeBaseId,
            limit: ENTRY_LIST_LIMIT,
          });
          setEntries(listed.filter((entry) => hitIds.has(entry.id)));
        } else {
          setAnsweredMode(null);
          setEntries(await KnowledgeAPI.listKnowledgeEntries({
            knowledgeBaseId,
            limit: ENTRY_LIST_LIMIT,
          }));
        }
      } catch (cause) {
        log.error('Failed to load knowledge entries', cause);
        setEntriesError(t('entries.error'));
      } finally {
        setEntriesLoading(false);
      }
    },
    [channel, submittedQuery, t],
  );

  const loadLedger = useCallback(
    async (knowledgeBaseId: string) => {
      setLedgerLoading(true);
      setLedgerError(null);
      try {
        setLedger(await KnowledgeAPI.listKnowledgeLedger({ knowledgeBaseId }));
      } catch (cause) {
        log.error('Failed to load knowledge ledger', cause);
        setLedgerError(t('ledger.error'));
      } finally {
        setLedgerLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadBases();
  }, [loadBases]);

  useEffect(() => {
    if (!selectedBaseId) {
      setEntries([]);
      setLedger([]);
      return;
    }
    void loadEntries(selectedBaseId);
    void loadLedger(selectedBaseId);
  }, [loadEntries, loadLedger, selectedBaseId]);

  const handleSubmitSearch = useCallback((value: string) => {
    setSubmittedQuery(value.trim());
  }, []);

  const handleChannelChange = useCallback((next: string) => {
    setChannel(next === 'full_text' ? 'full_text' : 'substring');
  }, []);

  const handleClearSearch = useCallback(() => {
    setQuery('');
    setSubmittedQuery('');
    setAnsweredMode(null);
  }, []);

  const openCreateBase = useCallback(() => {
    setBaseDraft({ ...EMPTY_BASE_DRAFT });
  }, []);

  const openEditBase = useCallback(() => {
    if (!selectedBase) return;
    setBaseDraft({
      id: selectedBase.id,
      name: selectedBase.name,
      description: selectedBase.description,
    });
  }, [selectedBase]);

  const openCreateEntry = useCallback(() => {
    setEntryDraft({ ...EMPTY_ENTRY_DRAFT });
  }, []);

  const openEditEntry = useCallback((entry: KnowledgeEntry) => {
    setEntryDraft({
      id: entry.id,
      title: entry.title,
      body: entry.body,
      tags: entry.tags,
      source: entry.source ?? '',
    });
  }, []);

  const saveBase = useCallback(async () => {
    if (!baseDraft) return;
    const name = baseDraft.name.trim();
    if (name.length === 0) {
      notifyError(t('errors.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      if (baseDraft.id) {
        await KnowledgeAPI.updateKnowledgeBase({
          knowledgeBaseId: baseDraft.id,
          name,
          description: baseDraft.description.trim(),
        });
      } else {
        const created = await KnowledgeAPI.createKnowledgeBase({
          name,
          description: baseDraft.description.trim(),
        });
        setSelectedBaseId(created.id);
      }
      setBaseDraft(null);
      await loadBases();
    } catch (cause) {
      log.error('Failed to save knowledge base', cause);
      notifyError(t('errors.generic', { message: String(cause) }));
    } finally {
      setSaving(false);
    }
  }, [baseDraft, loadBases, notifyError, t]);

  const saveEntry = useCallback(async () => {
    if (!entryDraft || !selectedBaseId) return;
    const title = entryDraft.title.trim();
    const body = entryDraft.body.trim();
    if (title.length === 0) {
      notifyError(t('errors.titleRequired'));
      return;
    }
    if (body.length === 0) {
      notifyError(t('errors.bodyRequired'));
      return;
    }
    setSaving(true);
    try {
      await KnowledgeAPI.upsertKnowledgeEntry({
        entryId: entryDraft.id,
        knowledgeBaseId: selectedBaseId,
        title,
        body,
        tags: entryDraft.tags.trim(),
        source: entryDraft.source.trim() || undefined,
      });
      setEntryDraft(null);
      await loadEntries(selectedBaseId);
      await loadLedger(selectedBaseId);
    } catch (cause) {
      log.error('Failed to save knowledge entry', cause);
      notifyError(t('errors.generic', { message: String(cause) }));
    } finally {
      setSaving(false);
    }
  }, [entryDraft, loadEntries, loadLedger, notifyError, selectedBaseId, t]);

  const deleteBase = useCallback(async () => {
    if (!selectedBase) return;
    const confirmed = await confirmDanger(
      t('confirm.deleteBaseTitle'),
      t('confirm.deleteBaseMessage', { name: selectedBase.name }),
    );
    if (!confirmed) return;
    try {
      await KnowledgeAPI.deleteKnowledgeBase(selectedBase.id);
      setSelectedBaseId(null);
      await loadBases();
    } catch (cause) {
      log.error('Failed to delete knowledge base', cause);
      notifyError(t('errors.generic', { message: String(cause) }));
    }
  }, [loadBases, notifyError, selectedBase, t]);

  const deleteEntry = useCallback(
    async (entry: KnowledgeEntry) => {
      const confirmed = await confirmDanger(
        t('confirm.deleteEntryTitle'),
        t('confirm.deleteEntryMessage', { title: entry.title }),
      );
      if (!confirmed) return;
      try {
        await KnowledgeAPI.deleteKnowledgeEntry({ entryId: entry.id });
        if (selectedBaseId) {
          await loadEntries(selectedBaseId);
          await loadLedger(selectedBaseId);
        }
      } catch (cause) {
        log.error('Failed to delete knowledge entry', cause);
        notifyError(t('errors.generic', { message: String(cause) }));
      }
    },
    [loadEntries, loadLedger, notifyError, selectedBaseId, t],
  );

  const ledgerActionLabel = useCallback(
    (record: KnowledgeLedgerRecord): string => {
      switch (record.action) {
        case 'create_entry':
          return t('ledger.actionCreateEntry');
        case 'update_entry':
          return t('ledger.actionUpdateEntry');
        case 'delete_entry':
          return t('ledger.actionDeleteEntry');
        default:
          return t('ledger.actionUnknown');
      }
    },
    [t],
  );

  const ledgerActorLabel = useCallback(
    (record: KnowledgeLedgerRecord): string => {
      if (record.actorKind === 'user') return t('ledger.actorUser');
      if (record.actorKind === 'agent') {
        return t('ledger.actorAgent', { id: record.actorId ?? '' });
      }
      return t('ledger.actorUnknown');
    },
    [t],
  );

  if (!desktopAvailable) {
    return (
      <div
        className="opc-knowledge-scene"
        data-opc-scene="knowledge"
        data-opc-part="root"
        data-testid="knowledge-scene"
      >
        <div data-opc-scene="knowledge" data-opc-part="unavailable">
          <Empty
            icon={<Icon name="book-open" size="lg" aria-hidden />}
            title={t('unavailable.title')}
            description={t('unavailable.description')}
          />
        </div>
      </div>
    );
  }

  const isEntriesEmpty = !entriesLoading && !entriesError && entries.length === 0;

  return (
    <div
      className="opc-knowledge-scene"
      data-opc-scene="knowledge"
      data-opc-part="root"
      data-opc-view={view === 'ledger' ? 'ledger' : 'entries'}
      data-testid="knowledge-scene"
    >
      <NavigationPanel
        className="knowledge-sidebar"
        aria-label={t('sidebar.title')}
        data-opc-scene="knowledge"
        data-opc-part="sidebar"
      >
        <div className="knowledge-sidebar__header" data-opc-scene="knowledge" data-opc-part="sidebarHeader">
          <div className="knowledge-sidebar__title" data-opc-scene="knowledge" data-opc-part="sidebarTitle">
            {t('sidebar.title')}
          </div>
          <div className="knowledge-sidebar__actions" data-opc-scene="knowledge" data-opc-part="sidebarActions">
            <Button
              size="xs"
              variant="outline"
              leadingIcon={<Icon name="plus" size="sm" aria-hidden />}
              onClick={openCreateBase}
            >
              {t('sidebar.new')}
            </Button>
          </div>
        </div>
        <NavigationPanelBody className="knowledge-sidebar__body">
          <div data-opc-scene="knowledge" data-opc-part="sidebarContent">
            <NavigationPanelContent>
              <NavigationPanelSection title={t('sidebar.sectionTitle')}>
                {basesLoading && bases.length === 0 ? (
                  <div className="knowledge-sidebar__state" data-opc-scene="knowledge" data-opc-part="sidebarLoading">
                    <LoadingState size="sm">{t('sidebar.loading')}</LoadingState>
                  </div>
                ) : null}
                {basesError ? (
                  <div className="knowledge-sidebar__state" data-opc-scene="knowledge" data-opc-part="sidebarError">
                    <span>{basesError}</span>
                    <Button size="xs" variant="text" onClick={() => void loadBases()}>
                      {t('sidebar.retry')}
                    </Button>
                  </div>
                ) : null}
                {!basesLoading && !basesError && bases.length === 0 ? (
                  <div className="knowledge-sidebar__state" data-opc-scene="knowledge" data-opc-part="sidebarEmpty">
                    {t('sidebar.empty')}
                  </div>
                ) : null}
                <div data-opc-scene="knowledge" data-opc-part="baseList">
                  {bases.map((base) => {
                    const isSelected = base.id === selectedBaseId;
                    return (
                      <div
                        key={base.id}
                        className="knowledge-sidebar__item"
                        data-opc-scene="knowledge"
                        data-opc-part="baseItem"
                        data-opc-state={stateTokens(isSelected && 'selected')}
                      >
                        <NavigationPanelItem
                          selected={isSelected}
                          onClick={() => {
                            setSelectedBaseId(base.id);
                            setView('entries');
                            setQuery('');
                            setSubmittedQuery('');
                          }}
                          leading={(
                            <span data-opc-scene="knowledge" data-opc-part="baseItemIcon">
                              <Icon name="book-open" size="sm" aria-hidden />
                            </span>
                          )}
                          metadata={(
                            <span data-opc-scene="knowledge" data-opc-part="baseItemMeta">
                              {base.updatedAtUnixSecs > 0
                                ? formatRelativeTime(base.updatedAtUnixSecs * 1000)
                                : ''}
                            </span>
                          )}
                        >
                          <span data-opc-scene="knowledge" data-opc-part="baseItemLabel">
                            {base.name}
                          </span>
                        </NavigationPanelItem>
                      </div>
                    );
                  })}
                </div>
              </NavigationPanelSection>
            </NavigationPanelContent>
          </div>
        </NavigationPanelBody>
      </NavigationPanel>

      <main className="knowledge-main" data-opc-scene="knowledge" data-opc-part="main">
        <header className="knowledge-main__header" data-opc-scene="knowledge" data-opc-part="header">
          <div className="knowledge-main__heading">
            <div className="knowledge-main__title" data-opc-scene="knowledge" data-opc-part="headerTitle">
              {selectedBase ? selectedBase.name : t('header.noSelectionTitle')}
            </div>
            <div className="knowledge-main__subtitle" data-opc-scene="knowledge" data-opc-part="headerSubtitle">
              {selectedBase
                ? selectedBase.description.length > 0
                  ? selectedBase.description
                  : t('header.noDescription')
                : t('header.noSelectionDescription')}
            </div>
          </div>
          <div className="knowledge-main__actions" data-opc-scene="knowledge" data-opc-part="headerActions">
            {selectedBase ? (
              <>
                <Button
                  size="xs"
                  variant="outline"
                  leadingIcon={<Icon name="edit" size="sm" aria-hidden />}
                  onClick={openEditBase}
                >
                  {t('header.rename')}
                </Button>
                <Button
                  size="xs"
                  variant="text"
                  tone="danger"
                  leadingIcon={<Icon name="delete" size="sm" aria-hidden />}
                  onClick={() => void deleteBase()}
                >
                  {t('header.delete')}
                </Button>
                <Button
                  size="xs"
                  variant="primary"
                  leadingIcon={<Icon name="plus" size="sm" aria-hidden />}
                  onClick={openCreateEntry}
                >
                  {t('header.newEntry')}
                </Button>
              </>
            ) : null}
          </div>
        </header>

        {selectedBase ? (
          <div className="knowledge-main__toolbar" data-opc-scene="knowledge" data-opc-part="toolbar">
            <div className="knowledge-main__segmented" data-opc-scene="knowledge" data-opc-part="viewSwitch">
              <Button
                size="xs"
                variant={view === 'entries' ? 'secondary' : 'text'}
                onClick={() => setView('entries')}
              >
                {t('header.viewEntries')}
              </Button>
              <Button
                size="xs"
                variant={view === 'ledger' ? 'secondary' : 'text'}
                onClick={() => setView('ledger')}
              >
                {t('header.viewLedger')}
              </Button>
            </div>
            {view === 'entries' ? (
              <div className="knowledge-main__search" data-opc-scene="knowledge" data-opc-part="search">
                <SearchField
                  value={query}
                  onValueChange={setQuery}
                  onSearch={handleSubmitSearch}
                  onClear={handleClearSearch}
                  clearLabel={query.length > 0 ? t('entries.clearSearch') : undefined}
                  leadingIcon={<Icon name="search" size="sm" aria-hidden />}
                  placeholder={t('entries.searchPlaceholder')}
                  aria-label={t('entries.searchLabel')}
                  size="sm"
                />
              </div>
            ) : null}
            {view === 'entries' ? (
              <div
                className="knowledge-main__channel"
                data-opc-scene="knowledge"
                data-opc-part="searchChannel"
              >
                <SegmentedControl
                  size="sm"
                  variant="pills"
                  options={[
                    { label: t('entries.channelSubstring'), value: 'substring' },
                    { label: t('entries.channelFullText'), value: 'full_text' },
                  ]}
                  value={channel}
                  onValueChange={handleChannelChange}
                />
                {answeredMode && submittedQuery.length > 0 ? (
                  <span
                    className="knowledge-main__channel-answer"
                    data-opc-scene="knowledge"
                    data-opc-part="searchAnswer"
                  >
                    {answeredMode === 'full_text'
                      ? t('entries.answeredFullText')
                      : answeredMode === 'substring'
                        ? t('entries.answeredSubstring')
                        : t('entries.answeredRecent')}
                  </span>
                ) : null}
              </div>
            ) : null}
            <Button
              size="xs"
              variant="text"
              leadingIcon={<Icon name="refresh" size="sm" aria-hidden />}
              onClick={() => {
                void loadBases();
                if (!selectedBaseId) return;
                if (view === 'ledger') {
                  void loadLedger(selectedBaseId);
                } else {
                  void loadEntries(selectedBaseId);
                }
              }}
            >
              {t('header.refresh')}
            </Button>
          </div>
        ) : null}

        {view === 'entries' && selectedBase ? (
          <ScrollArea className="knowledge-main__scroll">
            <div
              className="knowledge-main__entries"
              data-opc-scene="knowledge"
              data-opc-part="entries"
              data-opc-state={stateTokens(isEntriesEmpty && 'empty')}
            >
              {entriesLoading ? (
                <div data-opc-scene="knowledge" data-opc-part="loading">
                  <LoadingState size="md">{t('entries.loading')}</LoadingState>
                </div>
              ) : null}
              {entriesError ? (
                <div data-opc-scene="knowledge" data-opc-part="error">{entriesError}</div>
              ) : null}
              {!entriesLoading && !entriesError && entries.length === 0 ? (
                <div data-opc-scene="knowledge" data-opc-part="empty">
                  <Empty
                    icon={<Icon name="file-text" size="lg" aria-hidden />}
                    title={submittedQuery.length > 0 ? t('entries.emptySearch') : t('entries.empty')}
                    description={t('entries.emptyHint')}
                    actions={(
                      <Button
                        size="sm"
                        variant="primary"
                        leadingIcon={<Icon name="plus" size="sm" aria-hidden />}
                        onClick={openCreateEntry}
                      >
                        {t('header.newEntry')}
                      </Button>
                    )}
                  />
                </div>
              ) : null}
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="knowledge-main__entry"
                  data-opc-scene="knowledge"
                  data-opc-part="entry"
                >
                  <div className="knowledge-main__entry-body">
                    <div className="knowledge-main__entry-title" data-opc-scene="knowledge" data-opc-part="entryTitle">
                      {entry.title.length > 0 ? entry.title : t('entries.untitled')}
                    </div>
                    <div className="knowledge-main__entry-preview" data-opc-scene="knowledge" data-opc-part="entryPreview">
                      {entry.body.slice(0, 240)}
                    </div>
                    <div className="knowledge-main__entry-meta" data-opc-scene="knowledge" data-opc-part="entryMeta">
                      <span data-opc-scene="knowledge" data-opc-part="entryMetaItem">
                        <Icon name="clock" size="xs" aria-hidden />
                        {formatRelativeTime(entry.updatedAtUnixSecs * 1000)}
                      </span>
                      {entry.tags.length > 0 ? (
                        <span data-opc-scene="knowledge" data-opc-part="entryMetaItem">{entry.tags}</span>
                      ) : null}
                      {entry.source ? (
                        <span data-opc-scene="knowledge" data-opc-part="entryMetaItem">
                          {t('entries.source', { source: entry.source })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="knowledge-main__entry-actions" data-opc-scene="knowledge" data-opc-part="entryActions">
                    <Button
                      size="xs"
                      variant="text"
                      leadingIcon={<Icon name="edit" size="sm" aria-hidden />}
                      onClick={() => openEditEntry(entry)}
                    >
                      {t('entries.edit')}
                    </Button>
                    <Button
                      size="xs"
                      variant="text"
                      tone="danger"
                      leadingIcon={<Icon name="delete" size="sm" aria-hidden />}
                      onClick={() => void deleteEntry(entry)}
                    >
                      {t('entries.delete')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : null}

        {view === 'ledger' && selectedBase ? (
          <ScrollArea className="knowledge-main__scroll">
            <div className="knowledge-main__ledger" data-opc-scene="knowledge" data-opc-part="ledger">
              {ledgerLoading ? (
                <div data-opc-scene="knowledge" data-opc-part="ledgerLoading">
                  <LoadingState size="md">{t('ledger.loading')}</LoadingState>
                </div>
              ) : null}
              {ledgerError ? (
                <div data-opc-scene="knowledge" data-opc-part="ledgerError">{ledgerError}</div>
              ) : null}
              {!ledgerLoading && !ledgerError && ledger.length === 0 ? (
                <div data-opc-scene="knowledge" data-opc-part="ledgerEmpty">
                  {t('ledger.empty')}
                </div>
              ) : null}
              <div data-opc-scene="knowledge" data-opc-part="ledgerList">
                {ledger.map((record) => (
                  <div
                    key={record.id}
                    className="knowledge-main__ledger-row"
                    data-opc-scene="knowledge"
                    data-opc-part="ledgerRow"
                  >
                    <StatusPill
                      tone={record.actorKind === 'agent' ? 'accent' : 'neutral'}
                      shape="rounded"
                    >
                      {ledgerActorLabel(record)}
                    </StatusPill>
                    <span data-opc-scene="knowledge" data-opc-part="ledgerAction">
                      {ledgerActionLabel(record)}
                    </span>
                    <span data-opc-scene="knowledge" data-opc-part="ledgerTime">
                      {formatRelativeTime(record.createdAtUnixSecs * 1000)}
                    </span>
                    {record.reason ? (
                      <span data-opc-scene="knowledge" data-opc-part="ledgerReason">{record.reason}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        ) : null}

        {!selectedBase ? (
          <div className="knowledge-main__placeholder" data-opc-scene="knowledge" data-opc-part="placeholder">
            <Empty
              icon={<Icon name="book-open" size="lg" aria-hidden />}
              title={t('header.noSelectionTitle')}
              description={t('header.noSelectionDescription')}
              actions={(
                <Button size="sm" variant="primary" onClick={openCreateBase}>
                  {t('sidebar.new')}
                </Button>
              )}
            />
          </div>
        ) : null}
      </main>

      <Dialog
        open={baseDraft !== null}
        onOpenChange={(open) => { if (!open) setBaseDraft(null); }}
        size="md"
        aria-label={baseDraft?.id ? t('dialog.baseEditTitle') : t('dialog.baseCreateTitle')}
      >
        {baseDraft ? (
          <>
            <DialogHeader>
              <DialogHeading>
                <DialogTitle>{baseDraft.id ? t('dialog.baseEditTitle') : t('dialog.baseCreateTitle')}</DialogTitle>
              </DialogHeading>
              <DialogClose aria-label={t('dialog.cancel')} />
            </DialogHeader>
            <DialogBody>
              <div className="knowledge-form" data-opc-scene="knowledge" data-opc-part="form">
                <div className="knowledge-form__field" data-opc-scene="knowledge" data-opc-part="field">
                  <span className="knowledge-form__label" data-opc-scene="knowledge" data-opc-part="fieldLabel">
                    {t('dialog.baseName')}
                  </span>
                  <Input
                    size="sm"
                    value={baseDraft.name}
                    placeholder={t('dialog.baseNamePlaceholder')}
                    aria-label={t('dialog.baseName')}
                    onValueChange={(value) => setBaseDraft({ ...baseDraft, name: value })}
                  />
                </div>
                <div className="knowledge-form__field" data-opc-scene="knowledge" data-opc-part="field">
                  <span className="knowledge-form__label" data-opc-scene="knowledge" data-opc-part="fieldLabel">
                    {t('dialog.baseDescription')}
                  </span>
                  <Textarea
                    variant="default"
                    resize="vertical"
                    value={baseDraft.description}
                    placeholder={t('dialog.baseDescriptionPlaceholder')}
                    aria-label={t('dialog.baseDescription')}
                    onValueChange={(value) => setBaseDraft({ ...baseDraft, description: value })}
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter appearance="attached" separator>
              <Button size="sm" variant="text" onClick={() => setBaseDraft(null)}>
                {t('dialog.cancel')}
              </Button>
              <Button size="sm" variant="primary" loading={saving} onClick={() => void saveBase()}>
                {t('dialog.save')}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </Dialog>

      <Dialog
        open={entryDraft !== null}
        onOpenChange={(open) => { if (!open) setEntryDraft(null); }}
        size="2xl"
        aria-label={entryDraft?.id ? t('dialog.entryEditTitle') : t('dialog.entryCreateTitle')}
      >
        {entryDraft ? (
          <>
            <DialogHeader>
              <DialogHeading>
                <DialogTitle>{entryDraft.id ? t('dialog.entryEditTitle') : t('dialog.entryCreateTitle')}</DialogTitle>
              </DialogHeading>
              <DialogClose aria-label={t('dialog.cancel')} />
            </DialogHeader>
            <DialogBody>
              <div className="knowledge-form" data-opc-scene="knowledge" data-opc-part="form">
                <div className="knowledge-form__field" data-opc-scene="knowledge" data-opc-part="field">
                  <span className="knowledge-form__label" data-opc-scene="knowledge" data-opc-part="fieldLabel">
                    {t('dialog.entryTitle')}
                  </span>
                  <Input
                    size="sm"
                    value={entryDraft.title}
                    placeholder={t('dialog.entryTitlePlaceholder')}
                    aria-label={t('dialog.entryTitle')}
                    onValueChange={(value) => setEntryDraft({ ...entryDraft, title: value })}
                  />
                </div>
                <div className="knowledge-form__field" data-opc-scene="knowledge" data-opc-part="field">
                  <span className="knowledge-form__label" data-opc-scene="knowledge" data-opc-part="fieldLabel">
                    {t('dialog.entryBody')}
                  </span>
                  <Textarea
                    variant="default"
                    resize="vertical"
                    layout="fill"
                    value={entryDraft.body}
                    placeholder={t('dialog.entryBodyPlaceholder')}
                    aria-label={t('dialog.entryBody')}
                    onValueChange={(value) => setEntryDraft({ ...entryDraft, body: value })}
                  />
                </div>
                <div className="knowledge-form__field" data-opc-scene="knowledge" data-opc-part="field">
                  <span className="knowledge-form__label" data-opc-scene="knowledge" data-opc-part="fieldLabel">
                    {t('dialog.entryTags')}
                  </span>
                  <Input
                    size="sm"
                    value={entryDraft.tags}
                    placeholder={t('dialog.entryTagsPlaceholder')}
                    aria-label={t('dialog.entryTags')}
                    onValueChange={(value) => setEntryDraft({ ...entryDraft, tags: value })}
                  />
                </div>
                <div className="knowledge-form__field" data-opc-scene="knowledge" data-opc-part="field">
                  <span className="knowledge-form__label" data-opc-scene="knowledge" data-opc-part="fieldLabel">
                    {t('dialog.entrySource')}
                  </span>
                  <Input
                    size="sm"
                    value={entryDraft.source}
                    placeholder={t('dialog.entrySourcePlaceholder')}
                    aria-label={t('dialog.entrySource')}
                    onValueChange={(value) => setEntryDraft({ ...entryDraft, source: value })}
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter appearance="attached" separator>
              <Button size="sm" variant="text" onClick={() => setEntryDraft(null)}>
                {t('dialog.cancel')}
              </Button>
              <Button size="sm" variant="primary" loading={saving} onClick={() => void saveEntry()}>
                {t('dialog.save')}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </Dialog>
    </div>
  );
}
