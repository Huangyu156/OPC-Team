import React from 'react';
import { ScrollArea } from '@opc-team/ui';
import './GalleryLayout.scss';

interface GalleryLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

const GalleryLayout: React.FC<GalleryLayoutProps> = ({ children, className, ...rootProps }) => (
  <div
    data-opc-component="gallery-layout"
    data-opc-part="root"
    {...rootProps}
    className={['gallery-layout', className].filter(Boolean).join(' ')}
  >
    <ScrollArea className="gallery-layout__body" data-opc-component="gallery-layout" data-opc-part="body">
      <div className="gallery-layout__body-inner" data-opc-component="gallery-layout" data-opc-part="content">
        {children}
      </div>
    </ScrollArea>
  </div>
);

export default GalleryLayout;
export type { GalleryLayoutProps };
