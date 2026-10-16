import { useToolCardDisclosure } from '../timeline/readerState';
import React, { useEffect, useMemo, useState } from 'react';
import { Button, Icon, OverflowText, ScrollArea } from '@opc-team/ui';
import {
  AmbientToolCard, AmbientToolCardHeader, ProminentToolCard, ProminentToolCardSummary, ToolCardStatusSlot,
} from '@opc-team/ui/flow-chat';
import { useI18n } from '@/infrastructure/i18n';
import type { ToolCardProps } from '../types/flow-chat';
import { useToolCardHeightContract } from './useToolCardHeightContract';
import { getToolCardStatusDescription } from './toolCardStatus';
import { useOpcControlDiscovery } from './useOpcControlDiscovery';
import {
  buildOpcControlCardModel, controlDescription, controlTitle, isOpcControlDiscovery,
} from './opcControlCardModel';
import './OpcControlToolCard.scss';

export const OpcControlToolCard: React.FC<ToolCardProps> = ({ toolItem, onExpand }) => {
  const { t, currentLanguage, formatNumber } = useI18n('flow-chat');
  const [isExpanded, setExpanded] = useToolCardDisclosure('isExpanded');
  const [localCapability, setLocalCapability] = useState<unknown>();
  const model = useMemo(() => buildOpcControlCardModel(toolItem, currentLanguage, localCapability),
    [toolItem, currentLanguage, localCapability]);
  const discovery = useOpcControlDiscovery(toolItem, model, isExpanded);
  const { cardRootRef, applyExpandedState } = useToolCardHeightContract({
    toolId: toolItem.id, toolName: toolItem.toolName,
  });

  useEffect(() => {
    if (!model.capabilityId) return;
    let active = true;
    // Reuse the product catalog for labels only, and keep it out of the initial chat bundle.
    void import('@/app/global-search/interactiveCapabilityCatalog').then(({ getInteractiveCapability }) => {
      if (active) setLocalCapability(getInteractiveCapability(model.capabilityId!));
    }).catch(() => {
      // Older/remote capabilities and unavailable label chunks remain readable by their IDs.
      if (active) setLocalCapability(undefined);
    });
    return () => { active = false; };
  }, [model.capabilityId]);

  const actionLabels = {
    list: t('toolCards.opcControl.actions.list'),
    search: t('toolCards.opcControl.actions.search'),
    get: t('toolCards.opcControl.actions.get'),
    open: t('toolCards.opcControl.actions.open'),
    execute: t('toolCards.opcControl.actions.execute'),
    configure: t('toolCards.opcControl.actions.configure'),
  };
  const actionLabel = model.action ? actionLabels[model.action] : t('toolCards.opcControl.actions.unknown');
  const valueText = (value: unknown): string => {
    if (value === undefined) return t('toolCards.opcControl.noValue');
    if (value === null) return t('toolCards.opcControl.nullValue');
    if (typeof value === 'boolean') return value ? t('toolCards.opcControl.trueValue') : t('toolCards.opcControl.falseValue');
    if (typeof value === 'number') return formatNumber(value);
    if (typeof value === 'string') return value || t('toolCards.opcControl.emptyValue');
    return JSON.stringify(value, null, 2);
  };
  const waitingForApproval = model.status === 'pending_confirmation' || Boolean(
    toolItem.requiresConfirmation && !toolItem.userConfirmed
    && !['completed', 'error', 'cancelled', 'rejected'].includes(model.status),
  );
  const configuredValue = model.action === 'configure'
    ? model.confirmed && model.effectiveValue !== undefined ? model.effectiveValue : model.requestedValue
    : undefined;
  const targetLabel = model.query ?? model.target;
  const configurationLabel = configuredValue !== undefined
    ? `${model.confirmed ? t('toolCards.opcControl.effectiveValue') : t('toolCards.opcControl.requestedValue')}: ${valueText(configuredValue)}`
    : undefined;
  const summary = [targetLabel, configurationLabel].filter(Boolean).join(' · ');
  const isDiscovery = isOpcControlDiscovery(model.input);
  const icon = <Icon name="mouse-pointer" size="sm" />;
  const statusIcon = (model.status === 'completed' && !model.confirmed) || waitingForApproval
    ? icon
    : <ToolCardStatusSlot
      defaultIcon={isDiscovery ? undefined : ['completed', 'error', 'cancelled', 'rejected'].includes(model.status) ? 'tool' : 'status'}
      status={model.status === 'confirmed' ? 'preparing' : model.status}
      toolIcon={icon}
    />;
  const fields = [
    model.target && { label: t('toolCards.opcControl.target'), value: model.target },
    model.query && { label: t('toolCards.opcControl.query'), value: model.query },
    model.action === 'configure' && model.requestedValue !== undefined && {
      label: t('toolCards.opcControl.requestedValue'), value: valueText(model.requestedValue),
    },
    model.confirmed && model.effectiveValue !== undefined && {
      label: t('toolCards.opcControl.effectiveValue'), value: valueText(model.effectiveValue),
    },
    ...model.currentValues.map(item => ({ label: item.label, value: valueText(item.value) })),
  ].filter((field): field is { label: string; value: string } => Boolean(field));
  const description = controlDescription(model.capability, currentLanguage);
  const hasDiscoveryResults = model.confirmed && (model.action === 'list' || model.action === 'search');
  const hasAvailabilityNotice = model.action === 'get' && Boolean(model.availability) && model.availability !== 'available';
  const hasDetails = Boolean(model.failed || description || fields.length || hasAvailabilityNotice || model.syncPending || hasDiscoveryResults);
  const toggle = () => applyExpandedState(isExpanded, !isExpanded, setExpanded, { onExpand });
  const details = (
    <div className="opc-control-card__details" data-opc-component="opc-control-tool-card" data-opc-part="details">
      {model.failed && <p className="opc-control-card__error" data-opc-component="opc-control-tool-card" data-opc-part="error">{model.error || t('toolCards.default.failed')}</p>}
      {description && <p className="opc-control-card__description" data-opc-component="opc-control-tool-card" data-opc-part="description">{description}</p>}
      {fields.length > 0 && <dl className="opc-control-card__fields" data-opc-component="opc-control-tool-card" data-opc-part="fields">
        {fields.map((field, index) => <div className="opc-control-card__field" data-opc-component="opc-control-tool-card" data-opc-part="field" key={index}>
          <dt data-opc-component="opc-control-tool-card" data-opc-part="label">{field.label}</dt>
          <dd data-opc-component="opc-control-tool-card" data-opc-part="value">{field.value}</dd>
        </div>)}
      </dl>}
      {hasAvailabilityNotice && (
        <p className="opc-control-card__notice" data-opc-component="opc-control-tool-card" data-opc-part="notice">
          {t('toolCards.opcControl.controlUnavailable')}{model.availabilityReason && ` · ${model.availabilityReason}`}
        </p>
      )}
      {model.syncPending && <p className="opc-control-card__notice" data-opc-component="opc-control-tool-card" data-opc-part="notice">
        {t('toolCards.opcControl.syncPendingDetails')}{model.syncReason && ` · ${model.syncReason}`}
      </p>}
      {hasDiscoveryResults && (
        <div className="opc-control-card__results" data-opc-component="opc-control-tool-card" data-opc-part="results">
          {discovery.items.length === 0 ? (!discovery.loading && !discovery.error && <p data-opc-component="opc-control-tool-card" data-opc-part="description">{t('toolCards.opcControl.noResults')}</p>) : (
            <ScrollArea className="opc-control-card__viewport" edgeFade="vertical" overscrollBehaviorY="auto">
            <ul className="opc-control-card__list" data-opc-component="opc-control-tool-card" data-opc-part="list">
              {discovery.items.map((item, index) => <li className="opc-control-card__result" data-opc-component="opc-control-tool-card" data-opc-part="result" key={index} data-overflow-trigger>
                <OverflowText>{controlTitle(item, currentLanguage) ?? String(item.capabilityId ?? item.id ?? '')}</OverflowText>
                {controlDescription(item, currentLanguage) && <p data-opc-component="opc-control-tool-card" data-opc-part="description">{controlDescription(item, currentLanguage)}</p>}
              </li>)}
            </ul>
            </ScrollArea>
          )}
          {discovery.loading && <p role="status" className="opc-control-card__description" data-opc-component="opc-control-tool-card" data-opc-part="description">
            {t('toolCards.opcControl.loadingAll')}
          </p>}
          {discovery.error && <>
            <p role="status" className="opc-control-card__notice" data-opc-component="opc-control-tool-card" data-opc-part="notice">
              {discovery.error === 'catalog-changed' ? t('toolCards.opcControl.catalogChanged')
                : discovery.error === 'surface-changed' ? t('toolCards.opcControl.sourceDeviceRequired')
                  : t('toolCards.opcControl.loadAllFailed')}
            </p>
            {discovery.error === 'load-failed' && <Button variant="text" size="sm" onClick={discovery.retry}>
              {t('toolCards.opcControl.retryLoad')}
            </Button>}
          </>}
        </div>
      )}
    </div>
  );
  const common = {
    'data-opc-tool-card': 'opc-control',
    status: model.status,
    isExpanded: isExpanded && hasDetails,
    expandedContent: hasDetails ? details : undefined,
  };

  return <div ref={cardRootRef} data-opc-adapter="opc-control" data-tool-card-id={toolItem.id}>
    {isDiscovery ? (
      <AmbientToolCard {...common} onClick={hasDetails ? toggle : undefined}
        header={<AmbientToolCardHeader action={actionLabel} content={summary || t('toolCards.opcControl.allFeatures')}
          statusDescription={getToolCardStatusDescription(model.status, t, model.error)}
          icon={statusIcon} />} />
    ) : (
      <ProminentToolCard {...common} allowExpandedWhenFailed onToggle={hasDetails ? toggle : undefined} requiresConfirmation={waitingForApproval}
        summary={<ProminentToolCardSummary action={actionLabel} content={summary}
          icon={statusIcon} />} />
    )}
  </div>;
};
