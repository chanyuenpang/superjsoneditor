import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { test, vi } from "vitest";
import { App } from "../../src/App";
import { EditorShell } from "../../src/editor/EditorShell";
import type { EditorSchemaHost, EditorValidationResult } from "../../src/editor/schema";

test("renders a generic root document with the root breadcrumb only", () => {
  render(<EditorShell value={{ hello: "world" }} />);

  expect(screen.queryByText("JSON Document")).toBeNull();
  expect(screen.getAllByText("Root").length).toBeGreaterThanOrEqual(2);
  expect(screen.getByLabelText("Field hello")).toHaveValue("world");
});

test("renders the demo shell without depending on demo-only chrome", () => {
  render(<App />);

  expect(screen.getByText("Super JSON Editor")).toBeInTheDocument();
  expect(screen.getByDisplayValue("campaign-alpha")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "characters array 2 items" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "wideRecords array 5 items" })).toBeInTheDocument();
});

test("object pages edit primitive fields inline", () => {
  render(<EditorShell value={{ hello: "world" }} />);

  fireEvent.change(screen.getByLabelText("Field hello"), { target: { value: "galaxy" } });

  expect(screen.getByDisplayValue("galaxy")).toBeInTheDocument();
});

test("host save receives the full document map and clears dirty state", async () => {
  const handleSave = vi.fn(async (documents: Record<string, unknown>) => documents);
  render(<EditorShell documents={{ main: { hello: "world" } }} onSave={handleSave} />);

  fireEvent.change(screen.getByLabelText("Field hello"), { target: { value: "galaxy" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);

  await waitFor(() => expect(handleSave).toHaveBeenCalledWith({ main: { hello: "galaxy" } }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).toBeNull());
});

test("unavailable save attempts can explain that deployed demo changes do not persist", () => {
  const handleUnavailableSave = vi.fn();
  render(<EditorShell documents={{ main: { hello: "world" } }} onUnavailableSaveAttempt={handleUnavailableSave} />);

  fireEvent.change(screen.getByLabelText("Field hello"), { target: { value: "galaxy" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);

  expect(handleUnavailableSave).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
});

test("reload without a host callback reverts to the last saved snapshot", () => {
  render(<EditorShell documents={{ main: { hello: "world" } }} onSave={() => undefined} />);

  fireEvent.change(screen.getByLabelText("Field hello"), { target: { value: "galaxy" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Reload" })[0]);

  expect(screen.getByDisplayValue("world")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
});

test("host reload can replace the in-memory documents", async () => {
  const handleReload = vi.fn(async () => ({ main: { hello: "reloaded" } }));
  render(<EditorShell documents={{ main: { hello: "world" } }} onReload={handleReload} onSave={() => undefined} />);

  fireEvent.change(screen.getByLabelText("Field hello"), { target: { value: "galaxy" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Reload" })[0]);

  await waitFor(() => expect(handleReload).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByDisplayValue("reloaded")).toBeInTheDocument());
});

test("read only mode keeps navigation but disables mutation controls", () => {
  render(<EditorShell value={{ hello: "world", nested: { hp: 10 } }} readOnly />);

  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  expect(screen.getByLabelText("Field hello")).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "nested object 1 fields" }));

  expect(screen.getByDisplayValue("10")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
});

test("array pages render a table workspace", () => {
  render(<EditorShell value={{ party: [{ id: "hero", hp: 10 }, { id: "guide", hp: 6 }] }} />);

  fireEvent.click(screen.getByRole("button", { name: "party array 2 items" }));

  expect(screen.getByRole("columnheader", { name: "id" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "hp" })).toBeInTheDocument();
  expect(screen.getByText("hero")).toBeInTheDocument();
});

test("array pages render missing object fields as gray dash placeholders", () => {
  const { container } = render(<EditorShell value={{ party: [{ id: "hero", hp: 10 }, { id: "guide" }] }} />);

  fireEvent.click(screen.getByRole("button", { name: "party array 2 items" }));

  const missingTableCell = container.querySelector("td.array-cell--missing");
  const missingCell = container.querySelector(".array-cell-summary--missing");
  expect(missingTableCell).not.toBeNull();
  expect(missingCell).not.toBeNull();
  expect(missingCell?.textContent).toBe("-");
});

test("mixed object arrays keep object columns and collapse non-object rows", () => {
  const { container } = render(
    <EditorShell
      value={{ party: [{ id: "hero", hp: 10, mp: 4, role: "tank" }, ["slash", "guard"], { id: "guide", hp: 6, mp: 9, role: "support" }] }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "party array 3 items" }));

  expect(screen.getByRole("columnheader", { name: "id" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "hp" })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Type" })).toBeNull();
  expect(screen.queryByRole("columnheader", { name: "Value" })).toBeNull();
  const mixedRow = container.querySelector('tr[data-row-index="1"]');
  const mixedCells = mixedRow?.querySelectorAll("td");
  const mergedCell = mixedRow?.querySelector("td[colspan='2']");
  expect(mixedCells?.[0]?.textContent).toContain("array");
  expect(mixedCells?.[1]?.textContent).toContain("2 items");
  expect(mergedCell).not.toBeNull();
  expect(mergedCell?.textContent).toBe("");
});

test("page back button and toolbar back both use pop animation", () => {
  vi.useFakeTimers();
  const { container } = render(<EditorShell value={{ profile: { stats: { hp: 10 } } }} />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
  act(() => {
    vi.advanceTimersByTime(600);
  });
  fireEvent.click(screen.getAllByRole("button", { name: "Go up one level" }).at(-1) as HTMLButtonElement);

  expect(container.querySelector(".stack-page--pop-exit")).not.toBeNull();

  act(() => {
    vi.advanceTimersByTime(600);
  });
  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
  act(() => {
    vi.advanceTimersByTime(600);
  });
  fireEvent.click(screen.getByRole("button", { name: "Back" }));

  expect(container.querySelector(".stack-page--pop-exit")).not.toBeNull();
  vi.useRealTimers();
});

test("back from a right page with root pinned on the left cuts without pop animation", () => {
  const { container } = render(<EditorShell value={{ profile: { hp: 10 } }} />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));

  expect(container.querySelector(".stack-page--pop-exit")).toBeNull();
});

test("references can navigate into a different source document", () => {
  render(
    <EditorShell
      documents={{
        main: { profile: { companion: "asset://characters/hero.json" } },
        "asset://characters/hero.json": { id: "hero", stats: { hp: 10 } },
      }}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://characters/hero.json" ? { id: "hero", stats: { hp: 10 } } : undefined;
        },
      }}
      rootSourceId="main"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "companion reference asset://characters/hero.json" }));

  expect(screen.getByDisplayValue("hero")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Go up one level" }).length).toBeGreaterThan(0);
});

test("reference edits can be saved through the host contract", async () => {
  const handleSave = vi.fn(async (documents: Record<string, unknown>) => documents);
  render(
    <EditorShell
      documents={{
        main: { profile: { companion: "asset://characters/hero.json" } },
        "asset://characters/hero.json": { id: "hero", stats: { hp: 10 } },
      }}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://characters/hero.json" ? { id: "hero", stats: { hp: 10 } } : undefined;
        },
      }}
      onSave={handleSave}
      rootSourceId="main"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "companion reference asset://characters/hero.json" }));
  fireEvent.change(screen.getByLabelText("Field id"), { target: { value: "hero-updated" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);

  await waitFor(() =>
    expect(handleSave).toHaveBeenCalledWith({
      main: { profile: { companion: "asset://characters/hero.json" } },
      "asset://characters/hero.json": { id: "hero-updated", stats: { hp: 10 } },
    }),
  );
});

test("failed reference expansion opens a new error page", async () => {
  render(
    <EditorShell
      documents={{ main: { profile: { broken: "asset://characters/missing.json" } } }}
      host={{
        loadReferenceSource() {
          throw new Error("Document not found");
        },
      }}
      rootSourceId="main"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "broken reference asset://characters/missing.json" }));

  await waitFor(() => expect(screen.getByText("Reference Error")).toBeInTheDocument());
  expect(screen.getByText("Document not found")).toBeInTheDocument();
  expect(screen.getAllByText("asset://characters/missing.json").length).toBeGreaterThan(0);
});

