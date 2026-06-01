import { fireEvent, render, screen } from "@testing-library/react";
import { within } from "@testing-library/react";
import { test } from "vitest";
import { App } from "../../src/App";
import { EditorShell } from "../../src/editor/EditorShell";
import complexDemo from "../fixtures/complex-demo.json";
import { complexDemoHost } from "../fixtures/complex-demo-host";

test("renders editor shell title and root path", () => {
  render(<EditorShell value={{ hello: "world" }} />);
  expect(screen.getByText("Super JSON Editor")).toBeInTheDocument();
  expect(screen.getAllByText("Root").length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByText("object").length).toBeGreaterThanOrEqual(1);
});

test("renders the demo document title field", () => {
  render(<App />);
  expect(screen.getAllByText("campaign-alpha").length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText("Complex Demo Document").length).toBeGreaterThanOrEqual(1);
  expect(screen.getByRole("button", { name: "characters array 2 items" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "world object 2 fields" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "world object 2 fields" }));
  expect(screen.getByRole("button", { name: "activeQuest reference quests/intro" })).toBeInTheDocument();
});

test("top-level sidebar prioritizes navigable object and array entries before primitive fields", () => {
  render(<App />);

  const topLevelButtons = screen.getAllByRole("button").filter((button) => {
    return button.className.includes("sidebar-item") && button.textContent !== "#Complex Demo Documentobject";
  });

  const labels = topLevelButtons.map((button) => button.textContent ?? "");
  expect(labels.slice(0, 3)).toEqual(["{}meta3 fields", "[]characters2 items", "{}world2 fields"]);
});

test("top-level sidebar separates navigable entries from primitive fields", () => {
  render(<App />);

  expect(screen.getByText("Explore")).toBeInTheDocument();
  expect(screen.getByText("Fields")).toBeInTheDocument();
});

test("top-level sidebar jumps directly to the selected field from a deep page", () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "world object 2 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "activeQuest reference quests/intro" }));
  fireEvent.click(screen.getByRole("button", { name: ". title Complex Demo Document" }));

  const currentPage = document.querySelector(".stack-page.is-current");
  expect(currentPage).not.toBeNull();
  expect(within(currentPage as HTMLElement).getByLabelText("Field title")).toBeInTheDocument();
  expect(within(currentPage as HTMLElement).getByDisplayValue("Complex Demo Document")).toBeInTheDocument();
});

test("object pages edit primitive fields inline and keep raw json hidden by default", () => {
  render(<EditorShell value={{ hello: "world" }} />);
  expect(screen.queryByLabelText("JSON value editor")).not.toBeInTheDocument();

  const input = screen.getByLabelText("Field hello");
  fireEvent.change(input, { target: { value: "galaxy" } });

  expect(screen.getByDisplayValue("galaxy")).toBeInTheDocument();
});

test("object pages promote long prose fields into multiline editors", () => {
  render(
    <EditorShell
      value={{
        description:
          "The courier crosses three valleys before dusk, catalogues every ruin, and leaves precise notes for the next expedition.",
      }}
    />,
  );

  const field = screen.getByLabelText("Field description");
  expect(field.tagName).toBe("TEXTAREA");
  expect(field).toHaveAttribute("rows", "4");
});

test("object page nested summaries avoid repeating the field key inside the summary button", () => {
  render(<EditorShell value={{ profile: { stats: { hp: 10 } } }} />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));

  const nestedButton = screen.getByRole("button", { name: "stats object 1 fields" });
  expect(nestedButton.textContent).not.toContain("statsstats");
});

test("object page nested summaries render a dedicated structure icon", () => {
  render(<EditorShell value={{ profile: { stats: { hp: 10 } } }} />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));

  const nestedButton = screen.getByRole("button", { name: "stats object 1 fields" });
  const icon = nestedButton.querySelector(".nested-entry-icon");
  expect(icon).not.toBeNull();
});

test("reference summaries use a stable ascii icon", () => {
  render(<EditorShell value={{ activeQuest: { $ref: "quests/intro" } }} host={complexDemoHost} />);

  const nestedButton = screen.getByRole("button", { name: "activeQuest reference quests/intro" });
  const icon = nestedButton.querySelector(".nested-entry-icon");
  expect(icon?.textContent).toBe("->");
});

