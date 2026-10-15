import { SettingsPage } from '../shared/SettingsPage';
import HooksSettingsSection from './HooksSettingsSection';
import QuickActionsSettingsSection from './QuickActionsSettingsSection';

export default function AutomationSettingsPage() {
  return (
    <SettingsPage pageId="tools.automation" data-opc-component="automation-settings-page" data-opc-part="root">
      <div data-opc-component="automation-settings-page" data-opc-part="quickActions">
        <QuickActionsSettingsSection />
      </div>
      <div data-opc-component="automation-settings-page" data-opc-part="hooks">
        <HooksSettingsSection />
      </div>
    </SettingsPage>
  );
}
