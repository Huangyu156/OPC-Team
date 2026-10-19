import { describe, expect, it } from 'vitest';
import type { ProviderCatalogProvider } from '@/infrastructure/api/service-api/AIApi';
import {
  findCatalogProviderByBaseUrl,
  formatPriceRatio,
  resolveModelCatalogDetails,
} from './modelCatalogDetails';

const catalogModel = (overrides: Record<string, unknown> = {}) => ({
  id: 'model-a',
  description: 'A model that answers quickly.',
  recommended: false,
  source: 'models_dev' as const,
  capabilities: {
    chat: true,
    tool_call: true,
    reasoning: false,
    attachment: false,
    structured_output: false,
  },
  pricing: { input: '0.5', output: '2' },
  ...overrides,
});

const provider = (models: unknown[]): ProviderCatalogProvider => ({
  id: 'acme',
  display_order: 0,
  name: 'Acme',
  description: 'Acme models',
  requires_api_key: true,
  endpoints: [],
  models: models as ProviderCatalogProvider['models'],
});

describe('resolveModelCatalogDetails', () => {
  it('reads the description and the price ratio against the priciest chat model', () => {
    const details = resolveModelCatalogDetails('model-a', [
      catalogModel({ id: 'model-a', pricing: { input: '0.5', output: '2' } }),
      catalogModel({ id: 'model-flagship', pricing: { input: '2', output: '8' } }),
    ]);

    expect(details.description).toBe('A model that answers quickly.');
    expect(details.priceRatio).toBe(0.25);
    expect(details.inputPrice).toBe(0.5);
    expect(details.outputPrice).toBe(2);
  });

  it('leaves a model the catalog does not list with no details at all', () => {
    expect(resolveModelCatalogDetails('unlisted', [catalogModel()])).toEqual({});
  });

  it('keeps the description when the catalog carries no price', () => {
    const details = resolveModelCatalogDetails('model-a', [
      catalogModel({ pricing: undefined }),
    ]);

    expect(details.description).toBe('A model that answers quickly.');
    expect(details.priceRatio).toBeUndefined();
  });

  it('keeps the price when the catalog carries no description', () => {
    const details = resolveModelCatalogDetails('model-a', [
      catalogModel({ description: '   ', pricing: { input: '1' } }),
      catalogModel({ id: 'model-flagship', pricing: { input: '4' } }),
    ]);

    expect(details.description).toBeUndefined();
    expect(details.priceRatio).toBe(0.25);
  });

  it('ignores non-chat models when choosing the reference price', () => {
    const details = resolveModelCatalogDetails('model-a', [
      catalogModel({ id: 'model-a', pricing: { input: '1' } }),
      catalogModel({
        id: 'embedding',
        capabilities: {
          chat: false,
          tool_call: false,
          reasoning: false,
          attachment: false,
          structured_output: false,
        },
        pricing: { input: '100' },
      }),
    ]);

    expect(details.priceRatio).toBe(1);
  });

  it('returns nothing without a model name or a catalog', () => {
    expect(resolveModelCatalogDetails(undefined, [catalogModel()])).toEqual({});
    expect(resolveModelCatalogDetails('model-a', [])).toEqual({});
    expect(resolveModelCatalogDetails('model-a', undefined)).toEqual({});
  });
});

describe('findCatalogProviderByBaseUrl', () => {
  it('resolves a known provider URL through the shared template matcher', () => {
    const providers = [provider([catalogModel()]), { ...provider([]), id: 'deepseek', name: 'DeepSeek' }];
    const matched = findCatalogProviderByBaseUrl('https://api.deepseek.com/v1/chat/completions', providers);
    expect(matched?.id).toBe('deepseek');
  });

  it('resolves nothing for a URL no built-in template claims', () => {
    expect(findCatalogProviderByBaseUrl('https://models.example.invalid/v1', [provider([])])).toBeUndefined();
  });

  it('resolves nothing without a URL or providers', () => {
    expect(findCatalogProviderByBaseUrl(undefined, [provider([])])).toBeUndefined();
    expect(findCatalogProviderByBaseUrl('https://api.deepseek.com', undefined)).toBeUndefined();
  });
});

describe('formatPriceRatio', () => {
  it('prints one or two decimals without a trailing zero', () => {
    expect(formatPriceRatio(0.1)).toBe('0.1');
    expect(formatPriceRatio(0.25)).toBe('0.25');
    expect(formatPriceRatio(1)).toBe('1');
    expect(formatPriceRatio(0.045)).toBe('0.045');
  });

  it('refuses ratios a row cannot print', () => {
    expect(formatPriceRatio(0)).toBe('');
    expect(formatPriceRatio(-1)).toBe('');
    expect(formatPriceRatio(Number.NaN)).toBe('');
  });
});
