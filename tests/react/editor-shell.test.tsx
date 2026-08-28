import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, vi } from "vitest";
import { App } from "../../src/App";
import { within } from "@testing-library/react";
import { EditorShell, resolveCompactStack } from "../../src/editor/EditorShell";
import { resolveViewSchema } from "../../src/editor/view-schema";
import type { EditorSchema, EditorSchemaHost, EditorSchemaViewFile, EditorValidationResult } from "../../src/editor/schema";

function createMutableSchemaHost(initialRootSchema: EditorSchema, initialNamedSchemas?: Record<string, EditorSchema>): EditorSchemaHost & {
  getRootSchemaSnapshot: () => EditorSchema;
  getNamedSchemaSnapshot: (name: string) => EditorSchema | undefined;
} {
  let rootSchema = structuredClone(initialRootSchema);
  let namedSchemas = structuredClone(initialNamedSchemas ?? {});
  return {
    getSchema() {
      return rootSchema;
    },
    getNamedSchema(name) {
      return namedSchemas[name];
    },
    setRootSchema(nextSchema) {
      rootSchema = structuredClone(nextSchema);
    },
    setNamedSchema(name, nextSchema) {
      namedSchemas = {
        ...namedSchemas,
        [name]: structuredClone(nextSchema),
      };
    },
    getRootSchemaSnapshot() {
      return structuredClone(rootSchema);
    },
    getNamedSchemaSnapshot(name) {
      const schema = namedSchemas[name];
      return schema ? structuredClone(schema) : undefined;
    },
  };
}

function createLayeredSchemaHost(
  initialRootSchema: EditorSchema,
  initialNamedSchemas?: Record<string, EditorSchema>,
  initialViewFile?: EditorSchemaViewFile,
): EditorSchemaHost & {
  getRootSchemaSnapshot: () => EditorSchema;
  getNamedSchemaSnapshot: (name: string) => EditorSchema | undefined;
  getViewFileSnapshot: () => EditorSchemaViewFile | undefined;
} {
  let rootSchema = structuredClone(initialRootSchema);
  let namedSchemas = structuredClone(initialNamedSchemas ?? {});
  let viewFile = initialViewFile ? structuredClone(initialViewFile) : undefined;
  return {
    getSchema(context) {
      if (context.activeViewPath && viewFile?.target === context.sourceId) {
        return resolveViewSchema(rootSchema, viewFile.schema);
      }
      return rootSchema;
    },
    getNamedSchema(name, context) {
      const defaultNamed = namedSchemas[name];
      if (context?.activeViewPath && viewFile?.target === context.sourceId) {
        return resolveViewSchema(defaultNamed, viewFile.namedSchemas?.[name]);
      }
      return defaultNamed;
    },
    setRootSchema(nextSchema, context) {
      if (context.writeTarget?.mode === "view") {
        viewFile = {
          ...(viewFile ?? { target: context.sourceId, schema: {} }),
          target: context.sourceId,
          schema: structuredClone(nextSchema),
        };
        return;
      }
      rootSchema = structuredClone(nextSchema);
    },
    setNamedSchema(name, nextSchema, context) {
      if (context.writeTarget?.mode === "view") {
        viewFile = {
          ...(viewFile ?? { target: context.sourceId, schema: {} }),
          target: context.sourceId,
          namedSchemas: {
            ...(viewFile?.namedSchemas ?? {}),
            [name]: structuredClone(nextSchema),
          },
        };
        return;
      }
      namedSchemas = {
        ...namedSchemas,
        [name]: structuredClone(nextSchema),
      };
    },
    getRootSchemaSnapshot() {
      return structuredClone(rootSchema);
    },
    getNamedSchemaSnapshot(name) {
      const schema = namedSchemas[name];
      return schema ? structuredClone(schema) : undefined;
    },
    getViewFileSnapshot() {
      return viewFile ? structuredClone(viewFile) : undefined;
    },
  };
}

function getCurrentActionButton(name: string) {
  return screen.getAllByRole("button", { name }).at(-1) as HTMLElement;
}

function getCurrentPageElement() {
  return document.querySelector(".stack-page.is-current:not(.stack-page--overlay)") as HTMLElement;
}

function getCurrentPageQueries() {
  return within(getCurrentPageElement());
}

function getBackgroundPageElement() {
  return document.querySelector(".stack-page--background:not(.stack-page--overlay)") as HTMLElement;
}

function quickPressHeaderMenu(button: HTMLElement) {
  fireEvent.mouseDown(button, { button: 0, clientX: 100, clientY: 20 });
  fireEvent.mouseUp(window, { button: 0, clientX: 100, clientY: 20 });
}

test("view schema object merge keeps override key order before default-only keys", () => {
  const resolved = resolveViewSchema(
    {
      type: "object",
      properties: {
        id: { type: "string", title: "Identifier" },
        title: { type: "string", title: "Title" },
        hp: { type: "integer", title: "Health" },
        owner: { type: "string", title: "Owner" },
      },
    },
    {
      properties: {
        hp: { title: "View Health" },
        id: { title: "View ID" },
        title: { title: "View Title" },
      },
    },
  );

  expect(Object.keys(resolved?.properties ?? {})).toEqual(["hp", "id", "title", "owner"]);
  expect(resolved?.properties?.hp.title).toBe("View Health");
  expect(resolved?.properties?.owner.title).toBe("Owner");
});

function createNavigationSemanticsSchemaHost(): EditorSchemaHost {
  return {
    getSchema() {
      return {
        type: "object",
        properties: {
          rootA: {
            type: "object",
            properties: {
              detailA: {
                type: "object",
                properties: {
                  hp: { type: "integer" },
                },
              },
            },
          },
          rootB: {
            type: "object",
            properties: {
              detailB: {
                type: "object",
                properties: {
                  mp: { type: "integer" },
                },
              },
            },
          },
        },
      };
    },
  };
}

test("renders a generic root document with the root breadcrumb only", () => {
  render(<EditorShell value={{ hello: "world" }} />);

  expect(screen.queryByText("JSON Document")).toBeNull();
  expect(screen.getAllByText("main").length).toBeGreaterThanOrEqual(2);
  expect(screen.getByLabelText("Field hello")).toHaveValue("world");
  expect(screen.getByText("Select a field to inspect")).toBeInTheDocument();
});

test("root pages use the source filename unless the schema defines a name field", () => {
  const documentSourceId = "asset://items/moon-charm.json";

  const { rerender } = render(
    <EditorShell
      documents={{ [documentSourceId]: { title: "Ignored Title", hello: "world" } }}
      rootSourceId={documentSourceId}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              hello: { type: "string" },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getAllByText("moon-charm").length).toBeGreaterThanOrEqual(2);

  rerender(
    <EditorShell
      documents={{ [documentSourceId]: { name: "Moon Charm", hello: "world" } }}
      rootSourceId={documentSourceId}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              name: { type: "string" },
              hello: { type: "string" },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getAllByText("Moon Charm").length).toBeGreaterThanOrEqual(2);
});

test("array pages use parent-based titles for nested indexes", () => {
  render(
    <EditorShell
      value={{
        matrix: [[[1]]],
      }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "matrix array 1 items" }));

  const firstArrayRow = document.querySelector('.stack-page.is-current tr[data-row-index="0"]') as HTMLElement;
  fireEvent.click(firstArrayRow);
  expect(getCurrentPageQueries().getByText("matrix[0]")).toBeInTheDocument();

  const secondArrayRow = document.querySelector('.stack-page.is-current tr[data-row-index="0"]') as HTMLElement;
  fireEvent.click(secondArrayRow);
  expect(getCurrentPageQueries().getByText("matrix[0][0]")).toBeInTheDocument();
});

test("compact mode follows the editor viewport width before falling back to window width", () => {
  expect(resolveCompactStack(768, 960, 640)).toBe(false);
  expect(resolveCompactStack(768, 0, 640)).toBe(true);
});

test("renders the redesigned demo shell with schema showcase navigation", () => {
  render(<App />);

  expect(screen.getByText("Schema-first JSON editing")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Schema Authoring Table" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reference Projection" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Select And Tags" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Free JSON Explorer" })).toBeInTheDocument();
  expect(screen.getByText("Default table columns")).toBeInTheDocument();
});

test("demo scenario switcher swaps the live schema showcase", () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Select And Tags" }));

  expect(screen.getByText("Literal values, schema-defined options")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Field Tags/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Field Rarity/i })).toBeInTheDocument();
});

test("schema-authoring demo can toggle between default and view schemas beside raw and edit", () => {
  render(<App />);

  const defaultHeaders = [
    "#",
    "Quest",
    "Quest ID",
    "Status",
    "Description",
  ];

  expect(screen.getAllByRole("columnheader").map((node) => node.getAttribute("aria-label")?.trim())).toEqual(defaultHeaders);

  const viewToggle = screen.getAllByRole("button", { name: "View schema mode" }).at(-1) as HTMLElement;
  expect(viewToggle).toHaveTextContent("View");
  expect(viewToggle).toHaveAttribute("aria-pressed", "false");
  expect(viewToggle).not.toHaveClass("is-active");

  fireEvent.click(viewToggle);

  expect(screen.getAllByRole("columnheader").map((node) => node.getAttribute("aria-label")?.trim())).toEqual(defaultHeaders);
  expect(viewToggle).toHaveTextContent("View");
  expect(viewToggle).toHaveAttribute("aria-pressed", "true");
  expect(viewToggle).toHaveClass("is-active");
});

test("schema-authoring demo keeps view schema edits isolated from the default schema", async () => {
  render(<App />);

  const viewToggle = screen.getAllByRole("button", { name: "View schema mode" }).at(-1) as HTMLElement;

  fireEvent.click(viewToggle);
  quickPressHeaderMenu(screen.getByRole("button", { name: "Quest" }));
  fireEvent.change(screen.getAllByLabelText("Column label for Quest").at(-1) as HTMLElement, { target: { value: "Mission View" } });

  expect(screen.getByRole("columnheader", { name: "Mission View" })).toBeInTheDocument();

  fireEvent.click(viewToggle);
  expect(screen.getByRole("columnheader", { name: "Quest" })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Mission View" })).toBeNull();

  fireEvent.click(viewToggle);
  await waitFor(() => expect(screen.getByRole("columnheader", { name: "Mission View" })).toBeInTheDocument());
});

test("schema-authoring demo keeps object view schema edits isolated from the default schema", async () => {
  render(<App />);

  fireEvent.click(screen.getByText("Wake The Beacon"));
  const currentPage = getCurrentPageQueries();
  const viewToggle = currentPage.getByRole("button", { name: "View schema mode" });

  fireEvent.click(viewToggle);
  fireEvent.click(currentPage.getByRole("button", { name: "Edit" }));
  fireEvent.change(currentPage.getByLabelText("Field label for Quest"), { target: { value: "View Quest" } });

  await waitFor(() => expect(currentPage.getByLabelText("Field View Quest")).toHaveValue("Wake The Beacon"));

  fireEvent.click(viewToggle);
  await waitFor(() => expect(currentPage.getByLabelText("Field Quest")).toHaveValue("Wake The Beacon"));
  expect(currentPage.queryByLabelText("Field View Quest")).toBeNull();

  fireEvent.click(viewToggle);
  await waitFor(() => expect(currentPage.getByLabelText("Field View Quest")).toHaveValue("Wake The Beacon"));
});

test("reference projection demo stays aligned with real item fields", () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Reference Projection" }));

  const headers = screen.getAllByRole("columnheader").map((node) => node.getAttribute("aria-label")?.trim());
  expect(headers).toEqual(["#", "Name", "Kind"]);

  fireEvent.click(screen.getByRole("button", { name: /Column visibility/ }));
  expect(screen.getByRole("button", { name: /ID/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Damage/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Bonus/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Bound Encounter/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Icon/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Description/ })).toBeNull();
});

test("value arrays hide column visibility controls and disallow hiding generated columns", () => {
  const schemaHost = createMutableSchemaHost({
    type: "array",
    items: {
      type: "string",
    },
  });

  render(
    <EditorShell
      value={["alpha", "beta"]}
      schemaHost={schemaHost}
    />,
  );

  expect(screen.queryByRole("columnheader", { name: "Type" })).toBeNull();
  expect(screen.getByRole("columnheader", { name: "#" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Value" })).toBeInTheDocument();

  expect(screen.queryByRole("button", { name: /Column visibility/ })).toBeNull();

  const valueHeaderButton = screen.getByRole("button", { name: "Value" });
  quickPressHeaderMenu(valueHeaderButton);

  expect(screen.getByText("Type")).toBeInTheDocument();
  expect(screen.getByText("string")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Hide" })).toBeNull();
});

test("存量原始值数组的空列配置会恢复 Value 列并提示使用者", async () => {
  const schemaHost = createMutableSchemaHost({
    type: "array",
    items: { type: "string" },
    "x-editor": { table: { columns: [] } },
  });

  render(<EditorShell value={["COMBAT_VICTORY"]} schemaHost={schemaHost} />);

  expect(screen.getByRole("columnheader", { name: "Value" })).toBeInTheDocument();
  expect(screen.getByText("原始值数组不能隐藏全部列；已恢复 Value 列。")).toBeInTheDocument();
  await waitFor(() => expect(schemaHost.getRootSchemaSnapshot()["x-editor"]?.table?.columns).toEqual([{ key: "Value" }]));
});

test("reference projection demo can open nested encounter references from shared demo sources", () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Reference Projection" }));
  fireEvent.click(screen.getByRole("row", { name: "2 Moon Charm item" }));
  fireEvent.click(screen.getByRole("button", { name: "boundEncounter reference asset://encounters/shadow-eye.json" }));

  expect(screen.queryByText("Reference content not found")).toBeNull();
  expect(getCurrentPageQueries().getByDisplayValue("shadow-eye")).toBeInTheDocument();
});

test("demo settings can toggle editing and raw json affordances", () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  expect(screen.getByLabelText("Enable editing")).toBeChecked();
  expect(screen.getByLabelText("Enable raw JSON")).toBeChecked();

  fireEvent.click(screen.getByLabelText("Enable raw JSON"));
  expect(screen.queryByRole("button", { name: "Raw" })).toBeNull();

  fireEvent.click(screen.getByLabelText("Enable editing"));
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
});

test("demo settings can switch the layout mode to pinned root", () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.change(screen.getByLabelText("Layout mode"), { target: { value: "pinned-root" } });

  expect(screen.getByLabelText("Layout mode")).toHaveValue("pinned-root");
});

test("demo settings can toggle auto fullscreen when only the left page is visible", () => {
  const { container } = render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  const fullscreenToggle = screen.getByLabelText("Auto fullscreen single left page");
  expect(fullscreenToggle).toBeChecked();
  expect(container.querySelector(".stack-page--fullscreen-left")).not.toBeNull();

  fireEvent.click(fullscreenToggle);

  expect(fullscreenToggle).not.toBeChecked();
  expect(container.querySelector(".stack-page--fullscreen-left")).toBeNull();
});

test("demo settings button ignores long press release", () => {
  vi.useFakeTimers();
  render(<App />);

  const settingsButton = screen.getByRole("button", { name: "Settings" });

  try {
    fireEvent.mouseDown(settingsButton, { button: 0, clientX: 60, clientY: 24 });
    act(() => {
      vi.advanceTimersByTime(350);
    });
    fireEvent.mouseUp(settingsButton, { button: 0, clientX: 60, clientY: 24 });
    fireEvent.click(settingsButton);

    expect(screen.queryByText("Demo Settings")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("demo app uses wide-screen dual-page stack flow", () => {
  const originalInnerWidth = window.innerWidth;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });

  try {
    const { container } = render(<App />);
    fireEvent.click(screen.getByText("Wake The Beacon"));

    expect(container.querySelector(".stack-page--background")).not.toBeNull();
    expect(container.querySelector(".stack-page--foreground")).not.toBeNull();
  } finally {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
  }
});

test("object pages edit primitive fields inline", () => {
  render(<EditorShell value={{ hello: "world" }} />);

  fireEvent.change(screen.getByLabelText("Field hello"), { target: { value: "galaxy" } });

  expect(screen.getByDisplayValue("galaxy")).toBeInTheDocument();
});

test("nested entry buttons only render one primary label", () => {
  const { container } = render(
    <EditorShell
      value={{
        profile: { stats: { hp: 10 } },
        links: ["asset://characters/hero.json"],
      }}
    />,
  );

  const objectEntry = screen.getByRole("button", { name: "profile object 1 fields" });
  expect(objectEntry.querySelector(".entry-key")?.textContent).toBe("1 fields");
  expect(objectEntry.querySelector(".entry-type")).toBeNull();
  expect(objectEntry.querySelector(".entry-preview")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "links array 1 items" }));
  const referenceEntry = screen.getByRole("button", { name: /asset:\/\/characters\/hero\.json/i });
  expect(referenceEntry.querySelector(".entry-key")).not.toBeNull();
  expect(referenceEntry.querySelector(".entry-type")).toBeNull();
  expect(referenceEntry.querySelector(".entry-preview")).toBeNull();
  expect(container.querySelectorAll(".nested-entry-button .entry-type").length).toBe(0);
  expect(container.querySelectorAll(".nested-entry-button .entry-preview").length).toBe(0);
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

test("reload without a host callback retains the current document and exposes the failure", () => {
  render(<EditorShell documents={{ main: { hello: "world" } }} onSave={() => undefined} />);

  fireEvent.change(screen.getByLabelText("Field hello"), { target: { value: "galaxy" } });
  fireEvent.click(screen.getByRole("button", { name: "Reload JSON data" }));

  expect(screen.getByDisplayValue("galaxy")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("当前宿主未提供 JSON 刷新入口");
  expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
});

test("host reload can replace the in-memory documents", async () => {
  const handleReload = vi.fn(async () => ({ main: { hello: "reloaded" } }));
  render(<EditorShell documents={{ main: { hello: "world" } }} onReload={handleReload} onSave={() => undefined} />);

  fireEvent.change(screen.getByLabelText("Field hello"), { target: { value: "galaxy" } });
  fireEvent.click(screen.getByRole("button", { name: "Reload JSON data" }));

  await waitFor(() => expect(handleReload).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByDisplayValue("reloaded")).toBeInTheDocument());
});

test("hosts can observe live document changes before save", async () => {
  const handleChange = vi.fn();
  render(<EditorShell documents={{ main: { hello: "world" } }} onChange={handleChange} />);

  fireEvent.change(screen.getByLabelText("Field hello"), { target: { value: "galaxy" } });

  await waitFor(() => expect(handleChange).toHaveBeenCalledWith({ main: { hello: "galaxy" } }));
});

test("schema writes in view mode update only the view file while default mode stays unchanged", () => {
  const schemaHost = createLayeredSchemaHost(
    {
      type: "array",
      "x-editor": {
        table: {
          columns: [
            { key: "title" },
            { key: "status" },
          ],
        },
      },
      items: {
        type: "object",
        properties: {
          title: { type: "string", title: "Title" },
          status: { type: "string", title: "Status" },
        },
      },
    },
    undefined,
    {
      target: "main",
      schema: {
        "x-editor": {
          table: {
            columns: [
              { key: "title", label: "View Title" },
              { key: "status", label: "Stage" },
            ],
          },
        },
      },
    },
  );

  const { rerender } = render(
    <EditorShell
      value={[{ title: "Wake The Beacon", status: "draft" }]}
      schemaHost={schemaHost}
      activeSchemaLayer={{ mode: "view", path: "views/main.view.json" }}
    />,
  );

  quickPressHeaderMenu(screen.getByRole("button", { name: "View Title" }));
  fireEvent.change(screen.getAllByLabelText("Column label for View Title").at(-1) as HTMLElement, { target: { value: "Mission View" } });

  expect(schemaHost.getRootSchemaSnapshot()["x-editor"]?.table?.columns).toEqual([
    { key: "title" },
    { key: "status" },
  ]);
  expect(schemaHost.getViewFileSnapshot()?.schema["x-editor"]?.table?.columns).toEqual([
    { key: "title", label: "Mission View" },
    { key: "status", label: "Stage" },
  ]);

  rerender(
    <EditorShell
      value={[{ title: "Wake The Beacon", status: "draft" }]}
      schemaHost={schemaHost}
      activeSchemaLayer={{ mode: "default" }}
    />,
  );

  expect(screen.getByRole("columnheader", { name: "Title" })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Mission View" })).toBeNull();

  rerender(
    <EditorShell
      value={[{ title: "Wake The Beacon", status: "draft" }]}
      schemaHost={schemaHost}
      activeSchemaLayer={{ mode: "view", path: "views/main.view.json" }}
    />,
  );

  expect(screen.getByRole("columnheader", { name: "Mission View" })).toBeInTheDocument();
});

test("view schema overrides apply when toggled from an open array row object page", () => {
  const schemaHost = createLayeredSchemaHost(
    {
      type: "array",
      "x-editor": {
        table: {
          columns: [
            { key: "title" },
            { key: "status" },
          ],
        },
      },
      items: {
        type: "object",
        properties: {
          title: { type: "string", title: "Title" },
          status: { type: "string", title: "Status" },
        },
      },
    },
    undefined,
    {
      target: "main",
      schema: {
        items: {
          properties: {
            title: { title: "View Title" },
          },
        },
      },
    },
  );

  const { rerender } = render(
    <EditorShell
      value={[{ title: "Wake The Beacon", status: "draft" }]}
      schemaHost={schemaHost}
      activeSchemaLayer={{ mode: "default" }}
    />,
  );

  fireEvent.click(screen.getByRole("row", { name: /Wake The Beacon/i }));

  expect(getCurrentPageQueries().getByLabelText("Field Title")).toBeInTheDocument();
  expect(getCurrentPageQueries().queryByLabelText("Field View Title")).toBeNull();

  rerender(
    <EditorShell
      value={[{ title: "Wake The Beacon", status: "draft" }]}
      schemaHost={schemaHost}
      activeSchemaLayer={{ mode: "view", path: "views/main.view.json" }}
    />,
  );

  expect(getCurrentPageQueries().getByLabelText("Field View Title")).toBeInTheDocument();
  expect(getCurrentPageQueries().queryByLabelText("Field Title")).toBeNull();
});

test("附加字段不显示拖动把手，已声明字段正常显示", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "object",
        properties: {
          alpha: { type: "string", title: "Alpha" },
          beta: { type: "string", title: "Beta" },
        },
        additionalProperties: true,
      };
    },
    setRootSchema() { return undefined; },
  };

  render(<EditorShell value={{ alpha: "1", beta: "2", extra: "3" }} schemaHost={schemaHost} />);

  expect(screen.getByRole("button", { name: "Reorder Alpha" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reorder Beta" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reorder extra" })).not.toBeInTheDocument();
});

test("仅一个已声明字段时所有字段都不显示拖动把手", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "object",
        properties: {
          alpha: { type: "string", title: "Alpha" },
        },
        additionalProperties: true,
      };
    },
    setRootSchema() { return undefined; },
  };

  render(<EditorShell value={{ alpha: "1", extra: "2", other: "3" }} schemaHost={schemaHost} />);

  expect(screen.queryByRole("button", { name: /Reorder /i })).not.toBeInTheDocument();
});

test("拖已声明字段后 schema.properties 键集合不变且附加字段恒尾部", () => {
  const schemaHost = createMutableSchemaHost({
    type: "object",
    properties: {
      alpha: { type: "string", title: "Alpha" },
      beta: { type: "string", title: "Beta" },
    },
    additionalProperties: true,
  });

  const { container } = render(<EditorShell value={{ alpha: "1", beta: "2", extra: "3" }} schemaHost={schemaHost} />);

  const betaHandle = screen.getByRole("button", { name: "Reorder Beta" });
  const mockRow = (handle: HTMLElement, top: number) => {
    (handle.closest(".detail-property-item") as HTMLElement).getBoundingClientRect = () => ({
      x: 0, y: top, width: 300, height: 72, top, right: 300, bottom: top + 72, left: 0, toJSON() { return {}; },
    } as DOMRect);
  };
  mockRow(betaHandle, 120);
  mockRow(screen.getByRole("button", { name: "Reorder Alpha" }), 40);
  const extraRow = (screen.getByText("extra").closest(".detail-property-item")) as HTMLElement;
  extraRow.getBoundingClientRect = () => ({ x: 0, y: 200, width: 300, height: 72, top: 200, right: 300, bottom: 272, left: 0, toJSON() { return {}; } } as DOMRect);

  // 把 beta 拖到 alpha 之前
  fireEvent.mouseDown(betaHandle, { button: 0, clientX: 10, clientY: 150 });
  fireEvent.mouseMove(window, { clientX: 10, clientY: 30 });
  fireEvent.mouseUp(window, { clientX: 10, clientY: 30 });

  const saved = schemaHost.getRootSchemaSnapshot();
  expect(Object.keys(saved.properties ?? {})).toEqual(["beta", "alpha"]);
  // 键集合不变：附加字段未被注入 schema
  expect(Object.keys(saved.properties ?? {})).toEqual(["beta", "alpha"]);
  // 字段显示顺序：附加字段恒在尾部
  expect([...container.querySelectorAll(".property-heading > span")].slice(0, 3).map((node) => node.textContent?.trim())).toEqual([
    "Beta",
    "Alpha",
    "extra",
  ]);
});

