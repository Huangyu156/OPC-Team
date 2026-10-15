import React, { useId, useState } from 'react';
import { Disclosure, OverflowText, Icon, IconButton } from '@openbitfun/ui';
import './ConfigCollectionItem.scss';

export interface ConfigCollectionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  badge?: React.ReactNode;
  badgePlacement?: 'inline' | 'below';
  control: React.ReactNode;
  details?: React.ReactNode;
  disabled?: boolean;
  /** Separates details interaction from the item's disabled appearance. */
  detailsDisabled?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  /** Lets non-interactive row space toggle details while preserving nested controls. */
  toggleOnRowClick?: boolean;
  className?: string;
}

export const ConfigCollectionItem: React.FC<ConfigCollectionItemProps> = ({
  label,
  badge,
  badgePlacement = 'inline',
  control,
  details,
  disabled = false,
  detailsDisabled = disabled,
  expanded: expandedProp,
  onToggle,
  toggleOnRowClick = false,
  className = '',
  ...rootProps
}) => {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isControlled = expandedProp !== undefined;
  const isExpanded = isControlled ? expandedProp : internalExpanded;
  const hasDetails = Boolean(details);
  const labelId = useId();

  const toggleDetails = () => {
    if (!hasDetails || detailsDisabled) return;
    if (isControlled) {
      onToggle?.();
    } else {
      setInternalExpanded((prev) => !prev);
    }
  };

  const handleRowClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!toggleOnRowClick || !hasDetails || detailsDisabled) return;
    const target = event.target;
    if (
      target instanceof Element
      && target.closest('a, button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [contenteditable="true"]')
    ) {
      return;
    }
    toggleDetails();
  };

  return (
    <div
      className={`opc-collection-item ${isExpanded ? 'is-expanded' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}
      data-opc-component="config"
      data-opc-part="collectionItem"
      {...rootProps}
    >
      <Disclosure
        className="opc-collection-item__disclosure"
        summary={label}
        open={hasDetails && isExpanded}
        disabled={!hasDetails || detailsDisabled}
        onOpenChange={toggleDetails}
        unmountOnClose
        exitDurationMs={180}
        contentClassName="opc-collection-item__details-collapse"
        contentInnerClassName="opc-collection-item__details-clip"
        renderHeader={(triggerProps) => (
          <div data-overflow-trigger
            className={`opc-config-page-row opc-config-page-row--center opc-collection-item__row ${
              toggleOnRowClick && hasDetails && !detailsDisabled ? 'opc-collection-item__row--toggleable' : ''
            }`}
            data-opc-component="config"
            data-opc-part="collectionRow"
            onClick={handleRowClick}
          >
            <div className="opc-config-page-row__meta" data-opc-component="config" data-opc-part="collectionMeta">
              <div
                className={`opc-config-page-row__label opc-collection-item__label ${
                  badgePlacement === 'below' ? 'opc-collection-item__label--stacked' : ''
                }`}
              >
                <OverflowText id={labelId} className="opc-collection-item__name" data-opc-component="config" data-opc-part="collectionName">{label}</OverflowText>
                {badge && (
                  <span
                    className={`opc-collection-item__badges ${
                      badgePlacement === 'below'
                        ? 'opc-collection-item__badges--stacked'
                        : 'opc-collection-item__badges--inline'
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </div>
            </div>
            <div className="opc-config-page-row__control" data-opc-component="config" data-opc-part="collectionControl">
              <div className="opc-collection-item__control">
                {control}
                {hasDetails ? (
                  <IconButton
                    type="button"
                    className="opc-collection-btn opc-collection-item__details-toggle"
                    disabled={detailsDisabled}
                    aria-label={typeof label === 'string' ? label : ''}
                    aria-labelledby={labelId}
                    {...triggerProps}
                    icon={<Icon name="chevron-down" size="sm" aria-hidden="true" />}
                  />
                ) : null}
              </div>
            </div>
          </div>
        )}
      >
        <div className="opc-collection-item__details" data-opc-component="config" data-opc-part="collectionDetails">{details}</div>
      </Disclosure>
    </div>
  );
};

export default ConfigCollectionItem;
