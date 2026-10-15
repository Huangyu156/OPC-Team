import React from 'react';
import { PageHeader } from '@openbitfun/ui';
import { formatStandaloneUiText } from './standaloneUiCopy';
import './ConfigPageHeader.scss';

export interface ConfigPageHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  extra?: React.ReactNode;
  className?: string;
}

export const ConfigPageHeader: React.FC<ConfigPageHeaderProps> = ({
  title,
  subtitle,
  icon: _icon,
  extra,
  className = '',
  ...props
}) => {
  return (
    <div className={`opc-config-page-header ${className}`} data-opc-component="config" data-opc-part="pageHeader" {...props}>
      <div className="opc-config-page-header__inner" data-opc-component="config" data-opc-part="pageHeaderInner">
        <div className="opc-config-page-header__left">
          <div className="opc-config-page-header__info" data-opc-component="config" data-opc-part="pageHeaderInfo">
            <PageHeader
              level={2}
              size="md"
              title={(
                <span
                  className="opc-config-page-header__title"
                  data-opc-component="config"
                  data-opc-part="pageHeaderTitle"
                >
                  {title}
                </span>
              )}
              description={subtitle ? (
                <span className="opc-config-page-header__subtitle" data-opc-component="config" data-opc-part="pageHeaderSubtitle">{formatStandaloneUiText(subtitle)}</span>
              ) : undefined}
            />
          </div>
        </div>
        {extra && (
          <div className="opc-config-page-header__extra" data-opc-component="config" data-opc-part="pageHeaderExtra">
            {extra}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfigPageHeader;