test("object schema field order writes in view mode update only the view file", () => {
  const schemaHost = createLayeredSchemaHost({
    type: "object",
    properties: {
      id: { type: "string", title: "Identifier" },
      title: { type: "string", title: "Title" },
      hp: { type: "integer", title: "Health" },
    },
  });

  const { container, rerender } = render(
    <EditorShell
      value={{ id: "quest_001", title: "First Quest", hp: 10 }}
      schemaHost={schemaHost}
      activeSchemaLayer={{ mode: "view", path: "views/main.view.json" }}
    />,
  );

  const healthHandle = screen.getByRole("button", { name: "Reorder Health" });
  const idHandle = screen.getByRole("button", { name: "Reorder Identifier" });
  const titleHandle = screen.getByRole("button", { name: "Reorder Title" });
  (idHandle.closest(".detail-property-item") as HTMLElement).getBoundingClientRect = () => ({
    x: 0,
    y: 200,
    width: 300,
    height: 72,
    top: 200,
    right: 300,
    bottom: 272,
    left: 0,
    toJSON() {
      return {};
    },
  } as DOMRect);
  (healthHandle.closest(".detail-property-item") as HTMLElement).getBoundingClientRect = () => ({
    x: 0,
    y: 120,
    width: 300,
    height: 72,
    top: 120,
    right: 300,
    bottom: 192,
    left: 0,
    toJSON() {
      return {};
    },
  } as DOMRect);
  (titleHandle.closest(".detail-property-item") as HTMLElement).getBoundingClientRect = () => ({
    x: 0,
    y: 40,
    width: 300,
    height: 72,
    top: 40,
    right: 300,
    bottom: 112,
    left: 0,
    toJSON() {
      return {};
    },
  } as DOMRect);

  fireEvent.mouseDown(healthHandle, { button: 0, clientX: 10, clientY: 150 });
  fireEvent.mouseMove(window, { clientX: 10, clientY: 60 });
  fireEvent.mouseUp(window, { clientX: 10, clientY: 60 });

  expect([...container.querySelectorAll(".property-heading > span")].slice(0, 3).map((node) => node.textContent?.trim())).toEqual([
    "Health",
    "Identifier",
    "Title",
  ]);
  expect(Object.keys(schemaHost.getRootSchemaSnapshot().properties ?? {})).toEqual(["id", "title", "hp"]);
  expect(Object.keys(schemaHost.getViewFileSnapshot()?.schema.properties ?? {})).toEqual(["hp", "id", "title"]);

  rerender(
    <EditorShell
      value={{ id: "quest_001", title: "First Quest", hp: 10 }}
      schemaHost={schemaHost}
      activeSchemaLayer={{ mode: "default" }}
    />,
  );

  expect([...container.querySelectorAll(".property-heading > span")].slice(0, 3).map((node) => node.textContent?.trim())).toEqual([
    "Identifier",
    "Title",
    "Health",
  ]);
});

test("read only mode keeps navigation but disables mutation controls", () => {
  render(<EditorShell value={{ hello: "world", nested: { hp: 10 } }} readOnly />);

  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  expect(screen.getByLabelText("Field hello")).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "nested object 1 fields" }));

  expect(getCurrentPageQueries().getByDisplayValue("10")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
});

test("schema readOnly fields stay navigable but disable direct editing", () => {
  render(
    <EditorShell
      value={{ id: "quest_001", title: "First Quest" }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              id: { type: "string", readOnly: true },
              title: { type: "string" },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getByLabelText("Field id")).toBeDisabled();
  expect(screen.getByLabelText("Field title")).not.toBeDisabled();
});

test("schema textarea fields render textarea even for short text", () => {
  render(
    <EditorShell
      value={{ description: "short text" }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              description: {
                type: "string",
                "x-editor": {
                  fieldType: "textarea",
                },
              },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getByLabelText("Field description").tagName).toBe("TEXTAREA");
});

test("array pages render a table workspace", () => {
  render(<EditorShell value={{ party: [{ id: "hero", hp: 10 }, { id: "guide", hp: 6 }] }} />);

  fireEvent.click(screen.getByRole("button", { name: "party array 2 items" }));

  expect(getCurrentPageQueries().getByRole("columnheader", { name: "id" })).toBeInTheDocument();
  expect(getCurrentPageQueries().getByRole("columnheader", { name: "hp" })).toBeInTheDocument();
  expect(getCurrentPageQueries().getByText("hero")).toBeInTheDocument();
});

test("array pages stay in browse mode until Edit is enabled", () => {
  render(<EditorShell value={{ party: ["asset://quests/intro.json"] }} />);

  fireEvent.click(screen.getByRole("button", { name: "party array 1 items" }));

  expect(screen.queryByRole("button", { name: "Copy row 1" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete row 1" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Create row" })).toBeNull();
  expect(getCurrentActionButton("Edit")).toBeInTheDocument();
});

test("clickable array rows ignore long press release", () => {
  vi.useFakeTimers();
  render(<EditorShell value={{ party: [{ id: "hero", hp: 10 }, { id: "guide", hp: 6 }] }} />);

  fireEvent.click(screen.getByRole("button", { name: "party array 2 items" }));
  const row = screen.getByRole("row", { name: "hero 10" });

  try {
    fireEvent.mouseDown(row, { button: 0, clientX: 120, clientY: 80 });
    act(() => {
      vi.advanceTimersByTime(350);
    });
    fireEvent.mouseUp(row, { button: 0, clientX: 120, clientY: 80 });
    fireEvent.click(row);

    expect(getCurrentPageQueries().queryByLabelText("Field id")).toBeNull();
    expect(screen.getByRole("row", { name: "guide 6" })).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
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

test("pinned-root 娣卞眰杩斿洖涓嶄細璇Е鍙?stack-flow 鐨?pop 鍔ㄧ敾", () => {
  vi.useFakeTimers();
  const { container } = render(<EditorShell value={{ profile: { stats: { hp: 10 } } }} layoutMode="pinned-root" />);

  try {
    fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
    fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(container.querySelector(".stack-page--pop-exit")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("pinned-root 模式在根页右侧显示固定空态", () => {
  render(<EditorShell value={{ profile: { hp: 10 } }} layoutMode="pinned-root" />);

  expect(screen.getByText("Select a field to inspect")).toBeInTheDocument();
});

test("stack-flow 在开启 leftPageFullscreen 时会让单页铺满编辑器", () => {
  const { container } = render(
    <EditorShell value={{ profile: { hp: 10 } }} layoutMode="stack-flow" leftPageFullscreen />,
  );

  expect(container.querySelector(".stack-page--fullscreen-left")).not.toBeNull();
});

test("pinned-root 在开启 leftPageFullscreen 时会让根页铺满并隐藏空右页", () => {
  const { container } = render(
    <EditorShell value={{ profile: { hp: 10 } }} layoutMode="pinned-root" leftPageFullscreen />,
  );

  expect(container.querySelector(".stack-page--fullscreen-left")).not.toBeNull();
  expect(screen.queryByText("Select a field to inspect")).toBeNull();
});

test("pinned-root 模式导航后保留左侧 root 页", () => {
  const { container } = render(<EditorShell value={{ profile: { hp: 10 } }} layoutMode="pinned-root" />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));

  expect(container.querySelector(".stack-page--background")).not.toBeNull();
  expect(container.querySelector(".stack-page--foreground")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Close right page" })).toBeInTheDocument();
});

test("手动锁定左页后，右页深钻只替换右侧且左页保持不动", () => {
  vi.useFakeTimers();
  const { container } = render(
    <EditorShell value={{ profile: { stats: { detail: { hp: 10 } } } }} layoutMode="stack-flow" />,
  );

  try {
    fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
    act(() => { vi.advanceTimersByTime(600); });
    fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
    act(() => { vi.advanceTimersByTime(600); });

    fireEvent.click(screen.getByRole("button", { name: "Pin left page" }));
    expect(screen.getByRole("button", { name: "Unpin left page" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "detail object 1 fields" }));

    expect(container.querySelectorAll(".stack-page--background")).toHaveLength(1);
    expect(container.querySelector(".stack-page--replace-enter")).not.toBeNull();
    expect(container.querySelector(".stack-page--push-enter")).toBeNull();
    expect(screen.getByRole("button", { name: "stats object 1 fields" })).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test("刷新成功会取消手动锁定并回到最新根 JSON", async () => {
  const handleReload = vi.fn(async () => ({ main: { refreshed: "yes" } }));
  render(<EditorShell documents={{ main: { profile: { stats: { hp: 10 } } } }} onReload={handleReload} />);

  fireEvent.click(screen.getByRole("button", { name: "Pin left page" }));
  expect(screen.getByRole("button", { name: "Unpin left page" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reload JSON data" }));

  await waitFor(() => expect(handleReload).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByDisplayValue("yes")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Pin left page" })).toBeInTheDocument();
});

test("pinned-root 妯″紡涓嬬偣鍑诲彸椤垫寜閽細娌跨敤宸﹂〉鐨?replace 鍔ㄧ敾璇箟", () => {
  const { container } = render(<EditorShell value={{ profile: { stats: { hp: 10 } } }} layoutMode="pinned-root" />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));

  expect(container.querySelector(".stack-page--replace-enter")).not.toBeNull();
  expect(container.querySelector(".stack-page--push-enter")).toBeNull();
  expect(container.querySelector(".stack-page--push-enter-delayed")).toBeNull();
});

test("stack-flow 在开启 leftPageFullscreen 时为右页显示关闭按钮并可关闭回单页", () => {
  vi.useFakeTimers();
  const { container } = render(
    <EditorShell value={{ profile: { stats: { hp: 10 } } }} layoutMode="stack-flow" leftPageFullscreen />,
  );

  try {
    fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));

    const closeButton = screen.getByRole("button", { name: "Close right page" });
    expect(closeButton).toBeInTheDocument();

    fireEvent.click(closeButton);
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.queryByRole("button", { name: "Close right page" })).toBeNull();
    expect(screen.getByRole("button", { name: "profile object 1 fields" })).toBeInTheDocument();
    expect(container.querySelector(".stack-page--fullscreen-left")).not.toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("fullscreen 不改变页面原本是否有返回按钮的规则", () => {
  vi.useFakeTimers();
  render(
    <EditorShell value={{ profile: { stats: { hp: 10 } } }} layoutMode="stack-flow" leftPageFullscreen />,
  );

  try {
    expect(screen.queryByRole("button", { name: "Go up one level" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
    fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
    fireEvent.click(screen.getByRole("button", { name: "Close right page" }));
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.getByRole("button", { name: "Go up one level" })).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test("fullscreen A 返回时恢复 root 加 A 的双页上下文，而不是 fullscreen root", () => {
  vi.useFakeTimers();
  const { container } = render(
    <EditorShell value={{ profile: { stats: { hp: 10 } } }} layoutMode="stack-flow" leftPageFullscreen />,
  );

  try {
    fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
    fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
    fireEvent.click(screen.getByRole("button", { name: "Close right page" }));
    act(() => {
      vi.advanceTimersByTime(600);
    });

    fireEvent.click(screen.getByRole("button", { name: "Go up one level" }));

    expect(container.querySelector(".stack-page--pop-promote")).not.toBeNull();
    expect(container.querySelector(".stack-page--fullscreen-left")).toBeNull();
    expect(container.querySelector(".stack-page--background")).not.toBeNull();
    expect(container.querySelector(".stack-page--foreground")).not.toBeNull();
    expect(screen.getByRole("button", { name: "profile object 1 fields" })).toBeInTheDocument();
    expect(getCurrentPageQueries().getByRole("button", { name: "stats object 1 fields" })).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test("pinned-root 在开启 leftPageFullscreen 时为右页显示关闭按钮并可关闭回根页", () => {
  render(
    <EditorShell value={{ profile: { hp: 10 } }} layoutMode="pinned-root" leftPageFullscreen />,
  );

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));

  const closeButton = screen.getByRole("button", { name: "Close right page" });
  expect(closeButton).toBeInTheDocument();

  fireEvent.click(closeButton);

  expect(screen.queryByRole("button", { name: "Close right page" })).toBeNull();
  expect(screen.getByRole("button", { name: "profile object 1 fields" })).toBeInTheDocument();
  expect(screen.queryByText("Select a field to inspect")).toBeNull();
});

test("leftPageFullscreen 的 Close 会直接关闭整个右页上下文，而不是只回退一层", () => {
  vi.useFakeTimers();
  render(
    <EditorShell
      value={{ profile: { stats: { hp: 10 } } }}
      layoutMode="pinned-root"
      leftPageFullscreen
    />,
  );

  try {
    fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
    fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));

    fireEvent.click(screen.getByRole("button", { name: "Close right page" }));
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.queryByRole("button", { name: "Close right page" })).toBeNull();
    expect(screen.getByRole("button", { name: "profile object 1 fields" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("10")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("closing a right page uses fade-out instead of pop promotion", () => {
  const { container } = render(
    <EditorShell value={{ profile: { stats: { hp: 10 } } }} layoutMode="stack-flow" leftPageFullscreen />,
  );

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "Close right page" }));

  expect(container.querySelector(".stack-page--pop-exit")).not.toBeNull();
  expect(container.querySelector(".stack-page--pop-promote")).toBeNull();
  expect(container.querySelector(".stack-page--fullscreen-left")).not.toBeNull();
});

test("stack-flow 的 Close 会保留当前左页并结束右页上下文", () => {
  vi.useFakeTimers();
  render(
    <EditorShell
      value={{ profile: { stats: { hp: 10 } } }}
      layoutMode="stack-flow"
      leftPageFullscreen
    />,
  );

  try {
    fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
    fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
    fireEvent.click(screen.getByRole("button", { name: "Close right page" }));

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(getCurrentPageQueries().getByRole("button", { name: "stats object 1 fields" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("10")).toBeNull();
    expect(screen.queryByRole("button", { name: "Close right page" })).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("stack-flow 关闭右页后再次 push 会把 fullscreen 页视为唯一左页并直接 fade in 新右页", () => {
  vi.useFakeTimers();
  const { container } = render(
    <EditorShell
      value={{ profile: { stats: { hp: 10 } } }}
      layoutMode="stack-flow"
      leftPageFullscreen
    />,
  );

  try {
    fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
    fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
    fireEvent.click(screen.getByRole("button", { name: "Close right page" }));
    act(() => {
      vi.advanceTimersByTime(600);
    });

    fireEvent.click(getCurrentPageQueries().getByRole("button", { name: "stats object 1 fields" }));

    expect(container.querySelector(".stack-page--push-promote-shell")).toBeNull();
    expect(container.querySelector(".stack-page--push-enter")).not.toBeNull();
    expect(container.querySelector(".stack-page--replace-enter")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("默认 stack-flow 模式在宽屏导航后显示双页上下文", () => {
  const { container } = render(<EditorShell value={{ profile: { hp: 10 } }} />);

  expect(screen.getByText("Select a field to inspect")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));

  expect(container.querySelector(".stack-page--background")).not.toBeNull();
  expect(container.querySelector(".stack-page--foreground")).not.toBeNull();
});

test.each([
  { layoutMode: "stack-flow" as const, label: "stack-flow" },
  { layoutMode: "pinned-root" as const, label: "pinned-root" },
])("$label 的基础导航语义矩阵保持稳定", ({ layoutMode }) => {
  render(
    <EditorShell
      value={{
        rootA: { detailA: { hp: 10 } },
        rootB: { detailB: { mp: 20 } },
      }}
      layoutMode={layoutMode}
      schemaHost={createNavigationSemanticsSchemaHost()}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "rootA object 1 fields" }));
  expect(screen.getByRole("button", { name: "detailA object 1 fields" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "rootB object 1 fields" }));
  expect(screen.getByRole("button", { name: "detailB object 1 fields" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "detailA object 1 fields" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "detailB object 1 fields" }));
  expect(getCurrentPageQueries().getByLabelText("Field mp")).toHaveValue(20);

  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("button", { name: "detailB object 1 fields" })).toBeInTheDocument();
  expect(getCurrentPageQueries().queryByLabelText("Field mp")).toBeNull();
});

test("stack-flow 在左页是 reference 时点击左页兄弟项仍然 replace 右页", () => {
  vi.useFakeTimers();
  render(
    <EditorShell
      documents={{
        main: { encounter: "asset://encounters/shadow-eye.json" },
        "asset://encounters/shadow-eye.json": {
          boundEncounter: { hp: 12 },
          bonus: { manaRegen: 2 },
        },
      }}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://encounters/shadow-eye.json"
            ? {
                boundEncounter: { hp: 12 },
                bonus: { manaRegen: 2 },
              }
            : undefined;
        },
      }}
      rootSourceId="main"
    />,
  );
  try {
    fireEvent.click(screen.getByRole("button", { name: "encounter reference asset://encounters/shadow-eye.json" }));
    fireEvent.click(screen.getByRole("button", { name: "boundEncounter object 1 fields" }));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(getCurrentPageQueries().getByLabelText("Field hp")).toHaveValue(12);

    fireEvent.click(screen.getByRole("button", { name: "bonus object 1 fields" }));

    expect(getCurrentPageQueries().getByLabelText("Field manaRegen")).toHaveValue(2);
    expect(getCurrentPageQueries().queryByLabelText("Field hp")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("stack-flow 在 reference 对象左页从 boundEncounter 切到 bonus 时不推动左页", () => {
  vi.useFakeTimers();
  const { container } = render(
    <EditorShell
      value={{ item: "asset://items/moon-charm.json" }}
      host={{
        loadReferenceSource(uri) {
          if (uri === "asset://items/moon-charm.json") {
            return {
              id: "moon-charm",
              kind: "item",
              name: "Moon Charm",
              bonus: { manaRegen: 2 },
              boundEncounter: "asset://encounters/shadow-eye.json",
            };
          }
          if (uri === "asset://encounters/shadow-eye.json") {
            return { darkness: 4 };
          }
          return undefined;
        },
      }}
    />,
  );

  try {
    fireEvent.click(screen.getByRole("button", { name: "item reference asset://items/moon-charm.json" }));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.click(screen.getByRole("button", { name: "boundEncounter reference asset://encounters/shadow-eye.json" }));
    act(() => {
      vi.advanceTimersByTime(600);
    });

    fireEvent.click(screen.getByRole("button", { name: "bonus object 1 fields" }));

    expect(container.querySelector(".stack-page--replace-enter")).not.toBeNull();
    expect(container.querySelector(".stack-page--replace-promote")).toBeNull();
    expect(getCurrentPageQueries().getByLabelText("Field manaRegen")).toHaveValue(2);
    expect(getCurrentPageQueries().queryByLabelText("Field darkness")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("stack-flow 在普通 object 左页中从 reference 切到 array 时仍然 replace 右页", () => {
  vi.useFakeTimers();
  const { container } = render(
    <EditorShell
      value={[
        { id: "row-0" },
        {
          id: "row-1",
          boundEncounter: "asset://encounters/shadow-eye.json",
          bonus: ["mana", "speed"],
        },
      ]}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://encounters/shadow-eye.json"
            ? { hp: 12, kind: "encounter" }
            : undefined;
        },
      }}
    />,
  );

  try {
    fireEvent.click(screen.getByRole("row", { name: "row-1 asset://encounters/shadow-eye.json 2 items" }));
    fireEvent.click(screen.getByRole("button", { name: "boundEncounter reference asset://encounters/shadow-eye.json" }));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(getCurrentPageQueries().getByLabelText("Field hp")).toHaveValue(12);

    fireEvent.click(screen.getByRole("button", { name: "bonus array 2 items" }));

    expect(container.querySelector(".stack-page--replace-enter")).not.toBeNull();
    expect(container.querySelector(".stack-page--replace-promote")).toBeNull();
    expect(container.querySelector(".stack-page--push-promote-shell")).toBeNull();
    expect(getCurrentPageQueries().getByLabelText("Array item 0")).toHaveValue("mana");
    expect(getCurrentPageQueries().queryByLabelText("Field hp")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("stack-flow 在左页普通 object 且右页为 reference error 时点击左页 array 仍然 replace 右页", () => {
  vi.useFakeTimers();
  const { container } = render(
    <EditorShell
      value={[
        { id: "row-0" },
        {
          id: "row-1",
          boundEncounter: "asset://encounters/shadow-eye.json",
          bonus: ["mana", "speed"],
        },
      ]}
      host={{
        loadReferenceSource() {
          return undefined;
        },
      }}
    />,
  );

  try {
    fireEvent.click(screen.getByRole("row", { name: "row-1 asset://encounters/shadow-eye.json 2 items" }));
    fireEvent.click(screen.getByRole("button", { name: "boundEncounter reference asset://encounters/shadow-eye.json" }));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(getCurrentPageQueries().getByText("Reference content not found")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "bonus array 2 items" }));

    expect(container.querySelector(".stack-page--replace-enter")).not.toBeNull();
    expect(container.querySelector(".stack-page--replace-promote")).toBeNull();
    expect(container.querySelector(".stack-page--push-promote-shell")).toBeNull();
    expect(container.querySelector(".stack-page--pop-promote")).toBeNull();
    expect(getCurrentPageQueries().getByLabelText("Array item 0")).toHaveValue("mana");
    expect(getCurrentPageQueries().queryByText("Reference content not found")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("stack-flow 双页模式下左右页都保留相同的 footer 动作", () => {
  render(<EditorShell value={{ profile: { stats: { hp: 10 } } }} />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));

  expect(screen.getAllByRole("button", { name: "Raw" })).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(2);
});

test("默认 stack-flow 模式在 root 时显示和 pinned-root 一样的右侧空态", () => {
  const { container } = render(<EditorShell value={{ profile: { hp: 10 } }} />);

  expect(screen.getByText("Select a field to inspect")).toBeInTheDocument();
  expect(container.querySelector(".stack-page--background")).not.toBeNull();
  expect(container.querySelector(".stack-page--foreground")).not.toBeNull();
});

test("stack-flow 深层返回时恢复 pop 动画", () => {
  vi.useFakeTimers();
  const { container } = render(<EditorShell value={{ profile: { stats: { hp: 10 } } }} />);

  try {
    fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
    fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(container.querySelector(".stack-page--pop-exit")).toBeNull();
    expect(container.querySelector(".stack-page--pop-promote")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Go up one level" })).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("stack-flow 的左页在可回退时显示页头返回按钮", () => {
  const { container } = render(<EditorShell value={{ profile: { stats: { hp: 10 } } }} />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));

  expect(container.querySelectorAll(".page-back-button").length).toBeGreaterThan(0);
});

test("stack-flow 在双页且左页不是 root 时保留左页返回按钮", () => {
  render(<EditorShell value={{ profile: { stats: { details: { hp: 10 } } } }} />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "details object 1 fields" }));

  const backButtons = screen.getAllByRole("button", { name: "Go up one level" });
  expect(backButtons).toHaveLength(1);
});

test("back from a right page with root pinned on the left uses pop animation", () => {
  const { container } = render(<EditorShell value={{ profile: { hp: 10 } }} layoutMode="pinned-root" />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));

  expect(container.querySelector(".stack-page--pop-exit")).not.toBeNull();
});

test("pinned-root 从 reference 子页返回到 reference 首页时保留右页并使用 replace 语义", () => {
  const { container } = render(
    <EditorShell
      documents={{ main: { profile: { companion: "asset://characters/hero.json" } } }}
      layoutMode="pinned-root"
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://characters/hero.json"
            ? { id: "hero", stats: { hp: 10 }, tags: ["vanguard"] }
            : undefined;
        },
      }}
      rootSourceId="main"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "companion reference asset://characters/hero.json" }));
  fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));

  expect(container.querySelector(".stack-page--replace-enter")).not.toBeNull();
  expect(container.querySelector(".stack-page--pop-exit")).toBeNull();
  expect(getCurrentPageQueries().getByDisplayValue("hero")).toBeInTheDocument();
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

  expect(getCurrentPageQueries().getByDisplayValue("hero")).toBeInTheDocument();
  const backButton = screen.getByRole("button", { name: "Back" });
  expect(backButton).toHaveClass("toolbar-back-button");
  expect(backButton).toHaveAttribute("aria-label", "Back");
  expect(backButton.querySelector("svg")).not.toBeNull();
  expect(backButton.closest(".toolbar-actions")).not.toBeNull();
  expect(backButton.closest(".toolbar")?.querySelector(".toolbar-navigation .breadcrumbs")).not.toBeNull();
});

test("narrow editor shells keep the toolbar on one row and use an icon-only back control", () => {
  const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

  expect(styles).toMatch(/\.toolbar \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;/);
  expect(styles).toMatch(/@container editor-shell \(max-width: 360px\) \{[\s\S]*?\.toolbar-back-button__label \{[\s\S]*?display: none;/);
});

test("reference object pages apply ref-scope header styling after navigation", () => {
  const { container } = render(
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

  expect(getCurrentPageQueries().getByDisplayValue("hero")).toBeInTheDocument();
  expect(container.querySelector(".stack-page.is-current .node-page--object .detail-header--page.detail-header--ref-scope-1")).not.toBeNull();
});

test("reference projection renders configured fields in object view", () => {
  const characterSchema: EditorSchema = {
    type: "object",
    properties: {
      id: { type: "string", title: "ID" },
      name: { type: "string", title: "Name" },
      icon: { type: "string", title: "Icon" },
    },
  };
  const characterPreviewSchema: EditorSchema = {
    type: "object",
    properties: {
      name: {
        type: "string",
        title: "Name",
        "x-editor": {
          projection: { path: ["name"] },
        },
      },
      id: {
        type: "string",
        title: "ID",
        "x-editor": {
          projection: { path: ["id"] },
        },
      },
    },
  };
  const schemaHost: EditorSchemaHost = {
    getSchema({ path }) {
      if (path.length === 0) {
        return {
          type: "object",
          properties: {
            companion: {
              type: "string",
              "x-editor": {
                reference: {
                  target: { schemaRef: "character" },
                  view: {
                    layout: "inline",
                    schemaRef: "character_preview",
                  },
                },
              },
            },
          },
        };
      }
      return undefined;
    },
    getNamedSchema(name) {
      if (name === "character") return characterSchema;
      if (name === "character_preview") return characterPreviewSchema;
      return undefined;
    },
  };

  render(
    <EditorShell
      value={{ companion: "asset://characters/hero.json" }}
      schemaHost={schemaHost}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://characters/hero.json"
            ? { id: "hero", name: "Hero", icon: "res://assets/icons/hero.png" }
            : undefined;
        },
      }}
    />,
  );

  const companionButton = screen.getByRole("button", { name: "companion reference asset://characters/hero.json" });
  expect(companionButton.querySelector(".reference-preview__compact")).not.toBeNull();
  expect(screen.getByText("Hero")).toBeInTheDocument();
  expect(screen.queryByText("Name")).toBeNull();
  expect(screen.queryByText("ID")).toBeNull();
  expect(screen.queryByText("hero")).toBeNull();
});

test("reference projection renders configured fields in root array view", () => {
  const questSchema: EditorSchema = {
    type: "object",
    properties: {
      id: { type: "string", title: "ID" },
      title: { type: "string", title: "Title" },
      icon: {
        type: "string",
        title: "Icon",
        "x-editor": {
          display: {
            kind: "image",
            preview: {
              width: 40,
              height: 40,
              fit: "contain",
            },
          },
        },
      },
    },
  };
  const questRootRowSchema: EditorSchema = {
    type: "object",
    properties: {
      icon: {
        type: "string",
        title: "Icon",
        "x-editor": {
          projection: { path: ["icon"] },
        },
      },
      id: {
        type: "string",
        title: "ID",
        "x-editor": {
          projection: { path: ["id"] },
        },
      },
      title: {
        type: "string",
        title: "Title",
        "x-editor": {
          projection: { path: ["title"] },
        },
      },
      description: {
        type: "string",
        title: "Description",
        "x-editor": {
          display: {
            text: {
              sentenceLimit: 1,
            },
          },
          projection: { path: ["description"] },
        },
      },
    },
  };
  const schemaHost: EditorSchemaHost = {
    getSchema({ path }) {
      if (path.length === 0) {
        return {
          type: "array",
          items: {
            type: "string",
            "x-editor": {
              reference: {
                target: { schemaRef: "quest" },
                view: {
                  layout: "inline",
                  schemaRef: "quest_root_row",
                },
              },
            },
          },
        };
      }
      return undefined;
    },
    getNamedSchema(name) {
      if (name === "quest") return questSchema;
      if (name === "quest_root_row") return questRootRowSchema;
      return undefined;
    },
  };

  render(
    <EditorShell
      value={["asset://quests/intro.json"]}
      schemaHost={schemaHost}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://quests/intro.json"
            ? {
              id: "intro",
              title: "Intro Quest",
              description: "First quest. Second sentence should stay hidden.",
              icon: "res://icons/quest.png",
            }
            : undefined;
        },
        resolveDisplayUrl(value) {
          return value === "res://icons/quest.png" ? "/api/project-file?uri=res%3A%2F%2Ficons%2Fquest.png" : value;
        },
      }}
    />,
  );

  expect(screen.getByRole("columnheader", { name: "Icon" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "ID" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Title" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Description" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "#" })).toBeInTheDocument();
  expect(screen.queryByText("index")).toBeNull();
  expect(screen.queryByRole("columnheader", { name: "Type" })).toBeNull();
  expect(screen.queryByRole("columnheader", { name: "Value" })).toBeNull();
  expect(screen.getByText("1")).toBeInTheDocument();
  expect(screen.getByText("First quest.")).toBeInTheDocument();
  expect(screen.queryByText("Second sentence should stay hidden.")).toBeNull();
  expect(screen.getByText("Title")).toBeInTheDocument();
  expect(screen.getByText("Intro Quest")).toBeInTheDocument();
  expect(screen.getByText("ID")).toBeInTheDocument();
  expect(screen.getByText("intro")).toBeInTheDocument();
  const iconPreview = screen.getByRole("img", { name: "Icon" });
  expect(iconPreview).toHaveAttribute("src", "/api/project-file?uri=res%3A%2F%2Ficons%2Fquest.png");
  expect(iconPreview).toHaveStyle({ width: "40px", height: "40px", objectFit: "contain" });
});

test("reference projection renders multi-select tag labels in root array view", () => {
  const buffSchema: EditorSchema = {
    type: "object",
    properties: {
      id: { type: "string", title: "ID" },
      tags: {
        type: "array",
        title: "Tags",
        items: { type: "string" },
        "x-editor": {
          fieldType: "multi-select",
          options: [
            { value: "fire", label: "Fire", color: "red" },
            { value: "boss", label: "Boss", color: "gold" },
          ],
        },
      },
    },
  };
  const buffRootRowSchema: EditorSchema = {
    type: "object",
    properties: {
      id: {
        type: "string",
        title: "ID",
        "x-editor": {
          projection: { path: ["id"] },
        },
      },
      tags: {
        type: "array",
        title: "Tags",
        "x-editor": {
          projection: { path: ["tags"] },
        },
      },
    },
  };
  const schemaHost: EditorSchemaHost = {
    getSchema({ path }) {
      if (path.length === 0) {
        return {
          type: "array",
          items: {
            type: "string",
            "x-editor": {
              reference: {
                target: { schemaRef: "buff" },
                view: {
                  layout: "inline",
                  schemaRef: "buff_root_row",
                },
              },
            },
          },
        };
      }
      return undefined;
    },
    getNamedSchema(name) {
      if (name === "buff") return buffSchema;
      if (name === "buff_root_row") return buffRootRowSchema;
      return undefined;
    },
  };

  render(
    <EditorShell
      value={["asset://buff/flame_shield.json"]}
      schemaHost={schemaHost}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://buff/flame_shield.json"
            ? {
              id: "flame_shield",
              tags: ["fire", "boss"],
            }
            : undefined;
        },
      }}
    />,
  );

  expect(screen.getByText("Fire")).toBeInTheDocument();
  expect(screen.getByText("Boss")).toBeInTheDocument();
  expect(screen.queryByText("fire, boss")).toBeNull();
});

test("reference projection renders select labels in root array view", () => {
  const consumableSchema: EditorSchema = {
    type: "object",
    properties: {
      rarity: {
        type: "string",
        title: "稀有度",
        "x-editor": {
          fieldType: "select",
          options: [
            { value: "common", label: "普通", color: "gray" },
            { value: "rare", label: "稀有", color: "blue" },
          ],
        },
      },
    },
  };
  const consumableRootRowSchema: EditorSchema = {
    type: "object",
    properties: {
      rarity: {
        type: "string",
        title: "稀有度",
        "x-editor": {
          projection: { path: ["rarity"] },
        },
      },
    },
  };
  const schemaHost: EditorSchemaHost = {
    getSchema({ path }) {
      if (path.length === 0) {
        return {
          type: "array",
          "x-editor": {
            table: {
              columns: [
                { key: "rarity" },
              ],
            },
          },
          items: {
            type: "string",
            "x-editor": {
              reference: {
                target: { schemaRef: "consumable" },
                view: {
                  layout: "inline",
                  schemaRef: "consumable_root_row",
                },
              },
            },
          },
        };
      }
      return undefined;
    },
    getNamedSchema(name) {
      if (name === "consumable") return consumableSchema;
      if (name === "consumable_root_row") return consumableRootRowSchema;
      return undefined;
    },
  };

  render(
    <EditorShell
      value={["asset://consumable/healing_pill.json"]}
      schemaHost={schemaHost}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://consumable/healing_pill.json"
            ? {
              rarity: "common",
            }
            : undefined;
        },
      }}
    />,
  );

  expect(screen.getByRole("columnheader", { name: "稀有度" })).toBeInTheDocument();
  const rarityCell = screen.getByText("普通").closest("td");
  expect(rarityCell).not.toBeNull();
  expect(within(rarityCell as HTMLElement).getByText("普通")).toHaveClass("chip");
});

test("reference projection root array columns fall back to target schema for key-only select and bool fields missing from the shared row schema", () => {
  const settlementSchema: EditorSchema = {
    type: "object",
    properties: {
      id: { type: "string", title: "ID" },
      name: { type: "string", title: "名称" },
      settlement_type: {
        title: "据点类型",
        $ref: "settlement_type.schema.json",
      },
      unique: {
        type: "boolean",
        title: "唯一",
      },
    },
  };
  const settlementTypeSchema: EditorSchema = {
    type: "integer",
    title: "据点类型",
    "x-editor": {
      fieldType: "select",
      options: [
        { value: 0, label: "TOWN" },
        { value: 1, label: "STRONGHOLD" },
      ],
    },
  };
  const sharedReferenceRowSchema: EditorSchema = {
    type: "object",
    properties: {
      id: {
        type: "string",
        title: "ID",
        "x-editor": {
          projection: { path: ["id"] },
        },
      },
      name: {
        type: "string",
        title: "名称",
        "x-editor": {
          projection: { path: ["name"] },
        },
      },
    },
  };
  const schemaHost: EditorSchemaHost = {
    getSchema({ path }) {
      if (path.length === 0) {
        return {
          type: "array",
          "x-editor": {
            table: {
              columns: [
                { key: "id" },
                { key: "name" },
                { key: "settlement_type" },
                { key: "unique" },
              ],
            },
          },
          items: {
            type: "string",
            "x-editor": {
              reference: {
                target: { schemaRef: "settlement" },
                view: {
                  layout: "inline",
                  schemaRef: "resource_reference_row",
                },
              },
            },
          },
        };
      }
      return undefined;
    },
    getNamedSchema(name) {
      if (name === "settlement") return settlementSchema;
      if (name === "settlement_type.schema.json") return settlementTypeSchema;
      if (name === "resource_reference_row") return sharedReferenceRowSchema;
      return undefined;
    },
  };

  render(
    <EditorShell
      value={["asset://settlement/qingshi_town.json"]}
      schemaHost={schemaHost}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://settlement/qingshi_town.json"
            ? {
              id: "qingshi_town",
              name: "青石镇",
              settlement_type: 0,
              unique: true,
            }
            : undefined;
        },
      }}
    />,
  );

  expect(screen.getByRole("columnheader", { name: "据点类型" })).toBeInTheDocument();
  const settlementTypeCell = screen.getByText("TOWN").closest("td");
  expect(settlementTypeCell).not.toBeNull();
  expect(within(settlementTypeCell as HTMLElement).getByText("TOWN")).toHaveClass("chip");
  expect(screen.queryByText("0")).toBeNull();
  const uniqueCheckbox = screen.getByRole("checkbox", { name: "唯一" });
  expect(uniqueCheckbox).toBeChecked();
  expect(uniqueCheckbox).toBeDisabled();
  expect(screen.getByText("True")).toBeInTheDocument();
});

test("reference projection image display respects configured preview size", () => {
  const itemSchema: EditorSchema = {
    type: "object",
    properties: {
      icon: {
        type: "string",
        title: "Icon",
        "x-editor": {
          display: {
            kind: "image",
            preview: {
              width: 32,
              height: 24,
              fit: "cover",
            },
          },
        },
      },
      name: { type: "string", title: "Name" },
    },
  };
  const itemRowSchema: EditorSchema = {
    type: "object",
    properties: {
      icon: {
        type: "string",
        title: "Icon",
        "x-editor": {
          projection: { path: ["icon"] },
        },
      },
      name: {
        type: "string",
        title: "Name",
        "x-editor": {
          projection: { path: ["name"] },
        },
      },
    },
  };
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "object",
        properties: {
          reward: {
            type: "string",
            "x-editor": {
              reference: {
                target: { schemaRef: "reward_item" },
                view: {
                  layout: "inline",
                  schemaRef: "reward_item_row",
                },
              },
            },
          },
        },
      };
    },
    getNamedSchema(name) {
      if (name === "reward_item") return itemSchema;
      if (name === "reward_item_row") return itemRowSchema;
      return undefined;
    },
  };

  render(
    <EditorShell
      value={{ reward: "asset://items/reward.json" }}
      schemaHost={schemaHost}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://items/reward.json"
            ? { icon: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='24'></svg>", name: "Reward" }
            : undefined;
        },
      }}
    />,
  );

  const iconPreview = screen.getByRole("img", { name: "Icon" });
  expect(iconPreview).toHaveStyle({ width: "32px", height: "24px", objectFit: "cover" });
  expect(screen.getByText("Reward")).toBeInTheDocument();
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
  fireEvent.change(getCurrentPageQueries().getByLabelText("Field id"), { target: { value: "hero-updated" } });
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

  expect(screen.getByLabelText(/Field rarity/i)).toHaveDisplayValue("rare");
  expect(screen.getByRole("option", { name: "legendary" })).toBeInTheDocument();
});

test("schema table columns control root object-array header order and visibility", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "array",
        "x-editor": {
          table: {
            columns: [
              { key: "title", label: "Quest Title", sortable: true },
              { key: "id", sortable: true },
            ],
          },
        },
        items: {
          type: "object",
          properties: {
            id: { type: "string", title: "Identifier" },
            title: { type: "string", title: "Title" },
            hp: { type: "integer", title: "Health" },
          },
        },
      };
    },
  };

  render(
    <EditorShell
      value={[
        { id: "quest_002", title: "Second Quest", hp: 20 },
        { id: "quest_001", title: "First Quest", hp: 10 },
      ]}
      schemaHost={schemaHost}
    />,
  );

  const headers = screen.getAllByRole("columnheader").map((node) => node.getAttribute("aria-label")?.trim());
  expect(headers).toEqual(["#", "Quest Title", "Identifier"]);
  expect(screen.queryByRole("columnheader", { name: "Health" })).toBeNull();
  expect(screen.getByText("Second Quest")).toBeInTheDocument();
  expect(screen.queryByText("20")).toBeNull();
});

test("sortable schema table columns can be toggled from the header without initial sorting", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
          },
          "x-editor": {
            table: {
              columns: [
                { key: "title", label: "Title", sortable: true },
                { key: "id", label: "ID" },
              ],
            },
          },
        },
      };
    },
  };

  const { container } = render(
    <EditorShell
      value={[
        { id: "quest_002", title: "Second Quest" },
        { id: "quest_001", title: "First Quest" },
      ]}
      schemaHost={schemaHost}
    />,
  );

  const beforeSort = [...container.querySelectorAll("tbody tr[data-row-index]")]
    .map((row) => row.querySelectorAll("td")[1]?.textContent?.trim());
  expect(beforeSort).toEqual(["Second Quest", "First Quest"]);

  quickPressHeaderMenu(screen.getByRole("button", { name: "Title" }));
  fireEvent.click(screen.getByRole("button", { name: /Sort ascending/i }));

  const afterAscSort = [...container.querySelectorAll("tbody tr[data-row-index]")]
    .map((row) => row.querySelectorAll("td")[1]?.textContent?.trim());
  expect(afterAscSort).toEqual(["First Quest", "Second Quest"]);

  quickPressHeaderMenu(screen.getByRole("button", { name: "Title" }));
  fireEvent.click(screen.getByRole("button", { name: /Sort descending/i }));

  const afterDescSort = [...container.querySelectorAll("tbody tr[data-row-index]")]
    .map((row) => row.querySelectorAll("td")[1]?.textContent?.trim());
  expect(afterDescSort).toEqual(["Second Quest", "First Quest"]);
});

