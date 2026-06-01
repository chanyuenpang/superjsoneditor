# React Embedding Guide

`super-json-editor` can now be embedded as a React component without depending on the demo app or the local Vite save endpoint.

## Public entrypoints

```ts
import { EditorShell, type EditorDocuments, type EditorHost } from "super-json-editor";
import "super-json-editor/styles.css";
```

## Minimal integration

```tsx
import { useState } from "react";
import { EditorShell, type EditorDocuments } from "super-json-editor";
import "super-json-editor/styles.css";

const initialDocuments: EditorDocuments = {
  main: {
    title: "Super JSON Editor",
    profile: {
      name: "Hero",
      stats: {
        hp: 10,
      },
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

## Host contract

- `documents`: a `Record<string, unknown>` keyed by source id.
- `rootSourceId`: the source that should be treated as the real root.
- `onSave(documents)`: called when the user clicks `Save`. Return the saved documents if the host normalizes or rewrites data.
- `onReload()`: optional. If omitted, `Reload` restores the last in-memory saved snapshot.
- `readOnly`: optional. Disables all mutation controls while keeping navigation available.

## Reference example

```tsx
import { EditorShell, type EditorDocuments, type EditorHost } from "super-json-editor";

const documents: EditorDocuments = {
  main: {
    title: "Campaign",
    activeQuest: { $ref: "quests/intro" },
  },
  "quests/intro": {
    id: "intro",
    title: "Light the First Beacon",
  },
};

const host: EditorHost = {
  isReferenceNode(value) {
    return Boolean(value && typeof value === "object" && "$ref" in (value as Record<string, unknown>));
  },
  getReferenceLabel(value) {
    return String((value as { $ref: string }).$ref);
  },
  resolveReferenceTarget(value, sourceDocuments) {
    const sourceId = String((value as { $ref: string }).$ref);
    return {
      sourceId,
      path: [],
      value: sourceDocuments[sourceId],
    };
  },
};

export function ReferencedEditor() {
  return <EditorShell documents={documents} host={host} onSave={async () => undefined} rootSourceId="main" />;
}
```

## Demo adapter

The repo demo keeps its local file save behavior outside the editor core:

- The demo app uses `src/demo/saveDemoSources.ts` as a host-side adapter.
- The editor itself no longer calls `fetch("/__save-demo-sources")`.
- Any real host can replace that adapter with API calls, filesystem writes, or in-memory persistence.
