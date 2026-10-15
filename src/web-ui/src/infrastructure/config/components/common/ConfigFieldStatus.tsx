import React from 'react';
import { useTranslation } from 'react-i18next';
import './ConfigPageState.scss';

export type ConfigFieldStatusState = 'unsaved' | 'saving' | 'saved' | 'error';

export interface ConfigFieldStatusProps extends React.HTMLAttributes<HTMLDivElement> {
  status: ConfigFieldStatusState;
  message?: React.ReactNode;
}

export const ConfigFieldStatus: React.FC<ConfigFieldStatusProps> = ({
  status,
  message,
  className = '',
  ...props
}) => {
  const { t } = useTranslation('settings');
  return (
    <div
      {...props}
      className={['opc-config-field-status', className].filter(Boolean).join(' ')}
      data-opc-component="config"
      data-opc-part="fieldStatus"
      data-opc-status={status}
      role={status === 'error' ? 'alert' : 'status'}
      aria-live={status === 'error' ? 'assertive' : 'polite'}
    >
      <span className="opc-config-field-status__marker" aria-hidden="true" />
      <span>{message ?? t(`changeStatus.${status}`)}</span>
    </div>
  );
};
