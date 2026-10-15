import { lazyWithRecovery } from '@/shared/utils/lazyWithRecovery';
import React, { Suspense } from 'react';
import './ShellScene.scss';

const TerminalScene = lazyWithRecovery(() => import('../terminal/TerminalScene'));

interface ShellSceneProps {
  isActive?: boolean;
}

const ShellScene: React.FC<ShellSceneProps> = ({ isActive = true }) => (
  <div className="opc-shell-scene" data-testid="shell-panel" data-opc-scene="shell" data-opc-part="root" data-opc-state={isActive ? 'active' : undefined}>
    <Suspense fallback={<div className="opc-shell-scene__loading" data-opc-scene="shell" data-opc-part="loading" />}>
      <TerminalScene isActive={isActive} />
    </Suspense>
  </div>
);

export default ShellScene;
