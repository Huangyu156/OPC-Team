import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GetOpcCta, type GetOpcPlacement } from './GetOpcCta';
import type { Translate } from './i18n';
import { OPC_DOWNLOAD_URL } from './links';

const t = ((key: string) => key) as Translate;

describe('GetOpcCta', () => {
  it.each<GetOpcPlacement>(['catalog', 'listing'])(
    'sends %s visitors to the official download page',
    (placement) => {
      const markup = renderToStaticMarkup(<GetOpcCta placement={placement} t={t} />);

      expect(markup).toContain(`href="${OPC_DOWNLOAD_URL}"`);
      expect(markup).toContain('rel="noreferrer"');
      expect(markup).toContain('getOpcTitle');
      expect(markup).toContain('getOpcAction');
    },
  );

  it('explains the surface the visitor is actually looking at', () => {
    expect(renderToStaticMarkup(<GetOpcCta placement="listing" t={t} />))
      .toContain('getOpcListingNote');
    expect(renderToStaticMarkup(<GetOpcCta placement="catalog" t={t} />))
      .toContain('getOpcCatalogNote');
  });
});