test("数组左侧的显示菜单会在视口内向右展开", () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Reference Projection" }));
  const trigger = screen.getByRole("button", { name: /Column visibility/ });
  Object.defineProperty(trigger, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 4, top: 8, right: 32, bottom: 36, width: 28, height: 28 }),
  });
  fireEvent.click(trigger);

  const panel = document.body.querySelector(".hidden-fields-panel") as HTMLElement;
  expect(panel.style.left).toBe("12px");
  expect(panel.style.right).toBe("");
});

test("缺少 schema 保存宿主时，标题栏 schema 操作显示橙色提示", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "array",
        "x-editor": {
          table: {
            columns: [
              { key: "title", label: "Title", sortable: true },
              { key: "id", label: "ID" },
            ],
          },
        },
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
          },
        },
      };
    },
  };

  render(<EditorShell value={[{ id: "quest_001", title: "First Quest" }]} schemaHost={schemaHost} />);

  quickPressHeaderMenu(screen.getByRole("button", { name: "Title" }));
  fireEvent.click(screen.getByRole("button", { name: "Move right" }));

  expect(screen.getByRole("status")).toHaveTextContent("当前宿主未接入 schema 保存，列配置不会保留。");
  expect(screen.getByRole("status")).toHaveClass("schema-persistence-toast");
});

test("array schema can persist header sorting into the document order", () => {
  let lastDocuments: Record<string, unknown> | null = null;
  render(
    <EditorShell
      value={[
        { id: "quest_002", title: "Second Quest" },
        { id: "quest_001", title: "First Quest" },
      ]}
      onChange={(documents) => {
        lastDocuments = documents;
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "array",
            "x-editor": {
              table: {
                sort: "persist",
                columns: [{ key: "title", label: "Title", sortable: true }],
              },
            },
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
              },
            },
          };
        },
      }}
    />,
  );

  quickPressHeaderMenu(screen.getByRole("button", { name: "Title" }));
  fireEvent.click(screen.getByRole("button", { name: /Sort ascending/i }));

  expect(lastDocuments).toMatchObject({
    main: [
      { id: "quest_001", title: "First Quest" },
      { id: "quest_002", title: "Second Quest" },
    ],
  });
});

test("schema table columns reorder reference projection columns", () => {
  const itemSchema: EditorSchema = {
    type: "object",
    properties: {
      icon: {
        type: "string",
        title: "Icon",
        "x-editor": {
          display: {
            kind: "image",
            preview: {
              width: 32,
              height: 24,
              fit: "cover",
            },
          },
        },
      },
      id: { type: "string", title: "ID" },
      name: { type: "string", title: "Name" },
    },
  };
  const itemRowSchema: EditorSchema = {
    type: "object",
    properties: {
      icon: {
        type: "string",
        title: "Icon",
        "x-editor": {
          projection: { path: ["icon"] },
        },
      },
      id: {
        type: "string",
        title: "ID",
        "x-editor": {
          projection: { path: ["id"] },
        },
      },
      name: {
        type: "string",
        title: "Name",
        "x-editor": {
          projection: { path: ["name"] },
        },
      },
    },
  };
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "array",
        "x-editor": {
          table: {
            columns: [
              { field: ["name"], label: "Display Name", sortable: true },
              { field: ["icon"] },
            ],
          },
        },
        items: {
          type: "string",
          "x-editor": {
            reference: {
              target: { schemaRef: "reward_item" },
              view: {
                layout: "inline",
                schemaRef: "reward_item_row",
              },
            },
          },
        },
      };
    },
    getNamedSchema(name) {
      if (name === "reward_item") return itemSchema;
      if (name === "reward_item_row") return itemRowSchema;
      return undefined;
    },
  };

  render(
    <EditorShell
      value={["asset://items/reward.json"]}
      schemaHost={schemaHost}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://items/reward.json"
            ? { icon: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='24'></svg>", id: "reward", name: "Reward" }
            : undefined;
        },
      }}
    />,
  );

  const headers = screen.getAllByRole("columnheader").map((node) => node.getAttribute("aria-label")?.trim());
  expect(headers).toEqual(["#", "Display Name", "Icon"]);
  expect(screen.queryByRole("columnheader", { name: "ID" })).toBeNull();
});

test("reference projection column headers derive type labels from projection schema instead of raw reference values", () => {
  const itemSchema: EditorSchema = {
    type: "object",
    properties: {
      icon: {
        type: "string",
        title: "Icon",
      },
      name: {
        type: "string",
        title: "Name",
      },
    },
  };
  const itemRowSchema: EditorSchema = {
    type: "object",
    properties: {
      name: {
        type: "string",
        title: "Display Name",
        "x-editor": {
          projection: { path: ["name"] },
        },
      },
      icon: {
        type: "string",
        title: "Icon",
        "x-editor": {
          projection: { path: ["icon"] },
          display: {
            kind: "image",
          },
        },
      },
    },
  };
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "array",
        "x-editor": {
          table: {
            columns: [
              { field: ["name"] },
              { field: ["icon"] },
            ],
          },
        },
        items: {
          type: "string",
          "x-editor": {
            reference: {
              target: { schemaRef: "reward_item" },
              view: {
                layout: "inline",
                schemaRef: "reward_item_row",
              },
            },
          },
        },
      };
    },
    getNamedSchema(name) {
      if (name === "reward_item") return itemSchema;
      if (name === "reward_item_row") return itemRowSchema;
      return undefined;
    },
  };

  const { container } = render(
    <EditorShell
      value={["asset://items/reward.json"]}
      schemaHost={schemaHost}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://items/reward.json"
            ? { icon: "res://icons/reward.png", name: "Reward" }
            : undefined;
        },
      }}
    />,
  );

  expect(container.querySelector(".column-trigger small")).toBeNull();
  expect(screen.getByRole("button", { name: "Display Name" })).not.toHaveAttribute("title");
  quickPressHeaderMenu(screen.getByRole("button", { name: "Display Name" }));
  const menu = document.body.querySelector(".schema-column-menu-popup") as HTMLElement;
  expect(within(menu).getByText("string")).toBeInTheDocument();
  expect(screen.queryByText("undefined")).toBeNull();
});

test("inline select options render schema labels", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "object",
        properties: {
          rarity: {
            type: "string",
            "x-editor": {
              fieldType: "select",
              options: [
                { value: "common", label: "Common" },
                { value: "rare", label: "Rare" },
              ],
            },
          },
        },
      };
    },
  };

  render(<EditorShell value={{ rarity: "rare" }} schemaHost={schemaHost} />);

  expect(screen.getByRole("button", { name: /Field rarity/i })).toHaveTextContent("Rare");
});

test("inline multi-select options render chip labels and persist literal values", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "object",
        properties: {
          tags: {
            type: "array",
            items: { type: "string" },
            "x-editor": {
              fieldType: "multi-select",
              options: [
                { value: "fire", label: "Fire", color: "red" },
                { value: "boss", label: "Boss", color: "gold" },
              ],
            },
          },
        },
      };
    },
  };

  render(<EditorShell value={{ tags: ["fire", "boss"] }} schemaHost={schemaHost} />);

  const selectedValues = within(screen.getByLabelText(/Field tags selected values/i));
  expect(selectedValues.getByText("Fire")).toBeInTheDocument();
  expect(selectedValues.getByText("Boss")).toBeInTheDocument();
  expect(screen.queryByText("fire")).toBeNull();
});

