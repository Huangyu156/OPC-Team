 

import React, { useMemo } from 'react';
import { OverflowText, Icon, IconButton } from '@opc-team/ui';
import { AlertCircle, Loader2 } from 'lucide-react';
import { ContextItem } from '../../../types/context';
import { contextRegistry } from '../../../services/ContextRegistry';
import { useContextStore, selectValidationState, selectIsValidating } from '../../../stores/contextStore';
import { useI18n } from '@/infrastructure/i18n';
import './ContextCard.scss';

export interface ContextCardProps {
  context: ContextItem;
  onRemove?: (id: string) => void;
  compact?: boolean;
  interactive?: boolean;
  showPreview?: boolean;
  className?: string;
}

export const ContextCard: React.FC<ContextCardProps> = ({
  context,
  onRemove,
  compact = false,
  interactive = true,
  showPreview = true,
  className = ''
}) => {
  const { t } = useI18n('components');
  
  const validationState = useContextStore(selectValidationState(context.id));
  const isValidating = useContextStore(selectIsValidating(context.id));
  
  
  const renderer = useMemo(() => {
    return contextRegistry.getRenderer(context.type);
  }, [context.type]);
  
  
  const definition = useMemo(() => {
    return contextRegistry.getDefinition(context.type);
  }, [context.type]);
  
  
  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove?.(context.id);
  };
  
  
  const content = renderer 
    ? renderer.render(context, { compact, interactive, showPreview })
    : (
      <div className="opc-context-card__fallback">
        <div className="opc-context-card__icon">
          <AlertCircle size={20} />
        </div>
        <div className="opc-context-card__content">
          <div className="opc-context-card__title"><OverflowText>
            {t('contextSystem.contextCard.unknownType', { type: context.type })}
          </OverflowText></div>
        </div>
      </div>
    );
  
  
  const validationClass = validationState 
    ? validationState.valid 
      ? 'opc-context-card--valid'
      : 'opc-context-card--invalid'
    : '';
  
  return (
    <div 
      className={`
        opc-context-card
        opc-context-card--${context.type}
        ${validationClass}
        ${compact ? 'opc-context-card--compact' : ''}
        ${interactive ? 'opc-context-card--interactive' : ''}
        ${className}
      `.trim()}
      data-context-id={context.id}
      data-context-type={context.type}
      data-opc-component="context-list"
      data-opc-part="card"
      data-opc-state={validationState ? (validationState.valid ? 'valid' : 'invalid') : undefined}
    >
      
      {definition && (
        <div 
          className="opc-context-card__indicator"
          style={{ backgroundColor: definition.color }}
          data-opc-component="context-list"
          data-opc-part="cardIndicator"
        />
      )}
      
      
      <div className="opc-context-card__body" data-opc-component="context-list" data-opc-part="cardBody">
        {content}
      </div>
      
      
      {interactive && (
        <div className="opc-context-card__toolbar" data-opc-component="context-list" data-opc-part="cardToolbar">
          
          <div className="opc-context-card__validation">
            {isValidating ? (
              <Loader2 size={14} className="opc-context-card__spinner" />
            ) : validationState ? (
              validationState.valid ? (
                <Icon name="check-circle" size="sm" className="opc-context-card__icon--success" />
              ) : (
                <span title={validationState.error}>
                  <AlertCircle 
                    size={14} 
                    className="opc-context-card__icon--error"
                  />
                </span>
              )
            ) : null}
          </div>
          
          
          {onRemove && (
            <IconButton
              className="opc-context-card__remove-btn"
              onClick={handleRemove}
              title={t('contextSystem.contextCard.removeContext')}
              aria-label={t('contextSystem.contextCard.removeContext')}
              icon={<Icon name="xmark" size="sm" />}
            />
          )}
        </div>
      )}
      
      
      {validationState && !validationState.valid && validationState.error && (
        <div className="opc-context-card__error" data-opc-component="context-list" data-opc-part="cardError" data-opc-state="invalid">
          <AlertCircle size={12} />
          <span>{validationState.error}</span>
        </div>
      )}
      
      
      {validationState && validationState.valid && validationState.warnings && validationState.warnings.length > 0 && (
        <div className="opc-context-card__warnings">
          {validationState.warnings.map((warning, idx) => (
            <div key={idx} className="opc-context-card__warning">
              <AlertCircle size={12} />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ContextCard;
