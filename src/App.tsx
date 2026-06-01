import { EditorShell, type EditorDocuments } from "./editor/EditorShell";
import type { EditorHost } from "./editor/host";
import heroDocument from "./demo-sources/characters/hero.json";
import guideDocument from "./demo-sources/characters/guide.json";
import wolfPackDocument from "./demo-sources/encounters/wolf-pack.json";
import shadowEyeDocument from "./demo-sources/encounters/shadow-eye.json";
import ironSwordDocument from "./demo-sources/items/iron-sword.json";
import mainDocument from "./demo-sources/main.json";
import moonCharmDocument from "./demo-sources/items/moon-charm.json";
import introQuestDocument from "./demo-sources/quests/intro.json";
import { DEMO_ROOT_SOURCE_ID } from "./demo-sources/manifest";
import { saveDemoSources } from "./demo/saveDemoSources";

const demoDocuments: Record<string, unknown> = {
  main: mainDocument,
  "items/iron-sword": ironSwordDocument,
  "items/moon-charm": moonCharmDocument,
  "quests/intro": introQuestDocument,
  "encounters/wolf-pack": wolfPackDocument,
  "encounters/shadow-eye": shadowEyeDocument,
  "characters/hero": heroDocument,
  "characters/guide": guideDocument,
};

const demoHost: EditorHost = {
  isReferenceNode(value) {
    return Boolean(value && typeof value === "object" && "$ref" in (value as Record<string, unknown>));
  },
  getReferenceLabel(value) {
    return String((value as { $ref: string }).$ref);
  },
  resolveReferenceTarget(value, documents) {
    const key = (value as { $ref: string }).$ref;
    return {
      sourceId: key,
      path: [],
      value: documents[key] ?? { missing: true, $ref: key },
    };
  },
};

export function App() {
  return (
    <EditorShell
      documents={demoDocuments}
      host={demoHost}
      onSave={handleDemoSave}
      rootSourceId={DEMO_ROOT_SOURCE_ID}
    />
  );
}

async function handleDemoSave(documents: EditorDocuments) {
  await saveDemoSources(documents);
  return documents;
}
