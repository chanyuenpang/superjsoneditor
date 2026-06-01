import { EditorShell } from "./editor/EditorShell";
import type { EditorHost } from "./editor/host";

const demoDocument = {
  id: "campaign-alpha",
  title: "Complex Demo Document",
  description: "Use the editor to traverse nested objects, arrays, and resolved references.",
  meta: {
    kind: "campaign",
    version: 3,
    flags: {
      hardcore: false,
      featured: true,
    },
  },
  characters: [
    {
      id: "hero",
      profile: {
        name: "Lans",
        class: "Warden",
      },
      stats: {
        hp: 10,
        mp: 4,
        resistances: ["fire", "ice"],
      },
      inventory: [
        {
          slot: "weapon",
          item: { $ref: "items/iron-sword" },
        },
        {
          slot: "charm",
          item: { $ref: "items/moon-charm" },
        },
      ],
    },
    {
      id: "guide",
      profile: {
        name: "Pang",
        class: "Archivist",
      },
      stats: {
        hp: 6,
        mp: 12,
        resistances: [],
      },
    },
  ],
  world: {
    activeQuest: { $ref: "quests/intro" },
    map: {
      regions: [
        {
          id: "north-forest",
          threat: 2,
          encounters: [{ $ref: "encounters/wolf-pack" }],
        },
        {
          id: "sunken-vault",
          threat: 5,
          encounters: [{ $ref: "encounters/shadow-eye" }],
        },
      ],
    },
  },
};

const demoHost: EditorHost = {
  isReferenceNode(value) {
    return Boolean(value && typeof value === "object" && "$ref" in (value as Record<string, unknown>));
  },
  getReferenceLabel(value) {
    return String((value as { $ref: string }).$ref);
  },
  resolveReference(value) {
    const key = (value as { $ref: string }).$ref;
    return demoReferences[key] ?? { missing: true, $ref: key };
  },
};

const demoReferences: Record<string, unknown> = {
  "items/iron-sword": {
    id: "iron-sword",
    kind: "item",
    name: "Iron Sword",
    damage: { min: 3, max: 6 },
  },
  "items/moon-charm": {
    id: "moon-charm",
    kind: "item",
    name: "Moon Charm",
    bonus: { manaRegen: 2 },
  },
  "quests/intro": {
    id: "intro",
    kind: "quest",
    title: "Light the First Beacon",
    steps: [
      { id: "travel", text: "Travel to the northern watch." },
      { id: "light", text: "Ignite the beacon flame." },
    ],
  },
  "encounters/wolf-pack": {
    id: "wolf-pack",
    kind: "encounter",
    enemies: ["wolf", "wolf-alpha"],
  },
  "encounters/shadow-eye": {
    id: "shadow-eye",
    kind: "encounter",
    enemies: ["shadow-eye"],
    hazard: { darkness: 4 },
  },
};

export function App() {
  return <EditorShell host={demoHost} value={demoDocument} />;
}
