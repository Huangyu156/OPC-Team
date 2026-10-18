import '@/app/scenes/settings/pages/shared/ApplicationSettings.scss';
import { configManager } from '@/infrastructure/config/services/ConfigManager';
import { globalAPI, workspaceAPI } from '@/infrastructure/api';
import type { AssistantWorkspaceLocations } from '@/infrastructure/api/service-api/GlobalAPI';
import {
  ConfigLoadingState,
  ConfigMessage,
  ConfigPageRow,
  ConfigPageSection,
  ConfigRetryState,
} from '@/infrastructure/config/components/common';
import { pickWorkspaceDirectory } from '@/infrastructure/peer-device/pickWorkspaceDirectory';
import { createLogger } from '@/shared/utils/logger';
import { Alert, Button, IconButton, Input, Tooltip } from '@opc-team/ui';
import { FolderOpen, HardDriveDownload } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsPage } from '../shared/SettingsPage';

const log = createLogger('AssistantStorageSettingsPage');

const ASSISTANT_WORKSPACE_ROOT_CONFIG_PATH = 'app.assistant_workspace_root';

function AssistantWorkspaceStorageSection() {
  const { t } = useTranslation('settings/assistantStorage');
  const [configuredRoot, setConfiguredRoot] = useState<string | null>(null);
  const [locations, setLocations] = useState<AssistantWorkspaceLocations | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revealingPath, setRevealingPath] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const showMessage = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadFailed(false);
      const [savedRoot, resolvedLocations] = await Promise.all([
        configManager.getConfig<string | null>(ASSISTANT_WORKSPACE_ROOT_CONFIG_PATH),
        globalAPI.getAssistantWorkspaceLocations(),
      ]);
      setConfiguredRoot(savedRoot ?? null);
      setLocations(resolvedLocations);
    } catch (error) {
      log.error('Failed to load assistant workspace locations', error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handlePickRoot = useCallback(async () => {
    try {
      const selected = await pickWorkspaceDirectory({
        title: t('picker.title'),
        defaultPath: configuredRoot ?? locations?.activeRoot ?? undefined,
      });
      if (!selected) return;

      setSaving(true);
      await configManager.setConfig(ASSISTANT_WORKSPACE_ROOT_CONFIG_PATH, selected);
      setConfiguredRoot(selected);
      const resolvedLocations = await globalAPI.getAssistantWorkspaceLocations();
      setLocations(resolvedLocations);
      showMessage('success', t('messages.rootUpdated'));
    } catch (error) {
      log.error('Failed to set assistant workspace root', error);
      showMessage('error', t('messages.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [configuredRoot, locations?.activeRoot, showMessage, t]);

  const handleResetRoot = useCallback(async () => {
    try {
      setSaving(true);
      await configManager.resetConfig(ASSISTANT_WORKSPACE_ROOT_CONFIG_PATH);
      setConfiguredRoot(null);
      const resolvedLocations = await globalAPI.getAssistantWorkspaceLocations();
      setLocations(resolvedLocations);
      showMessage('success', t('messages.rootReset'));
    } catch (error) {
      log.error('Failed to reset assistant workspace root', error);
      showMessage('error', t('messages.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [showMessage, t]);

  const handleReveal = useCallback(async (path: string | undefined) => {
    if (!path) return;
    try {
      setRevealingPath(path);
      await workspaceAPI.revealInExplorer(path);
    } catch (error) {
      log.error('Failed to reveal assistant workspace root', { path, error });
      showMessage('error', t('messages.openFailed'));
    } finally {
      setRevealingPath(null);
    }
  }, [showMessage, t]);

  if (loading) {
    return <ConfigLoadingState label={t('messages.loading')} />;
  }

  if (loadFailed) {
    return (
      <ConfigRetryState
        message={t('messages.loadFailed')}
        retryLabel={t('common.retry')}
        onRetry={() => void loadData()}
      />
    );
  }

  return (
    <div className="opc-logging-config" data-opc-component="application-settings" data-opc-part="assistant-storage">
      <div className="opc-logging-config__content">
        <ConfigMessage message={message} />

        <ConfigPageSection
          title={t('storage.sections.location')}
          description={t('storage.sections.locationHint')}
        >
          <ConfigPageRow
            label={t('storage.customRoot.label')}
            description={t('storage.customRoot.description')}
            multiline
          >
            <div className="opc-logging-config__path-row" data-opc-component="application-settings" data-opc-part="assistantStoragePath">
              <Input
                className="opc-logging-config__path-box"
                aria-label={t('storage.customRoot.label')}
                title={configuredRoot || t('storage.customRoot.defaultHint')}
                value={configuredRoot || ''}
                placeholder={t('storage.customRoot.defaultHint')}
                readOnly
                size="sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                leadingIcon={<HardDriveDownload size={14} aria-hidden />}
                data-testid="assistant-storage-pick-button"
                onClick={() => void handlePickRoot()}
                loading={saving}
                disabled={saving}
              >
                {t('storage.customRoot.pick')}
              </Button>
              {configuredRoot !== null && (
                <Button
                  type="button"
                  variant="text"
                  size="sm"
                  onClick={() => void handleResetRoot()}
                  loading={saving}
                  disabled={saving}
                >
                  {t('storage.customRoot.reset')}
                </Button>
              )}
            </div>
          </ConfigPageRow>
          {configuredRoot !== null && (
            <Alert
              tone="info"
              message={t('storage.existingAssistants.title')}
              description={t('storage.existingAssistants.description')}
            />
          )}
          <ConfigPageRow
            label={t('storage.activeRoot.label')}
            description={t('storage.activeRoot.description')}
            multiline
          >
            <div className="opc-logging-config__path-row" data-opc-component="application-settings" data-opc-part="assistantActiveRoot">
              <Input
                className="opc-logging-config__path-box"
                aria-label={t('storage.activeRoot.label')}
                title={locations?.activeRoot || undefined}
                value={locations?.activeRoot || '-'}
                readOnly
                size="sm"
              />
              <Tooltip content={t('storage.actions.openFolderTooltip')} placement="top">
                <IconButton
                  aria-label={t('storage.actions.openFolderTooltip')}
                  variant="quiet"
                  size="sm"
                  onClick={() => void handleReveal(locations?.activeRoot)}
                  loading={revealingPath === locations?.activeRoot}
                  disabled={!locations?.activeRoot}
                  icon={<FolderOpen size={14} aria-hidden />}
                />
              </Tooltip>
            </div>
          </ConfigPageRow>
          {locations?.customRootActive && locations.legacyRoot !== locations.activeRoot && (
            <ConfigPageRow
              label={t('storage.legacyRoot.label')}
              description={t('storage.legacyRoot.description')}
              multiline
            >
              <div className="opc-logging-config__path-row" data-opc-component="application-settings" data-opc-part="assistantLegacyRoot">
                <Input
                  className="opc-logging-config__path-box"
                  aria-label={t('storage.legacyRoot.label')}
                  title={locations.legacyRoot}
                  value={locations.legacyRoot}
                  readOnly
                  size="sm"
                />
                <Tooltip content={t('storage.actions.openFolderTooltip')} placement="top">
                  <IconButton
                    aria-label={t('storage.actions.openFolderTooltip')}
                    variant="quiet"
                    size="sm"
                    onClick={() => void handleReveal(locations.legacyRoot)}
                    loading={revealingPath === locations.legacyRoot}
                    disabled={!locations.legacyRoot}
                    icon={<FolderOpen size={14} aria-hidden />}
                  />
                </Tooltip>
              </div>
            </ConfigPageRow>
          )}
        </ConfigPageSection>
      </div>
    </div>
  );
}

const AssistantStorageSettingsPage: React.FC = () => {
  return (
    <SettingsPage pageId="data.assistantStorage" data-opc-component="application-settings" data-opc-part="root">
      <AssistantWorkspaceStorageSection />
    </SettingsPage>
  );
};
export default AssistantStorageSettingsPage;
