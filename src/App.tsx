import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
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
  const [layoutMode, setLayoutMode] = useState<"stack-flow" | "pinned-root">("stack-flow");
  const [editingEnabled, setEditingEnabled] = useState(true);
  const [rawJsonEnabled, setRawJsonEnabled] = useState(true);
  return (
    <EditorShell
      documents={demoDocuments}
      host={demoHost}
      layoutMode={layoutMode}
      readOnly={!editingEnabled}
      enableRawEditor={rawJsonEnabled}
      onSave={canPersistDemoSources ? handleDemoSave : undefined}
      onUnavailableSaveAttempt={canPersistDemoSources ? undefined : handleUnavailableDemoSave}
      rootSourceId={DEMO_ROOT_SOURCE_ID}
      toolbarActions={(
        <DemoSettingsPopover
          editingEnabled={editingEnabled}
          layoutMode={layoutMode}
          rawJsonEnabled={rawJsonEnabled}
          onEditingEnabledChange={setEditingEnabled}
          onLayoutModeChange={setLayoutMode}
          onRawJsonEnabledChange={setRawJsonEnabled}
        />
      )}
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

function DemoSettingsPopover(props: {
  editingEnabled: boolean;
  layoutMode: "stack-flow" | "pinned-root";
  rawJsonEnabled: boolean;
  onEditingEnabledChange: (nextValue: boolean) => void;
  onLayoutModeChange: (nextValue: "stack-flow" | "pinned-root") => void;
  onRawJsonEnabledChange: (nextValue: boolean) => void;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="ghost-button demo-settings-trigger" type="button">
          Settings
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" className="demo-settings-popover" sideOffset={8}>
          <div className="demo-settings-panel">
            <div className="demo-settings-panel__header">
              <strong>Demo Settings</strong>
              <span>Preview editor modes without touching source code.</span>
            </div>
            <label className="demo-settings-field">
              <span>Layout mode</span>
              <select
                aria-label="Layout mode"
                className="detail-input"
                value={props.layoutMode}
                onChange={(event) => props.onLayoutModeChange(event.target.value as "stack-flow" | "pinned-root")}
              >
                <option value="stack-flow">stack-flow</option>
                <option value="pinned-root">pinned-root</option>
              </select>
            </label>
            <label className="demo-settings-checkbox">
              <input
                aria-label="Enable editing"
                checked={props.editingEnabled}
                type="checkbox"
                onChange={(event) => props.onEditingEnabledChange(event.target.checked)}
              />
              <span>Enable editing</span>
            </label>
            <label className="demo-settings-checkbox">
              <input
                aria-label="Enable raw JSON"
                checked={props.rawJsonEnabled}
                type="checkbox"
                onChange={(event) => props.onRawJsonEnabledChange(event.target.checked)}
              />
              <span>Enable raw JSON</span>
            </label>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
