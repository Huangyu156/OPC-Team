import '@/app/scenes/settings/pages/application/AppearanceSettingsPage.scss';
import { AppearancePackageConfigSection } from '@/infrastructure/config/components/AppearancePackageConfigSection';
import {
  ConfigPageContent,
  ConfigPageHeader,
  ConfigPageLayout,
  ConfigPageSectionStack
} from '@/infrastructure/config/components/common';
import { FontPreferencePanel } from '@/infrastructure/font-preference';
import SessionPanelSettingsSection from './SessionPanelSettingsSection';
import React from 'react';
import { useTranslation } from 'react-i18next';

const AppearanceSettingsPage: React.FC = () => {
  const { t } = useTranslation('settings/appearance');

  return (
    <ConfigPageLayout
      className="opc-appearance-settings"
      data-opc-component="appearance-settings"
      data-opc-part="root"
    >
      <ConfigPageHeader title={t('title')} subtitle={t('subtitle')} />
      <ConfigPageContent
        className="opc-appearance-settings__content"
        data-opc-component="appearance-settings"
        data-opc-part="content"
      >
        <ConfigPageSectionStack data-testid="appearance-settings">
          <AppearancePackageConfigSection />
          <FontPreferencePanel />
          <SessionPanelSettingsSection />
        </ConfigPageSectionStack>
      </ConfigPageContent>
    </ConfigPageLayout>
  );
};

export default AppearanceSettingsPage;