test("object pages keep primitive fields ahead of nested structures", () => {
  render(
    <EditorShell
      value={{
        profile: { stats: { hp: 10 } },
        name: "Hero",
        inventory: [{ id: "sword" }],
      }}
    />,
  );

  const fieldLabels = Array.from(document.querySelectorAll(".object-field-row .property-heading span")).map((node) => node.textContent);
  expect(fieldLabels.slice(0, 3)).toEqual(["name", "profile", "inventory"]);
});

test("raw json editor stays hidden until explicitly opened", () => {
  render(<EditorShell value={{ hello: "world" }} />);
  expect(screen.queryByLabelText("JSON value editor")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Raw JSON" }));

  expect(screen.getByLabelText("JSON value editor")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Apply JSON" })).toBeInTheDocument();
});

test("array pages render a table workspace instead of a json textarea", () => {
  render(<EditorShell value={{ party: [{ id: "hero", hp: 10 }, { id: "guide", hp: 6 }] }} />);

  fireEvent.click(screen.getByRole("button", { name: "party array 2 items" }));

  expect(screen.getByRole("columnheader", { name: "id" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "hp" })).toBeInTheDocument();
  expect(screen.getByText("hero")).toBeInTheDocument();
  expect(screen.queryByLabelText("JSON value editor")).not.toBeInTheDocument();
});

test("array pages render a stable empty state instead of a blank grid", () => {
  render(<EditorShell value={{ party: [] }} />);

  fireEvent.click(screen.getByRole("button", { name: "party array 0 items" }));

  expect(screen.getByText("This array has no items.")).toBeInTheDocument();
});

test("array workspace sizes columns by content instead of distributing page width evenly", () => {
  render(
    <EditorShell
      value={{
        entries: [
          { id: "hero", description: "A compact summary." },
          { id: "wanderer", description: "A much longer description that should make this column noticeably wider than id." },
        ],
      }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "entries array 2 items" }));

  const idColumn = document.querySelector('col[data-column="id"]') as HTMLTableColElement | null;
  const descriptionColumn = document.querySelector('col[data-column="description"]') as HTMLTableColElement | null;
  const table = document.querySelector(".array-workspace") as HTMLTableElement | null;

  expect(idColumn).not.toBeNull();
  expect(descriptionColumn).not.toBeNull();
  expect(table?.style.minWidth).not.toBe("100%");
  expect(Number.parseInt(descriptionColumn?.style.width ?? "0", 10)).toBeGreaterThan(
    Number.parseInt(idColumn?.style.width ?? "0", 10),
  );
});

test("array workspace prioritizes identity-like columns before secondary fields", () => {
  render(
    <EditorShell
      value={{
        entries: [
          { description: "Scout", name: "Lans", hp: 10 },
          { description: "Guide", name: "Mira", hp: 8 },
        ],
      }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "entries array 2 items" }));

  const headers = screen.getAllByRole("columnheader").map((header) => header.getAttribute("aria-label"));
  expect(headers).toEqual(["name", "description", "hp"]);
});

test("array workspace emphasizes the first identity column visually", () => {
  const { container } = render(
    <EditorShell
      value={{
        entries: [
          { name: "Lans", description: "Scout", hp: 10 },
        ],
      }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "entries array 1 items" }));

  const firstCell = container.querySelector("tbody tr td .array-cell-summary");
  expect(firstCell?.className).toContain("array-cell-summary--identity");
});

test("array workspace keeps the first identity column pinned for horizontal scanning", () => {
  render(
    <EditorShell
      value={{
        entries: [
          { id: "hero", hp: 10, mp: 4 },
        ],
      }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "entries array 1 items" }));

  const identityHeader = screen.getByRole("columnheader", { name: "id" });
  expect(identityHeader.className).toContain("array-column--sticky");
});

test("array workspace highlights the active row when a child page is open", () => {
  const { container } = render(
    <EditorShell
      value={{
        entries: [
          { id: "hero", hp: 10 },
          { id: "guide", hp: 8 },
        ],
      }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "entries array 2 items" }));
  fireEvent.click(screen.getByText("hero"));

  const activeRow = container.querySelector('tr[data-row-index="0"]');
  expect(activeRow?.className).toContain("is-active-row");
});

