import { useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { EditorShell, type EditorDocuments } from "./editor/EditorShell";
import type { EditorHost } from "./editor/host";
import type { EditorSchema, EditorSchemaHost } from "./editor/schema";
import heroDocument from "./demo-sources/characters/hero.json";
import guideDocument from "./demo-sources/characters/guide.json";
import shadowEyeDocument from "./demo-sources/encounters/shadow-eye.json";
import wolfPackDocument from "./demo-sources/encounters/wolf-pack.json";
import ironSwordDocument from "./demo-sources/items/iron-sword.json";
import moonCharmDocument from "./demo-sources/items/moon-charm.json";
import mainDocument from "./demo-sources/main.json";
import introQuestDocument from "./demo-sources/quests/intro.json";
import { DEMO_ROOT_SOURCE_ID } from "./demo-sources/manifest";
import { saveDemoSources } from "./demo/saveDemoSources";

const deployedDemoSaveMessage = "Save only works in local development. Changes in the deployed demo will not persist.";

const freeJsonDocuments: Record<string, unknown> = {
  main: mainDocument,
  "asset://items/iron-sword.json": ironSwordDocument,
  "asset://items/moon-charm.json": moonCharmDocument,
  "asset://quests/intro.json": introQuestDocument,
  "asset://encounters/wolf-pack.json": wolfPackDocument,
  "asset://encounters/shadow-eye.json": shadowEyeDocument,
  "asset://characters/hero.json": heroDocument,
  "asset://characters/guide.json": guideDocument,
};

const schemaAuthoringDocuments: Record<string, unknown> = {
  "schema-authoring": [
    {
      id: "quest_001",
      title: "Wake The Beacon",
      status: "draft",
      owner: "Guide",
      description: "Meet the guide at the old signal tower and restore the beacon before nightfall.",
    },
    {
      id: "quest_002",
      title: "Moonlit Bargain",
      status: "review",
      owner: "Archivist",
      description: "Negotiate with the moon merchant and document every trade rule in the ledger.",
    },
    {
      id: "quest_003",
      title: "Silent Crossing",
      status: "live",
      owner: "Scout",
      description: "Escort the caravan through the quiet marsh while keeping every lantern hidden.",
    },
  ],
};

const referenceProjectionDocuments: Record<string, unknown> = {
  "reference-projection": [
    "asset://items/iron-sword.json",
    "asset://items/moon-charm.json",
  ],
  "asset://items/iron-sword.json": ironSwordDocument,
  "asset://items/moon-charm.json": moonCharmDocument,
};

const selectAndTagsDocuments: Record<string, unknown> = {
  "select-tags": {
    rarity: "rare",
    tags: ["fire", "boss"],
    faction: "moon",
    reward: "asset://items/moon-charm.json",
    note: null,
  },
  "asset://items/moon-charm.json": moonCharmDocument,
  "asset://schema-data/factions.json": [
    { id: "moon", name: "Moon Court", color: "blue" },
    { id: "guild", name: "Guild Union", color: "gold" },
    { id: "wild", name: "Wild Chorus", color: "green" },
  ],
};

const freeJsonHost: EditorHost = {
  loadReferenceSource(uri) {
    return freeJsonDocuments[uri];
  },
};

const referenceProjectionHost: EditorHost = {
  loadReferenceSource(uri) {
    return referenceProjectionDocuments[uri];
  },
};

const selectAndTagsHost: EditorHost = {
  loadReferenceSource(uri) {
    return selectAndTagsDocuments[uri] ?? referenceProjectionDocuments[uri] ?? freeJsonDocuments[uri];
  },
};

const schemaAuthoringSchemaHost = createMutableSchemaHost({
  "schema-authoring": {
    type: "array",
    "x-editor": {
      table: {
        columns: [
          { key: "title", label: "Quest", sortable: true },
          { key: "id", label: "Quest ID" },
          { key: "status", sortable: true },
          { key: "description", wrap: true },
        ],
      },
    },
    items: {
      type: "object",
      properties: {
        title: { type: "string", title: "Quest" },
        id: { type: "string", title: "Quest ID" },
        status: {
          type: "string",
          title: "Status",
          "x-editor": {
            fieldType: "select",
            options: [
              { value: "draft", label: "Draft", color: "gray" },
              { value: "review", label: "Review", color: "yellow" },
              { value: "live", label: "Live", color: "green" },
            ],
          },
        },
        owner: { type: "string", title: "Owner" },
        description: { type: "string", title: "Description" },
      },
    },
  },
});

const rewardItemSchema: EditorSchema = {
  type: "object",
  properties: {
    id: { type: "string", title: "ID" },
    kind: { type: "string", title: "Kind" },
    name: { type: "string", title: "Name" },
    damage: {
      type: "object",
      title: "Damage",
      properties: {
        min: { type: "integer", title: "Min" },
        max: { type: "integer", title: "Max" },
      },
    },
    bonus: {
      type: "object",
      title: "Bonus",
      properties: {
        manaRegen: { type: "integer", title: "Mana Regen" },
      },
      additionalProperties: { type: "integer" },
    },
    boundEncounter: {
      type: "string",
      title: "Bound Encounter",
      "x-editor": {
        reference: {
          target: { schemaRef: "encounter" },
          view: { layout: "inline", schemaRef: "encounter_row" },
        },
      },
    },
  },
};

const rewardItemRowSchema: EditorSchema = {
  type: "object",
  properties: {
    id: {
      type: "string",
      title: "ID",
      "x-editor": {
        projection: { path: ["id"] },
      },
    },
    kind: {
      type: "string",
      title: "Kind",
      "x-editor": {
        projection: { path: ["kind"] },
      },
    },
    name: {
      type: "string",
      title: "Name",
      "x-editor": {
        projection: { path: ["name"] },
      },
    },
    boundEncounter: {
      type: "string",
      title: "Bound Encounter",
      "x-editor": {
        projection: { path: ["boundEncounter"] },
      },
    },
  },
};

const encounterSchema: EditorSchema = {
  type: "object",
  properties: {
    id: { type: "string", title: "ID" },
    kind: { type: "string", title: "Kind" },
    enemies: {
      type: "array",
      title: "Enemies",
      items: { type: "string" },
    },
  },
};

const encounterRowSchema: EditorSchema = {
  type: "object",
  properties: {
    id: {
      type: "string",
      title: "ID",
      "x-editor": {
        projection: { path: ["id"] },
      },
    },
    kind: {
      type: "string",
      title: "Kind",
      "x-editor": {
        projection: { path: ["kind"] },
      },
    },
  },
};

const referenceProjectionSchemaHost = createMutableSchemaHost(
  {
    "reference-projection": {
      type: "array",
      "x-editor": {
        table: {
          columns: [
            { field: ["name"], label: "Name" },
            { field: ["kind"] },
          ],
        },
      },
      items: {
        type: "string",
        "x-editor": {
          reference: {
            target: { schemaRef: "reward_item" },
            view: { layout: "inline", schemaRef: "reward_item_row" },
          },
        },
      },
    },
    "asset://items/iron-sword.json": rewardItemSchema,
    "asset://items/moon-charm.json": rewardItemSchema,
    "asset://encounters/shadow-eye.json": encounterSchema,
    "asset://encounters/wolf-pack.json": encounterSchema,
  },
  {
    reward_item: rewardItemSchema,
    reward_item_row: rewardItemRowSchema,
    encounter: encounterSchema,
    encounter_row: encounterRowSchema,
  },
);

const selectAndTagsSchemaHost = createMutableSchemaHost(
  {
    "select-tags": {
      type: "object",
      properties: {
        rarity: {
          type: "string",
          title: "Rarity",
          "x-editor": {
            fieldType: "select",
            options: [
              { value: "common", label: "Common", color: "gray" },
              { value: "rare", label: "Rare", color: "blue" },
              { value: "legendary", label: "Legendary", color: "gold" },
            ],
          },
        },
        tags: {
          type: "array",
          items: { type: "string" },
          title: "Tags",
          "x-editor": {
            fieldType: "multi-select",
            options: [
              { value: "fire", label: "Fire", color: "red" },
              { value: "boss", label: "Boss", color: "gold" },
              { value: "elite", label: "Elite", color: "blue" },
            ],
          },
        },
        faction: {
          type: "string",
          title: "Faction",
          "x-editor": {
            fieldType: "select",
            optionsSource: {
              kind: "json-file",
              uri: "asset://schema-data/factions.json",
              valueField: "id",
              labelField: "name",
              colorField: "color",
            },
          },
        },
        reward: {
          type: "string",
          title: "Reward",
          "x-editor": {
            reference: {
              target: { schemaRef: "reward_item" },
              view: { layout: "inline", schemaRef: "reward_item_row" },
            },
          },
        },
        note: {
          type: ["string", "null"],
          title: "Note",
        },
      },
    },
    "asset://items/moon-charm.json": rewardItemSchema,
  },
  {
    reward_item: rewardItemSchema,
    reward_item_row: rewardItemRowSchema,
    encounter: encounterSchema,
    encounter_row: encounterRowSchema,
  },
);

type DemoScenario = {
  id: string;
  title: string;
  mode: "schema" | "free";
  eyebrow: string;
  summary: string;
  note: string;
  features: string[];
  documents: EditorDocuments;
  rootSourceId: string;
  host?: EditorHost;
  schemaHost?: EditorSchemaHost;
};

const demoScenarios: DemoScenario[] = [
  {
    id: "schema-authoring",
    title: "Schema Authoring Table",
    mode: "schema",
    eyebrow: "Schema mode",
    summary: "A root array that treats headers as view-schema controls instead of plain JSON rendering.",
    note: "Default table columns",
    features: [
      "Drag headers to rewrite default column order.",
      "Rename, resize, wrap, and hide columns from the header itself.",
      "Open a row to continue authoring field order inside object detail.",
    ],
    documents: schemaAuthoringDocuments,
    rootSourceId: "schema-authoring",
    schemaHost: schemaAuthoringSchemaHost,
  },
  {
    id: "reference-projection",
    title: "Reference Projection",
    mode: "schema",
    eyebrow: "Schema mode",
    summary: "File references become schema-defined projection tables, without pulling in record IDs or relation graphs.",
    note: "Projection columns and reference previews",
    features: [
      "Reference arrays render as tables from named view schemas.",
      "Projection columns can still be shown, hidden, renamed, and reordered.",
      "Opening a referenced document stays inside the same schema vocabulary.",
    ],
    documents: referenceProjectionDocuments,
    rootSourceId: "reference-projection",
    host: referenceProjectionHost,
    schemaHost: referenceProjectionSchemaHost,
  },
  {
    id: "select-and-tags",
    title: "Select And Tags",
    mode: "schema",
    eyebrow: "Schema mode",
    summary: "Selects and tags validate against schema-defined option sets while saving literal values back to JSON.",
    note: "Literal values, schema-defined options",
    features: [
      "Inline options support labels, colors, creation, reordering, and deletion.",
      "JSON-backed option sources drive validation and display without becoming references.",
      "Nullable fields and reference previews still work in the same object page.",
    ],
    documents: selectAndTagsDocuments,
    rootSourceId: "select-tags",
    host: selectAndTagsHost,
    schemaHost: selectAndTagsSchemaHost,
  },
  {
    id: "free-json",
    title: "Free JSON Explorer",
    mode: "free",
    eyebrow: "Free mode",
    summary: "The original untyped multi-document explorer stays available so the contrast with schema mode is explicit.",
    note: "No schema, raw structure-first navigation",
    features: [
      "Traverse mixed objects, arrays, and references without a schema contract.",
      "This keeps the editor useful for broad JSON inspection and cleanup work.",
      "Local save support still follows the original demo-source flow on localhost.",
    ],
    documents: freeJsonDocuments,
    rootSourceId: DEMO_ROOT_SOURCE_ID,
    host: freeJsonHost,
  },
];

export function App() {
  const canPersistDemoSources = isLocalDemoSaveHost();
  const [activeScenarioId, setActiveScenarioId] = useState("schema-authoring");
  const [layoutMode, setLayoutMode] = useState<"stack-flow" | "pinned-root">("stack-flow");
  const [editingEnabled, setEditingEnabled] = useState(true);
  const [rawJsonEnabled, setRawJsonEnabled] = useState(true);
  const activeScenario = useMemo(
    () => demoScenarios.find((scenario) => scenario.id === activeScenarioId) ?? demoScenarios[0],
    [activeScenarioId],
  );

  const saveHandler = activeScenario.id === "free-json" && canPersistDemoSources ? handleDemoSave : undefined;
  const unavailableSaveHandler = activeScenario.id === "free-json" && !canPersistDemoSources ? handleUnavailableDemoSave : undefined;

  return (
    <div className="demo-site">
      <aside className="demo-site__sidebar">
        <div className="demo-hero">
          <div className="demo-kicker">Super JSON Editor</div>
          <h1>Schema-first JSON editing</h1>
          <p>
            One demo now shows both sides of the product: broad free-form JSON exploration and
            schema-driven view authoring that changes the default editing experience.
          </p>
        </div>
        <div className="demo-pill-row" aria-label="Core capabilities">
          <span className="demo-pill">Validate JSON</span>
          <span className="demo-pill">Define views</span>
          <span className="demo-pill">Author schema</span>
        </div>
        <section className="demo-scenarios">
          <div className="demo-section-title">Playgrounds</div>
          <div className="demo-scenario-list">
            {demoScenarios.map((scenario) => (
              <button
                aria-label={scenario.title}
                aria-pressed={activeScenario.id === scenario.id}
                className={`demo-scenario-card ${activeScenario.id === scenario.id ? "is-active" : ""}`}
                key={scenario.id}
                type="button"
                onClick={() => setActiveScenarioId(scenario.id)}
              >
                <span className="demo-scenario-card__mode">{scenario.eyebrow}</span>
                <strong>{scenario.title}</strong>
                <span>{scenario.summary}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="demo-scenario-detail">
          <div className="demo-section-title">Current showcase</div>
          <div className="demo-detail-card">
            <div className="demo-detail-card__header">
              <span className={`demo-mode-chip demo-mode-chip--${activeScenario.mode}`}>{activeScenario.eyebrow}</span>
              <strong>{activeScenario.title}</strong>
            </div>
            <p>{activeScenario.note}</p>
            <ul>
              {activeScenario.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </div>
        </section>
      </aside>
      <main className="demo-site__preview">
        <div className="demo-preview-shell">
          <EditorShell
            key={activeScenario.id}
            documents={activeScenario.documents}
            enableRawEditor={rawJsonEnabled}
            host={activeScenario.host}
            layoutMode={layoutMode}
            onSave={saveHandler}
            onUnavailableSaveAttempt={unavailableSaveHandler}
            readOnly={!editingEnabled}
            rootSourceId={activeScenario.rootSourceId}
            schemaHost={activeScenario.schemaHost}
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
        </div>
      </main>
    </div>
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

function createMutableSchemaHost(
  initialSourceSchemas: Record<string, EditorSchema>,
  initialNamedSchemas?: Record<string, EditorSchema>,
): EditorSchemaHost {
  let sourceSchemas = structuredClone(initialSourceSchemas);
  let namedSchemas = structuredClone(initialNamedSchemas ?? {});

  return {
    getSchema(context) {
      return sourceSchemas[context.sourceId];
    },
    getNamedSchema(name) {
      return namedSchemas[name];
    },
    setRootSchema(schema, context) {
      sourceSchemas = {
        ...sourceSchemas,
        [context.sourceId]: structuredClone(schema),
      };
    },
    setNamedSchema(name, schema) {
      namedSchemas = {
        ...namedSchemas,
        [name]: structuredClone(schema),
      };
    },
  };
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
