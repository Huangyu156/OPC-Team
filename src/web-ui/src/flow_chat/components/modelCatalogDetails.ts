/**
 * Catalog details a configured model can borrow for its menu row.
 *
 * The model menu lists the user's own configuration entries, which carry only a
 * name, a provider and a context window. models.dev knows more about the same
 * model — a one-line description and a list price — and the menu is where a
 * person compares models, so that knowledge belongs on the row.
 *
 * Matching is deliberately conservative: a provider the built-in templates do
 * not recognize, or a model the catalog does not list, resolves to no details
 * at all. A name-only row beats an invented description.
 */

import type { ProviderCatalogModel, ProviderCatalogProvider } from '@/infrastructure/api/service-api/AIApi';
import { matchProviderCatalogItemByBaseUrl } from '@/infrastructure/config/services/providerCatalog';

/** The catalog facts one menu row can show. Every member is optional. */
export interface ModelCatalogDetails {
  /** models.dev's own one-line summary for the model. */
  description?: string;
  /**
   * This model's input price as a fraction of the priciest chat model its
   * provider catalog lists. `0.1` reads "a tenth of the flagship".
   */
  priceRatio?: number;
  /** Raw catalog prices for the row's tooltip. USD per million tokens. */
  inputPrice?: number;
  outputPrice?: number;
}

/** The members of `ProviderCatalogModel` this module reads. */
type CatalogModelLike = Pick<ProviderCatalogModel, 'id' | 'description' | 'capabilities' | 'pricing'>;

const parsePrice = (value?: string): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const isChatModel = (model: CatalogModelLike): boolean => model.capabilities?.chat !== false;

/**
 * The priciest input price among a catalog provider's chat models.
 *
 * A ratio needs one shared reference or the numbers cannot be compared across
 * rows, and the flagship is the reference a reader already holds: "a tenth of
 * the expensive one" needs no explanation, while "a tenth of the cheapest"
 * would move whenever a cheaper model ships.
 */
function referenceInputPrice(models: readonly CatalogModelLike[]): number | undefined {
  let reference: number | undefined;
  for (const model of models) {
    if (!isChatModel(model)) continue;
    const price = parsePrice(model.pricing?.input);
    if (price !== undefined && (reference === undefined || price > reference)) reference = price;
  }
  return reference;
}

/**
 * Resolve the catalog details for one configured model.
 *
 * @param modelName - the configured model's wire name (`AIModelConfig.model_name`).
 * @param catalogModels - the catalog models of the provider the model belongs to.
 */
export function resolveModelCatalogDetails(
  modelName: string | undefined,
  catalogModels: readonly CatalogModelLike[] | undefined,
): ModelCatalogDetails {
  if (!modelName || !catalogModels?.length) return {};

  const entry = catalogModels.find(model => model.id === modelName);
  if (!entry) return {};

  const description = entry.description?.trim();
  const inputPrice = parsePrice(entry.pricing?.input);
  const outputPrice = parsePrice(entry.pricing?.output);
  const reference = referenceInputPrice(catalogModels);

  return {
    ...(description ? { description } : {}),
    ...(inputPrice !== undefined && reference !== undefined
      ? { priceRatio: inputPrice / reference, inputPrice, outputPrice }
      : {}),
  };
}

/**
 * Find the catalog provider a configured model's base URL belongs to.
 *
 * @param baseUrl - the configured model's base URL.
 * @param providers - the catalog's providers.
 */
export function findCatalogProviderByBaseUrl(
  baseUrl: string | undefined,
  providers: readonly ProviderCatalogProvider[] | undefined,
): ProviderCatalogProvider | undefined {
  if (!baseUrl || !providers?.length) return undefined;
  const template = matchProviderCatalogItemByBaseUrl(baseUrl);
  if (!template) return undefined;
  return providers.find(provider => provider.id === template.id);
}

/**
 * Format a price ratio the way the row prints it: one or two significant
 * decimals, never a trailing zero, so 0.10 reads `0.1` and 0.25 reads `0.25`.
 */
export function formatPriceRatio(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '';
  const rounded = ratio >= 0.1 ? Math.round(ratio * 100) / 100 : Math.round(ratio * 1000) / 1000;
  return String(rounded);
}
