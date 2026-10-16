import type { MarketSubmissionDraftRequest } from '@/infrastructure/api/service-api/MiniAppMarketAPI';

export function createEmptyMarketSubmissionDraft(): MarketSubmissionDraftRequest {
  return {
    slug: '',
    releaseNumber: 1,
    name: '',
    description: '',
    icon: 'box',
    category: 'other',
    tags: [],
    minOpcVersion: '',
    changelog: '',
    license: { spdxExpression: 'MIT' },
  };
}

export function applyCurrentClientVersionDefault(
  draft: MarketSubmissionDraftRequest,
  currentClientVersion: string,
): MarketSubmissionDraftRequest {
  if (draft.minOpcVersion.trim() || !currentClientVersion.trim()) {
    return draft;
  }
  return {
    ...draft,
    minOpcVersion: currentClientVersion.trim(),
  };
}
