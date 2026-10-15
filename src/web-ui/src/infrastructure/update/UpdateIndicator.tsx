import { useHasAppUpdate } from './useHasAppUpdate';
import './UpdateIndicator.scss';

export function UpdateIndicator() {
  const visible = useHasAppUpdate();
  return visible ? <span className="opc-update-indicator" aria-hidden="true"
    data-testid="app-update-indicator" data-opc-component="update" data-opc-part="indicator" /> : null;
}