test("multi-select reference fields project host reference options as select options", async () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "object",
        properties: {
          assignees: {
            type: "array",
            title: "Assignees",
            "x-editor": { fieldType: "multi-select" },
            items: {
              type: "string",
              "x-editor": { reference: { types: ["person"] } },
            },
          },
        },
      };
    },
  };

  const onChange = vi.fn();
  render(
    <EditorShell
      value={{ assignees: ["management://person/yop"] }}
      schemaHost={schemaHost}
      host={{
        getReferenceOptions({ reference }) {
          return reference?.types?.includes("person")
            ? [
              { value: "management://person/yop", label: "Yop" },
              { value: "management://person/qin", label: "Qin" },
            ]
            : [];
        },
      }}
      onChange={onChange}
    />,
  );

  const selectedValues = within(screen.getByLabelText(/Field Assignees selected values/i));
  expect(selectedValues.getByText("Yop")).toBeInTheDocument();
  expect(screen.queryByText("management://person/yop")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /Field Assignees/i }));
  fireEvent.pointerDown(screen.getByRole("button", { name: /^Qin$/i }));

  await waitFor(() => {
    const lastDocuments = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(Object.values(lastDocuments)[0]).toEqual({
      assignees: ["management://person/yop", "management://person/qin"],
    });
  });
});

test("table cell select fields author options and colors when schema writing is available", async () => {
  const schemaHost = createMutableSchemaHost({
    type: "array",
    items: {
      type: "object",
      properties: {
        status: {
          type: "string",
          title: "Status",
          "x-editor": {
            fieldType: "select",
            options: [{ value: "todo", label: "Todo" }],
          },
        },
      },
    },
  });

  render(<EditorShell value={[{ status: "todo" }]} schemaHost={schemaHost} rootSourceId="tasks" />);

  fireEvent.click(screen.getByRole("button", { name: /Array item 0 status/i }));
  const menuTrigger = document.querySelector(".option-menu-trigger") as HTMLButtonElement | null;
  expect(menuTrigger).not.toBeNull();
  fireEvent.click(menuTrigger!);
  fireEvent.pointerDown(screen.getByRole("button", { name: /深红/ }));

  await waitFor(() => {
    const savedItems = schemaHost.getRootSchemaSnapshot().items as Record<string, any>;
    const options = savedItems.properties.status["x-editor"].options as Array<{ value: string; color?: string }>;
    expect(options.find((option) => option.value === "todo")?.color).toBe("dark_red");
  });
});

test("无声明 options 的表格 cell 字段发现现有值并支持 label 创建/设色", async () => {
  const schemaHost = createMutableSchemaHost({
    type: "array",
    items: {
      type: "object",
      properties: {
        tags: {
          type: "array",
          title: "Tags",
          "x-editor": { fieldType: "multi-select" },
          items: { type: "string" },
        },
      },
      additionalProperties: true,
    },
  });

  render(
    <EditorShell
      value={[{ tags: ["fire", "boss"] }, { tags: ["fire"] }]}
      schemaHost={schemaHost}
      rootSourceId="tasks"
    />,
  );

  // 1) 打开表格 cell 的 multi-select：选项来自数据行发现（去重）
  fireEvent.click(screen.getAllByRole("button", { name: /Array item 0 tags/i }).at(-1)!);
  const popover = latestPopover();
  expect(within(popover).getAllByText("fire").length).toBeGreaterThan(0);
  expect(within(popover).getAllByText("boss").length).toBeGreaterThan(0);

  // 2) 发现模式提供选项管理入口
  const menus = popover.querySelectorAll(".option-menu-trigger");
  expect(menus.length).toBe(2);

  // 3) 给 "fire" 设深红色：首次编辑先把发现选项物化进 schema，再写颜色
  fireEvent.click(menus[0] as HTMLElement);
  await waitFor(() => { expect(latestOptionEditor().querySelector(".multi-select-color-columns")).not.toBeNull(); });
  fireEvent.pointerDown(within(latestOptionEditor()).getAllByRole("button", { name: /深红/ })[0]);
  await waitFor(() => {
    const savedItems = schemaHost.getRootSchemaSnapshot().items as Record<string, any>;
    const options = savedItems.properties.tags["x-editor"].options as Array<{ value: string; color?: string }>;
    expect(options.find((option) => option.value === "fire")?.color).toBe("dark_red");
    expect(options.find((option) => option.value === "boss")?.color).toBeUndefined();
  });

  // 4) 创建新 label：输入 draft → Create → schema options 追加
  const draftInput = popover.querySelector<HTMLInputElement>(".multi-select-input")!;
  fireEvent.change(draftInput, { target: { value: "elite" } });
  fireEvent.pointerDown(within(popover).getAllByRole("button", { name: /Create "elite"/i })[0]);
  await waitFor(() => {
    const savedItems = schemaHost.getRootSchemaSnapshot().items as Record<string, any>;
    const options = savedItems.properties.tags["x-editor"].options as Array<{ value: string }>;
    expect(options.some((option) => option.value === "elite")).toBe(true);
  });
});

function latestPopover() {
  const popovers = document.querySelectorAll<HTMLElement>(".multi-select-popover");
  return popovers[popovers.length - 1]!;
}

function latestOptionEditor() {
  const editors = document.querySelectorAll<HTMLElement>(".multi-select-option-editor");
  return editors[editors.length - 1]!;
}

test("详情页 select 字段提供重命名/删除/排序/设色完整 label 编辑", async () => {
  const schemaHost = createMutableSchemaHost({
    type: "array",
    items: {
      type: "object",
      properties: {
        status: {
          type: "string",
          title: "Status",
          "x-editor": {
            fieldType: "select",
            options: [
              { value: "todo", label: "Todo" },
              { value: "doing", label: "Doing" },
            ],
          },
        },
      },
    },
  });

  render(<EditorShell value={[{ status: "todo" }]} schemaHost={schemaHost} rootSourceId="tasks" />);

  // 进入详情页并点开 status select
  fireEvent.click(document.querySelector("tbody tr")!);
  fireEvent.click(screen.getByRole("button", { name: /Field Status/i }));
  const popover = latestPopover();
  const menus = popover.querySelectorAll(".option-menu-trigger");
  expect(menus.length).toBe(2);

  // 打开第一个选项的编辑菜单：应含重命名输入、删除与颜色分组（vendor 面板无 Move 按钮）
  fireEvent.click(menus[0] as HTMLElement);
  const editor = latestOptionEditor();
  expect(editor.querySelector(".multi-select-option-name-input")).not.toBeNull();
  expect(editor.textContent).toContain("删除");
  expect(editor.textContent).not.toContain("Move up");
  expect(editor.querySelector(".multi-select-color-columns")).not.toBeNull();
});

test("选项 dragHandle 支持拖拽排序并写回 schema 顺序", async () => {
  const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const list = this.closest(".multi-select-options");
    if (!list || !this.classList.contains("multi-select-option-row") || !list.contains(this)) {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    }
    const rows = [...list.children].filter((el) => el.classList.contains("multi-select-option-row"));
    const index = rows.indexOf(this);
    return { top: index * 40, left: 0, right: 200, bottom: index * 40 + 34, width: 200, height: 34, x: 0, y: index * 40, toJSON: () => ({}) } as DOMRect;
  });
  const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });

  try {
    const schemaHost = createMutableSchemaHost({
      type: "array",
      items: {
        type: "object",
        properties: {
          status: {
            type: "string",
            title: "Status",
            "x-editor": {
              fieldType: "select",
              options: [
                { value: "todo", label: "Todo" },
                { value: "doing", label: "Doing" },
                { value: "done", label: "Done" },
              ],
            },
          },
        },
      },
    });

    render(<EditorShell value={[{ status: "todo" }]} schemaHost={schemaHost} rootSourceId="tasks" />);

    fireEvent.click(screen.getAllByRole("button", { name: /Array item 0 status/i }).at(-1)!);
    const popover = latestPopover();
    const handle = [...popover.querySelectorAll<HTMLElement>(".option-drag-handle")].find((element) => !element.classList.contains("is-disabled"));
    expect(handle).toBeDefined();

    const pointerEvent = (type: string, init: { pointerId: number; clientY?: number }) => {
      const event = new MouseEvent(type, { clientY: init.clientY ?? 0 });
      Object.defineProperty(event, "pointerId", { value: init.pointerId });
      return event;
    };
    fireEvent.pointerDown(handle!, { pointerId: 7, clientY: 0 });
    act(() => { window.dispatchEvent(pointerEvent("pointermove", { pointerId: 7, clientY: 120 })); });
    await waitFor(() => { expect(popover.querySelector(".option-field-drag-placeholder")).not.toBeNull(); });
    act(() => { window.dispatchEvent(pointerEvent("pointerup", { pointerId: 7 })); });

    await waitFor(() => {
      const savedItems = schemaHost.getRootSchemaSnapshot().items as Record<string, any>;
      const options = savedItems.properties.status["x-editor"].options as Array<{ value: string }>;
      expect(options.map((option) => option.value)).toEqual(["doing", "done", "todo"]);
    });
  } finally {
    rafSpy.mockRestore();
    rectSpy.mockRestore();
  }
});

test("schema 保存失败时回滚内存顺序并持续显示错误", async () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "array",
        items: {
          type: "object",
          properties: {
            status: {
              type: "string",
              title: "Status",
              "x-editor": {
                fieldType: "select",
                options: [
                  { value: "todo", label: "Todo" },
                  { value: "doing", label: "Doing" },
                  { value: "done", label: "Done" },
                ],
              },
            },
          },
        },
      };
    },
    setRootSchema() { return Promise.reject(new Error("network down")); },
  };

  render(<EditorShell value={[{ status: "todo" }]} schemaHost={schemaHost} rootSourceId="tasks" />);

  // 打开下拉，把第一项拖到末尾（复用拖拽驱动）
  const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const list = this.closest(".multi-select-options");
    if (!list || !this.classList.contains("multi-select-option-row") || !list.contains(this)) {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    }
    const rows = [...list.children].filter((el) => el.classList.contains("multi-select-option-row"));
    const index = rows.indexOf(this);
    return { top: index * 40, left: 0, right: 200, bottom: index * 40 + 34, width: 200, height: 34, x: 0, y: index * 40, toJSON: () => ({}) } as DOMRect;
  });
  const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });

  try {
    fireEvent.click(screen.getAllByRole("button", { name: /Array item 0 status/i }).at(-1)!);
    const popover = latestPopover();
    const before = popover.querySelectorAll(".multi-select-option .chip").length;

    const handle = [...popover.querySelectorAll<HTMLElement>(".option-drag-handle")].find((element) => !element.classList.contains("is-disabled"));
    const pointerEvent = (type: string, init: { clientY?: number }) => {
      const event = new MouseEvent(type, { clientY: init.clientY ?? 0 });
      return event;
    };
    fireEvent.pointerDown(handle!, { pointerId: 3, clientY: 0 });
    act(() => { window.dispatchEvent(pointerEvent("pointermove", { clientY: 100 })); });
    act(() => { window.dispatchEvent(pointerEvent("pointerup", { clientY: 100 })); });

    // 保存失败：持续错误可见，且顺序回滚（首项恢复原位）
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("schema 保存失败");
    });
    await waitFor(() => {
      const chips = [...latestPopover().querySelectorAll(".multi-select-option .chip")];
      expect(chips.map((chip) => chip.textContent)).toEqual(["Todo", "Doing", "Done"]);
    });
    expect(before).toBe(3);
  } finally {
    rafSpy.mockRestore();
    rectSpy.mockRestore();
  }
});

test("table cell reference multi-select fields do not expose option authoring", async () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "array",
        items: {
          type: "object",
          properties: {
            assignees: {
              type: "array",
              title: "Assignees",
              "x-editor": { fieldType: "multi-select" },
              items: { type: "string", "x-editor": { reference: { types: ["person"] } } },
            },
          },
        },
      };
    },
    setRootSchema() { return undefined; },
  };

  render(
    <EditorShell
      value={[{ assignees: ["management://person/yop"] }]}
      schemaHost={schemaHost}
      host={{ getReferenceOptions: ({ reference }) => reference?.types?.includes("person") ? [{ value: "management://person/yop", label: "Yop" }] : [] }}
      rootSourceId="tasks"
    />,
  );

  fireEvent.click(screen.getAllByRole("button", { name: /Array item 0 assignees/i }).at(-1)!);
  expect(screen.getAllByText("Yop").length).toBeGreaterThan(0);
  // reference 字段：开放颜色与排序编辑，不提供快速创建。
  const popover = latestPopover();
  const menuTrigger = popover.querySelector(".option-menu-trigger");
  expect(menuTrigger).not.toBeNull();

  // 打开选项编辑面板：应有颜色分区，无重命名与删除
  fireEvent.click(menuTrigger as HTMLElement);
  const editor = await waitFor(() => {
    const found = latestOptionEditor();
    expect(found.querySelector(".multi-select-color-columns")).not.toBeNull();
    return found;
  });
  expect(editor.querySelector(".multi-select-option-name-input")?.tagName).toBe("SPAN");
  expect(editor.textContent).not.toContain("删除");

  // 输入新值不出现快速创建（ref 选项存在性归宿主）
  const draftInput = popover.querySelector<HTMLInputElement>(".multi-select-input");
  fireEvent.change(draftInput!, { target: { value: "management://person/newbie" } });
  expect(popover.textContent).not.toContain("Create");
});

test("inline multi-select still renders in object view when field value is null", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "object",
        properties: {
          tags: {
            type: "array",
            items: { type: "string" },
            "x-editor": {
              fieldType: "multi-select",
              options: [
                { value: "fire", label: "Fire", color: "red" },
                { value: "boss", label: "Boss", color: "gold" },
              ],
            },
          },
        },
      };
    },
  };

  render(<EditorShell value={{ tags: null }} schemaHost={schemaHost} />);

  expect(screen.getByRole("button", { name: /Field Tags/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /tags array/i })).toBeNull();
});

test("object view materializes child schema before deciding whether tags stays navigable", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "object",
        properties: {
          tags: {
            title: "Tags",
            allOf: [
              {
                type: "array",
                items: { type: "string" },
                "x-editor": {
                  fieldType: "multi-select",
                },
              },
            ],
            "x-editor": {
              options: [
                { value: "herb", label: "Herb", color: "green" },
                { value: "year_2", label: "Year 2", color: "blue" },
              ],
            },
          },
        },
      };
    },
  };

  render(<EditorShell value={{ tags: ["herb", "year_2"] }} schemaHost={schemaHost} />);

  expect(screen.getByRole("button", { name: /Field Tags/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /tags array/i })).toBeNull();
});

test("array object rows render inner multi-select fields as inline editors by default", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", title: "ID" },
            tags: {
              type: "array",
              title: "Tags",
              items: { type: "string" },
              "x-editor": {
                fieldType: "multi-select",
                options: [
                  { value: "fire", label: "Fire", color: "red" },
                  { value: "boss", label: "Boss", color: "gold" },
                ],
              },
            },
          },
        },
      };
    },
  };

  render(<EditorShell value={[{ id: "hero", tags: ["fire", "boss"] }]} schemaHost={schemaHost} />);

  expect(screen.getByRole("button", { name: /Array item 0 Tags/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /tags array/i })).toBeNull();
  const selectedValues = within(screen.getByLabelText(/Array item 0 Tags selected values/i));
  expect(selectedValues.getByText("Fire")).toBeInTheDocument();
  expect(selectedValues.getByText("Boss")).toBeInTheDocument();
});

test("asset-picker renders single image selections with preview viewer and picker metadata", async () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "object",
        properties: {
          icon: {
            type: "string",
            title: "Icon",
            "x-editor": {
              fieldType: "asset-picker",
              optionsSource: {
                kind: "json-file",
                uri: "asset://editor-picker/image.json",
                valueField: "value",
                labelField: "text",
                descriptionField: "path",
                previewField: "preview",
              },
              display: {
                kind: "image",
                preset: "large-icon",
              },
            },
          },
        },
      };
    },
  };

  render(
    <EditorShell
      value={{ icon: "res://assets/icons/role/player_default.png" }}
      schemaHost={schemaHost}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://editor-picker/image.json"
            ? [{
              value: "res://assets/icons/role/player_default.png",
              text: "player_default.png",
              path: "res://assets/icons/role/player_default.png",
              preview: "res://assets/icons/role/player_default.png",
            }]
            : undefined;
        },
        resolveDisplayUrl(value) {
          return value.replace("res://", "http://localhost/");
        },
      }}
    />,
  );

  expect(screen.getByRole("img", { name: "Icon" })).toHaveAttribute(
    "src",
    "http://localhost/assets/icons/role/player_default.png",
  );
  expect(screen.getByText("res://assets/icons/role/player_default.png")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "打开 Icon 图片浏览" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Field Icon/i }));
  await waitFor(() => {
    expect(screen.getByLabelText(/Field Icon 搜索/i)).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole("button", { name: "打开 Icon 图片浏览" }));
  expect(screen.getByRole("dialog", { name: "Icon 图片浏览" })).toBeInTheDocument();
});

test("asset-picker renders multi string arrays as array rows with add flow", async () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "object",
        properties: {
          role_ids: {
            type: "array",
            title: "角色",
            items: { type: "string" },
            "x-editor": {
              fieldType: "asset-picker",
              optionsSource: {
                kind: "json-file",
                uri: "asset://schema-data-resource-options/role.json",
                valueField: "value",
                labelField: "text",
                descriptionField: "value",
              },
            },
          },
        },
      };
    },
  };

  render(
    <EditorShell
      value={{ role_ids: ["npc_mortal_realm_innkeeper"] }}
      schemaHost={schemaHost}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://schema-data-resource-options/role.json"
            ? [
              { value: "npc_mortal_realm_innkeeper", text: "客栈老板" },
              { value: "npc_guard_captain", text: "守卫队长" },
            ]
            : undefined;
        },
      }}
    />,
  );

  expect(screen.getByText("客栈老板")).toBeInTheDocument();
  expect(screen.getByText("npc_mortal_realm_innkeeper")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /添加 Field 角色/i }));
  fireEvent.pointerDown(screen.getByRole("button", { name: /守卫队长/i }));

  await waitFor(() => {
    expect(screen.getAllByText("守卫队长").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("npc_guard_captain").length).toBeGreaterThanOrEqual(1);
  });
});

test("implicit res asset strings without schema editor metadata still render as asset picker cards", async () => {
  render(
    <EditorShell
      value={{ scene: "res://scenes/ui/facility/specific/inn_facility.tscn" }}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://editor-picker/tscn.json"
            ? [{
              value: "res://scenes/ui/facility/specific/inn_facility.tscn",
              text: "inn_facility.tscn",
              path: "res://scenes/ui/facility/specific/inn_facility.tscn",
            }]
            : undefined;
        },
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              scene: {
                type: "string",
                title: "场景",
              },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getByRole("button", { name: /Field 场景/i })).toBeInTheDocument();
  expect(screen.getByText("inn_facility.tscn")).toBeInTheDocument();
  expect(screen.getByText("res://scenes/ui/facility/specific/inn_facility.tscn")).toBeInTheDocument();
  expect(screen.queryByDisplayValue("res://scenes/ui/facility/specific/inn_facility.tscn")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /Field 场景/i }));
  await waitFor(() => {
    expect(screen.getByLabelText(/Field 场景 搜索/i)).toBeInTheDocument();
    expect(screen.getAllByText("inn_facility.tscn").length).toBeGreaterThanOrEqual(1);
  });
});

test("reference fields render searchable picker cards instead of native select", async () => {
  render(
    <EditorShell
      documents={{
        main: { facility: "asset://facility/inn.json" },
        "resource/facility/inn": {
          id: "inn",
          name: "客栈",
        },
        "resource/facility/blacksmith": {
          id: "blacksmith",
          name: "铁匠铺",
        },
      }}
      host={{
        getReferenceOptions() {
          return [
            {
              value: "asset://facility/inn.json",
              label: "客栈",
              description: "asset://facility/inn.json",
            },
            {
              value: "asset://facility/blacksmith.json",
              label: "铁匠铺",
              description: "asset://facility/blacksmith.json",
            },
          ];
        },
        loadReferenceSource(uri) {
          if (uri === "asset://facility/inn.json") {
            return { id: "inn", name: "客栈" };
          }
          if (uri === "asset://facility/blacksmith.json") {
            return { id: "blacksmith", name: "铁匠铺" };
          }
          return undefined;
        },
        resolveReferenceSourceId(uri) {
          if (uri === "asset://facility/inn.json") {
            return "resource/facility/inn";
          }
          if (uri === "asset://facility/blacksmith.json") {
            return "resource/facility/blacksmith";
          }
          return undefined;
        },
      }}
      schemaHost={{
        getSchema(context): EditorSchema {
          if (context.sourceId === "resource/facility/inn" || context.sourceId === "resource/facility/blacksmith") {
            return {
              type: "object",
              properties: {
                id: { type: "string", readOnly: true },
                name: { type: "string" },
              },
            };
          }
          return {
            type: "object",
            properties: {
              facility: {
                type: "string",
                title: "设施",
                "x-editor": {
                  reference: {
                    kind: "resource",
                    types: ["facility"],
                    target: {
                      schemaRef: "facility",
                    },
                    view: {
                      layout: "inline",
                      schemaRef: "resource_reference_row",
                    },
                  },
                },
              },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getAllByText("客栈").length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText("asset://facility/inn.json")).toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: /Field 设施/i })).toBeNull();
  expect(screen.getByRole("button", { name: /Open Field 设施/i })).toBeEnabled();

  fireEvent.click(screen.getByRole("button", { name: /^Field 设施$/i }));
  await waitFor(() => {
    expect(screen.getByLabelText(/Field 设施 搜索/i)).toBeInTheDocument();
  });
  fireEvent.pointerDown(screen.getByRole("button", { name: /铁匠铺/i }));

  await waitFor(() => {
    expect(screen.getAllByText("铁匠铺").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("asset://facility/blacksmith.json").length).toBeGreaterThanOrEqual(1);
  });

  fireEvent.click(screen.getByRole("button", { name: /Open Field 设施/i }));
  await waitFor(() => {
    expect(screen.getByDisplayValue("blacksmith")).toBeInTheDocument();
  });
});

test("reference array items inside documents keep picker rows but不再提供额外打开按钮", async () => {
  render(
    <EditorShell
      documents={{
        main: {
          facilities: ["asset://facility/inn.json"],
        },
        "resource/facility/inn": {
          id: "inn",
          name: "客栈",
        },
        "resource/facility/blacksmith": {
          id: "blacksmith",
          name: "铁匠铺",
        },
      }}
      host={{
        getReferenceOptions() {
          return [
            {
              value: "asset://facility/inn.json",
              label: "客栈",
              description: "asset://facility/inn.json",
            },
            {
              value: "asset://facility/blacksmith.json",
              label: "铁匠铺",
              description: "asset://facility/blacksmith.json",
            },
          ];
        },
        loadReferenceSource(uri) {
          if (uri === "asset://facility/inn.json") {
            return { id: "inn", name: "客栈" };
          }
          if (uri === "asset://facility/blacksmith.json") {
            return { id: "blacksmith", name: "铁匠铺" };
          }
          return undefined;
        },
        resolveReferenceSourceId(uri) {
          if (uri === "asset://facility/inn.json") {
            return "resource/facility/inn";
          }
          if (uri === "asset://facility/blacksmith.json") {
            return "resource/facility/blacksmith";
          }
          return undefined;
        },
      }}
      schemaHost={{
        getSchema(context): EditorSchema {
          if (context.sourceId === "resource/facility/inn" || context.sourceId === "resource/facility/blacksmith") {
            return {
              type: "object",
              properties: {
                id: { type: "string", readOnly: true },
                name: { type: "string" },
              },
            };
          }
          return {
            type: "object",
            properties: {
              facilities: {
                type: "array",
                title: "设施列表",
                items: {
                  type: "string",
                  "x-editor": {
                    reference: {
                      kind: "resource",
                      types: ["facility"],
                      target: {
                        schemaRef: "facility",
                      },
                      view: {
                        layout: "inline",
                        schemaRef: "resource_reference_row",
                      },
                    },
                  },
                },
              },
            },
          };
        },
      }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /facilities array 1 items/i }));
  expect(screen.getByRole("button", { name: /^Array item 0$/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Open Array item 0/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /facility reference asset:\/\/facility\/inn\.json/i })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /^Array item 0$/i }));
  await waitFor(() => {
    expect(screen.getByLabelText(/Array item 0 搜索/i)).toBeInTheDocument();
  });
  fireEvent.pointerDown(screen.getByRole("button", { name: /铁匠铺/i }));

  await waitFor(() => {
    expect(screen.getAllByText("铁匠铺").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("asset://facility/blacksmith.json").length).toBeGreaterThanOrEqual(1);
  });
});

