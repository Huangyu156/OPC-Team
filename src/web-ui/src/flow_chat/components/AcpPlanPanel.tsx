import { Icon } from '@opc-team/ui';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { CircleDashed } from 'lucide-react';

import type { AcpPlanEntry } from '@/infrastructure/api/service-api/ACPClientAPI';
import './AcpPlanPanel.scss';

export interface AcpPlanPanelProps {
  entries: AcpPlanEntry[];
}

function statusIcon(status: string): React.ReactNode {
  switch (status) {
    case 'completed':
      return <Icon name="check-line" size="sm" className="opc-acp-plan__icon opc-acp-plan__icon--done" />;
    case 'in_progress':
      return (
        <Icon name="progress-25" size="sm" className="opc-acp-plan__icon opc-acp-plan__icon--active" />
      );
    default:
      return (
        <Icon glyph={CircleDashed} size="sm" className="opc-acp-plan__icon opc-acp-plan__icon--pending" />
      );
  }
}

export const AcpPlanPanel: React.FC<AcpPlanPanelProps> = ({ entries }) => {
  const { t } = useTranslation('flow-chat');
  if (entries.length === 0) return null;

  const done = entries.filter((entry) => entry.status === 'completed').length;

  return (
    <div data-opc-component="acp-plan-panel" data-opc-part="root" className="opc-acp-plan" data-testid="acp-plan-panel">
      <div data-opc-component="acp-plan-panel" data-opc-part="header" className="opc-acp-plan__header">
        <span data-opc-component="acp-plan-panel" data-opc-part="title" className="opc-acp-plan__title">{t('chatInput.acpPlan.title')}</span>
        <span data-opc-component="acp-plan-panel" data-opc-part="progress" className="opc-acp-plan__progress">
          {done}/{entries.length}
        </span>
      </div>
      <ul data-opc-component="acp-plan-panel" data-opc-part="list" className="opc-acp-plan__list">
        {entries.map((entry, index) => (
          <li
            key={`${index}-${entry.content}`}
            data-opc-component="acp-plan-panel"
            data-opc-part="item"
            data-opc-status={entry.status}
            className={`opc-acp-plan__item opc-acp-plan__item--${entry.status}`}
          >
            {statusIcon(entry.status)}
            <span data-opc-component="acp-plan-panel" data-opc-part="content" className="opc-acp-plan__content">{entry.content}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

AcpPlanPanel.displayName = 'AcpPlanPanel';
