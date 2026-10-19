import { Icon, OverflowText, ScrollArea, Switch, Tooltip } from '@opc-team/ui';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckSquare2, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  KnowledgeAPI,
  type KnowledgeBase,
} from '@/infrastructure/api/service-api/KnowledgeAPI';
import type { KnowledgeBaseRef } from '@/infrastructure/api/service-api/CustomAgentAPI';

interface KnowledgeBasePickerProps {
  selectedRefs: KnowledgeBaseRef[];
  onChange: (refs: KnowledgeBaseRef[]) => void;
  disabled?: boolean;
  /** Read-only agents can consult bases but never enrich them. */
  readOnlyAgent: boolean;
  testId?: string;
}

/**
 * Pick which user-level knowledge bases an agent may consult, and whether it may
 * also extend them.
 *
 * Scope lives in the agent definition, not in the tool input schema, so the
 * model cannot widen its own reach by naming an unlisted base.
 */
export const KnowledgeBasePicker: React.FC<KnowledgeBasePickerProps> = ({
  selectedRefs,
  onChange,
  disabled = false,
  readOnlyAgent,
  testId,
}) => {
  const { t } = useTranslation('scenes/agents');
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    KnowledgeAPI.listKnowledgeBases()
      .then((records) => {
        if (!cancelled) setBases(records);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedById = useMemo(() => {
    const map = new Map<string, KnowledgeBaseRef>();
    for (const ref of selectedRefs) map.set(ref.id, ref);
    return map;
  }, [selectedRefs]);

  const knownBaseIds = useMemo(() => new Set(bases.map((base) => base.id)), [bases]);

  /** References whose base was deleted elsewhere still surface so users can see them. */
  const missingRefs = useMemo(
    () => selectedRefs.filter((ref) => !knownBaseIds.has(ref.id)),
    [knownBaseIds, selectedRefs],
  );

  const toggleBase = useCallback(
    (baseId: string) => {
      if (selectedById.has(baseId)) {
        onChange(selectedRefs.filter((ref) => ref.id !== baseId));
        return;
      }
      onChange([...selectedRefs, { id: baseId, mode: 'read' }]);
    },
    [onChange, selectedById, selectedRefs],
  );

  const setMode = useCallback(
    (baseId: string, writable: boolean) => {
      onChange(
        selectedRefs.map((ref) =>
          ref.id === baseId ? { ...ref, mode: writable ? 'readwrite' : 'read' } : ref,
        ),
      );
    },
    [onChange, selectedRefs],
  );

  const renderRow = (baseId: string, label: string, present: boolean) => {
    const ref = selectedById.get(baseId);
    const isSelected = ref !== undefined;
    const writable = ref?.mode === 'readwrite';
    return (
      <div
        key={baseId}
        className={`th-knowledge-base-row${isSelected ? ' is-selected' : ''}`}
        data-opc-component="create-agent-page"
        data-opc-part="knowledgeBaseRow"
        data-opc-state={isSelected ? 'active' : undefined}
      >
        <button
          type="button"
          className="th-knowledge-base-row__toggle"
          onClick={() => toggleBase(baseId)}
          disabled={disabled}
          aria-pressed={isSelected}
          aria-label={label}
          data-overflow-trigger
        >
          <Icon glyph={isSelected ? CheckSquare2 : Square} size="sm" aria-hidden="true" />
          <OverflowText>{label}</OverflowText>
        </button>
        {!present ? (
          <span className="th-knowledge-base-row__missing">
            {t('agentsOverview.form.knowledgeBaseMissing')}
          </span>
        ) : null}
        {isSelected ? (
          <Tooltip
            content={
              <span className="th-create-panel__tooltip-content">
                {readOnlyAgent
                  ? t('agentsOverview.form.knowledgeWriteReadonlyAgent')
                  : t('agentsOverview.form.knowledgeWriteTooltip')}
              </span>
            }
            placement="top"
            interactive
          >
            <label className="th-knowledge-base-row__write">
              <Switch
                checked={writable}
                onCheckedChange={(next) => setMode(baseId, next)}
                disabled={disabled || readOnlyAgent}
                aria-label={t('agentsOverview.form.knowledgeWrite')}
              />
              <span>{t('agentsOverview.form.knowledgeWrite')}</span>
            </label>
          </Tooltip>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className="th-knowledge-base-picker"
      data-opc-component="create-agent-page"
      data-opc-part="knowledgeBases"
      data-testid={testId}
    >
      <div className="th-create-page__context-heading">
        <h3>{t('agentsOverview.form.knowledgeBases')}</h3>
        <span className="th-create-panel__label-hint">
          {t('agentsOverview.form.knowledgeBasesHint')}
        </span>
      </div>
      {error !== null ? (
        <p className="th-knowledge-base-picker__error" role="alert">
          {error}
        </p>
      ) : loading ? (
        <p className="th-knowledge-base-picker__empty">
          {t('agentsOverview.form.knowledgeBasesLoading')}
        </p>
      ) : bases.length === 0 && missingRefs.length === 0 ? (
        <p className="th-knowledge-base-picker__empty">
          {t('agentsOverview.form.knowledgeBasesEmpty')}
        </p>
      ) : (
        <ScrollArea className="th-knowledge-base-picker__list">
          {bases.map((base) => renderRow(base.id, base.name, true))}
          {missingRefs.map((ref) => renderRow(ref.id, ref.id, false))}
        </ScrollArea>
      )}
      <p className="th-knowledge-base-picker__hint">
        {readOnlyAgent
          ? t('agentsOverview.form.knowledgeReadonlyAgentHint')
          : t('agentsOverview.form.knowledgeWriteHint')}
      </p>
    </div>
  );
};

export default KnowledgeBasePicker;
