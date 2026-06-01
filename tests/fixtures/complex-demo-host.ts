import type { EditorHost } from "../../src/editor/host";

const references: Record<string, unknown> = {
  "items/iron-sword": {
    id: "iron-sword",
    kind: "item",
    name: "Iron Sword",
    damage: { min: 3, max: 6 }
  },
  "items/moon-charm": {
    id: "moon-charm",
    kind: "item",
    name: "Moon Charm",
    bonus: { manaRegen: 2 }
  },
  "quests/intro": {
    id: "intro",
    kind: "quest",
    title: "Light the First Beacon",
    steps: [
      { id: "travel", text: "Travel to the northern watch." },
      { id: "light", text: "Ignite the beacon flame." }
    ]
  },
  "encounters/wolf-pack": {
    id: "wolf-pack",
    kind: "encounter",
    enemies: ["wolf", "wolf-alpha"]
  },
  "encounters/shadow-eye": {
    id: "shadow-eye",
    kind: "encounter",
    enemies: ["shadow-eye"],
    hazard: { darkness: 4 }
  }
};

export const complexDemoHost: EditorHost = {
  isReferenceNode(value) {
    return Boolean(value && typeof value === "object" && "$ref" in (value as Record<string, unknown>));
  },
  getReferenceLabel(value) {
    return String((value as { $ref: string }).$ref);
  },
  resolveReference(value) {
    const key = (value as { $ref: string }).$ref;
    return references[key] ?? { missing: true, $ref: key };
  }
};
