/**
 * NavPanel — navigation sidebar container.
 *
 * All scene navigation shares a short paired crossfade/translation for pointer
 * input. Keyboard and programmatic navigation stay immediate. WorkspaceBody
 * owns the background material beneath both layers.
 *
 * MainNav is always mounted so its state is preserved across transitions.
 */

import React, {
  Suspense,
  startTransition,
  useState,
  useEffect,
  useRef,
} from 'react';
import { useI18n } from '@/infrastructure/i18n';
import { useNavSceneStore } from '../../stores/navSceneStore';
import { getSceneNav, preloadSceneNav } from '../../scenes/nav-registry';
import type { SceneTabId } from '../SceneBar/types';
import { NavigationTransitionBoundary } from '@/app/navigation/NavigationTransitionBoundary';
import type { InteractionMotion } from '@/shared/utils/motionPreference';
import MainNav from './MainNav';
import PersistentFooterActions from './components/PersistentFooterActions';
import './NavPanel.scss';

interface NavPanelProps {
  className?: string;
}

const NavPanel: React.FC<NavPanelProps> = ({ className = '' }) => {
  const { t } = useI18n('common');
  const showSceneNav = useNavSceneStore(s => s.showSceneNav);
  const navSceneId = useNavSceneStore(s => s.navSceneId);
  const navigationMotion = useNavSceneStore(s => s.navigationMotion);

  // Retain the scene while its layer exits, including when navSceneId clears.
  const [mountedSceneId, setMountedSceneId] = useState<SceneTabId | null>(navSceneId);
  const [mountedSceneMotion, setMountedSceneMotion] = useState<InteractionMotion>(navigationMotion);
  const sceneRequestRef = useRef(0);
  useEffect(() => {
    const requestId = ++sceneRequestRef.current;
    if (!navSceneId) return;

    const commit = () => {
      if (sceneRequestRef.current !== requestId) return;
      // React keeps the currently painted navigation visible if the cached
      // lazy component still suspends for a final promise microtask.
      startTransition(() => {
        setMountedSceneId(navSceneId);
        setMountedSceneMotion(navigationMotion);
      });
    };
    void preloadSceneNav(navSceneId).then(commit, commit);
  }, [navSceneId, navigationMotion]);

  const SceneNavComponent = mountedSceneId ? getSceneNav(mountedSceneId) : null;

  const hasMountedSceneNav = showSceneNav && SceneNavComponent !== null;

  const contentCls = [
    'opc-nav-panel__content',
    hasMountedSceneNav && 'is-scene',
    (showSceneNav ? mountedSceneMotion : navigationMotion) === 'pointer' && 'has-pointer-motion',
  ].filter(Boolean).join(' ');

  const sceneCls = [
    'opc-nav-panel__layer opc-nav-panel__layer--scene',
    hasMountedSceneNav && 'is-active',
  ].filter(Boolean).join(' ');

  return (
    <div
      data-opc-component="nav-panel"
      data-opc-part="root"
      data-opc-state={hasMountedSceneNav ? 'scene' : ''}
      data-opc-theme-scope="chrome"
      className={`opc-nav-panel ${className}`}
      aria-label={t('nav.aria.mainNav')}
      data-testid="nav-panel"
    >
      <div className={contentCls} data-opc-component="nav-panel" data-opc-part="content">

        <div
          className="opc-nav-panel__layer opc-nav-panel__layer--main"
          data-opc-component="nav-panel"
          data-opc-part="mainLayer"
          data-opc-layer="main"
          aria-hidden={hasMountedSceneNav || undefined}
          {...(hasMountedSceneNav ? { inert: '' } : {})}
        >
          <MainNav />
        </div>

        {SceneNavComponent && (
          <div
            className={sceneCls}
            data-opc-component="nav-panel"
            data-opc-part="sceneLayer"
            data-opc-layer="scene"
            data-opc-state={hasMountedSceneNav ? 'active' : ''}
            aria-hidden={!hasMountedSceneNav || undefined}
            {...(!hasMountedSceneNav ? { inert: '' } : {})}
          >
            <Suspense fallback={null}>
              <NavigationTransitionBoundary
                transitionKey={mountedSceneId ?? 'main'}
                motion={showSceneNav && mountedSceneMotion === 'pointer' ? 'pointer' : 'none'}
                className="opc-nav-panel__scene-transition"
                layerClassName="opc-nav-panel__scene-inner"
                data-opc-component="nav-panel"
                data-opc-part="sceneContent"
              >
                <SceneNavComponent />
              </NavigationTransitionBoundary>
            </Suspense>
          </div>
        )}

      </div>
      <PersistentFooterActions />
    </div>
  );
};

export default NavPanel;
