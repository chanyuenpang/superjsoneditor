import type { EditorHost } from "../../src/editor/host";

const references: Record<string, unknown> = {
  "asset://items/iron-sword.json": {
    id: "iron-sword",
    kind: "item",
    name: "Iron Sword",
    damage: { min: 3, max: 6 }
  },
  "asset://items/moon-charm.json": {
    id: "moon-charm",
    kind: "item",
    name: "Moon Charm",
    bonus: { manaRegen: 2 }
  },
  "asset://quests/intro.json": {
    id: "intro",
    kind: "quest",
    title: "Light the First Beacon",
    steps: [
      { id: "travel", text: "Travel to the northern watch." },
      { id: "light", text: "Ignite the beacon flame." }
    ]
  },
  "asset://encounters/wolf-pack.json": {
    id: "wolf-pack",
    kind: "encounter",
    enemies: ["wolf", "wolf-alpha"]
  },
  "asset://encounters/shadow-eye.json": {
    id: "shadow-eye",
    kind: "encounter",
    enemies: ["shadow-eye"],
    hazard: { darkness: 4 }
  }
};

export const complexDemoHost: EditorHost = {
  loadReferenceSource(uri) {
    return references[uri];
  }
};
