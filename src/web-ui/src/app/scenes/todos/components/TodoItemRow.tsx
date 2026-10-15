/**
 * One Todo row, shared by the 24-hour list and the calendar day detail.
 *
 * A row represents a single occurrence, so the same recurring job can appear on
 * several rows with different times.
 */

import { OverflowText, Icon, IconButton, Switch, Tooltip } from '@openbitfun/ui';
import React from 'react';
import { CalendarClock } from 'lucide-react';

import { useI18n } from '@/infrastructure/i18n';
import type { CronJob } from '@/infrastructure/api';
import type { WorkspaceInfo } from '@/shared/types';
import {
  formatCountdown,
  formatJobTargetLabel,
  formatScheduleSummary,
  formatTimeOfDay,
  resolveJobWorkspaceLabel,
} from '../todoPresentation';

export interface TodoItemRowProps {
  job: CronJob;
  /** Occurrence time, or null for a row in the inactive group. */
  atMs: number | null;
  isOverdue?: boolean;
  isNextRun?: boolean;
  /** The scheduler is executing this run right now. */
  isRunning?: boolean;
  nowMs: number;
  workspaces: WorkspaceInfo[];
  /** Replaces the countdown, used for inactive rows ("Paused", "Done"). */
  statusLabel?: string;
  isSelected?: boolean;
  onEdit: (job: CronJob) => void;
  onDelete: (job: CronJob) => void;
  onToggleEnabled: (job: CronJob, enabled: boolean) => void;
}

const TodoItemRow: React.FC<TodoItemRowProps> = ({
  job,
  atMs,
  isOverdue = false,
  isNextRun = false,
  isRunning = false,
  nowMs,
  workspaces,
  statusLabel,
  isSelected = false,
  onEdit,
  onDelete,
  onToggleEnabled,
}) => {
  const { t, formatDate } = useI18n(['scenes/todos', 'shared']);

  const timeLabel = atMs != null ? formatTimeOfDay(atMs, formatDate) : null;
  const relativeLabel = statusLabel
    ?? (isRunning ? t('shared:statuses.running') : null)
    ?? (atMs != null ? formatCountdown(atMs, nowMs, t) : null);

  const rowState = [
    isSelected ? 'selected' : null,
    isRunning ? 'running' : null,
    isOverdue ? 'overdue' : null,
    job.enabled ? null : 'disabled',
  ].filter(Boolean).join(' ');

  return (
    <div data-overflow-trigger
      className={[
        'opc-todos__row',
        isRunning ? 'opc-todos__row--running' : '',
        isOverdue ? 'opc-todos__row--overdue' : '',
        job.enabled ? '' : 'opc-todos__row--disabled',
        isSelected ? 'opc-todos__row--selected' : '',
      ].filter(Boolean).join(' ')}
      data-opc-scene="todos"
      data-opc-part="row"
      data-opc-state={rowState || undefined}
      data-testid="todos-row"
      role="group"
      tabIndex={0}
      aria-label={`${job.name}${timeLabel ? `, ${timeLabel}` : ''}`}
      onClick={() => onEdit(job)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEdit(job);
        }
      }}
    >
      <div className="opc-todos__row-icon" data-opc-scene="todos" data-opc-part="rowIcon">
        <CalendarClock size={19} aria-hidden="true" />
      </div>

      <div className="opc-todos__row-body" data-opc-scene="todos" data-opc-part="rowBody">
        <div className="opc-todos__row-title-line">
          <OverflowText className="opc-todos__row-name">{job.name}</OverflowText>
          {isRunning ? (
            <span
              className="opc-todos__row-badge opc-todos__row-badge--running"
              data-opc-scene="todos"
              data-opc-part="rowBadge"
            >
              {t('shared:statuses.running')}
            </span>
          ) : isNextRun ? (
            <span className="opc-todos__row-badge" data-opc-scene="todos" data-opc-part="rowBadge">
              {t('badges.nextRun')}
            </span>
          ) : null}
          {isOverdue ? (
            <span
              className="opc-todos__row-badge opc-todos__row-badge--warn"
              data-opc-scene="todos"
              data-opc-part="rowBadge"
            >
              {t('badges.overdue')}
            </span>
          ) : null}
        </div>
        <div className="opc-todos__row-meta"><OverflowText behavior="marquee">
          <span>{resolveJobWorkspaceLabel(job, workspaces)}</span>
          <span className="opc-todos__row-meta-sep" aria-hidden="true">·</span>
          <span>{formatScheduleSummary(job.schedule, t, formatDate)}</span>
          <span className="opc-todos__row-meta-sep" aria-hidden="true">·</span>
          <span>{formatJobTargetLabel(job, t)}</span>
          {relativeLabel ? (
            <>
              <span className="opc-todos__row-meta-sep" aria-hidden="true">·</span>
              <span title={timeLabel ?? undefined}>{relativeLabel}</span>
            </>
          ) : null}
        </OverflowText></div>
        {job.state.lastError ? (
          <p className="opc-todos__row-error" data-opc-scene="todos" data-opc-part="rowError">
            {job.state.lastError}
          </p>
        ) : null}
      </div>

      <div
        className="opc-todos__row-actions"
        data-opc-scene="todos"
        data-opc-part="rowActions"
        onClick={(event) => event.stopPropagation()}
        role="presentation"
      >
        <Switch
          checked={job.enabled}
          aria-label={t('actions.toggleEnabled')}
          onChange={(event) => onToggleEnabled(job, event.currentTarget.checked)}
        />
        <div className="opc-todos__row-action-buttons">
          <Tooltip content={t('actions.edit')}>
            <IconButton
              type="button"
              size="sm"
              aria-label={t('actions.edit')}
              icon={<Icon name="edit" size="lg" />}
              onClick={() => onEdit(job)}
            />
          </Tooltip>
          <Tooltip content={t('actions.delete')}>
            <IconButton
              type="button"
              size="sm"
              tone="danger"
              aria-label={t('actions.delete')}
              icon={<Icon name="delete" size="lg" />}
              onClick={() => onDelete(job)}
            />
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

export default TodoItemRow;