test("object 视图中的非 JSON 资产引用只保留 picker，不显示打开按钮", async () => {
  render(
    <EditorShell
      documents={{
        main: {
          entry_map: "res://data/terrain_configs/test_map.tres",
        },
        "resource/terrain_config/test_map": {
          id: "test_map",
          name: "测试地图",
        },
      }}
      host={{
        getReferenceOptions() {
          return [
            {
              value: "res://data/terrain_configs/test_map.tres",
              label: "测试地图",
              description: "res://data/terrain_configs/test_map.tres",
            },
          ];
        },
        loadReferenceSource(uri) {
          return uri === "res://data/terrain_configs/test_map.tres"
            ? { id: "test_map", name: "测试地图" }
            : undefined;
        },
        resolveReferenceSourceId(uri) {
          return uri === "res://data/terrain_configs/test_map.tres"
            ? "resource/terrain_config/test_map"
            : undefined;
        },
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              entry_map: {
                type: "string",
                title: "入口地图",
                "x-editor": {
                  reference: {
                    kind: "resource",
                    types: ["terrain_config"],
                    target: {
                      schemaRef: "terrain_config",
                    },
                    view: {
                      layout: "inline",
                      schemaRef: "resource_reference_row",
                    },
                  },
                },
              },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getByText("res://data/terrain_configs/test_map.tres")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Open Field 入口地图/i })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /^Field 入口地图$/i }));
  await waitFor(() => {
    expect(screen.getByLabelText(/Field 入口地图 搜索/i)).toBeInTheDocument();
  });
});

test("array 视图在列 schema 缺省时默认复用 object schema，terrain 引用列显示颜色摘要而不是 4 fields", async () => {
  render(
    <EditorShell
      value={["res://data/terrain_configs/test_map.tres"]}
      schemaHost={{
        getSchema({ path }) {
          if (path.length === 0) {
            return {
              type: "array",
              items: {
                type: "string",
                title: "地图",
                "x-editor": {
                  reference: {
                    kind: "resource",
                    types: ["terrain_config"],
                    target: {
                      schemaRef: "terrain_config",
                    },
                    view: {
                      layout: "inline",
                      schemaRef: "terrain_row",
                    },
                  },
                },
              },
            };
          }
          return undefined;
        },
        getNamedSchema(name) {
          if (name === "terrain_config") {
            return {
              type: "object",
              properties: {
                name: { type: "string", title: "地图名" },
                tint: {
                  type: "object",
                  title: "地表色",
                  "x-editor": {
                    object: {
                      preset: "rgba",
                    },
                  },
                  properties: {
                    r: { type: "number", title: "R" },
                    g: { type: "number", title: "G" },
                    b: { type: "number", title: "B" },
                    a: { type: "number", title: "A" },
                  },
                },
                icon: {
                  type: "string",
                  title: "缩略图",
                  "x-editor": {
                    display: {
                      kind: "image",
                    },
                  },
                },
              },
            };
          }
          if (name === "terrain_row") {
            return {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  title: "地图名",
                  "x-editor": {
                    projection: { path: ["name"] },
                  },
                },
                tint: {
                  type: "object",
                  title: "地表色",
                  "x-editor": {
                    projection: { path: ["tint"] },
                  },
                },
                icon: {
                  type: "string",
                  title: "缩略图",
                  "x-editor": {
                    projection: { path: ["icon"] },
                  },
                },
              },
            };
          }
          return undefined;
        },
      }}
      host={{
        loadReferenceSource(uri) {
          return uri === "res://data/terrain_configs/test_map.tres"
            ? {
              name: "测试地图",
              tint: {
                r: 0.91,
                g: 0.3,
                b: 0.24,
                a: 1,
              },
              icon: "res://assets/icons/test_map.png",
            }
            : undefined;
        },
      }}
    />,
  );

  expect(screen.getByRole("columnheader", { name: "地图名" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "地表色" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "缩略图" })).toBeInTheDocument();
  expect(screen.getByText("测试地图")).toBeInTheDocument();
  expect(screen.getByText("#E84D3D")).toBeInTheDocument();
  expect(document.querySelector(".array-color-summary__swatch")).not.toBeNull();
  expect(screen.getByRole("img", { name: "缩略图" })).toHaveAttribute("src", "res://assets/icons/test_map.png");
  expect(screen.queryByText("4 fields")).toBeNull();
  expect(screen.queryByRole("button", { name: /Open Array item 0/i })).toBeNull();
});

test("reference arrays expose inline add picker together with create-resource entry", async () => {
  const createReferenceRow = vi.fn(async () => "asset://facility/new_facility.json");

  render(
    <EditorShell
      documents={{
        main: {
          facilities: ["asset://facility/inn.json"],
        },
        "resource/facility/inn": {
          id: "inn",
          name: "客栈",
        },
        "resource/facility/blacksmith": {
          id: "blacksmith",
          name: "铁匠铺",
        },
      }}
      host={{
        createReferenceRow,
        getReferenceOptions() {
          return [
            {
              value: "asset://facility/inn.json",
              label: "客栈",
              description: "asset://facility/inn.json",
            },
            {
              value: "asset://facility/blacksmith.json",
              label: "铁匠铺",
              description: "asset://facility/blacksmith.json",
            },
          ];
        },
        loadReferenceSource(uri) {
          if (uri === "asset://facility/inn.json") {
            return { id: "inn", name: "客栈" };
          }
          if (uri === "asset://facility/blacksmith.json") {
            return { id: "blacksmith", name: "铁匠铺" };
          }
          return undefined;
        },
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              facilities: {
                type: "array",
                title: "设施列表",
                items: {
                  type: "string",
                  "x-editor": {
                    reference: {
                      kind: "resource",
                      types: ["facility"],
                      target: {
                        schemaRef: "facility",
                      },
                      view: {
                        layout: "inline",
                        schemaRef: "resource_reference_row",
                      },
                    },
                  },
                },
              },
            },
          };
        },
      }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /facilities array 1 items/i }));
  fireEvent.click(screen.getAllByRole("button", { name: /^Edit$/i }).at(-1) as HTMLElement);

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /添加引用/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /新建资源/i })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole("button", { name: /添加引用/i }));
  await waitFor(() => {
    expect(screen.getByLabelText(/添加引用 搜索/i)).toBeInTheDocument();
  });
  fireEvent.pointerDown(screen.getByRole("button", { name: /铁匠铺/i }));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /^Array item 1$/i })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole("button", { name: /新建资源/i }));
  await waitFor(() => {
    expect(createReferenceRow).toHaveBeenCalledTimes(1);
  });
});

test("json-backed select options validate and render labels while preserving literal values", async () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "object",
        properties: {
          tag: {
            type: "string",
            "x-editor": {
              fieldType: "select",
              optionsSource: {
                kind: "json-file",
                uri: "asset://schema-data/tags.json",
                valueField: "id",
                labelField: "name",
                colorField: "color",
              },
            },
          },
        },
      };
    },
  };

  render(
    <EditorShell
      value={{ tag: "fire" }}
      schemaHost={schemaHost}
      host={{
        loadReferenceSource(uri: string) {
          return uri === "asset://schema-data/tags.json"
            ? [{ id: "fire", name: "Fire", color: "red" }, { id: "ice", name: "Ice", color: "blue" }]
            : undefined;
        },
      }}
    />,
  );

  expect(screen.getByRole("button", { name: /Field tag/i })).toHaveTextContent("Fire");

  fireEvent.click(screen.getByRole("button", { name: /Field tag/i }));
  fireEvent.pointerDown(screen.getByRole("button", { name: /Ice/i }));

  await waitFor(() => expect(screen.getByRole("button", { name: /Field tag/i })).toHaveTextContent("Ice"));
});

test("optionsSource multi-select color edits route back to the source when colorField is declared", async () => {
  const setOptionsSourceOptionColor = vi.fn();
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "object",
        properties: {
          tags: {
            type: "array",
            items: { type: "string" },
            "x-editor": {
              fieldType: "multi-select",
              optionsSource: {
                kind: "json-file",
                uri: "asset://schema-data/tags.json",
                valueField: "id",
                labelField: "name",
                colorField: "color",
              },
            },
          },
        },
      };
    },
  };

  render(
    <EditorShell
      value={{ tags: ["fire"] }}
      schemaHost={schemaHost}
      host={{
        loadReferenceSource(uri: string) {
          return uri === "asset://schema-data/tags.json"
            ? [{ id: "fire", name: "Fire", color: "red" }, { id: "ice", name: "Ice", color: "blue" }]
            : undefined;
        },
        setOptionsSourceOptionColor,
      } as any}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Field tags/i }));
  const menuTrigger = document.querySelector(".option-menu-trigger") as HTMLButtonElement | null;
  expect(menuTrigger).not.toBeNull();
  fireEvent.click(menuTrigger!);
  fireEvent.pointerDown(screen.getByRole("button", { name: /金色/ }));

  await waitFor(() => {
    expect(setOptionsSourceOptionColor).toHaveBeenCalledWith({
      uri: "asset://schema-data/tags.json",
      optionValue: "fire",
      color: "gold",
    });
  });
});

test("optionsSource multi-select without colorField does not expose color editing", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "object",
        properties: {
          tags: {
            type: "array",
            items: { type: "string" },
            "x-editor": {
              fieldType: "multi-select",
              optionsSource: {
                kind: "json-file",
                uri: "asset://schema-data/tags.json",
                valueField: "id",
                labelField: "name",
              },
            },
          },
        },
      };
    },
  };

  render(
    <EditorShell
      value={{ tags: ["fire"] }}
      schemaHost={schemaHost}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://schema-data/tags.json"
            ? [{ id: "fire", name: "Fire" }, { id: "ice", name: "Ice" }]
            : undefined;
        },
      }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Field tags/i }));
  expect(document.querySelector(".option-menu-trigger")).toBeNull();
});

test("invalid schema options configuration surfaces a schema error", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "object",
        properties: {
          rarity: {
            type: "string",
            "x-editor": {
              fieldType: "select",
              options: [{ value: "common", label: "Common" }],
              optionsSource: {
                kind: "json-file",
                uri: "asset://schema-data/tags.json",
                valueField: "id",
                labelField: "name",
              },
            },
          },
        },
      };
    },
  };

  render(<EditorShell value={{ rarity: "common" }} schemaHost={schemaHost} />);

  expect(screen.getByText("Schema cannot declare both inline options and optionsSource")).toBeInTheDocument();
});

test("nested object and array pages inside a reference keep their data", async () => {
  render(
    <EditorShell
      documents={{ main: { profile: { companion: "asset://characters/hero.json" } } }}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://characters/hero.json"
            ? { id: "hero", stats: { hp: 10 }, tags: ["vanguard"] }
            : undefined;
        },
      }}
      rootSourceId="main"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "companion reference asset://characters/hero.json" }));

  fireEvent.click(screen.getByRole("button", { name: "stats object 1 fields" }));
  expect(getCurrentPageQueries().getByLabelText("Field hp")).toHaveValue(10);

  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.click(screen.getByRole("button", { name: "tags array 1 items" }));
  expect(getCurrentPageQueries().getByLabelText("Array item 0")).toHaveValue("vanguard");
  expect(screen.queryByLabelText("Field tags")).toBeNull();
});

test("schema object mode only allows adding declared properties", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema({ path }) {
      if (path.length === 0) {
        return {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            title: { type: "string", default: "New Quest" },
          },
        };
      }
      return undefined;
    },
  };

  render(<EditorShell value={{ id: "quest_001" }} schemaHost={schemaHost} />);

  fireEvent.click(getCurrentActionButton("Edit"));
  expect(screen.queryByPlaceholderText("New property key")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add property" }));

  expect(screen.getByDisplayValue("New Quest")).toBeInTheDocument();
});

test("schema object mode keeps add property controls hidden until Edit is enabled", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema({ path }) {
      if (path.length === 0) {
        return {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            title: { type: "string", default: "New Quest" },
          },
        };
      }
      return undefined;
    },
  };

  render(<EditorShell value={{ id: "quest_001" }} schemaHost={schemaHost} />);

  expect(screen.queryByRole("button", { name: "Add property" })).toBeNull();
  expect(screen.queryByPlaceholderText("New property key")).toBeNull();
});

test("schema object mode allows dynamic keys from additionalProperties schema", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema({ path }) {
      if (path.length === 0) {
        return {
          type: "object",
          additionalProperties: {
            type: "integer",
            default: 7,
          },
        };
      }
      return undefined;
    },
  };

  render(<EditorShell value={{}} schemaHost={schemaHost} />);

  fireEvent.click(getCurrentActionButton("Edit"));
  fireEvent.change(screen.getByPlaceholderText("New property key"), { target: { value: "bonus_hp" } });
  fireEvent.click(screen.getByRole("button", { name: "Add property" }));

  expect(screen.getByLabelText("Field bonus_hp")).toHaveValue(7);
});

test("const object pages become read only in schema mode", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema({ path }) {
      if (path.length === 0) {
        return {
          type: "object",
          properties: {
            profile: {
              type: "object",
              const: {
                hp: 10,
              },
              properties: {
                hp: { type: "integer" },
              },
            },
          },
        };
      }
      return undefined;
    },
  };

  render(<EditorShell value={{ profile: { hp: 10 } }} schemaHost={schemaHost} />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));

  expect(getCurrentPageQueries().getByLabelText("Field hp")).toBeDisabled();
});

test("schema array mode creates items from items schema defaults", async () => {
  const schemaHost: EditorSchemaHost = {
    getSchema({ path }) {
      if (path.length === 0) {
        return {
          type: "object",
          properties: {
            party: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", default: "unit_001" },
                  hp: { type: "integer", default: 10 },
                },
              },
            },
          },
        };
      }
      return undefined;
    },
  };

  render(<EditorShell value={{ party: [] }} schemaHost={schemaHost} />);

  fireEvent.click(screen.getByRole("button", { name: "party array 0 items" }));
  fireEvent.click(getCurrentActionButton("Edit"));
  await waitFor(() => expect(getCurrentActionButton("Done")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Create row" }));

  expect(getCurrentPageQueries().getByDisplayValue("unit_001")).toBeInTheDocument();
  expect(getCurrentPageQueries().getByDisplayValue("10")).toBeInTheDocument();
});

test("schema array mode disables delete when minItems is reached", async () => {
  const schemaHost: EditorSchemaHost = {
    getSchema({ path }) {
      if (path.length === 0) {
        return {
          type: "object",
          properties: {
            party: {
              type: "array",
              minItems: 1,
              items: {
                type: "string",
              },
            },
          },
        };
      }
      return undefined;
    },
  };

  render(<EditorShell value={{ party: ["hero"] }} schemaHost={schemaHost} />);

  fireEvent.click(screen.getByRole("button", { name: "party array 1 items" }));
  fireEvent.click(getCurrentActionButton("Edit"));
  await waitFor(() => expect(getCurrentActionButton("Done")).toBeInTheDocument());

  expect(screen.getByRole("button", { name: "Delete row 1" })).toBeDisabled();
});

test("array edit mode uses icon action buttons with tooltip labels", async () => {
  render(<EditorShell value={{ party: ["hero", "guide"] }} />);

  fireEvent.click(screen.getByRole("button", { name: "party array 2 items" }));
  fireEvent.click(getCurrentActionButton("Edit"));
  await waitFor(() => expect(getCurrentActionButton("Done")).toBeInTheDocument());

  expect(screen.getByRole("button", { name: "Copy row 1" })).toHaveAttribute("title", "Copy row 1");
  expect(screen.getByRole("button", { name: "Delete row 1" })).toHaveAttribute("title", "Delete row 1");
  expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
});

test("array edit mode can drag to reorder rows", async () => {
  const { container } = render(<EditorShell value={{ party: ["hero", "guide", "mage"] }} />);

  fireEvent.click(screen.getByRole("button", { name: "party array 3 items" }));
  fireEvent.click(getCurrentActionButton("Edit"));
  await waitFor(() => expect(getCurrentActionButton("Done")).toBeInTheDocument());

  const firstHandle = screen.getByRole("button", { name: "Reorder row 1" });
  const secondHandle = screen.getByRole("button", { name: "Reorder row 2" });
  const thirdHandle = screen.getByRole("button", { name: "Reorder row 3" });

  (firstHandle.closest("tr") as HTMLElement).getBoundingClientRect = () => ({
    x: 0,
    y: 40,
    width: 420,
    height: 48,
    top: 40,
    right: 420,
    bottom: 88,
    left: 0,
    toJSON() {
      return {};
    },
  } as DOMRect);
  (secondHandle.closest("tr") as HTMLElement).getBoundingClientRect = () => ({
    x: 0,
    y: 100,
    width: 420,
    height: 48,
    top: 100,
    right: 420,
    bottom: 148,
    left: 0,
    toJSON() {
      return {};
    },
  } as DOMRect);
  (thirdHandle.closest("tr") as HTMLElement).getBoundingClientRect = () => ({
    x: 0,
    y: 160,
    width: 420,
    height: 48,
    top: 160,
    right: 420,
    bottom: 208,
    left: 0,
    toJSON() {
      return {};
    },
  } as DOMRect);

  fireEvent.mouseDown(thirdHandle, { button: 0, clientX: 12, clientY: 184 });
  fireEvent.mouseMove(window, { clientX: 12, clientY: 60 });
  fireEvent.mouseUp(window, { clientX: 12, clientY: 60 });

  const rowTexts = [...container.querySelectorAll(".stack-page.is-current tbody input[aria-label^='Array item']")]
    .map((input) => (input as HTMLInputElement).value.trim())
    .filter(Boolean);
  expect(rowTexts).toEqual(["mage", "hero", "guide"]);
});

test("schema array mode disables create when maxItems is reached", async () => {
  const schemaHost: EditorSchemaHost = {
    getSchema({ path }) {
      if (path.length === 0) {
        return {
          type: "object",
          properties: {
            party: {
              type: "array",
              maxItems: 1,
              items: {
                type: "string",
                default: "hero",
              },
            },
          },
        };
      }
      return undefined;
    },
  };

  render(<EditorShell value={{ party: ["hero"] }} schemaHost={schemaHost} />);

  fireEvent.click(screen.getByRole("button", { name: "party array 1 items" }));
  fireEvent.click(getCurrentActionButton("Edit"));
  await waitFor(() => expect(getCurrentActionButton("Done")).toBeInTheDocument());

  expect(screen.getByRole("button", { name: "Create row" })).toBeDisabled();
});

test("schema array mode shows uniqueItems validation errors", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema({ path }) {
      if (path.length === 0) {
        return {
          type: "object",
          properties: {
            party: {
              type: "array",
              uniqueItems: true,
              items: {
                type: "string",
              },
            },
          },
        };
      }
      return undefined;
    },
  };

  render(<EditorShell value={{ party: ["hero", "hero"] }} schemaHost={schemaHost} />);

  fireEvent.click(screen.getByRole("button", { name: "party array 2 items" }));

  expect(getCurrentPageQueries().getByText("Array items must be unique")).toBeInTheDocument();
});

test("schema union branches can switch from oneOf options", () => {
  const attackSchema: EditorSchema = {
    title: "Attack",
    type: "object",
    properties: {
      kind: { type: "string", const: "attack" },
      power: { type: "integer", default: 10 },
    },
  };
  const healSchema: EditorSchema = {
    title: "Heal",
    type: "object",
    properties: {
      kind: { type: "string", const: "heal" },
      amount: { type: "integer", default: 5 },
    },
  };
  const schemaHost: EditorSchemaHost = {
    getSchema({ path }) {
      if (path.length === 0) {
        return {
          type: "object",
          properties: {
            action: {
              oneOf: [attackSchema, healSchema],
            },
          },
        };
      }
      return undefined;
    },
  };

  render(<EditorShell value={{ action: { kind: "attack", power: 10 } }} schemaHost={schemaHost} />);

  fireEvent.click(screen.getByRole("button", { name: "action object 2 fields" }));
  fireEvent.change(getCurrentPageQueries().getByLabelText("Schema branch"), { target: { value: "1" } });

  expect(getCurrentPageQueries().getByLabelText("Field amount")).toHaveValue(5);
  expect(getCurrentPageQueries().queryByLabelText("Field power")).toBeNull();
});

test("raw mode keeps schema validation active", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema({ path }) {
      if (path.length === 0) {
        return {
          type: "object",
          properties: {
            title: {
              type: "string",
              minLength: 3,
            },
          },
        };
      }
      return undefined;
    },
  };

  render(<EditorShell value={{ title: "Hero" }} schemaHost={schemaHost} />);

  fireEvent.click(screen.getByRole("button", { name: "Raw" }));
  fireEvent.change(screen.getByLabelText("JSON value editor"), { target: { value: '{\n  "title": ""\n}' } });
  fireEvent.click(screen.getByRole("button", { name: "Apply JSON" }));

  expect(screen.getByText("String must have at least 3 characters")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("String must have at least 3 characters");
  expect(screen.getByLabelText("JSON value editor")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("JSON value editor")).toHaveValue('{\n  "title": ""\n}');
});

test("raw mode applies valid object JSON and returns to field view", () => {
  render(<EditorShell value={{ title: "Hero" }} />);

  fireEvent.click(screen.getByRole("button", { name: "Raw" }));
  fireEvent.change(screen.getByLabelText("JSON value editor"), { target: { value: '{\n  "title": "Mage"\n}' } });
  fireEvent.click(screen.getByRole("button", { name: "Apply JSON" }));

  expect(screen.queryByLabelText("JSON value editor")).toBeNull();
  expect(screen.getByLabelText("Field title")).toHaveValue("Mage");
});

test("schema-authoring row object page can apply unchanged raw JSON", () => {
  render(<App />);

  fireEvent.click(screen.getByText("Wake The Beacon"));
  fireEvent.click(getCurrentPageQueries().getByRole("button", { name: "Raw" }));
  fireEvent.click(getCurrentPageQueries().getByRole("button", { name: "Apply JSON" }));

  expect(screen.queryByLabelText("JSON value editor")).toBeNull();
  expect(getCurrentPageQueries().getByLabelText("Field Quest")).toHaveValue("Wake The Beacon");
});

test("nullable schema fields expose an explicit null toggle", () => {
  const schemaHost: EditorSchemaHost = {
    getSchema({ path }) {
      if (path.length === 0) {
        return {
          type: "object",
          properties: {
            note: {
              type: ["string", "null"],
            },
          },
        };
      }
      return undefined;
    },
  };

  render(<EditorShell value={{ note: null }} schemaHost={schemaHost} />);

  expect(screen.getByRole("button", { name: "Set string value" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Set string value" }));
  const input = screen.getByLabelText("Field note");
  expect(input).toHaveValue("");
  const fieldRow = input.closest(".property-block") as HTMLElement;
  const headingActions = fieldRow.querySelector(".property-heading__actions") as HTMLElement;
  const setNullButton = within(headingActions).getByRole("button", { name: "Set null" });
  expect(setNullButton).toHaveTextContent("null");
  expect(fieldRow.querySelector(".nullable-editor")).toBeNull();
});

test("raw mode can be disabled by host", () => {
  render(<EditorShell value={{ hello: "world" }} enableRawEditor={false} />);

  expect(screen.queryByRole("button", { name: "Raw" })).toBeNull();
});

test("保存不做校验，直接提交文档", async () => {
  const handleSave = vi.fn(async (documents: Record<string, unknown>) => documents);

  render(
    <EditorShell
      documents={{ main: { title: "" } }}
      onSave={handleSave}
    />,
  );

  fireEvent.change(screen.getByLabelText("Field title"), { target: { value: "draft title" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);

  await waitFor(() => expect(handleSave).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("Schema validation failed")).toBeNull();
});

test("schema authoring columns manager can add hidden object-array columns while header menus handle rename", () => {
  const schemaHost = createMutableSchemaHost({
    type: "array",
    "x-editor": {
      table: {
        columns: [
          { key: "title", sortable: true },
          { key: "id" },
        ],
      },
    },
    items: {
      type: "object",
      properties: {
        id: { type: "string", title: "Identifier" },
        title: { type: "string", title: "Title" },
        hp: { type: "integer", title: "Health" },
      },
    },
  });

  render(
    <EditorShell
      value={[
        { id: "quest_001", title: "First Quest", hp: 10 },
      ]}
      schemaHost={schemaHost}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Column visibility/ }));
  const visibilityPanel = document.body.querySelector(".hidden-fields-panel") as HTMLElement;
  fireEvent.click(within(visibilityPanel).getByRole("button", { name: /Health/ }));
  fireEvent.click(screen.getByRole("button", { name: /Column visibility/ }));
  quickPressHeaderMenu(screen.getByRole("button", { name: "Identifier" }));
  fireEvent.change(screen.getByLabelText("Column label for Identifier"), { target: { value: "Quest ID" } });

  const headers = screen.getAllByRole("columnheader").map((node) => node.getAttribute("aria-label")?.trim());
  expect(headers).toEqual(["#", "Title", "Quest ID", "Health"]);
  expect(schemaHost.getRootSchemaSnapshot()["x-editor"]?.table?.columns).toEqual([
    { key: "title", sortable: true },
    { key: "id", label: "Quest ID" },
    { key: "hp" },
  ]);
});

test("schema 缺失时会从数组 JSON 推导 schema，并持久化表头编辑", () => {
  let persistedSchema: EditorSchema | undefined;
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return undefined;
    },
    setRootSchema(schema) {
      persistedSchema = structuredClone(schema);
    },
  };

  render(
    <EditorShell
      value={[{ id: "quest_001", title: "First Quest", hp: 10 }]}
      schemaHost={schemaHost}
    />,
  );

  quickPressHeaderMenu(screen.getByRole("button", { name: "id" }));
  fireEvent.change(screen.getByLabelText("Column label for id"), { target: { value: "Quest ID" } });

  expect(screen.getByRole("columnheader", { name: "Quest ID" })).toBeInTheDocument();
  expect(persistedSchema).toMatchObject({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "array",
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        hp: { type: "integer" },
      },
      additionalProperties: true,
    },
    "x-editor": {
      table: {
        columns: [
          { key: "id", label: "Quest ID" },
          { key: "title" },
          { key: "hp" },
        ],
      },
    },
  });
});