test("opens nested structures in a stacked subpage flow and can go back", () => {
  const { container } = render(<EditorShell value={{ profile: { name: "Lans", stats: { hp: 10 } } }} />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 2 fields" }));
  expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  expect(screen.getAllByText("profile").length).toBeGreaterThanOrEqual(2);
  expect(container.querySelector(".stack-page--push-enter")).not.toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
  expect(screen.getByText("hp")).toBeInTheDocument();
  expect(screen.getAllByText("stats").length).toBeGreaterThanOrEqual(1);
  expect(container.querySelector(".stack-page--push-enter-delayed")).not.toBeNull();
  expect(container.querySelector(".stack-page--push-promote")).not.toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(container.querySelector(".stack-page--pop-exit")).not.toBeNull();
  expect(screen.getAllByText("stats").length).toBeGreaterThanOrEqual(1);
});

test("replacing the right page from the left page does not animate the left page", () => {
  const { container } = render(
    <EditorShell value={{ profile: { stats: { hp: 10 }, equipment: { weapon: "sword" } } }} />,
  );

  fireEvent.click(screen.getByRole("button", { name: "profile object 2 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "equipment object 1 fields" }));

  expect(screen.getByText("weapon")).toBeInTheDocument();
  expect(container.querySelector(".stack-page--replace-enter")).not.toBeNull();
  expect(container.querySelector(".stack-page--push-enter")).toBeNull();
  expect(container.querySelector(".stack-page--push-promote")).toBeNull();
  expect(container.querySelector(".stack-page--push-exit")).toBeNull();
});

test("switching top-level entries with root still visible only replaces the right page", () => {
  const { container } = render(<EditorShell value={{ profile: { hp: 10 }, party: [{ id: "hero" }] }} />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "party array 1 items" }));

  expect(screen.getByRole("columnheader", { name: "id" })).toBeInTheDocument();
  expect(container.querySelector(".stack-page--replace-enter")).not.toBeNull();
  expect(container.querySelector(".stack-page--push-promote")).toBeNull();
  expect(container.querySelector(".stack-page--push-exit")).toBeNull();
});

test("back uses pop classes instead of push or replace classes", () => {
  const { container } = render(<EditorShell value={{ profile: { stats: { hp: 10 } } }} />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));

  expect(container.querySelector(".stack-page--pop-enter")).not.toBeNull();
  expect(container.querySelector(".stack-page--replace-enter")).toBeNull();
  expect(container.querySelector(".stack-page--push-enter")).toBeNull();
});

test("breadcrumb jump to root from a deep two-page state does not force a transition class", () => {
  const { container } = render(<EditorShell value={{ profile: { stats: { hp: 10 } } }} />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Root" })[0]);

  expect(screen.getAllByText("profile").length).toBeGreaterThanOrEqual(1);
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  expect(container.querySelector(".stack-page--push-enter")).toBeNull();
  expect(container.querySelector(".stack-page--replace-enter")).toBeNull();
  expect(container.querySelector(".stack-page--pop-enter")).toBeNull();
});

test("breadcrumb jump to the left visible page collapses to a single page without forcing replace semantics", () => {
  const { container } = render(<EditorShell value={{ profile: { stats: { hp: 10 }, equipment: { weapon: "sword" } } }} />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 2 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
  fireEvent.click(screen.getAllByRole("button", { name: "profile" }).at(-1) as HTMLButtonElement);

  expect(screen.getByRole("button", { name: "equipment object 1 fields" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Back" })).toBeInTheDocument();
  expect(container.querySelector(".stack-page--replace-enter")).toBeNull();
  expect(container.querySelector(".stack-page--push-enter")).toBeNull();
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
  expect(screen.getByDisplayValue("hero")).toBeInTheDocument();
  expect(screen.getAllByText("stats").length).toBeGreaterThanOrEqual(1);
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

  expect(screen.getAllByText("companion").length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText("characters/hero")).toBeInTheDocument();
  expect(screen.queryByText("hero")).not.toBeInTheDocument();
});

test("uses the complex fixture to exercise arrays, nested objects, and references", () => {
  render(<EditorShell value={complexDemo} host={complexDemoHost} />);

  expect(screen.getByRole("button", { name: "characters array 2 items" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "world object 2 fields" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "world object 2 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "activeQuest reference quests/intro" }));

  expect(screen.getByDisplayValue("intro")).toBeInTheDocument();
  expect(screen.getByDisplayValue("Light the First Beacon")).toBeInTheDocument();
});
