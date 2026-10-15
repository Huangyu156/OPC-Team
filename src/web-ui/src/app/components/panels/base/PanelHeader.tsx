import { OverflowText } from '@openbitfun/ui';
/**
 * Generic panel header with centered title and optional action buttons.
 */

import React from 'react';
import './PanelHeader.scss';

export interface PanelHeaderProps {
  title: string;
  actions?: React.ReactNode;
  className?: string;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({
  title,
  actions,
  className = '',
}) => {
  return (
    <div data-opc-component="panel-header" data-opc-part="root" className={`opc-panel-header ${className}`}>
      <h3 className="opc-panel-header__title" data-opc-component="panel-header" data-opc-part="title"><OverflowText>{title}</OverflowText></h3>
      {actions && (
        <div className="opc-panel-header__actions" data-opc-component="panel-header" data-opc-part="actions">
          {actions}
        </div>
      )}
    </div>
  );
};

PanelHeader.displayName = 'PanelHeader';

export default PanelHeader;
