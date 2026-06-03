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

const deployedDemoSaveMessage = "Save only works in local development. Changes in the deployed demo will not persist.";

const demoDocuments: Record<string, unknown> = {
  main: mainDocument,
  "asset://items/iron-sword.json": ironSwordDocument,
  "asset://items/moon-charm.json": moonCharmDocument,
  "asset://quests/intro.json": introQuestDocument,
  "asset://encounters/wolf-pack.json": wolfPackDocument,
  "asset://encounters/shadow-eye.json": shadowEyeDocument,
  "asset://characters/hero.json": heroDocument,
  "asset://characters/guide.json": guideDocument,
};

const demoHost: EditorHost = {
  loadReferenceSource(uri) {
    return demoDocuments[uri];
  },
};

export function App() {
  const canPersistDemoSources = isLocalDemoSaveHost();
  return (
    <EditorShell
      documents={demoDocuments}
      host={demoHost}
      onSave={canPersistDemoSources ? handleDemoSave : undefined}
      onUnavailableSaveAttempt={canPersistDemoSources ? undefined : handleUnavailableDemoSave}
      rootSourceId={DEMO_ROOT_SOURCE_ID}
    />
  );
}

async function handleDemoSave(documents: EditorDocuments) {
  await saveDemoSources(documents);
  return documents;
}

function handleUnavailableDemoSave() {
  window.alert(deployedDemoSaveMessage);
}

function isLocalDemoSaveHost() {
  if (typeof window === "undefined") return true;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}