test("schema 持久化失败后回滚内存编辑并持续显示错误", async () => {
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return undefined;
    },
    setRootSchema() {
      return Promise.reject(new Error("disk unavailable"));
    },
  };

  render(<EditorShell value={{ title: "Hero" }} schemaHost={schemaHost} />);

  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Field label for title"), { target: { value: "Name" } });

  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("schema 保存失败，已回滚本次修改。"));
  expect(screen.getByLabelText("Field label for title")).toBeInTheDocument();
});

test("数据只读不阻止 host 保存表头视图 schema", () => {
  let persistedSchema: EditorSchema | undefined;
  const schemaHost: EditorSchemaHost = {
    getSchema() {
      return {
        type: "array",
        readOnly: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
      };
    },
    setRootSchema(schema) {
      persistedSchema = structuredClone(schema);
    },
  };

  render(<EditorShell value={[{ id: "source.herb-field" }]} schemaHost={schemaHost} />);

  quickPressHeaderMenu(screen.getByRole("button", { name: "id" }));
  fireEvent.change(screen.getByLabelText("Column label for id"), { target: { value: "Source ID" } });

  expect(screen.getByRole("columnheader", { name: "Source ID" })).toBeInTheDocument();
  expect(persistedSchema?.["x-editor"]?.table?.columns).toEqual([{ key: "id", label: "Source ID" }]);
});

test("array 视图的 column 改名在中文输入法合成结束前不会提前提交", () => {
  const schemaHost = createMutableSchemaHost({
    type: "array",
    "x-editor": {
      table: {
        columns: [
          { key: "title" },
        ],
      },
    },
    items: {
      type: "object",
      properties: {
        title: { type: "string", title: "Title" },
      },
    },
  });

  render(
    <EditorShell
      value={[
        { title: "First Quest" },
      ]}
      schemaHost={schemaHost}
    />,
  );

  quickPressHeaderMenu(screen.getByRole("button", { name: "Title" }));
  const renameInput = screen.getByLabelText("Column label for Title");

  fireEvent.compositionStart(renameInput);
  fireEvent.change(renameInput, { target: { value: "标" } });

  expect(renameInput).toHaveValue("标");
  expect(schemaHost.getRootSchemaSnapshot()["x-editor"]?.table?.columns).toEqual([
    { key: "title" },
  ]);

  fireEvent.compositionEnd(renameInput, { data: "标" });

  expect(schemaHost.getRootSchemaSnapshot()["x-editor"]?.table?.columns).toEqual([
    { key: "title", label: "标" },
  ]);
});

test("column visibility menu keeps visible columns first and hidden columns in schema order", () => {
  const schemaHost = createMutableSchemaHost({
    type: "array",
    "x-editor": {
      table: {
        columns: [
          { key: "title" },
          { key: "id" },
        ],
      },
    },
    items: {
      type: "object",
      properties: {
        id: { type: "string", title: "Identifier" },
        title: { type: "string", title: "Title" },
        hp: { type: "integer", title: "Health" },
        mp: { type: "integer", title: "Mana" },
      },
    },
  });

  render(
    <EditorShell
      value={[
        { id: "quest_001", title: "First Quest", hp: 10, mp: 4 },
      ]}
      schemaHost={schemaHost}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Column visibility/ }));
  const visibilityPanel = document.body.querySelector(".hidden-fields-panel") as HTMLElement;
  const menuLabels = [...visibilityPanel.querySelectorAll(".hidden-field-toggle")]
    .map((button) => button.textContent?.trim());

  expect(menuLabels).toEqual(["Title", "Identifier", "Health", "Mana"]);
});

test("column visibility menu falls back to object schema order when no visible columns remain", () => {
  const schemaHost = createMutableSchemaHost({
    type: "array",
    "x-editor": {
      table: {
        columns: [
          { key: "title" },
          { key: "id" },
        ],
      },
    },
    items: {
      type: "object",
      properties: {
        id: { type: "string", title: "Identifier" },
        title: { type: "string", title: "Title" },
        hp: { type: "integer", title: "Health" },
      },
    },
  });

  render(
    <EditorShell
      value={[
        { id: "quest_001", title: "First Quest", hp: 10 },
      ]}
      schemaHost={schemaHost}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Column visibility/ }));
  let visibilityPanel = document.body.querySelector(".hidden-fields-panel") as HTMLElement;
  fireEvent.click(within(visibilityPanel).getAllByRole("button", { name: /Title/ }).at(-1) as HTMLElement);
  fireEvent.click(within(visibilityPanel).getAllByRole("button", { name: /Identifier/ }).at(-1) as HTMLElement);

  visibilityPanel = document.body.querySelector(".hidden-fields-panel") as HTMLElement;
  const menuLabels = [...visibilityPanel.querySelectorAll(".hidden-field-toggle")]
    .map((button) => button.textContent?.trim());

  expect(menuLabels).toEqual(["Identifier", "Title", "Health"]);
  expect(schemaHost.getRootSchemaSnapshot()["x-editor"]?.table?.columns).toEqual([]);
});

test("column visibility menu can drag visible items to rewrite column order", () => {
  const schemaHost = createMutableSchemaHost({
    type: "array",
    "x-editor": {
      table: {
        columns: [
          { key: "title" },
          { key: "id" },
          { key: "hp" },
        ],
      },
    },
    items: {
      type: "object",
      properties: {
        id: { type: "string", title: "Identifier" },
        title: { type: "string", title: "Title" },
        hp: { type: "integer", title: "Health" },
      },
    },
  });

  render(
    <EditorShell
      value={[
        { id: "quest_001", title: "First Quest", hp: 10 },
      ]}
      schemaHost={schemaHost}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Column visibility/ }));
  const visibilityPanel = document.body.querySelector(".hidden-fields-panel") as HTMLElement;
  const titleHandle = within(visibilityPanel).getByRole("button", { name: "Reorder Title" });
  const idHandle = within(visibilityPanel).getByRole("button", { name: "Reorder Identifier" });
  const hpHandle = within(visibilityPanel).getByRole("button", { name: "Reorder Health" });

  (titleHandle.closest(".hidden-field-item") as HTMLElement).getBoundingClientRect = () => ({
    x: 0,
    y: 40,
    width: 220,
    height: 36,
    top: 40,
    right: 220,
    bottom: 76,
    left: 0,
    toJSON() {
      return {};
    },
  } as DOMRect);
  (idHandle.closest(".hidden-field-item") as HTMLElement).getBoundingClientRect = () => ({
    x: 0,
    y: 84,
    width: 220,
    height: 36,
    top: 84,
    right: 220,
    bottom: 120,
    left: 0,
    toJSON() {
      return {};
    },
  } as DOMRect);
  (hpHandle.closest(".hidden-field-item") as HTMLElement).getBoundingClientRect = () => ({
    x: 0,
    y: 128,
    width: 220,
    height: 36,
    top: 128,
    right: 220,
    bottom: 164,
    left: 0,
    toJSON() {
      return {};
    },
  } as DOMRect);

  fireEvent.mouseDown(hpHandle, { button: 0, clientX: 10, clientY: 146 });
  fireEvent.mouseMove(window, { clientX: 10, clientY: 50 });
  fireEvent.mouseUp(window, { clientX: 10, clientY: 50 });

  expect(schemaHost.getRootSchemaSnapshot()["x-editor"]?.table?.columns).toEqual([
    { key: "hp" },
    { key: "title" },
    { key: "id" },
  ]);
});

test("schema column header long press does not open the menu", () => {
  vi.useFakeTimers();
  const schemaHost = createMutableSchemaHost({
    type: "array",
    "x-editor": {
      table: {
        columns: [
          { key: "title", sortable: true },
          { key: "id" },
        ],
      },
    },
    items: {
      type: "object",
      properties: {
        id: { type: "string", title: "Identifier" },
        title: { type: "string", title: "Title" },
      },
    },
  });

  render(
    <EditorShell
      value={[
        { id: "quest_001", title: "First Quest" },
      ]}
      schemaHost={schemaHost}
    />,
  );

  const headerButton = screen.getByRole("button", { name: "Identifier" });

  try {
    fireEvent.mouseDown(headerButton, { button: 0, clientX: 100, clientY: 20 });
    act(() => {
      vi.advanceTimersByTime(350);
    });
    fireEvent.mouseUp(window, { button: 0, clientX: 100, clientY: 20 });
    fireEvent.click(headerButton);

    expect(screen.queryByLabelText("Column label for Identifier")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("schema authoring can drag table headers to rewrite default column order", async () => {
  const schemaHost = createMutableSchemaHost({
    type: "array",
    "x-editor": {
      table: {
        columns: [
          { key: "title" },
          { key: "id" },
          { key: "hp" },
        ],
      },
    },
    items: {
      type: "object",
      properties: {
        id: { type: "string", title: "Identifier" },
        title: { type: "string", title: "Title" },
        hp: { type: "integer", title: "Health" },
      },
    },
  });

  const { container } = render(
    <EditorShell
      value={[
        { id: "quest_001", title: "First Quest", hp: 10 },
      ]}
      schemaHost={schemaHost}
    />,
  );

  const tableScroll = container.querySelector(".table-scroll") as HTMLDivElement;
  Object.defineProperty(tableScroll, "scrollWidth", { configurable: true, value: 900 });
  Object.defineProperty(tableScroll, "clientWidth", { configurable: true, value: 480 });
  tableScroll.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: 480,
    height: 200,
    top: 0,
    right: 480,
    bottom: 200,
    left: 0,
    toJSON() {
      return {};
    },
  } as DOMRect);

  const headers = screen.getAllByRole("columnheader");
  const layout = new Map<string, { left: number; right: number }>([
    ["Title", { left: 40, right: 160 }],
    ["Identifier", { left: 160, right: 280 }],
    ["Health", { left: 280, right: 400 }],
  ]);
  for (const header of headers) {
    const label = header.getAttribute("aria-label");
    const slot = label ? layout.get(label) : undefined;
    if (!slot) continue;
    (header as HTMLElement).getBoundingClientRect = () => ({
      x: slot.left,
      y: 0,
      width: slot.right - slot.left,
      height: 40,
      top: 0,
      right: slot.right,
      bottom: 40,
      left: slot.left,
      toJSON() {
        return {};
      },
    } as DOMRect);
  }

  const dragHandle = screen.getByRole("button", { name: "Title" });
  const dragHeader = dragHandle.parentElement as HTMLElement;
  dragHeader.getBoundingClientRect = () => ({
    x: 40,
    y: 0,
    width: 120,
    height: 40,
    top: 0,
    right: 160,
    bottom: 40,
    left: 40,
    toJSON() {
      return {};
    },
  } as DOMRect);
  fireEvent.mouseDown(dragHandle, { button: 0, clientX: 100, clientY: 20 });
  fireEvent.mouseMove(window, { clientX: 181, clientY: 20 });
  await waitFor(() => {
    expect(screen.getAllByRole("columnheader").map((node) => node.getAttribute("aria-label")?.trim())).toEqual([
      "#",
      "Identifier",
      "Title",
      "Health",
    ]);
  });
  fireEvent.mouseMove(window, { clientX: 360, clientY: 20 });
  fireEvent.mouseUp(window, { clientX: 360, clientY: 20 });

  await waitFor(() => {
    expect(screen.getAllByRole("columnheader").map((node) => node.getAttribute("aria-label")?.trim())).toEqual([
      "#",
      "Identifier",
      "Health",
      "Title",
    ]);
  });
  expect(schemaHost.getRootSchemaSnapshot()["x-editor"]?.table?.columns).toEqual([
    { key: "id", width: 120 },
    { key: "hp", width: 120 },
    { key: "title", width: 120 },
  ]);
});

test("reordering preserves the rendered width of an auto-expanded trailing column", async () => {
  const schemaHost = createMutableSchemaHost({
    type: "array",
    "x-editor": {
      table: {
        columns: [
          { key: "status", width: 90 },
          { key: "desc", width: 140 },
        ],
      },
    },
    items: {
      type: "object",
      properties: {
        status: { type: "string", title: "Status" },
        desc: { type: "string", title: "Description" },
      },
    },
  });

  const { container } = render(
    <EditorShell
      value={[
        { status: "Open", desc: "A much longer description that fills the row." },
      ]}
      schemaHost={schemaHost}
    />,
  );

  const tableScroll = container.querySelector(".table-scroll") as HTMLDivElement;
  Object.defineProperty(tableScroll, "scrollWidth", { configurable: true, value: 900 });
  Object.defineProperty(tableScroll, "clientWidth", { configurable: true, value: 480 });
  tableScroll.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: 480,
    height: 200,
    top: 0,
    right: 480,
    bottom: 200,
    left: 0,
    toJSON() {
      return {};
    },
  } as DOMRect);

  const headerLayout = new Map<string, { left: number; right: number }>([
    ["Status", { left: 40, right: 130 }],
    ["Description", { left: 130, right: 479 }],
  ]);
  for (const header of screen.getAllByRole("columnheader")) {
    const label = header.getAttribute("aria-label");
    const slot = label ? headerLayout.get(label) : undefined;
    if (!slot) continue;
    (header as HTMLElement).getBoundingClientRect = () => ({
      x: slot.left,
      y: 0,
      width: slot.right - slot.left,
      height: 40,
      top: 0,
      right: slot.right,
      bottom: 40,
      left: slot.left,
      toJSON() {
        return {};
      },
    } as DOMRect);
  }

  const dragHandle = screen.getByRole("button", { name: "Status" });
  const dragHeader = dragHandle.parentElement as HTMLElement;
  dragHeader.getBoundingClientRect = () => ({
    x: 40,
    y: 0,
    width: 90,
    height: 40,
    top: 0,
    right: 130,
    bottom: 40,
    left: 40,
    toJSON() {
      return {};
    },
  } as DOMRect);

  fireEvent.mouseDown(dragHandle, { button: 0, clientX: 80, clientY: 20 });
  fireEvent.mouseMove(window, { clientX: 420, clientY: 20 });
  fireEvent.mouseUp(window, { clientX: 420, clientY: 20 });

  await waitFor(() => {
    expect(schemaHost.getRootSchemaSnapshot()["x-editor"]?.table?.columns).toEqual([
      { key: "desc", width: 349 },
      { key: "status", width: 90 },
    ]);
  });
});

test("drag preview keeps the auto-expanded width attached to the original long column", () => {
  const schemaHost = createMutableSchemaHost({
    type: "array",
    "x-editor": {
      table: {
        columns: [
          { key: "status", width: 90 },
          { key: "desc", width: 140 },
        ],
      },
    },
    items: {
      type: "object",
      properties: {
        status: { type: "string", title: "Status" },
        desc: { type: "string", title: "Description" },
      },
    },
  });

  const { container } = render(
    <EditorShell
      value={[
        { status: "Open", desc: "A much longer description that fills the row." },
      ]}
      schemaHost={schemaHost}
    />,
  );

  const tableScroll = container.querySelector(".table-scroll") as HTMLDivElement;
  Object.defineProperty(tableScroll, "scrollWidth", { configurable: true, value: 900 });
  Object.defineProperty(tableScroll, "clientWidth", { configurable: true, value: 480 });
  tableScroll.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: 480,
    height: 200,
    top: 0,
    right: 480,
    bottom: 200,
    left: 0,
    toJSON() {
      return {};
    },
  } as DOMRect);

  const headerLayout = new Map<string, { left: number; right: number }>([
    ["Status", { left: 40, right: 130 }],
    ["Description", { left: 130, right: 479 }],
  ]);
  for (const header of screen.getAllByRole("columnheader")) {
    const label = header.getAttribute("aria-label");
    const slot = label ? headerLayout.get(label) : undefined;
    if (!slot) continue;
    (header as HTMLElement).getBoundingClientRect = () => ({
      x: slot.left,
      y: 0,
      width: slot.right - slot.left,
      height: 40,
      top: 0,
      right: slot.right,
      bottom: 40,
      left: slot.left,
      toJSON() {
        return {};
      },
    } as DOMRect);
  }

  const dragHandle = screen.getByRole("button", { name: "Status" });
  const dragHeader = dragHandle.parentElement as HTMLElement;
  dragHeader.getBoundingClientRect = () => ({
    x: 40,
    y: 0,
    width: 90,
    height: 40,
    top: 0,
    right: 130,
    bottom: 40,
    left: 40,
    toJSON() {
      return {};
    },
  } as DOMRect);

  fireEvent.mouseDown(dragHandle, { button: 0, clientX: 80, clientY: 20 });
  fireEvent.mouseMove(window, { clientX: 420, clientY: 20 });

  const statusCol = container.querySelector('col[data-column-field="status"]') as HTMLTableColElement;
  const descCol = container.querySelector('col[data-column-field="desc"]') as HTMLTableColElement;
  expect(statusCol.style.width).toBe("90px");
  expect(descCol.style.width).toBe("349px");
});

test("drag preview keeps the index column width stable", () => {
  const schemaHost = createMutableSchemaHost({
    type: "array",
    "x-editor": {
      table: {
        columns: [
          { key: "status", width: 90 },
          { key: "desc", width: 140 },
        ],
      },
    },
    items: {
      type: "object",
      properties: {
        status: { type: "string", title: "Status" },
        desc: { type: "string", title: "Description" },
      },
    },
  });

  const { container } = render(
    <EditorShell
      value={[
        { status: "Open", desc: "A much longer description that fills the row." },
      ]}
      schemaHost={schemaHost}
    />,
  );

  const tableScroll = container.querySelector(".table-scroll") as HTMLDivElement;
  Object.defineProperty(tableScroll, "scrollWidth", { configurable: true, value: 900 });
  Object.defineProperty(tableScroll, "clientWidth", { configurable: true, value: 480 });
  tableScroll.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: 480,
    height: 200,
    top: 0,
    right: 480,
    bottom: 200,
    left: 0,
    toJSON() {
      return {};
    },
  } as DOMRect);

  const dragHandle = screen.getByRole("button", { name: "Status" });
  const dragHeader = dragHandle.parentElement as HTMLElement;
  dragHeader.getBoundingClientRect = () => ({
    x: 40,
    y: 0,
    width: 90,
    height: 40,
    top: 0,
    right: 130,
    bottom: 40,
    left: 40,
    toJSON() {
      return {};
    },
  } as DOMRect);

  fireEvent.mouseDown(dragHandle, { button: 0, clientX: 80, clientY: 20 });
  fireEvent.mouseMove(window, { clientX: 420, clientY: 20 });

  const indexCol = container.querySelector('col[data-column="#"]') as HTMLTableColElement | null;
  expect(indexCol?.style.width).toBe("45px");
});

test("schema authoring starts reordering once the drag crosses the next column border plus hysteresis", async () => {
  const schemaHost = createMutableSchemaHost({
    type: "array",
    "x-editor": {
      table: {
        columns: [
          { key: "title" },
          { key: "id" },
          { key: "hp" },
        ],
      },
    },
    items: {
      type: "object",
      properties: {
        id: { type: "string", title: "Identifier" },
        title: { type: "string", title: "Title" },
        hp: { type: "integer", title: "Health" },
      },
    },
  });

  const { container } = render(
    <EditorShell
      value={[
        { id: "quest_001", title: "First Quest", hp: 10 },
      ]}
      schemaHost={schemaHost}
    />,
  );

  const tableScroll = container.querySelector(".table-scroll") as HTMLDivElement;
  Object.defineProperty(tableScroll, "scrollWidth", { configurable: true, value: 900 });
  Object.defineProperty(tableScroll, "clientWidth", { configurable: true, value: 480 });
  tableScroll.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: 480,
    height: 200,
    top: 0,
    right: 480,
    bottom: 200,
    left: 0,
    toJSON() {
      return {};
    },
  } as DOMRect);

  const headers = screen.getAllByRole("columnheader");
  const layout = new Map<string, { left: number; right: number }>([
    ["Title", { left: 40, right: 160 }],
    ["Identifier", { left: 160, right: 280 }],
    ["Health", { left: 280, right: 400 }],
  ]);
  for (const header of headers) {
    const label = header.getAttribute("aria-label");
    const slot = label ? layout.get(label) : undefined;
    if (!slot) continue;
    (header as HTMLElement).getBoundingClientRect = () => ({
      x: slot.left,
      y: 0,
      width: slot.right - slot.left,
      height: 40,
      top: 0,
      right: slot.right,
      bottom: 40,
      left: slot.left,
      toJSON() {
        return {};
      },
    } as DOMRect);
  }

  const dragHandle = screen.getByRole("button", { name: "Title" });
  const dragHeader = dragHandle.parentElement as HTMLElement;
  dragHeader.getBoundingClientRect = () => ({
    x: 40,
    y: 0,
    width: 120,
    height: 40,
    top: 0,
    right: 160,
    bottom: 40,
    left: 40,
    toJSON() {
      return {};
    },
  } as DOMRect);

  fireEvent.mouseDown(dragHandle, { button: 0, clientX: 100, clientY: 20 });
  fireEvent.mouseMove(window, { clientX: 181, clientY: 20 });
  fireEvent.mouseUp(window, { clientX: 181, clientY: 20 });

  await waitFor(() => {
    expect(screen.getAllByRole("columnheader").map((node) => node.getAttribute("aria-label")?.trim())).toEqual([
      "#",
      "Identifier",
      "Title",
      "Health",
    ]);
  });
});

test("schema authoring column drag ghost stays attached to the mouse hotspot", () => {
  const schemaHost = createMutableSchemaHost({
    type: "array",
    "x-editor": {
      table: {
        columns: [
          { key: "title" },
          { key: "id" },
        ],
      },
    },
    items: {
      type: "object",
      properties: {
        id: { type: "string", title: "Identifier" },
        title: { type: "string", title: "Title" },
      },
    },
  });

  render(
    <EditorShell
      value={[
        { id: "quest_001", title: "First Quest" },
      ]}
      schemaHost={schemaHost}
    />,
  );

  const dragHandle = screen.getByRole("button", { name: "Title" });
  const dragHeader = dragHandle.parentElement as HTMLElement;
  dragHeader.getBoundingClientRect = () => ({
    x: 40,
    y: 12,
    width: 120,
    height: 40,
    top: 12,
    right: 160,
    bottom: 52,
    left: 40,
    toJSON() {
      return {};
    },
  } as DOMRect);

  fireEvent.mouseDown(dragHandle, { button: 0, clientX: 96, clientY: 26 });
  fireEvent.mouseMove(window, { clientX: 210, clientY: 78 });

  const ghost = document.querySelector(".column-drag-ghost") as HTMLElement;
  expect(ghost).not.toBeNull();
  expect(ghost.style.left).toBe("154px");
  expect(ghost.style.top).toBe("64px");
});

