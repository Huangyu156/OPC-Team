/**
 * About dialog component.
 * Shows product identity, build metadata, license, and the
 * persistent GitHub repository entry point.
 */

import {
  Button,
  FieldGroup,
  FieldRow,
  Icon,
  IconButton,
  StatusPill,
  Tooltip,
  Dialog,
  DialogBody,
  DialogClose,
  DialogTitle,
} from '@openbitfun/ui';
import React, { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/infrastructure/i18n';
import {
  formatBuildDate,
  formatDisplayedVersion,
  getAboutInfo,
} from '@/shared/utils/version';
import { createLogger } from '@/shared/utils/logger';
import { systemAPI } from '@/infrastructure/api';
import { isTauriRuntime } from '@/infrastructure/update/tauriEnv';
import { OpenBitFunBrandMotion } from '@openbitfun/ui/brand';
import './AboutDialog.scss';

const log = createLogger('AboutDialog');
const GITHUB_REPOSITORY_URL = 'https://github.com/GCWing/OpenBitFun';

interface AboutDialogProps {
  /** Whether visible */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
}

export const AboutDialog: React.FC<AboutDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useI18n('common');
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [nativeVersion, setNativeVersion] = useState<string | null>(null);

  const aboutInfo = getAboutInfo();
  const { version, license } = aboutInfo;
  const nativeRuntime = isTauriRuntime();
  const displayedVersion = formatDisplayedVersion(
    version,
    nativeVersion,
    nativeRuntime,
    import.meta.env.DEV,
  );
  const licenseName = license.type === 'MIT' ? 'MIT License' : license.type;
  const licenseCopyright = license.text?.startsWith(`${licenseName} - `)
    ? license.text.slice(`${licenseName} - `.length)
    : license.text;
  const legalCopyright = licenseCopyright
    ? `${licenseCopyright.replace(/\.$/, '')}. ${t('about.allRightsReserved')}`
    : t('about.copyright');

  let releaseLabel = t('about.stableBuild');
  if (displayedVersion.endsWith('-dev')) {
    releaseLabel = t('about.developmentBuild');
  } else if (version.releaseChannel === 'beta') {
    releaseLabel = t('about.betaBuild');
  } else if (version.releaseChannel === 'nightly') {
    releaseLabel = t('about.nightlyBuild');
  }

  useEffect(() => {
    if (!isOpen || !nativeRuntime) return;
    let active = true;
    void systemAPI.getLocalAppVersion()
      .then(currentVersion => {
        if (active) setNativeVersion(currentVersion);
      })
      .catch(error => {
        log.warn('Failed to read the local version; using generated version metadata', error);
      });
    return () => {
      active = false;
    };
  }, [isOpen, nativeRuntime]);

  const handleGithubStar = useCallback(() => {
    systemAPI.openExternal(GITHUB_REPOSITORY_URL).catch(error => {
      log.error('Failed to open the GitHub repository', { url: GITHUB_REPOSITORY_URL, error });
    });
  }, []);

  const copyToClipboard = async (text: string, itemId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItem(itemId);
      window.setTimeout(() => setCopiedItem(null), 2000);
    } catch (error) {
      log.error('Failed to copy to clipboard', error);
    }
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}
        size="xl"
        className="opc-about-dialog"
        aria-label={t('about.dialogTitle')}
        data-testid="about-dialog-modal"
      >
        <DialogClose className="opc-about-dialog__close" />
        <DialogBody className="opc-about-dialog__modal-content" inset="none">
          <div
            className="opc-about-dialog__content"
            data-opc-component="about-dialog"
            data-opc-part="root"
          >
            <div className="opc-about-dialog__body">
              <div
                className="opc-about-dialog__brand"
                data-opc-component="about-dialog"
                data-opc-part="hero"
                aria-hidden="true"
              >
                <div className="opc-about-dialog__artwork">
                  <OpenBitFunBrandMotion className="opc-about-dialog__brand-mark" active={isOpen} />
                </div>
                <p className="opc-about-dialog__brand-statement">
                  {t('about.brandStatement')}
                </p>
              </div>

              <section
                className="opc-about-dialog__metadata"
                data-opc-component="about-dialog"
                data-opc-part="content"
                aria-label={t('about.details')}
              >
                <header className="opc-about-dialog__brand-copy">
                  <DialogTitle
                    className="opc-about-dialog__title"
                    data-opc-component="about-dialog"
                    data-opc-part="title"
                  >
                    {version.name}
                  </DialogTitle>
                  <p className="opc-about-dialog__tagline">{t('about.tagline')}</p>
                </header>

                <FieldGroup className="opc-about-dialog__details" appearance="plain" dividers={false}>
                  <FieldRow padding="none">
                    <dl className="opc-about-dialog__info-row" data-opc-component="about-dialog" data-opc-part="infoRow">
                      <dt className="opc-about-dialog__info-label" data-opc-component="about-dialog" data-opc-part="infoLabel">
                        <span>{t('about.versionLabel')}</span>
                      </dt>
                      <dd className="opc-about-dialog__info-value-group">
                        <span
                          className="opc-about-dialog__info-value"
                          data-opc-component="about-dialog"
                          data-opc-part="infoValue"
                          data-testid="about-version-value"
                        >
                          {displayedVersion}
                        </span>
                        <span
                          className="opc-about-dialog__channel-badge"
                          data-opc-component="about-dialog"
                          data-opc-part="channelBadge"
                        >
                          <StatusPill tone="neutral">{releaseLabel}</StatusPill>
                        </span>
                      </dd>
                    </dl>
                  </FieldRow>

                  <FieldRow padding="none">
                    <dl className="opc-about-dialog__info-row" data-opc-component="about-dialog" data-opc-part="infoRow">
                      <dt className="opc-about-dialog__info-label" data-opc-component="about-dialog" data-opc-part="infoLabel">
                        <span>{t('about.buildDate')}</span>
                      </dt>
                      <dd className="opc-about-dialog__info-value-group">
                        <span className="opc-about-dialog__info-value" data-opc-component="about-dialog" data-opc-part="infoValue">
                          {formatBuildDate(version.buildDate)}
                        </span>
                      </dd>
                    </dl>
                  </FieldRow>

                  <FieldRow padding="none">
                    <dl className="opc-about-dialog__info-row" data-opc-component="about-dialog" data-opc-part="infoRow">
                      <dt className="opc-about-dialog__info-label" data-opc-component="about-dialog" data-opc-part="infoLabel">
                        <span>{t('about.commit')}</span>
                      </dt>
                      <dd className="opc-about-dialog__info-value-group">
                        <span
                          className="opc-about-dialog__info-value opc-about-dialog__info-value--mono"
                          data-opc-component="about-dialog"
                          data-opc-part="infoValue"
                        >
                          {version.gitCommit ?? t('about.notAvailable')}
                        </span>
                        {version.gitCommit ? (
                          <span
                            className="opc-about-dialog__copy-action"
                            data-opc-component="about-dialog"
                            data-opc-part="copyButton"
                          >
                            <Tooltip content={t('about.copy')}>
                              <IconButton
                                size="xs"
                                variant="quiet"
                                icon={<Icon name={copiedItem === 'commit' ? 'check-line' : 'duplicate'} size="sm" />}
                                onClick={() => void copyToClipboard(version.gitCommit ?? '', 'commit')}
                                aria-label={t('about.copyCommit')}
                              />
                            </Tooltip>
                          </span>
                        ) : null}
                      </dd>
                    </dl>
                  </FieldRow>

                  <FieldRow padding="none">
                    <dl className="opc-about-dialog__info-row" data-opc-component="about-dialog" data-opc-part="infoRow">
                      <dt className="opc-about-dialog__info-label" data-opc-component="about-dialog" data-opc-part="infoLabel">
                        <span>{t('about.branch')}</span>
                      </dt>
                      <dd className="opc-about-dialog__info-value-group">
                        <span
                          className="opc-about-dialog__info-value"
                          data-opc-component="about-dialog"
                          data-opc-part="infoValue"
                          data-testid="about-branch-value"
                          title={version.gitBranch}
                        >
                          {version.gitBranch ?? t('about.notAvailable')}
                        </span>
                      </dd>
                    </dl>
                  </FieldRow>

                  <FieldRow padding="none">
                    <dl className="opc-about-dialog__info-row" data-opc-component="about-dialog" data-opc-part="infoRow">
                      <dt className="opc-about-dialog__info-label" data-opc-component="about-dialog" data-opc-part="infoLabel">
                        <span>{t('about.license')}</span>
                      </dt>
                      <dd className="opc-about-dialog__info-value-group">
                        <span
                          className="opc-about-dialog__info-value"
                          data-opc-component="about-dialog"
                          data-opc-part="license"
                          data-testid="about-license-value"
                        >
                          {licenseName}
                        </span>
                      </dd>
                    </dl>
                  </FieldRow>
                </FieldGroup>

              </section>
            </div>

            <footer
              className="opc-about-dialog__footer"
              data-opc-component="about-dialog"
              data-opc-part="footer"
            >
              <div
                className="opc-about-dialog__star-callout"
                data-opc-component="about-dialog"
                data-opc-part="starCallout"
                role="group"
                aria-labelledby="opc-about-star-title"
              >
                <div className="opc-about-dialog__star-copy">
                  <h3 id="opc-about-star-title" className="opc-about-dialog__star-title">
                    {t('about.githubStarTitle')}
                  </h3>
                  <p className="opc-about-dialog__star-description">
                    {t('about.githubStarDescription')}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="opc-about-dialog__star-button"
                  leadingIcon={<Icon name="star" size="sm" aria-hidden="true" />}
                  onClick={handleGithubStar}
                  data-testid="about-github-star"
                >
                  {t('about.githubStarAction')}
                </Button>
              </div>
              <p
                className="opc-about-dialog__copyright"
                data-opc-component="about-dialog"
                data-opc-part="copyright"
              >
                {legalCopyright}
              </p>
            </footer>
          </div>
        </DialogBody>
      </Dialog>

    </>
  );
};

export default AboutDialog;
