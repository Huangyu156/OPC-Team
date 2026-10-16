import { ArrowRight, Download as DownloadSimple } from 'lucide-react';
import type { MessageKey } from './i18n';
import { OPC_DOWNLOAD_URL } from './links';

// A .bfminiapp package is useless without the desktop client, so the catalog
// and every listing keep one explicit path to the official download page.
export type GetOpcPlacement = 'catalog' | 'listing';

export function GetOpcCta({
  placement,
  t,
}: {
  placement: GetOpcPlacement;
  t: (key: MessageKey) => string;
}) {
  return (
    <a
      className={`get-opc get-opc-${placement}`}
      href={OPC_DOWNLOAD_URL}
      target="_blank"
      rel="noreferrer"
    >
      <span className="get-opc-icon">
        <DownloadSimple size={18} aria-hidden="true" />
      </span>
      <span className="get-opc-copy">
        <strong>{t('getOpcTitle')}</strong>
        <span>
          {t(placement === 'listing' ? 'getOpcListingNote' : 'getOpcCatalogNote')}
        </span>
        <span className="get-opc-action">
          {t('getOpcAction')}
          <ArrowRight size={18} aria-hidden="true" />
        </span>
      </span>
    </a>
  );
}