test("schema authoring column drag ghost clears on mouse release", () => {
  const schemaHost = createMutableSchemaHost({
    type: "array",
    "x-editor": {
      table: {
        columns: [
          { key: "title" },
          { key: "id" },
        ],
      },
    },
    items: {
      type: "object",
      properties: {
        id: { type: "string", title: "Identifier" },
        title: { type: "string", title: "Title" },
      },
    },
  });

  render(
    <EditorShell
      value={[
        { id: "quest_001", title: "First Quest" },
      ]}
      schemaHost={schemaHost}
    />,
  );

  const dragHandle = screen.getByRole("button", { name: "Title" });
  const dragHeader = dragHandle.parentElement as HTMLElement;
  dragHeader.getBoundingClientRect = () => ({
    x: 40,
    y: 12,
    width: 120,
    height: 40,
    top: 12,
    right: 160,
    bottom: 52,
    left: 40,
    toJSON() {
      return {};
    },
  } as DOMRect);

  fireEvent.mouseDown(dragHandle, { button: 0, clientX: 96, clientY: 26 });
  fireEvent.mouseMove(window, { clientX: 210, clientY: 78 });
  expect(document.querySelector(".column-drag-ghost")).not.toBeNull();

  fireEvent.mouseUp(window, { button: 0, clientX: 210, clientY: 78 });

  expect(document.querySelector(".column-drag-ghost")).toBeNull();
});

test("schema authoring can add hidden reference projection columns and rename them from the header menu", () => {
  const schemaHost = createMutableSchemaHost(
    {
      type: "array",
      "x-editor": {
        table: {
          columns: [
            { field: ["name"] },
            { field: ["icon"] },
          ],
        },
      },
      items: {
        type: "string",
        "x-editor": {
          reference: {
            target: {
              schemaRef: "reward_item",
            },
            view: {
              schemaRef: "reward_item_row",
            },
          },
        },
      },
    },
    {
      reward_item: {
        type: "object",
        properties: {
          id: { type: "string", title: "Identifier" },
          name: { type: "string", title: "Name" },
          icon: { type: "string", title: "Icon" },
        },
      },
      reward_item_row: {
        type: "object",
        properties: {
          name: {
            type: "string",
            title: "Name",
            "x-editor": {
              projection: { path: ["name"] },
            },
          },
          icon: {
            type: "string",
            title: "Icon",
            "x-editor": {
              projection: { path: ["icon"] },
              display: { kind: "image" },
            },
          },
          id: {
            type: "string",
            title: "Identifier",
            "x-editor": {
              projection: { path: ["id"] },
            },
          },
        },
      },
    },
  );

  render(
    <EditorShell
      value={["asset://items/reward.json"]}
      schemaHost={schemaHost}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://items/reward.json"
            ? { id: "reward", name: "Reward", icon: "res://icons/reward.png" }
            : undefined;
        },
      }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Column visibility/ }));
  const visibilityPanel = document.body.querySelector(".hidden-fields-panel") as HTMLElement;
  fireEvent.click(within(visibilityPanel).getByRole("button", { name: /Identifier/ }));
  fireEvent.click(screen.getByRole("button", { name: /Column visibility/ }));
  quickPressHeaderMenu(screen.getByRole("button", { name: "Name" }));
  fireEvent.change(screen.getAllByLabelText("Column label for Name").at(-1) as HTMLElement, { target: { value: "Display Name" } });

  const headers = screen.getAllByRole("columnheader").map((node) => node.getAttribute("aria-label")?.trim());
  expect(headers).toEqual(["#", "Display Name", "Icon", "Identifier"]);
  expect(schemaHost.getRootSchemaSnapshot()["x-editor"]?.table?.columns).toEqual([
    { field: ["name"], label: "Display Name" },
    { field: ["icon"] },
    { key: "id" },
  ]);
  expect(schemaHost.getNamedSchemaSnapshot("reward_item")?.["x-editor"]?.table?.columns).toBeUndefined();
});

test("reference column manager offers target schema fields even when projection schema omits them", () => {
  const schemaHost = createMutableSchemaHost(
    {
      type: "array",
      "x-editor": {
        table: {
          columns: [
            { field: ["name"] },
          ],
        },
      },
      items: {
        type: "string",
        "x-editor": {
          reference: {
            target: {
              schemaRef: "reward_item",
            },
            view: {
              schemaRef: "reward_item_row",
            },
          },
        },
      },
    },
    {
      reward_item: {
        type: "object",
        properties: {
          id: { type: "string", title: "Identifier" },
          name: { type: "string", title: "Name" },
          icon: { type: "string", title: "Icon" },
          description: { type: "string", title: "Description" },
        },
      },
      reward_item_row: {
        type: "object",
        properties: {
          name: {
            type: "string",
            title: "Name",
            "x-editor": {
              projection: { path: ["name"] },
            },
          },
        },
      },
    },
  );

  render(
    <EditorShell
      value={["asset://items/reward.json"]}
      schemaHost={schemaHost}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://items/reward.json"
            ? { id: "reward", name: "Reward", icon: "res://icons/reward.png", description: "A reward item" }
            : undefined;
        },
      }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Column visibility/ }));

  expect(screen.getByRole("button", { name: /Identifier/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Icon/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Description/ })).toBeInTheDocument();
});

test("schema authoring field order only rewrites schema property order", () => {
  const schemaHost = createMutableSchemaHost({
    type: "object",
    properties: {
      id: { type: "string", title: "Identifier" },
      title: { type: "string", title: "Title" },
      hp: { type: "integer", title: "Health" },
    },
  });

  const handleChange = vi.fn();
  const { container } = render(
    <EditorShell
      value={{ id: "quest_001", title: "First Quest", hp: 10 }}
      schemaHost={schemaHost}
      onChange={handleChange}
    />,
  );

  const healthHandle = screen.getByRole("button", { name: "Reorder Health" });
  const idHandle = screen.getByRole("button", { name: "Reorder Identifier" });
  const titleHandle = screen.getByRole("button", { name: "Reorder Title" });
  (idHandle.closest(".detail-property-item") as HTMLElement).getBoundingClientRect = () => ({
    x: 0,
    y: 200,
    width: 300,
    height: 72,
    top: 200,
    right: 300,
    bottom: 272,
    left: 0,
    toJSON() {
      return {};
    },
  } as DOMRect);
  (healthHandle.closest(".detail-property-item") as HTMLElement).getBoundingClientRect = () => ({
    x: 0,
    y: 120,
    width: 300,
    height: 72,
    top: 120,
    right: 300,
    bottom: 192,
    left: 0,
    toJSON() {
      return {};
    },
  } as DOMRect);
  (titleHandle.closest(".detail-property-item") as HTMLElement).getBoundingClientRect = () => ({
    x: 0,
    y: 40,
    width: 300,
    height: 72,
    top: 40,
    right: 300,
    bottom: 112,
    left: 0,
    toJSON() {
      return {};
    },
  } as DOMRect);
  fireEvent.mouseDown(healthHandle, { button: 0, clientX: 10, clientY: 150 });
  fireEvent.mouseMove(window, { clientX: 10, clientY: 60 });
  fireEvent.mouseUp(window, { clientX: 10, clientY: 60 });

  const fieldLabels = [...container.querySelectorAll(".property-heading > span")].map((node) => node.textContent?.trim());
  expect(fieldLabels.slice(0, 3)).toEqual(["Health", "Identifier", "Title"]);
  expect(Object.keys(schemaHost.getRootSchemaSnapshot().properties ?? {})).toEqual(["hp", "id", "title"]);
  expect(handleChange).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Raw" }));
  expect(screen.getByRole("textbox")).toHaveValue(`{
  "id": "quest_001",
  "title": "First Quest",
  "hp": 10
}`);
});

test("object page field reorder requires schema authoring support", () => {
  render(
    <EditorShell
      value={{ id: "quest_001", title: "First Quest", hp: 10 }}
    />,
  );
  expect(screen.queryByRole("button", { name: "Reorder hp" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reorder id" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reorder title" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Raw" }));
  expect(screen.getByRole("textbox")).toHaveValue(`{
  "id": "quest_001",
  "title": "First Quest",
  "hp": 10
}`);
});

test("schema select editors use a popover trigger and keep writing literal values", () => {
  const schemaHost = createMutableSchemaHost({
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
          ],
        },
      },
    },
  });

  render(<EditorShell value={{ rarity: "common" }} schemaHost={schemaHost} />);

  fireEvent.click(screen.getByRole("button", { name: /Field Rarity/i }));
  fireEvent.pointerDown(screen.getByRole("button", { name: /Rare/i }));

  expect(screen.getByRole("button", { name: /Field Rarity/i })).toHaveTextContent("Rare");
});

test("schema multi-select option popover can author inline options", async () => {
  const schemaHost = createMutableSchemaHost({
    type: "object",
    properties: {
      tags: {
        type: "array",
        items: { type: "string" },
        title: "Tags",
        "x-editor": {
          fieldType: "multi-select",
          options: [
            { value: "fire", label: "Fire", color: "red" },
            { value: "boss", label: "Boss", color: "gold" },
          ],
        },
      },
    },
  });

  render(<EditorShell value={{ tags: ["fire"] }} schemaHost={schemaHost} />);

  fireEvent.click(screen.getByRole("button", { name: /Field Tags/i }));
  fireEvent.change(screen.getByPlaceholderText("Search or create an option"), { target: { value: "elite" } });
  fireEvent.pointerDown(screen.getByRole("button", { name: /Create "elite"/i }));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /Field Tags/i })).toHaveTextContent("elite");
  });
});

test("schema header wrap toggle writes column wrap config and applies wrapped-cell styling", async () => {
  const schemaHost = createMutableSchemaHost({
    type: "array",
    "x-editor": {
      table: {
        columns: [
          { key: "title" },
          { key: "hp" },
        ],
      },
    },
    items: {
      type: "object",
      properties: {
        title: { type: "string", title: "Title" },
        hp: { type: "integer", title: "Health" },
      },
    },
  });

  const { container } = render(
    <EditorShell
      value={[
        { title: "A very long title that should wrap once the column wrap setting is enabled.", hp: 10 },
      ]}
      schemaHost={schemaHost}
    />,
  );

  quickPressHeaderMenu(screen.getByRole("button", { name: "Title" }));
  fireEvent.click(screen.getByRole("button", { name: "Wrap text" }));

  await waitFor(() => {
    expect(schemaHost.getRootSchemaSnapshot()["x-editor"]?.table?.columns).toEqual([
      { key: "title", wrap: true },
      { key: "hp" },
    ]);
  });

  const wrappedCell = container.querySelector('tbody td.wrapped-cell');
  expect(wrappedCell).not.toBeNull();
  expect(wrappedCell?.textContent).toContain("A very long title");
});

test("object pages render image display fields with preview and path input", () => {
  render(
    <EditorShell
      value={{ icon: "res://assets/icons/monster/htj_bully.png" }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              icon: {
                type: "string",
                title: "Icon",
                "x-editor": {
                  display: {
                    kind: "image",
                  },
                },
              },
            },
          };
        },
      }}
      host={{
        resolveDisplayUrl(value) {
          return value.replace("res://", "http://localhost/");
        },
      }}
    />,
  );

  expect(screen.getByLabelText("Field Icon")).toHaveValue("res://assets/icons/monster/htj_bully.png");
  expect(screen.getByRole("img", { name: "Icon" })).toHaveAttribute(
    "src",
    "http://localhost/assets/icons/monster/htj_bully.png",
  );
});

test("object pages render icon preset with larger detail preview than list thumbnails", () => {
  render(
    <EditorShell
      value={{ icon: "res://assets/icons/material/iron_ore.png" }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              icon: {
                type: "string",
                title: "Icon",
                "x-editor": {
                  display: {
                    kind: "image",
                    preset: "icon",
                  },
                },
              },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getByRole("img", { name: "Icon" })).toHaveStyle({ width: "72px", height: "72px" });
});

test("object pages render large-icon preset with larger featured preview", () => {
  render(
    <EditorShell
      value={{ icon: "res://assets/icons/role/player_default.png" }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              icon: {
                type: "string",
                title: "Icon",
                "x-editor": {
                  display: {
                    kind: "image",
                    preset: "large-icon",
                  },
                },
              },
            },
          };
        },
      }}
    />,
  );

  const iconPreview = screen.getByRole("img", { name: "Icon" });
  expect(iconPreview).toHaveStyle({ width: "128px", height: "128px" });
  expect(iconPreview).toHaveClass("reference-preview__image--large-icon", "reference-preview__image--field-editor");
  expect(iconPreview.closest(".image-field-editor")).toHaveClass("image-field-editor--large-icon");
});

test("object image previews open centered viewer with zoom controls and wheel scaling", () => {
  render(
    <EditorShell
      value={{ icon: "res://assets/icons/role/player_default.png" }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              icon: {
                type: "string",
                title: "Icon",
                "x-editor": {
                  display: {
                    kind: "image",
                    preset: "large-icon",
                  },
                },
              },
            },
          };
        },
      }}
    />,
  );

  fireEvent.click(screen.getByRole("img", { name: "Icon" }));

  const dialog = screen.getByRole("dialog", { name: "Icon 图片浏览" });
  const dialogQueries = within(dialog);
  expect(dialogQueries.getByRole("button", { name: "放大图片" })).toBeTruthy();
  expect(dialogQueries.getByRole("button", { name: "缩小图片" })).toBeTruthy();
  expect(dialogQueries.getByRole("button", { name: "恢复图片大小" })).toBeTruthy();
  expect(dialogQueries.getByRole("button", { name: "关闭图片浏览" })).toBeTruthy();
  expect(dialogQueries.getByRole("button", { name: "放大图片" }).closest(".image-viewer__toolbar")?.parentElement).toBe(dialog);

  const viewerImage = dialogQueries.getByRole("img", { name: "Icon" });
  expect(viewerImage).toHaveStyle({ transform: "scale(1)" });

  fireEvent.click(dialogQueries.getByRole("button", { name: "放大图片" }));
  expect(viewerImage).toHaveStyle({ transform: "scale(1.25)" });

  fireEvent.wheel(viewerImage, { deltaY: -100 });
  expect(viewerImage).toHaveStyle({ transform: "scale(1.5)" });

  fireEvent.click(dialogQueries.getByRole("button", { name: "恢复图片大小" }));
  expect(viewerImage).toHaveStyle({ transform: "scale(1)" });

  fireEvent.click(dialogQueries.getByRole("img", { name: "Icon" }).closest(".image-viewer__viewport") as HTMLElement);
  expect(screen.queryByRole("dialog", { name: "Icon 图片浏览" })).toBeNull();
});

test("object pages infer image presets from field semantics without host-injected display config", () => {
  render(
    <EditorShell
      value={{
        icon: "res://assets/icons/role/player_default.png",
        portrait: "res://assets/portraits/player_default.png",
        background_image: "res://assets/backgrounds/sect_hall.png",
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              icon: {
                type: "string",
                title: "图标",
              },
              portrait: {
                type: "string",
                title: "Portrait",
              },
              background_image: {
                type: "string",
                title: "背景图",
              },
            },
          };
        },
      }}
    />,
  );

  const previews = screen.getAllByRole("img");
  expect(previews[0]).toHaveClass("reference-preview__image--large-icon");
  expect(previews[0]).toHaveStyle({ width: "128px", height: "128px" });
  expect(previews[1]).toHaveClass("reference-preview__image--portrait");
  expect(previews[1]).toHaveStyle({ width: "144px", height: "192px" });
  expect(previews[2]).toHaveClass("reference-preview__image--banner");
  expect(previews[2]).toHaveStyle({ width: "192px", height: "72px" });
});

test("object pages render structured array fields as inline previews with direct cell editing", () => {
  render(
    <EditorShell
      value={{
        components_config: [
          {
            component_name: "ScenarioComponent",
            config: {
              map: {
                scene: "res://scenes/world/player.tscn",
                outfit: "player_world",
              },
              combat: {
                scene: "res://scenes/combat/player.tscn",
                outfit: "player_combat",
              },
            },
          },
        ],
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              components_config: {
                type: "array",
                title: "Components",
                items: {
                  type: "object",
                  properties: {
                    component_name: {
                      type: "string",
                      title: "组件",
                    },
                    config: {
                      type: "object",
                      title: "配置",
                    },
                  },
                },
                "x-editor": {
                  table: {
                    columns: [
                      { key: "component_name", label: "组件" },
                      { key: "config", label: "配置", width: 320, wrap: true },
                    ],
                  },
                },
              },
            },
          };
        },
      }}
      host={{
        getObjectProjectionConfig(context) {
          if (context.path.at(-1) !== "config") {
            return undefined;
          }
          return {
            columns: [
              { field: ["map", "scene"], label: "大地图场景", width: 240, wrap: true },
              { field: ["combat", "scene"], label: "战斗场景", width: 240, wrap: true },
            ],
            objectValueSchema: {
              type: "object",
              properties: {
                map: {
                  type: "object",
                  properties: {
                    scene: { type: "string" },
                    outfit: { type: "string" },
                  },
                },
                combat: {
                  type: "object",
                  properties: {
                    scene: { type: "string" },
                    outfit: { type: "string" },
                  },
                },
              },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getByText("Showing 1 of 1 items")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open Components" })).toBeInTheDocument();
  expect(screen.queryByText("Open array")).toBeNull();
  expect(screen.getByText("ScenarioComponent")).toBeInTheDocument();
  expect(document.querySelector(".object-array-preview .nested-entry-button")).not.toBeNull();
  expect(screen.queryByText("大地图场景")).toBeNull();
  expect(screen.queryByText("战斗场景")).toBeNull();
});

test("object inline array previews keep reference cells as compact summaries instead of expanding full reference rows", () => {
  render(
    <EditorShell
      value={{
        shop_items: [
          {
            item_path: "asset://material/copper_ore.json",
            buy_price: 100,
            sell_price: 50,
          },
        ],
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              shop_items: {
                type: "array",
                title: "商品",
                items: {
                  type: "object",
                  properties: {
                    item_path: {
                      type: "string",
                      title: "物品路径",
                      "x-editor": {
                        reference: {
                          kind: "resource",
                          target: {
                            schemaRef: "resource_reference_target",
                          },
                          view: {
                            layout: "inline",
                            schemaRef: "resource_reference_row",
                          },
                        },
                      },
                    },
                    buy_price: { type: "number", title: "买入价" },
                    sell_price: { type: "number", title: "卖出价" },
                  },
                },
                "x-editor": {
                  table: {
                    columns: [
                      { key: "item_path", label: "物品路径", wrap: true },
                      { key: "buy_price", label: "买入价" },
                      { key: "sell_price", label: "卖出价" },
                    ],
                  },
                },
              },
            },
          };
        },
        getNamedSchema(name) {
          if (name === "resource_reference_target") {
            return {
              type: "object",
              properties: {
                id: { type: "string", title: "ID" },
                icon: {
                  type: "string",
                  title: "图标",
                  "x-editor": {
                    display: {
                      kind: "image",
                      preset: "icon",
                    },
                  },
                },
                name: { type: "string", title: "名称" },
                description: { type: "string", title: "说明" },
              },
            };
          }
          if (name === "resource_reference_row") {
            return {
              type: "object",
              properties: {
                icon: {
                  type: "string",
                  title: "图标",
                  "x-editor": {
                    display: {
                      kind: "image",
                      preset: "icon",
                    },
                    projection: { path: ["icon"] },
                  },
                },
                id: {
                  type: "string",
                  title: "ID",
                  "x-editor": {
                    projection: { path: ["id"] },
                  },
                },
                name: {
                  type: "string",
                  title: "名称",
                  "x-editor": {
                    projection: { path: ["name"] },
                  },
                },
                description: {
                  type: "string",
                  title: "说明",
                  "x-editor": {
                    projection: { path: ["description"] },
                  },
                },
              },
            };
          }
          return undefined;
        },
      }}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://material/copper_ore.json"
            ? {
              id: "copper_ore",
              icon: "res://assets/icons/materials/ores/copper_ore.png",
              name: "铜矿石",
              description: "产地：矿山 用途：冶炼铜器",
            }
            : undefined;
        },
      }}
    />,
  );

  expect(screen.getByText("Showing 1 of 1 items")).toBeInTheDocument();
  expect(screen.getByText("铜矿石")).toBeInTheDocument();
  expect(document.querySelector(".object-array-preview .reference-preview__compact")).not.toBeNull();
  expect(screen.queryByText("说明")).toBeNull();
  expect(screen.getByText("产地：矿山 用途：冶炼铜器")).toBeInTheDocument();
});

test("object inline array previews render rgba preset objects as swatch plus color value summaries", () => {
  render(
    <EditorShell
      value={{
        labels: [
          {
            id: "attack",
            name: "攻击",
            color: {
              r: 0.91,
              g: 0.3,
              b: 0.24,
              a: 1,
            },
          },
        ],
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              labels: {
                type: "array",
                title: "属性标签",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", title: "标签ID" },
                    name: { type: "string", title: "标签名" },
                    color: {
                      type: "object",
                      title: "颜色",
                      "x-editor": {
                        object: {
                          preset: "rgba",
                        },
                      },
                      properties: {
                        r: { type: "number", title: "R" },
                        g: { type: "number", title: "G" },
                        b: { type: "number", title: "B" },
                        a: { type: "number", title: "A" },
                      },
                    },
                  },
                },
                "x-editor": {
                  table: {
                    columns: [
                      { key: "id", label: "标签ID" },
                      { key: "name", label: "标签名" },
                      { key: "color", label: "颜色" },
                    ],
                  },
                },
              },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getByText("Showing 1 of 1 items")).toBeInTheDocument();
  expect(screen.getByText("#E84D3D")).toBeInTheDocument();
  expect(document.querySelector(".array-color-summary__swatch")).not.toBeNull();
  expect(screen.queryByDisplayValue("0.91")).toBeNull();
  expect(screen.queryByDisplayValue("0.3")).toBeNull();
  expect(screen.queryByDisplayValue("0.24")).toBeNull();
  expect(screen.queryByText("4 items")).toBeNull();
});

test("object reference fields render compact inline projections without field labels", () => {
  const { container } = render(
    <EditorShell
      value={{
        effect: "asset://buff/heal_small.json",
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              effect: {
                type: "string",
                title: "效果",
                "x-editor": {
                  reference: {
                    kind: "resource",
                    target: {
                      schemaRef: "buff",
                    },
                    view: {
                      layout: "inline",
                      schemaRef: "resource_reference_row",
                    },
                  },
                },
              },
            },
          };
        },
        getNamedSchema(name) {
          if (name === "buff") {
            return {
              type: "object",
              properties: {
                id: { type: "string", title: "ID" },
                name: { type: "string", title: "名称" },
                description: { type: "string", title: "说明" },
              },
            };
          }
          if (name === "resource_reference_row") {
            return {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  title: "ID",
                  "x-editor": {
                    projection: { path: ["id"] },
                  },
                },
                name: {
                  type: "string",
                  title: "名称",
                  "x-editor": {
                    projection: { path: ["name"] },
                  },
                },
                description: {
                  type: "string",
                  title: "说明",
                  "x-editor": {
                    projection: { path: ["description"] },
                  },
                },
              },
            };
          }
          return undefined;
        },
      }}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://buff/heal_small.json"
            ? {
              id: "heal_small",
              name: "小型治疗",
              description: "恢复少量生命值",
            }
            : undefined;
        },
      }}
    />,
  );

  const button = container.querySelector(".node-page--object .nested-entry-button.tone-reference");
  const compact = button?.querySelector(".reference-preview__compact");

  expect(button).not.toBeNull();
  expect(compact).not.toBeNull();
  expect(screen.getByText("小型治疗")).toBeInTheDocument();
  expect(screen.queryByText("名称")).toBeNull();
  expect(screen.queryByText("说明")).toBeNull();
  expect(screen.getByText("恢复少量生命值")).toBeInTheDocument();
});

test("object pages keep plain arrays as navigable entries when schema does not declare table or reference preview", () => {
  render(
    <EditorShell
      value={{
        party: [
          { id: "hero", hp: 10 },
          { id: "guide", hp: 6 },
        ],
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              party: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    hp: { type: "number" },
                  },
                },
              },
            },
          };
        },
      }}
    />,
  );

  expect(screen.queryByText("Showing 2 of 2 items")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "party array 2 items" })).toBeInTheDocument();
});

