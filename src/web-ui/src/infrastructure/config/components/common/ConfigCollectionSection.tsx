import React from 'react';
import { ConfigPageSection } from './ConfigPageLayout';
import './ConfigCollectionSection.scss';

export interface ConfigCollectionSectionProps {
  title: string;
  description?: string;
  toolbar?: React.ReactNode;
  filters?: React.ReactNode;
  editor?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export const ConfigCollectionSection: React.FC<ConfigCollectionSectionProps> = ({
  title,
  description,
  toolbar,
  filters,
  editor,
  className = '',
  children,
}) => {
  const hasEditor = Boolean(editor);

  return (
    <ConfigPageSection
      title={title}
      description={description}
      className={`opc-config-collection-section ${hasEditor ? 'opc-config-collection-section--with-editor' : ''} ${className}`}
    >
      <div className="opc-config-collection-section__content" data-opc-component="config" data-opc-part="collectionSection">
        {toolbar && (
          <div className="opc-config-collection-section__toolbar" data-opc-component="config" data-opc-part="collectionToolbar">
            {toolbar}
          </div>
        )}
        {editor && (
          <div className="opc-config-collection-section__editor" data-opc-component="config" data-opc-part="collectionEditor">
            {editor}
          </div>
        )}
        {filters && (
          <div className="opc-config-collection-section__filters" data-opc-component="config" data-opc-part="collectionFilters">
            {filters}
          </div>
        )}
        <div className="opc-config-collection-section__list" data-opc-component="config" data-opc-part="collectionList">
          {children}
        </div>
      </div>
    </ConfigPageSection>
  );
};

export default ConfigCollectionSection;
