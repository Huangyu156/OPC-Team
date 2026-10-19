import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { knowledgeSceneAppearanceDescriptor } from './appearance';

function readSibling(filename: string): string {
  return readFileSync(
    fileURLToPath(new URL(filename, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

describe('Knowledge scene presentation', () => {
  it('exposes the scene Appearance surface on an intrinsic root node', () => {
    const source = readSibling('./KnowledgeScene.tsx');

    expect(knowledgeSceneAppearanceDescriptor.id).toBe('knowledge');
    expect(source).toContain('data-opc-scene="knowledge"');
    expect(source).toContain('data-opc-part="root"');
    // The surface id has to appear as a literal on the same intrinsic node.
    expect(source).toMatch(
      /<div\s+className="opc-knowledge-scene"\s+data-opc-scene="knowledge"\s+data-opc-part="root"/,
    );
  });

  it('asks for a full entry page instead of rendering the default listing', () => {
    const source = readSibling('./KnowledgeScene.tsx');

    expect(source).toContain('const ENTRY_LIST_LIMIT = 200;');
    expect(source.match(/limit: ENTRY_LIST_LIMIT,/g)).toHaveLength(2);
  });

  it('keeps audit ledger reasons machine-written rather than localized UI copy', () => {
    const source = readSibling('./KnowledgeScene.tsx');

    // Ledger rows are append-only audit records; a localized `reason` would make
    // the same event read differently per UI language.
    expect(source).not.toMatch(/reason:\s*t\(/);
    expect(source).not.toContain('reasonHuman');
  });

  it('offers the two retrieval channels as an exclusive pick instead of merging them', () => {
    const source = readSibling('./KnowledgeScene.tsx');

    // The operator picks one channel; the scene never asks for both and merges.
    expect(source).toContain('<SegmentedControl');
    expect(source).toContain("value: 'substring'");
    expect(source).toContain("value: 'full_text'");
    expect(source).not.toContain('channel: \'auto\'');
  });

  it('refuses a query the chosen full-text channel cannot index', () => {
    const source = readSibling('./KnowledgeScene.tsx');

    // The store's trigram floor is enforced before the round trip so the
    // operator gets an explanation instead of an empty result.
    expect(source).toContain('const TRIGRAM_MIN_TERM_CHARS = 3;');
    expect(source).toContain("channel === 'full_text'");
    expect(source).toContain("t('entries.fullTextNeedsLongerTerms'");
  });

  it('declares every Appearance part it renders and no phantom ones', () => {
    const source = readSibling('./KnowledgeScene.tsx');
    const declaredParts = new Set(knowledgeSceneAppearanceDescriptor.parts.map((part) => part.id));
    const renderedParts = new Set(
      Array.from(source.matchAll(/data-opc-part="([a-zA-Z0-9]+)"/g), (match) => match[1]),
    );

    expect(renderedParts.size).toBeGreaterThanOrEqual(4);
    for (const part of renderedParts) {
      expect(declaredParts.has(part)).toBe(true);
    }
  });

  it('styles the scene from design-system tokens only', () => {
    const stylesheet = readSibling('./KnowledgeScene.scss');

    expect(stylesheet).toContain('container: knowledge-scene / inline-size;');
    expect(stylesheet).toContain('var(--opcteam-color-surface-scene)');
    expect(stylesheet).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(stylesheet).not.toMatch(/font-size:\s*\d/);
  });
});