test("projected object fields render declared table arrays as inline previews", () => {
  render(
    <EditorShell
      value={{
        world: {
          entry_map: "mortal_realm_early_world",
          maps: [
            {
              map_id: "mortal_realm_early_world",
              map_name: "凡人界初期世界",
            },
          ],
        },
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              world: {
                type: "object",
                properties: {
                  entry_map: { type: "string" },
                  maps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        map_id: { type: "string", title: "地图ID" },
                        map_name: { type: "string", title: "地图名称" },
                      },
                    },
                    "x-editor": {
                      table: {
                        columns: [
                          { key: "map_id", label: "地图ID" },
                          { key: "map_name", label: "地图名称", width: 220, wrap: true },
                        ],
                      },
                    },
                  },
                },
              },
            },
          };
        },
      }}
      host={{
        getObjectProjectionConfig(context) {
          if (context.path.at(-1) !== "world") {
            return undefined;
          }
          return {
            columns: [
              { field: ["entry_map"], label: "入口地图", width: 180, wrap: true },
              { field: ["maps"], label: "地图列表", width: 260, wrap: true },
            ],
            objectValueSchema: {
              type: "object",
              properties: {
                entry_map: { type: "string" },
                maps: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      map_id: { type: "string", title: "地图ID" },
                      map_name: { type: "string", title: "地图名称" },
                    },
                  },
                  "x-editor": {
                    table: {
                      columns: [
                        { key: "map_id", label: "地图ID" },
                        { key: "map_name", label: "地图名称", width: 220, wrap: true },
                      ],
                    },
                  },
                },
              },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getByText("地图列表")).toBeInTheDocument();
  expect(screen.getByText("Showing 1 of 1 items")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open 地图列表" })).toBeInTheDocument();
  expect(screen.getByText("mortal_realm_early_world")).toBeInTheDocument();
  expect(screen.getByText("凡人界初期世界")).toBeInTheDocument();
});

test("inline array previews follow schema visible-column order and cap object-view columns", () => {
  render(
    <EditorShell
      value={{
        effects: [
          {
            effect_type: "heal",
            value: 10,
            duration: 5,
            target: "asset://buff/consumable_heal.json",
          },
        ],
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              effects: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    effect_type: { type: "string", title: "效果类型" },
                    value: { type: "number", title: "数值" },
                    duration: { type: "number", title: "持续时间" },
                    target: { type: "string", title: "目标" },
                  },
                },
                "x-editor": {
                  table: {
                    columns: [
                      { key: "effect_type", label: "效果类型" },
                      { key: "value", label: "数值" },
                      { key: "duration", label: "持续时间" },
                      { key: "target", label: "目标" },
                    ],
                  },
                },
              },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getByRole("columnheader", { name: "效果类型" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "数值" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "持续时间" })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "目标" })).toBeNull();
  expect(screen.queryByDisplayValue("heal")).toBeNull();
  expect(screen.getByText("heal")).toBeInTheDocument();
});

test("object pages render rgba preset objects as compact inline editors", () => {
  render(
    <EditorShell
      value={{
        effect_color: {
          r: 1,
          g: 0.5,
          b: 0.25,
          a: 0.75,
        },
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              effect_color: {
                type: "object",
                title: "Effect Color",
                "x-editor": {
                  object: {
                    preset: "rgba",
                  },
                },
                properties: {
                  r: { type: "number" },
                  g: { type: "number" },
                  b: { type: "number" },
                  a: { type: "number" },
                },
              },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getByText("R")).toBeInTheDocument();
  expect(screen.getByText("G")).toBeInTheDocument();
  expect(screen.getByText("B")).toBeInTheDocument();
  expect(screen.getByText("A")).toBeInTheDocument();
  expect(screen.getByDisplayValue("1")).toBeInTheDocument();
  expect(screen.getByDisplayValue("0.5")).toBeInTheDocument();
  expect(screen.getByDisplayValue("0.25")).toBeInTheDocument();
  expect(screen.getByDisplayValue("0.75")).toBeInTheDocument();
});

test("object pages expose rgba color pickers that sync rgb channels and preserve alpha", () => {
  const { container } = render(
    <EditorShell
      value={{
        effect_color: {
          r: 1,
          g: 0.5,
          b: 0.25,
          a: 0.75,
        },
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              effect_color: {
                type: "object",
                title: "Effect Color",
                "x-editor": {
                  object: {
                    preset: "rgba",
                  },
                },
                properties: {
                  r: { type: "number" },
                  g: { type: "number" },
                  b: { type: "number" },
                  a: { type: "number" },
                },
              },
            },
          };
        },
      }}
    />,
  );

  const picker = screen.getByLabelText("Effect Color color picker");
  const projection = container.querySelector(".node-page--object .object-field-projection--rgba");
  const firstCell = projection?.querySelector(".object-field-projection__cell");
  expect(picker).toHaveValue("#ff8040");
  expect(container.querySelector(".object-field-projection__rgba-control")).toBeNull();
  expect(firstCell?.querySelector('input[type="color"]')).toBe(picker);
  expect(firstCell).toHaveClass("object-field-projection__cell--rgba-picker");

  fireEvent.change(picker, { target: { value: "#000000" } });

  expect(screen.getByLabelText("Effect Color R")).toHaveValue(0);
  expect(screen.getByLabelText("Effect Color G")).toHaveValue(0);
  expect(screen.getByLabelText("Effect Color B")).toHaveValue(0);
  expect(screen.getByDisplayValue("0.75")).toBeInTheDocument();
  expect(screen.queryByDisplayValue("0.5")).toBeNull();
  expect(screen.queryByDisplayValue("0.25")).toBeNull();
});

test("object pages resolve rgba preset from union object branches", () => {
  render(
    <EditorShell
      value={{
        effect_color: {
          r: 0.8,
          g: 0.4,
          b: 0.2,
          a: 1,
        },
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              effect_color: {
                title: "Effect Color",
                oneOf: [
                  {
                    type: "array",
                    items: { type: "number" },
                  },
                  {
                    type: "object",
                    "x-editor": {
                      object: {
                        preset: "rgba",
                      },
                    },
                    properties: {
                      r: { type: "number" },
                      g: { type: "number" },
                      b: { type: "number" },
                      a: { type: "number" },
                    },
                  },
                ],
              },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getByText("R")).toBeInTheDocument();
  expect(screen.getByText("G")).toBeInTheDocument();
  expect(screen.getByText("B")).toBeInTheDocument();
  expect(screen.getByText("A")).toBeInTheDocument();
  expect(screen.getByDisplayValue("0.8")).toBeInTheDocument();
  expect(screen.getByDisplayValue("0.4")).toBeInTheDocument();
  expect(screen.getByDisplayValue("0.2")).toBeInTheDocument();
  expect(screen.getByDisplayValue("1")).toBeInTheDocument();
});

test("object pages infer xy preset from numeric point schemas", () => {
  render(
    <EditorShell
      value={{
        position: {
          x: 120,
          y: 48,
        },
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              position: {
                type: "object",
                title: "Position",
                properties: {
                  x: { type: "number" },
                  y: { type: "number" },
                },
              },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getByText("X")).toBeInTheDocument();
  expect(screen.getByText("Y")).toBeInTheDocument();
  expect(screen.getByDisplayValue("120")).toBeInTheDocument();
  expect(screen.getByDisplayValue("48")).toBeInTheDocument();
});

test("object pages honor field-level object projection schemas", () => {
  render(
    <EditorShell
      value={{
        component_name: "CombatComponent",
        config: {
          max_health: {
            default: 100,
            type: "float",
            tooltip: "最大生命值",
          },
        },
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              component_name: {
                type: "string",
                title: "组件",
              },
              config: {
                type: "object",
                title: "配置",
                "x-editor": {
                  table: {
                    columns: [
                      { field: ["default"], label: "值" },
                      { field: ["type"], label: "类型" },
                      { field: ["tooltip"], label: "说明", wrap: true },
                    ],
                    objectValueSchema: {
                      type: "object",
                      properties: {
                        default: {},
                        type: { type: "string", readOnly: true },
                        tooltip: { type: "string", readOnly: true },
                      },
                    },
                  },
                },
              },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getByText("值")).toBeInTheDocument();
  expect(screen.getByText("类型")).toBeInTheDocument();
  expect(screen.getByText("说明")).toBeInTheDocument();
  expect(screen.getByDisplayValue("100")).toBeInTheDocument();
  expect(screen.getByDisplayValue("float")).toBeDisabled();
  expect(screen.getByDisplayValue("最大生命值")).toBeDisabled();
});

test("array tables honor field-level object projection schemas and allow editing inline", () => {
  render(
    <EditorShell
      value={[
        {
          component_name: "CombatComponent",
          config: {
            max_health: {
              default: 100,
              type: "float",
              tooltip: "最大生命值",
            },
          },
        },
      ]}
      schemaHost={{
        getSchema() {
          return {
            type: "array",
            "x-editor": {
              table: {
                columns: [
                  { key: "component_name", label: "组件" },
                  { key: "config", label: "配置", width: 320, wrap: true },
                ],
              },
            },
            items: {
              type: "object",
              properties: {
                component_name: {
                  type: "string",
                  title: "组件",
                },
                config: {
                  type: "object",
                  title: "配置",
                  "x-editor": {
                    table: {
                      columns: [
                        { field: ["default"], label: "值" },
                        { field: ["type"], label: "类型" },
                        { field: ["tooltip"], label: "说明", wrap: true },
                      ],
                      objectValueSchema: {
                        type: "object",
                        properties: {
                          default: {},
                          type: { type: "string", readOnly: true },
                          tooltip: { type: "string", readOnly: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getByText("值")).toBeInTheDocument();
  expect(screen.getByText("类型")).toBeInTheDocument();
  expect(screen.getByDisplayValue("100")).toBeInTheDocument();
  expect(screen.getByDisplayValue("float")).toBeDisabled();

  fireEvent.change(screen.getByDisplayValue("100"), { target: { value: "120" } });

  expect(screen.getByDisplayValue("120")).toBeInTheDocument();
});

test("array tables keep object projection editable during mixed wrapper migration", () => {
  let lastDocuments: Record<string, unknown> | null = null;
  render(
    <EditorShell
      value={[
        {
          component_name: "HealthComponent",
          config: {
            max_health: {
              default: 100,
              type: "float",
              tooltip: "最大生命值",
            },
            regeneration: 5,
          },
        },
      ]}
      onChange={(documents) => {
        lastDocuments = documents;
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "array",
            "x-editor": {
              table: {
                columns: [
                  { key: "component_name", label: "组件" },
                  { key: "config", label: "配置", width: 320, wrap: true },
                ],
              },
            },
            items: {
              type: "object",
              properties: {
                component_name: {
                  type: "string",
                  title: "组件",
                },
                config: {
                  type: "object",
                  title: "配置",
                  "x-editor": {
                    table: {
                      columns: [
                        { field: ["default"], label: "值" },
                        { field: ["type"], label: "类型" },
                        { field: ["tooltip"], label: "说明", wrap: true },
                      ],
                      objectValueSchema: {
                        type: "object",
                        properties: {
                          default: {},
                          type: { type: "string", readOnly: true },
                          tooltip: { type: "string", readOnly: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getByDisplayValue("100")).toBeInTheDocument();
  expect(screen.getByDisplayValue("5")).toBeInTheDocument();

  fireEvent.change(screen.getByDisplayValue("5"), { target: { value: "8" } });

  expect(screen.getByDisplayValue("8")).toBeInTheDocument();
  expect(lastDocuments).toMatchObject({
    main: [
      {
        config: {
          regeneration: 8,
        },
      },
    ],
  });
});

test("projected object maps can inline nested object projections from host config", () => {
  let lastDocuments: Record<string, unknown> | null = null;
  render(
    <EditorShell
      value={[
        {
          component_name: "ScenarioComponent",
          config: {
            map: {
              scene: "res://scenes/entities/templates/map_base.tscn",
              outfit: "res://scenes/entities/outfits/player_outfit.tscn",
            },
          },
        },
      ]}
      onChange={(documents) => {
        lastDocuments = documents;
      }}
      host={{
        getObjectProjectionConfig(context) {
          const parent = context.parentValue;
          if (!parent || typeof parent !== "object" || (parent as { component_name?: string }).component_name !== "ScenarioComponent") {
            return undefined;
          }
          return {
            columns: [
              { field: ["scene"], label: "场景" },
              { field: ["outfit"], label: "外观" },
            ],
            objectValueSchema: {
              type: "object",
              properties: {
                scene: { type: "string" },
                outfit: { type: "string" },
              },
            },
          };
        },
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "array",
            "x-editor": {
              table: {
                columns: [
                  { key: "component_name", label: "组件" },
                  { key: "config", label: "配置", width: 320, wrap: true },
                ],
              },
            },
            items: {
              type: "object",
              properties: {
                component_name: {
                  type: "string",
                  title: "组件",
                },
                config: {
                  type: "object",
                  title: "配置",
                  "x-editor": {
                    table: {
                      columns: [
                        { field: ["default"], label: "值" },
                      ],
                      objectValueSchema: {
                        type: "object",
                        properties: {
                          default: {},
                        },
                      },
                    },
                  },
                },
              },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getByText("场景")).toBeInTheDocument();
  expect(screen.getByText("外观")).toBeInTheDocument();
  expect(screen.getByDisplayValue("res://scenes/entities/templates/map_base.tscn")).toBeInTheDocument();

  fireEvent.change(screen.getByDisplayValue("res://scenes/entities/templates/map_base.tscn"), {
    target: { value: "res://scenes/entities/templates/map_variant.tscn" },
  });

  expect(lastDocuments).toMatchObject({
    main: [
      {
        component_name: "ScenarioComponent",
        config: {
          map: {
            scene: "res://scenes/entities/templates/map_variant.tscn",
            outfit: "res://scenes/entities/outfits/player_outfit.tscn",
          },
        },
      },
    ],
  });
});

test("projected object fields render editable controls even when the projected keys are currently missing", () => {
  let lastDocuments: Record<string, unknown> | null = null;
  render(
    <EditorShell
      value={[
        {
          component_name: "ScenarioComponent",
          config: {},
        },
      ]}
      onChange={(documents) => {
        lastDocuments = documents;
      }}
      host={{
        getObjectProjectionConfig(context) {
          const parent = context.parentValue;
          if (!parent || typeof parent !== "object" || (parent as { component_name?: string }).component_name !== "ScenarioComponent") {
            return undefined;
          }
          return {
            columns: [
              { field: ["scene"], label: "场景" },
              { field: ["outfit"], label: "外观" },
            ],
            objectValueSchema: {
              type: "object",
              properties: {
                scene: { type: "string" },
                outfit: { type: "string" },
              },
            },
          };
        },
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "array",
            "x-editor": {
              table: {
                columns: [
                  { key: "component_name", label: "组件" },
                  { key: "config", label: "配置", width: 320, wrap: true },
                ],
              },
            },
            items: {
              type: "object",
              properties: {
                component_name: {
                  type: "string",
                  title: "组件",
                },
                config: {
                  type: "object",
                  title: "配置",
                },
              },
            },
          };
        },
      }}
    />,
  );

  const sceneInput = screen.getByLabelText("配置 场景");
  const outfitInput = screen.getByLabelText("配置 外观");
  expect(sceneInput).toHaveValue("");
  expect(outfitInput).toHaveValue("");

  fireEvent.change(sceneInput, {
    target: { value: "res://scenes/entities/templates/map_variant.tscn" },
  });

  expect(lastDocuments).toMatchObject({
    main: [
      {
        component_name: "ScenarioComponent",
        config: {
          scene: "res://scenes/entities/templates/map_variant.tscn",
        },
      },
    ],
  });
});

test("object map projection 可以显示 host 注入的静态元数据列而不污染文档值", () => {
  render(
    <EditorShell
      value={{
        config: {
          regeneration: 8,
        },
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              config: {
                type: "object",
                "x-editor": {
                  table: {
                    columns: [
                      { field: ["default"], label: "值" },
                      { field: ["type"], label: "类型" },
                      { field: ["tooltip"], label: "说明", wrap: true },
                    ],
                    objectValueSchema: {
                      type: "object",
                      properties: {
                        default: { type: "number" },
                        type: { type: "string", readOnly: true },
                        tooltip: { type: "string", readOnly: true },
                      },
                    },
                    objectValueMetadataByKey: {
                      regeneration: {
                        type: "float",
                        tooltip: "每秒恢复生命值",
                      },
                    },
                  },
                },
              },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getByLabelText("config regeneration 值")).toHaveValue(8);
  expect(screen.getByLabelText("config regeneration 类型")).toHaveValue("float");
  expect(screen.getByLabelText("config regeneration 类型")).toBeDisabled();
  expect(screen.getByLabelText("config regeneration 说明")).toHaveValue("每秒恢复生命值");
  expect(screen.getByLabelText("config regeneration 说明")).toBeDisabled();
});

test("object map projection 支持 host 按父级上下文动态提供元数据", () => {
  render(
    <EditorShell
      value={{
        component_name: "HealthComponent",
        config: {
          regeneration: 8,
        },
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              component_name: { type: "string" },
              config: {
                type: "object",
                "x-editor": {
                  table: {
                    columns: [
                      { field: ["default"], label: "值" },
                      { field: ["type"], label: "类型" },
                      { field: ["tooltip"], label: "说明", wrap: true },
                    ],
                    objectValueSchema: {
                      type: "object",
                      properties: {
                        default: { type: "number" },
                        type: { type: "string", readOnly: true },
                        tooltip: { type: "string", readOnly: true },
                      },
                    },
                  },
                },
              },
            },
          };
        },
      }}
      host={{
        getObjectValueMetadata(context) {
          const parent = context.parentValue as { component_name?: string } | undefined;
          if (parent?.component_name !== "HealthComponent") {
            return undefined;
          }
          return {
            regeneration: {
              type: "float",
              tooltip: "每秒恢复生命值",
            },
          };
        },
      }}
    />,
  );

  expect(screen.getByLabelText("config regeneration 类型")).toHaveValue("float");
  expect(screen.getByLabelText("config regeneration 说明")).toHaveValue("每秒恢复生命值");
});

test("object map projection 会为 metadata-only 行渲染可编辑默认值控件", () => {
  let lastDocuments: Record<string, unknown> | null = null;
  render(
    <EditorShell
      value={{
        config: {},
      }}
      onChange={(documents) => {
        lastDocuments = documents;
      }}
      schemaHost={{
        getSchema() {
          return {
            type: "object",
            properties: {
              config: {
                type: "object",
                "x-editor": {
                  table: {
                    columns: [
                      { field: ["default"], label: "值" },
                      { field: ["type"], label: "类型" },
                      { field: ["tooltip"], label: "说明", wrap: true },
                    ],
                    objectValueSchema: {
                      type: "object",
                      properties: {
                        default: {},
                        type: { type: "string", readOnly: true },
                        tooltip: { type: "string", readOnly: true },
                      },
                    },
                    objectValueMetadataByKey: {
                      regeneration: {
                        type: "float",
                        tooltip: "每秒恢复生命值",
                      },
                    },
                  },
                },
              },
            },
          };
        },
      }}
    />,
  );

  const valueInput = screen.getByLabelText("config regeneration 值");
  expect(valueInput).toHaveValue("");
  expect(screen.getByLabelText("config regeneration 类型")).toHaveValue("float");
  expect(screen.getByLabelText("config regeneration 说明")).toHaveValue("每秒恢复生命值");

  fireEvent.change(valueInput, {
    target: { value: "12" },
  });

  expect(lastDocuments).toMatchObject({
    main: {
      config: {
        regeneration: "12",
      },
    },
  });
});

test("array tables 支持 host 按父级上下文动态提供对象投影配置", () => {
  render(
    <EditorShell
      value={[
        {
          component_name: "ScenarioComponent",
          config: {
            map: {
              scene: "res://map.tscn",
              outfit: "res://map_outfit.tscn",
            },
          },
        },
      ]}
      schemaHost={{
        getSchema() {
          return {
            type: "array",
            "x-editor": {
              table: {
                columns: [
                  { key: "component_name", label: "组件" },
                  { key: "config", label: "配置", width: 320, wrap: true },
                ],
              },
            },
            items: {
              type: "object",
              properties: {
                component_name: {
                  type: "string",
                },
                config: {
                  type: "object",
                },
              },
            },
          };
        },
      }}
      host={{
        getObjectProjectionConfig(context) {
          const parent = context.parentValue as { component_name?: string } | undefined;
          if (parent?.component_name !== "ScenarioComponent") {
            return undefined;
          }
          return {
            columns: [
              { field: ["scene"], label: "场景" },
              { field: ["outfit"], label: "外观" },
            ],
            objectValueSchema: {
              type: "object",
              properties: {
                scene: { type: "string" },
                outfit: { type: "string" },
              },
            },
          };
        },
      }}
    />,
  );

  expect(screen.getByLabelText("配置 map 场景")).toHaveValue("res://map.tscn");
  expect(screen.getByLabelText("配置 map 外观")).toHaveValue("res://map_outfit.tscn");
});

test("projected object map rows honor host field labels for inline editing", () => {
  render(
    <EditorShell
      value={[
        {
          component_name: "ScenarioComponent",
          config: {
            map: {
              scene: "res://map.tscn",
              outfit: "res://map_outfit.tscn",
            },
          },
        },
      ]}
      schemaHost={{
        getSchema() {
          return {
            type: "array",
            "x-editor": {
              table: {
                columns: [
                  { key: "component_name", label: "组件" },
                  { key: "config", label: "配置", width: 320, wrap: true },
                ],
              },
            },
            items: {
              type: "object",
              properties: {
                component_name: {
                  type: "string",
                },
                config: {
                  type: "object",
                },
              },
            },
          };
        },
      }}
      host={{
        getObjectProjectionConfig(context) {
          const parent = context.parentValue as { component_name?: string } | undefined;
          if (parent?.component_name !== "ScenarioComponent") {
            return undefined;
          }
          return {
            columns: [
              { field: ["scene"], label: "场景" },
              { field: ["outfit"], label: "外观" },
            ],
            objectValueSchema: {
              type: "object",
              properties: {
                scene: { type: "string" },
                outfit: { type: "string" },
              },
            },
          };
        },
        getFieldLabel(path, fieldName) {
          if (path.at(-1) === "map" && fieldName === "map") {
            return "大地图";
          }
          return fieldName;
        },
      }}
    />,
  );

  expect(screen.getByText("大地图")).toBeInTheDocument();
  expect(screen.getByLabelText("配置 大地图 场景")).toHaveValue("res://map.tscn");
  expect(screen.getByLabelText("配置 大地图 外观")).toHaveValue("res://map_outfit.tscn");
});

test("reference object pages会沿用映射后的 sourceId schema，正确显示 icon 预览并禁用只读 id", () => {
  const rootSchema: EditorSchema = {
    type: "object",
    properties: {
      companion: {
        type: "string",
      },
    },
  };
  const referenceSchema: EditorSchema = {
    type: "object",
    properties: {
      id: {
        type: "string",
        readOnly: true,
      },
      icon: {
        type: "string",
        title: "Icon",
        "x-editor": {
          display: {
            kind: "image",
            preset: "large-icon",
          },
        },
      },
    },
  };

  render(
    <EditorShell
      documents={{
        main: { companion: "asset://characters/hero.json" },
        "resource/characters/hero": {
          id: "hero",
          icon: "res://assets/icons/hero.png",
        },
      }}
      host={{
        loadReferenceSource(uri) {
          return uri === "asset://characters/hero.json"
            ? {
              id: "hero",
              icon: "res://assets/icons/hero.png",
            }
            : undefined;
        },
        resolveReferenceSourceId(uri) {
          return uri === "asset://characters/hero.json" ? "resource/characters/hero" : undefined;
        },
        resolveDisplayUrl(value) {
          return value.replace("res://", "http://localhost/");
        },
      }}
      rootSourceId="main"
      schemaHost={{
        getSchema(context) {
          if (context.sourceId === "main") {
            return rootSchema;
          }
          if (context.sourceId === "resource/characters/hero") {
            return referenceSchema;
          }
          return undefined;
        },
      }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "companion reference asset://characters/hero.json" }));

  expect(screen.getAllByLabelText("Field id").some((element) => (element as HTMLInputElement).disabled)).toBe(true);
  expect(screen.getAllByLabelText("Field Icon").some((element) => (element as HTMLInputElement).value === "res://assets/icons/hero.png")).toBe(true);
  expect(screen.getAllByRole("img", { name: "Icon" }).some((element) => element.getAttribute("src") === "http://localhost/assets/icons/hero.png")).toBe(true);
  expect(screen.getAllByRole("img", { name: "Icon" })[0]).toHaveAttribute(
    "src",
    "http://localhost/assets/icons/hero.png",
  );
  expect(screen.getAllByRole("img", { name: "Icon" })[0]).toHaveClass("reference-preview__image--large-icon");
  expect(screen.getAllByRole("img", { name: "Icon" })[0].closest(".image-field-editor")).toHaveClass("image-field-editor--large-icon");
});
