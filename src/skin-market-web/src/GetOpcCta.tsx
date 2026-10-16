import { ArrowRight, Download as DownloadSimple } from 'lucide-react';
import type { Translate } from './i18n';
import { OPC_DOWNLOAD_URL } from './links';

// An appearance package only applies inside the desktop client, so the catalog
// and every listing carry the same visible route to the official download page.
export type GetOpcPlacement = 'catalog' | 'listing';

export function GetOpcCta({
  placement,
  t,
}: {
  placement: GetOpcPlacement;
  t: Translate;
}) {
  return (
    <a
      className={`get-opc get-opc--${placement}`}
      href={OPC_DOWNLOAD_URL}
      target="_blank"
      rel="noreferrer"
    >
      <span className="get-opc__icon">
        <DownloadSimple size={20} aria-hidden="true" />
      </span>
      <span className="get-opc__copy">
        <strong>{t('getOpcTitle')}</strong>
        <span>
          {t(placement === 'listing' ? 'getOpcListingNote' : 'getOpcCatalogNote')}
        </span>
        <span className="get-opc__action">
          {t('getOpcAction')}
          <ArrowRight size={17} aria-hidden="true" />
        </span>
      </span>
    </a>
  );
}
