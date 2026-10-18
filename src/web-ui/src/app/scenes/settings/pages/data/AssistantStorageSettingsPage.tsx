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
import { isPeerDeviceModeActive } from '@/infrastructure/peer-device/peerModeFlag';
import { isTauriRuntime } from '@/infrastructure/runtime';
import { createLogger } from '@/shared/utils/logger';
import { Alert, Button, IconButton, Input, Tooltip } from '@opc-team/ui';
import { FolderOpen, HardDriveDownload } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsPage } from '../shared/SettingsPage';

const log = createLogger('AssistantStorageSettingsPage');

const ASSISTANT_WORKSPACE_ROOT_CONFIG_PATH = 'app.assistant_workspace_root';

const WINDOWS_ABSOLUTE_PATH = /^[a-zA-Z]:[\\/]/;
const UNC_ABSOLUTE_PATH = /^\\\\[^\\]/;

/**
 * The assistant workspace root is consumed by the host process, so the stored
 * value must be an absolute host path. Relative input is rejected before the
 * write instead of being silently stored and ignored at resolution time.
 */
function isAbsoluteHostPath(value: string): boolean {
  return value.startsWith('/') || WINDOWS_ABSOLUTE_PATH.test(value) || UNC_ABSOLUTE_PATH.test(value);
}

function AssistantWorkspaceStorageSection() {
  const { t } = useTranslation('settings/assistantStorage');
  const [configuredRoot, setConfiguredRoot] = useState<string | null>(null);
  const [draftRoot, setDraftRoot] = useState('');
  const [locations, setLocations] = useState<AssistantWorkspaceLocations | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revealingPath, setRevealingPath] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Browser-hosted Web UI has no native directory dialog and no OS shell, so the
  // page must fall back to typed input instead of invoking a host API that throws.
  const nativeHostAvailable = isTauriRuntime() || isPeerDeviceModeActive();
  const draftDirty = draftRoot.trim() !== (configuredRoot ?? '');

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
      setDraftRoot(savedRoot ?? '');
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

  const persistRoot = useCallback(async (nextRoot: string) => {
    try {
      setSaving(true);
      await configManager.setConfig(ASSISTANT_WORKSPACE_ROOT_CONFIG_PATH, nextRoot);
      setConfiguredRoot(nextRoot);
      setDraftRoot(nextRoot);
      const resolvedLocations = await globalAPI.getAssistantWorkspaceLocations();
      setLocations(resolvedLocations);
      showMessage('success', t('messages.rootUpdated'));
      return true;
    } catch (error) {
      log.error('Failed to set assistant workspace root', { root: nextRoot, error });
      showMessage('error', t('messages.saveFailed'));
      return false;
    } finally {
      setSaving(false);
    }
  }, [showMessage, t]);

  const handleApplyRoot = useCallback(async () => {
    const candidate = draftRoot.trim();
    if (!candidate) {
      showMessage('error', t('messages.pathRequired'));
      return;
    }
    if (!isAbsoluteHostPath(candidate)) {
      showMessage('error', t('messages.invalidPath'));
      return;
    }
    await persistRoot(candidate);
  }, [draftRoot, persistRoot, showMessage, t]);

  const handlePickRoot = useCallback(async () => {
    if (!nativeHostAvailable) {
      showMessage('info', t('messages.pickerUnavailable'));
      return;
    }
    try {
      const selected = await pickWorkspaceDirectory({
        title: t('picker.title'),
        defaultPath: draftRoot.trim() || configuredRoot || locations?.activeRoot || undefined,
      });
      if (!selected) return;
      await persistRoot(selected);
    } catch (error) {
      log.error('Failed to choose assistant workspace root', error);
      showMessage('error', t('messages.saveFailed'));
    }
  }, [configuredRoot, draftRoot, locations?.activeRoot, nativeHostAvailable, persistRoot, showMessage, t]);

  const handleResetRoot = useCallback(async () => {
    try {
      setSaving(true);
      await configManager.resetConfig(ASSISTANT_WORKSPACE_ROOT_CONFIG_PATH);
      setConfiguredRoot(null);
      setDraftRoot('');
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
    <div className="opc-logging-config" data-opc-component="application-settings" data-opc-part="assistantStorage">
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
                value={draftRoot}
                placeholder={t('storage.customRoot.pathPlaceholder')}
                invalid={draftDirty && draftRoot.trim() !== '' && !isAbsoluteHostPath(draftRoot.trim())}
                size="sm"
                disabled={saving}
                data-testid="assistant-storage-root-input"
                onValueChange={setDraftRoot}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleApplyRoot();
                  }
                }}
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                data-testid="assistant-storage-apply-button"
                onClick={() => void handleApplyRoot()}
                loading={saving}
                disabled={saving || !draftDirty}
              >
                {t('storage.customRoot.apply')}
              </Button>
              {nativeHostAvailable && (
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
              )}
              {configuredRoot !== null && (
                <Button
                  type="button"
                  variant="text"
                  size="sm"
                  data-testid="assistant-storage-reset-button"
                  onClick={() => void handleResetRoot()}
                  loading={saving}
                  disabled={saving}
                >
                  {t('storage.customRoot.reset')}
                </Button>
              )}
            </div>
            {!nativeHostAvailable && (
              <div
                className="opc-logging-config__path-hint"
                data-testid="assistant-storage-manual-hint"
              >
                {t('storage.customRoot.manualHint')}
              </div>
            )}
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
              {nativeHostAvailable && (
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
              )}
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
                {nativeHostAvailable && (
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
                )}
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
