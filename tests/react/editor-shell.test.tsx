import { fireEvent, render, screen } from "@testing-library/react";
import { test } from "vitest";
import { App } from "../../src/App";
import { EditorShell } from "../../src/editor/EditorShell";
import complexDemo from "../fixtures/complex-demo.json";

const complexHost = {
  isReferenceNode(value: unknown) {
    return Boolean(value && typeof value === "object" && "$ref" in (value as Record<string, unknown>));
  },
  getReferenceLabel(value: unknown) {
    return String((value as { $ref: string }).$ref);
  },
  resolveReference(value: unknown) {
    const key = (value as { $ref: string }).$ref;
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

    return references[key] ?? { missing: true, $ref: key };
  }
};

test("renders editor shell title and root path", () => {
  render(<EditorShell value={{ hello: "world" }} />);
  expect(screen.getByText("Super JSON Editor")).toBeInTheDocument();
  expect(screen.getAllByText("Root")).toHaveLength(2);
  expect(screen.getByText("object")).toBeInTheDocument();
});

test("renders the demo document title field", () => {
  render(<App />);
  expect(screen.getByText("simple-demo")).toBeInTheDocument();
  expect(screen.getByText("Simple Demo Page")).toBeInTheDocument();
  expect(screen.getByText("This page stays intentionally small. Complex coverage lives in test fixtures.")).toBeInTheDocument();
});

test("applies JSON text edits to the current node", () => {
  render(<EditorShell value={{ hello: "world" }} />);
  const textarea = screen.getByLabelText("JSON value editor");
  fireEvent.change(textarea, { target: { value: "\"galaxy\"" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply JSON" }));
  expect(screen.getByText("galaxy")).toBeInTheDocument();
});

test("opens nested structures in a stacked subpage flow and can go back", () => {
  render(<EditorShell value={{ profile: { name: "Lans", stats: { hp: 10 } } }} />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 2 fields" }));
  expect(screen.getByText("Page 2")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  expect(screen.getAllByText("profile")).toHaveLength(2);

  fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
  expect(screen.getByText("Page 3")).toBeInTheDocument();
  expect(screen.getByText("hp")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByText("Page 2")).toBeInTheDocument();
  expect(screen.getByText("stats")).toBeInTheDocument();
});

test("expands host-provided reference nodes through a resolver", () => {
  render(
    <EditorShell
      value={{ profile: { companion: { $ref: "characters/hero" } } }}
      host={{
        isReferenceNode(value) {
          return Boolean(value && typeof value === "object" && "$ref" in (value as Record<string, unknown>));
        },
        getReferenceLabel(value) {
          return String((value as { $ref: string }).$ref);
        },
        resolveReference(value) {
          if ((value as { $ref: string }).$ref === "characters/hero") {
            return { id: "hero", stats: { hp: 10 } };
          }
          return null;
        }
      }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "companion reference characters/hero" }));
  expect(screen.getByText("Page 3")).toBeInTheDocument();
  expect(screen.getByText("hero")).toBeInTheDocument();
  expect(screen.getByText("stats")).toBeInTheDocument();
});

test("keeps the source ref object unchanged after opening a resolved reference page", () => {
  render(
    <EditorShell
      value={{ profile: { companion: { $ref: "characters/hero" } } }}
      host={{
        isReferenceNode(value) {
          return Boolean(value && typeof value === "object" && "$ref" in (value as Record<string, unknown>));
        },
        getReferenceLabel(value) {
          return String((value as { $ref: string }).$ref);
        },
        resolveReference() {
          return { id: "hero", stats: { hp: 10 } };
        },
      }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "companion reference characters/hero" }));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));

  expect(screen.getByText("companion")).toBeInTheDocument();
  expect(screen.getByText("characters/hero")).toBeInTheDocument();
  expect(screen.queryByText("hero")).not.toBeInTheDocument();
});

test("uses the complex fixture to exercise arrays, nested objects, and references", () => {
  render(<EditorShell value={complexDemo} host={complexHost} />);

  expect(screen.getByRole("button", { name: "characters array 2 items" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "world object 2 fields" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "world object 2 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "activeQuest reference quests/intro" }));

  expect(screen.getByText("Page 3")).toBeInTheDocument();
  expect(screen.getByText("intro")).toBeInTheDocument();
  expect(screen.getByText("Light the First Beacon")).toBeInTheDocument();
});
