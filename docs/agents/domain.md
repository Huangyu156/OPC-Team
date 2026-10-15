# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Confirmed layout: single-context

This repo uses the **single-context** layout: one repository, one root `CONTEXT.md`, with architecture decisions recorded in `docs/adr/`. `CONTEXT-MAP.md` and per-subproject `CONTEXT.md` files are deliberately not created; they appear only lazily, when the first glossary entries or decisions are actually written down.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root (single-context layout, see above)
- **`docs/adr/`**: read ADRs that touch the area you're about to work in

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT.md          ← created lazily, on the first real glossary entry
├── docs/adr/
│   ├── 0001-some-decision.md
│   └── 0002-another-decision.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (…), but worth reopening because…_
