import { useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { EditorShell, type EditorDocuments } from "./editor/EditorShell";
import type { EditorHost } from "./editor/host";
import type { EditorSchema, EditorSchemaHost } from "./editor/schema";
import { usePressSlopGuard } from "./editor/usePressSlopGuard";
import heroDocument from "./demo-sources/characters/hero.json";
import guideDocument from "./demo-sources/characters/guide.json";
import shadowEyeDocument from "./demo-sources/encounters/shadow-eye.json";
import wolfPackDocument from "./demo-sources/encounters/wolf-pack.json";
import ironSwordDocument from "./demo-sources/items/iron-sword.json";
import moonCharmDocument from "./demo-sources/items/moon-charm.json";
import mainDocument from "./demo-sources/main.json";
import introQuestDocument from "./demo-sources/quests/intro.json";
import heroDocumentZh from "./demo-sources-zh/characters/hero.json";
import guideDocumentZh from "./demo-sources-zh/characters/guide.json";
import shadowEyeDocumentZh from "./demo-sources-zh/encounters/shadow-eye.json";
import wolfPackDocumentZh from "./demo-sources-zh/encounters/wolf-pack.json";
import ironSwordDocumentZh from "./demo-sources-zh/items/iron-sword.json";
import moonCharmDocumentZh from "./demo-sources-zh/items/moon-charm.json";
import mainDocumentZh from "./demo-sources-zh/main.json";
import introQuestDocumentZh from "./demo-sources-zh/quests/intro.json";
import { DEMO_ROOT_SOURCE_ID } from "./demo-sources/manifest";
import { saveDemoSources } from "./demo/saveDemoSources";

type DemoLocale = "en" | "zh";
type LocalizedText = Record<DemoLocale, string>;

const localeOptions: { id: DemoLocale; label: string }[] = [
  { id: "en", label: "EN" },
  { id: "zh", label: "中文" },
];

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

const freeJsonDocumentsZh: Record<string, unknown> = {
  main: mainDocumentZh,
  "asset://items/iron-sword.json": ironSwordDocumentZh,
  "asset://items/moon-charm.json": moonCharmDocumentZh,
  "asset://quests/intro.json": introQuestDocumentZh,
  "asset://encounters/wolf-pack.json": wolfPackDocumentZh,
  "asset://encounters/shadow-eye.json": shadowEyeDocumentZh,
  "asset://characters/hero.json": heroDocumentZh,
  "asset://characters/guide.json": guideDocumentZh,
};

const schemaAuthoringDocuments: Record<string, unknown> = {
  "schema-authoring": [
    {
      id: "quest_001",
      title: "Wake The Beacon",
      status: "draft",
      owner: "Guide",
      description: "Restore the signal tower before the harbor fog covers the northern route.",
    },
    {
      id: "quest_002",
      title: "Moonlit Bargain",
      status: "review",
      owner: "Archivist",
      description: "Lock the merchant pact terms and log every lantern tax exception in the ledger.",
    },
    {
      id: "quest_003",
      title: "Silent Crossing",
      status: "live",
      owner: "Scout",
      description: "Move the convoy through the reed channels without exposing the beacon convoy route.",
    },
  ],
};

const schemaAuthoringDocumentsZh: Record<string, unknown> = {
  "schema-authoring": [
    {
      id: "quest_001",
      title: "点亮北境灯塔",
      status: "draft",
      owner: "向导",
      description: "在港湾浓雾封住北线之前，完成信号塔修复并恢复首段航路灯。",
    },
    {
      id: "quest_002",
      title: "月市交易夜",
      status: "review",
      owner: "档案官",
      description: "敲定月商契约条款，并把所有灯税例外逐条记入夜间账册。",
    },
    {
      id: "quest_003",
      title: "静默穿潮",
      status: "live",
      owner: "斥候",
      description: "护送车队穿过芦苇水道，全程避免暴露灯塔补给的行进路线。",
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

const referenceProjectionDocumentsZh: Record<string, unknown> = {
  "reference-projection": [
    "asset://items/iron-sword.json",
    "asset://items/moon-charm.json",
  ],
  "asset://items/iron-sword.json": ironSwordDocumentZh,
  "asset://items/moon-charm.json": moonCharmDocumentZh,
};

const selectAndTagsDocuments: Record<string, unknown> = {
  "select-tags": {
    rarity: "rare",
    tags: ["ritual", "night"],
    faction: "moon",
    reward: "asset://items/moon-charm.json",
    note: "Reserved for the first lighthouse keeper who completes the northbound route.",
  },
  "asset://items/moon-charm.json": moonCharmDocument,
  "asset://schema-data/factions.json": [
    { id: "moon", name: "Moon Court", color: "blue" },
    { id: "guild", name: "Guild Union", color: "gold" },
    { id: "wild", name: "Wild Chorus", color: "green" },
  ],
};

const selectAndTagsDocumentsZh: Record<string, unknown> = {
  "select-tags": {
    rarity: "rare",
    tags: ["ritual", "night"],
    faction: "moon",
    reward: "asset://items/moon-charm.json",
    note: "预留给首位完成北向灯塔航线值守的守灯人。",
  },
  "asset://items/moon-charm.json": moonCharmDocumentZh,
  "asset://schema-data/factions.json": [
    { id: "moon", name: "月廷", color: "blue" },
    { id: "guild", name: "行会联署", color: "gold" },
    { id: "wild", name: "荒野合唱团", color: "green" },
  ],
};

const freeJsonHost: EditorHost = {
  loadReferenceSource(uri) {
    return freeJsonDocuments[uri];
  },
};

const freeJsonHostZh: EditorHost = {
  loadReferenceSource(uri) {
    return freeJsonDocumentsZh[uri];
  },
};

const referenceProjectionHost: EditorHost = {
  loadReferenceSource(uri) {
    return referenceProjectionDocuments[uri] ?? freeJsonDocuments[uri];
  },
};

const referenceProjectionHostZh: EditorHost = {
  loadReferenceSource(uri) {
    return referenceProjectionDocumentsZh[uri] ?? freeJsonDocumentsZh[uri];
  },
};

const selectAndTagsHost: EditorHost = {
  loadReferenceSource(uri) {
    return selectAndTagsDocuments[uri] ?? referenceProjectionDocuments[uri] ?? freeJsonDocuments[uri];
  },
};

const selectAndTagsHostZh: EditorHost = {
  loadReferenceSource(uri) {
    return selectAndTagsDocumentsZh[uri] ?? referenceProjectionDocumentsZh[uri] ?? freeJsonDocumentsZh[uri];
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
              { value: "ritual", label: "Ritual", color: "yellow" },
              { value: "night", label: "Night", color: "gray" },
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
  title: LocalizedText;
  mode: "schema" | "free";
  eyebrow: LocalizedText;
  summary: LocalizedText;
  note: LocalizedText;
  features: LocalizedText[];
};

type DemoScenarioRuntime = {
  documents: EditorDocuments;
  rootSourceId: string;
  host?: EditorHost;
  schemaHost?: EditorSchemaHost;
};

const demoScenarios: DemoScenario[] = [
  {
    id: "schema-authoring",
    title: {
      en: "Schema Authoring Table",
      zh: "Schema 编排表",
    },
    mode: "schema",
    eyebrow: {
      en: "Schema mode",
      zh: "Schema 模式",
    },
    summary: {
      en: "A root array where the schema defines the first-pass table view instead of leaving everything to raw JSON structure.",
      zh: "根数组会优先按 schema 给出的表格视图展开，而不是只按原始 JSON 结构裸露展示。",
    },
    note: {
      en: "Default table columns",
      zh: "列行为由 schema 决定，但记录本身仍然保持为字面 JSON 对象。",
    },
    features: [
      {
        en: "Reorder headers to reshape the default reading order for dense production lists.",
        zh: "拖动表头即可重排高密度生产列表的默认阅读顺序。",
      },
      {
        en: "Rename, resize, wrap, and hide columns directly from the header surface.",
        zh: "可以直接从表头完成重命名、调宽、换行和隐藏列。",
      },
      {
        en: "Open a row to continue field-level authoring inside object detail pages.",
        zh: "打开任意行后，可以继续在对象详情页里做字段级编辑。",
      },
    ],
  },
  {
    id: "reference-projection",
    title: {
      en: "Reference Projection",
      zh: "引用投影视图",
    },
    mode: "schema",
    eyebrow: {
      en: "Schema mode",
      zh: "Schema 模式",
    },
    summary: {
      en: "File references render as projection tables, so linked records stay compact until you need the full document.",
      zh: "文件引用会被投影成紧凑表格，只有需要时才继续展开完整文档。",
    },
    note: {
      en: "Reference previews read like a curated view model instead of a pile of raw relation IDs.",
      zh: "引用预览更像精选后的视图模型，而不是一堆裸露的关系 ID。",
    },
    features: [
      {
        en: "Reference arrays can render with named view schemas instead of generic string cells.",
        zh: "引用数组可以套用命名视图 schema，而不是退化成普通字符串单元格。",
      },
      {
        en: "Projection columns remain movable, renamable, wrappable, and hideable.",
        zh: "投影列仍然支持重排、改名、换行和隐藏。",
      },
      {
        en: "Opening a referenced document keeps the same schema vocabulary across screens.",
        zh: "继续打开被引用文档时，仍然沿用同一套 schema 语言。",
      },
    ],
  },
  {
    id: "select-and-tags",
    title: {
      en: "Select And Tags",
      zh: "选项与标签",
    },
    mode: "schema",
    eyebrow: {
      en: "Schema mode",
      zh: "Schema 模式",
    },
    summary: {
      en: "Selects and tag chips validate against option sets while continuing to save literal values into JSON.",
      zh: "下拉选项和标签会按规则集校验，同时仍把字面值直接写回 JSON。",
    },
    note: {
      en: "Literal values, schema-defined options",
      zh: "适合 UI 需要丰富选择控件、而数据源仍然坚持纯 JSON 的场景。",
    },
    features: [
      {
        en: "Inline options support labels, colors, creation, reordering, and deletion.",
        zh: "内联选项支持标签、颜色、新建、重排和删除。",
      },
      {
        en: "JSON-backed option sources can drive validation without becoming navigable references.",
        zh: "由 JSON 提供的选项源可以参与校验，而不必变成可跳转引用。",
      },
      {
        en: "Nullable notes and reference previews still coexist in the same object page.",
        zh: "可空备注和引用预览也能自然共存在同一对象页面中。",
      },
    ],
  },
  {
    id: "free-json",
    title: {
      en: "Free JSON Explorer",
      zh: "自由 JSON 浏览",
    },
    mode: "free",
    eyebrow: {
      en: "Free mode",
      zh: "自由模式",
    },
    summary: {
      en: "The untyped explorer stays available for broad inspection, cleanup, and mixed-structure document work.",
      zh: "无类型约束的浏览模式依旧保留，适合做广泛检查、清洗和混合结构文档处理。",
    },
    note: {
      en: "Nested objects, references, and wide operational records stay readable even with no schema at all.",
      zh: "即使完全没有 schema，嵌套对象、引用和宽表记录依旧能保持可读。",
    },
    features: [
      {
        en: "Traverse mixed objects, arrays, and references without preparing a schema contract first.",
        zh: "无需预先准备 schema，也能直接遍历对象、数组和引用混合的数据。",
      },
      {
        en: "This mode remains useful for general-purpose JSON cleanup and content review work.",
        zh: "这个模式仍然适合通用 JSON 清洗和内容审阅工作。",
      },
      {
        en: "Local save support still follows the original demo-source flow on localhost.",
        zh: "在 localhost 下仍然可以沿用原本的 demo source 保存流程。",
      },
    ],
  },
];

const demoScenarioRuntimes: Record<DemoLocale, Record<string, DemoScenarioRuntime>> = {
  en: {
    "schema-authoring": {
      documents: schemaAuthoringDocuments,
      rootSourceId: "schema-authoring",
      schemaHost: schemaAuthoringSchemaHost,
    },
    "reference-projection": {
      documents: referenceProjectionDocuments,
      rootSourceId: "reference-projection",
      host: referenceProjectionHost,
      schemaHost: referenceProjectionSchemaHost,
    },
    "select-and-tags": {
      documents: selectAndTagsDocuments,
      rootSourceId: "select-tags",
      host: selectAndTagsHost,
      schemaHost: selectAndTagsSchemaHost,
    },
    "free-json": {
      documents: freeJsonDocuments,
      rootSourceId: DEMO_ROOT_SOURCE_ID,
      host: freeJsonHost,
    },
  },
  zh: {
    "schema-authoring": {
      documents: schemaAuthoringDocumentsZh,
      rootSourceId: "schema-authoring",
      schemaHost: schemaAuthoringSchemaHost,
    },
    "reference-projection": {
      documents: referenceProjectionDocumentsZh,
      rootSourceId: "reference-projection",
      host: referenceProjectionHostZh,
      schemaHost: referenceProjectionSchemaHost,
    },
    "select-and-tags": {
      documents: selectAndTagsDocumentsZh,
      rootSourceId: "select-tags",
      host: selectAndTagsHostZh,
      schemaHost: selectAndTagsSchemaHost,
    },
    "free-json": {
      documents: freeJsonDocumentsZh,
      rootSourceId: DEMO_ROOT_SOURCE_ID,
      host: freeJsonHostZh,
    },
  },
};

const appCopy = {
  en: {
    productName: "Super JSON Editor",
    heroTitle: "Schema-first JSON editing",
    heroBody:
      "Switch between free-form exploration and schema-shaped editing in one playground. The shell stays product-like while the data stays ordinary JSON.",
    capabilityLabel: "Core capabilities",
    capabilityPills: ["Validate JSON", "Shape views", "Author schema"],
    scenarioSectionTitle: "Playgrounds",
    detailSectionTitle: "Current showcase",
    languageLabel: "Language",
    previewLabel: "Live preview",
    previewTitle: "Editor sandbox",
    previewBody:
      "Use the side panel to compare how the same shell behaves with schema guidance, references, and wide record sets.",
    settingsButton: "Settings",
    settingsTitle: "Demo Settings",
    settingsDescription: "Preview editor modes without touching source code.",
    layoutModeLabel: "Layout mode",
    editingEnabledLabel: "Enable editing",
    rawJsonEnabledLabel: "Enable raw JSON",
    leftPageFullscreenLabel: "Auto fullscreen single left page",
    deployedSaveMessage: "Save only works in local development. Changes in the deployed demo will not persist.",
  },
  zh: {
    productName: "Super JSON Editor",
    heroTitle: "面向真实工作文档的 Schema 优先 JSON 编辑",
    heroBody:
      "在同一个 demo 里切换自由浏览和 schema 驱动编辑。外壳保持产品化，数据本身仍然只是普通 JSON。",
    capabilityLabel: "核心能力",
    capabilityPills: ["校验 JSON", "塑造视图", "编排 Schema"],
    scenarioSectionTitle: "演示场景",
    detailSectionTitle: "当前展示",
    languageLabel: "语言",
    previewLabel: "实时预览",
    previewTitle: "编辑器沙箱",
    previewBody: "通过左侧面板切换 schema 引导、引用投影和宽表记录，直观看到同一套外壳的不同工作方式。",
    settingsButton: "设置",
    settingsTitle: "Demo 设置",
    settingsDescription: "无需改源码，直接预览不同编辑器模式。",
    layoutModeLabel: "布局模式",
    editingEnabledLabel: "允许编辑",
    rawJsonEnabledLabel: "允许 Raw JSON",
    leftPageFullscreenLabel: "单左页自动全屏",
    deployedSaveMessage: "保存仅在本地开发环境中生效，线上 demo 的改动不会持久化。",
  },
} satisfies Record<
  DemoLocale,
  {
    productName: string;
    heroTitle: string;
    heroBody: string;
    capabilityLabel: string;
    capabilityPills: string[];
    scenarioSectionTitle: string;
    detailSectionTitle: string;
    languageLabel: string;
    previewLabel: string;
    previewTitle: string;
    previewBody: string;
    settingsButton: string;
    settingsTitle: string;
    settingsDescription: string;
    layoutModeLabel: string;
    editingEnabledLabel: string;
    rawJsonEnabledLabel: string;
    leftPageFullscreenLabel: string;
    deployedSaveMessage: string;
  }
>;

export function App() {
  const canPersistDemoSources = isLocalDemoSaveHost();
  const appRootRef = useRef<HTMLDivElement | null>(null);
  const [locale, setLocale] = useState<DemoLocale>("en");
  const [activeScenarioId, setActiveScenarioId] = useState("schema-authoring");
  const [layoutMode, setLayoutMode] = useState<"stack-flow" | "pinned-root">("stack-flow");
  const [editingEnabled, setEditingEnabled] = useState(true);
  const [rawJsonEnabled, setRawJsonEnabled] = useState(true);
  const [leftPageFullscreen, setLeftPageFullscreen] = useState(true);
  const activeScenario = useMemo(
    () => demoScenarios.find((scenario) => scenario.id === activeScenarioId) ?? demoScenarios[0],
    [activeScenarioId],
  );
  const copy = appCopy[locale];
  const activeScenarioRuntime = demoScenarioRuntimes[locale][activeScenario.id];
  usePressSlopGuard(appRootRef);

  const saveHandler =
    activeScenario.id === "free-json" && canPersistDemoSources
      ? (documents: EditorDocuments) => handleDemoSave(documents, locale)
      : undefined;
  const unavailableSaveHandler =
    activeScenario.id === "free-json" && !canPersistDemoSources
      ? () => handleUnavailableDemoSave(copy.deployedSaveMessage)
      : undefined;

  return (
    <div className="demo-site" ref={appRootRef}>
      <aside className="demo-site__sidebar">
        <div className="demo-hero">
          <div className="demo-hero__topline">
            <div className="demo-kicker">{copy.productName}</div>
            <div className="demo-language-switch" aria-label={copy.languageLabel} role="group">
              {localeOptions.map((option) => (
                <button
                  key={option.id}
                  aria-pressed={locale === option.id}
                  className={`demo-language-button ${locale === option.id ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setLocale(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <h1>{copy.heroTitle}</h1>
          <p>{copy.heroBody}</p>
        </div>
        <div className="demo-pill-group" aria-label={copy.capabilityLabel}>
          {copy.capabilityPills.map((pill) => (
            <span key={pill} className="demo-pill">
              {pill}
            </span>
          ))}
        </div>
        <section className="demo-scenarios">
          <div className="demo-section-title">{copy.scenarioSectionTitle}</div>
          <div className="demo-scenario-list">
            {demoScenarios.map((scenario) => (
              <button
                key={scenario.id}
                aria-label={scenario.title[locale]}
                aria-pressed={activeScenario.id === scenario.id}
                className={`demo-scenario-card ${activeScenario.id === scenario.id ? "is-active" : ""}`}
                type="button"
                onClick={() => setActiveScenarioId(scenario.id)}
              >
                <span className="demo-scenario-card__mode">{scenario.eyebrow[locale]}</span>
                <strong>{scenario.title[locale]}</strong>
                <span>{scenario.summary[locale]}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="demo-scenario-detail">
          <div className="demo-section-title">{copy.detailSectionTitle}</div>
          <div className="demo-detail-card">
            <div className="demo-detail-card__header">
              <span className={`demo-mode-chip demo-mode-chip--${activeScenario.mode}`}>
                {activeScenario.eyebrow[locale]}
              </span>
              <strong>{activeScenario.title[locale]}</strong>
            </div>
            <p>{activeScenario.note[locale]}</p>
            <ul>
              {activeScenario.features.map((feature) => (
                <li key={feature.en}>{feature[locale]}</li>
              ))}
            </ul>
          </div>
        </section>
      </aside>
      <main className="demo-site__preview">
        <div className="demo-preview-shell">
          <EditorShell
            key={`${locale}:${activeScenario.id}`}
            documents={activeScenarioRuntime.documents}
            enableRawEditor={rawJsonEnabled}
            host={activeScenarioRuntime.host}
            layoutMode={layoutMode}
            leftPageFullscreen={leftPageFullscreen}
            onSave={saveHandler}
            onUnavailableSaveAttempt={unavailableSaveHandler}
            readOnly={!editingEnabled}
            rootSourceId={activeScenarioRuntime.rootSourceId}
            schemaHost={activeScenarioRuntime.schemaHost}
            toolbarActions={(
              <DemoSettingsPopover
                copy={copy}
                editingEnabled={editingEnabled}
                leftPageFullscreen={leftPageFullscreen}
                layoutMode={layoutMode}
                rawJsonEnabled={rawJsonEnabled}
                onEditingEnabledChange={setEditingEnabled}
                onLeftPageFullscreenChange={setLeftPageFullscreen}
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

async function handleDemoSave(documents: EditorDocuments, locale: DemoLocale) {
  await saveDemoSources(documents, locale);
  return documents;
}

function handleUnavailableDemoSave(message: string) {
  window.alert(message);
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
  copy: {
    settingsButton: string;
    settingsTitle: string;
    settingsDescription: string;
    layoutModeLabel: string;
    editingEnabledLabel: string;
    rawJsonEnabledLabel: string;
    leftPageFullscreenLabel: string;
  };
  editingEnabled: boolean;
  leftPageFullscreen: boolean;
  layoutMode: "stack-flow" | "pinned-root";
  rawJsonEnabled: boolean;
  onEditingEnabledChange: (nextValue: boolean) => void;
  onLeftPageFullscreenChange: (nextValue: boolean) => void;
  onLayoutModeChange: (nextValue: "stack-flow" | "pinned-root") => void;
  onRawJsonEnabledChange: (nextValue: boolean) => void;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="ghost-button demo-settings-trigger" type="button">
          {props.copy.settingsButton}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" className="demo-settings-popover" sideOffset={8}>
          <div className="demo-settings-panel">
            <div className="demo-settings-panel__header">
              <strong>{props.copy.settingsTitle}</strong>
              <span>{props.copy.settingsDescription}</span>
            </div>
            <label className="demo-settings-field">
              <span>{props.copy.layoutModeLabel}</span>
              <select
                aria-label={props.copy.layoutModeLabel}
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
                aria-label={props.copy.editingEnabledLabel}
                checked={props.editingEnabled}
                type="checkbox"
                onChange={(event) => props.onEditingEnabledChange(event.target.checked)}
              />
              <span>{props.copy.editingEnabledLabel}</span>
            </label>
            <label className="demo-settings-checkbox">
              <input
                aria-label={props.copy.rawJsonEnabledLabel}
                checked={props.rawJsonEnabled}
                type="checkbox"
                onChange={(event) => props.onRawJsonEnabledChange(event.target.checked)}
              />
              <span>{props.copy.rawJsonEnabledLabel}</span>
            </label>
            <label className="demo-settings-checkbox">
              <input
                aria-label={props.copy.leftPageFullscreenLabel}
                checked={props.leftPageFullscreen}
                type="checkbox"
                onChange={(event) => props.onLeftPageFullscreenChange(event.target.checked)}
              />
              <span>{props.copy.leftPageFullscreenLabel}</span>
            </label>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
