# Super JSON Editor

Super JSON Editor is a reusable, embeddable generic JSON editor.

The product goal is straightforward:

1. Build a generic JSON editor that can be embedded into arbitrary web projects
2. Reach a product-grade interaction and visual quality modeled after `Nocturne`'s `data-editor`

This repository is for the generic editor itself.
Host-project-specific rules should stay outside this repo.

## What It Ships

The editor now ships as a React component package with:

- stack-based object / array / primitive navigation
- multi-source document editing
- host-resolved `$ref` navigation
- in-memory dirty tracking
- host-driven `Save` / `Reload`
- optional read-only mode

The demo app in this repo is only a host example.
The editor core no longer depends on the demo save endpoint.

## Package Entry

```ts
import { EditorShell, type EditorDocuments, type EditorHost } from "super-json-editor";
import "super-json-editor/styles.css";
```

## Minimal React Example

```tsx
import { useState } from "react";
import { EditorShell, type EditorDocuments } from "super-json-editor";
import "super-json-editor/styles.css";

const initialDocuments: EditorDocuments = {
  main: {
    title: "Super JSON Editor",
    profile: {
      name: "Hero",
      stats: { hp: 10 },
    },
  },
};

export function JsonEditorHost() {
  const [documents, setDocuments] = useState(initialDocuments);

  return (
    <EditorShell
      documents={documents}
      rootSourceId="main"
      onSave={async (nextDocuments) => {
        await persistDocuments(nextDocuments);
        setDocuments(nextDocuments);
        return nextDocuments;
      }}
      onReload={async () => {
        const latest = await loadDocuments();
        setDocuments(latest);
        return latest;
      }}
    />
  );
}
```

## Host Responsibilities

- Provide `documents` as `Record<string, unknown>`
- Choose the real root with `rootSourceId`
- Implement persistence in `onSave`
- Optionally provide authoritative reload behavior in `onReload`
- Provide ref resolution and labels through `EditorHost` when needed

## Integration Guide

- [React Embedding Guide](docs/integration/react-embedding.md)

## Current Stage

The project is currently in `Phase 1: Interaction Convergence`.

That means:

- The editor shell is implemented and runnable
- The stack navigation model exists
- Array, object, primitive, and reference editing flows already exist in working form
- The current focus is making the interaction model feel correct and mature

The project is no longer only in a spec phase.
It is also not yet in a stable product-foundation phase, because core interaction semantics are still being refined.

## Documents

- [Project Scope](docs/specs/2026-06-01-project-scope.md)
- [V1 Spec Draft](docs/specs/2026-06-01-v1-spec-draft.md)
- [Technical Design](docs/specs/2026-06-01-technical-design.md)
- [Product Roadmap](docs/plans/2026-06-01-product-roadmap.md)