test("schema controls object field order and titles", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "object",
        properties: {
          title: { type: "string", title: "Title" },
          id: { type: "string", title: "Identifier" },
        },
      };
    },
  };

  const { container } = render(<EditorShell value={{ id: "quest_001", title: "First Quest" }} schemaHost={schemaHost} />);

  const headings = [...container.querySelectorAll(".property-heading > span:first-child")].map((node) => node.textContent?.trim());
  expect(headings.slice(0, 2)).toEqual(["Title", "Identifier"]);
});

test("schema enum fields render as selects", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema({ path }) {
      if (path.length === 0) {
        return {
          type: "object",
          properties: {
            rarity: {
              type: "string",
              title: "Rarity",
              enum: ["common", "rare", "legendary"],
            },
          },
        };
      }
      return undefined;
    },
  };

  render(<EditorShell value={{ rarity: "rare" }} schemaHost={schemaHost} />);

  expect(screen.getByLabelText("Field rarity")).toHaveDisplayValue("rare");
  expect(screen.getByRole("option", { name: "legendary" })).toBeInTheDocument();
});

test("validation failures block save and show field errors", async () => {
  const handleSave = vi.fn(async (documents: Record<string, unknown>) => documents);
  const validateDocument = vi.fn(async (): Promise<EditorValidationResult> => ({
    valid: false,
    documentErrors: ["Schema validation failed"],
    fieldErrors: [
      {
        sourceId: "main",
        path: ["title"],
        message: "Title is required",
      },
    ],
  }));

  render(
    <EditorShell
      documents={{ main: { title: "" } }}
      onSave={handleSave}
      validateDocument={validateDocument}
    />,
  );

  fireEvent.change(screen.getByLabelText("Field title"), { target: { value: "draft title" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);

  await waitFor(() => expect(validateDocument).toHaveBeenCalledTimes(1));
  expect(handleSave).not.toHaveBeenCalled();
  expect(screen.getByText("Title is required")).toBeInTheDocument();
  expect(screen.getByText("Schema validation failed")).toBeInTheDocument();
});
