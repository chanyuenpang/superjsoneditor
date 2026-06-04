import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { test, vi } from "vitest";
import { App } from "../../src/App";
import { within } from "@testing-library/react";
import { EditorShell, resolveCompactStack } from "../../src/editor/EditorShell";
import type { EditorSchema, EditorSchemaHost, EditorValidationResult } from "../../src/editor/schema";

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
  expect(screen.getAllByText("Root").length).toBeGreaterThanOrEqual(2);
  expect(screen.getByLabelText("Field hello")).toHaveValue("world");
  expect(screen.getByText("Select a field to inspect")).toBeInTheDocument();
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
  expect(fullscreenToggle).not.toBeChecked();
  expect(container.querySelector(".stack-page--fullscreen-left")).toBeNull();

  fireEvent.click(fullscreenToggle);

  expect(fullscreenToggle).toBeChecked();
  expect(container.querySelector(".stack-page--fullscreen-left")).not.toBeNull();
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

  expect(getCurrentPageQueries().getByDisplayValue("10")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
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

  expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Create row" })).toBeNull();
  expect(getCurrentActionButton("Edit")).toBeInTheDocument();
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
  expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
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
  render(
    <EditorShell value={{ profile: { stats: { hp: 10 } } }} layoutMode="stack-flow" leftPageFullscreen />,
  );

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));

  const closeButton = screen.getByRole("button", { name: "Close" });
  expect(closeButton).toBeInTheDocument();

  fireEvent.click(closeButton);

  expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  expect(screen.getByRole("button", { name: "profile object 1 fields" })).toBeInTheDocument();
});

test("pinned-root 在开启 leftPageFullscreen 时为右页显示关闭按钮并可关闭回根页", () => {
  render(
    <EditorShell value={{ profile: { hp: 10 } }} layoutMode="pinned-root" leftPageFullscreen />,
  );

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));

  const closeButton = screen.getByRole("button", { name: "Close" });
  expect(closeButton).toBeInTheDocument();

  fireEvent.click(closeButton);

  expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
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

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.getByRole("button", { name: "profile object 1 fields" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("10")).toBeNull();
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

    expect(container.querySelector(".stack-page--pop-exit")).not.toBeNull();
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
  expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
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

  expect(screen.getByText("Name")).toBeInTheDocument();
  expect(screen.getByText("Hero")).toBeInTheDocument();
  expect(screen.getByText("ID")).toBeInTheDocument();
  expect(screen.getByText("hero")).toBeInTheDocument();
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
        items: {
          type: "object",
          properties: {
            id: { type: "string", title: "Identifier" },
            title: { type: "string", title: "Title" },
            hp: { type: "integer", title: "Health" },
          },
          "x-editor": {
            table: {
              columns: [
                { key: "title", label: "Quest Title", sortable: true },
                { key: "id", sortable: true },
              ],
            },
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

  expect(container.querySelector(".column-trigger small")?.textContent).toBe("string");
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
        loadReferenceSource(uri) {
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
  expect(screen.queryByPlaceholderText("newKey")).toBeNull();
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
  expect(screen.queryByPlaceholderText("newKey")).toBeNull();
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
  fireEvent.change(screen.getByPlaceholderText("newKey"), { target: { value: "bonus_hp" } });
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

  expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
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
  expect(screen.getByLabelText("JSON value editor")).toHaveValue('{\n  "title": ""\n}');
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
  expect(screen.getByLabelText("Field note")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Set null" })).toBeInTheDocument();
});

test("raw mode can be disabled by host", () => {
  render(<EditorShell value={{ hello: "world" }} enableRawEditor={false} />);

  expect(screen.queryByRole("button", { name: "Raw" })).toBeNull();
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
  fireEvent.mouseDown(dragHandle, { button: 0, clientX: 100, clientY: 20 });
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
    { key: "id" },
    { key: "hp" },
    { key: "title" },
  ]);
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

test("schema authoring field order controls rewrite object property order", () => {
  const schemaHost = createMutableSchemaHost({
    type: "object",
    properties: {
      id: { type: "string", title: "Identifier" },
      title: { type: "string", title: "Title" },
      hp: { type: "integer", title: "Health" },
    },
  });

  const { container } = render(
    <EditorShell
      value={{ id: "quest_001", title: "First Quest", hp: 10 }}
      schemaHost={schemaHost}
    />,
  );

  fireEvent.click(getCurrentActionButton("Edit"));
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

test("schema option authoring can reorder inline options", async () => {
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
            { value: "elite", label: "Elite", color: "blue" },
          ],
        },
      },
    },
  });

  render(<EditorShell value={{ tags: ["fire"] }} schemaHost={schemaHost} />);

  fireEvent.click(screen.getByRole("button", { name: /Field Tags/i }));
  fireEvent.click(screen.getAllByTitle("Edit option")[0]);
  fireEvent.pointerDown(screen.getByRole("button", { name: "Move down" }));

  await waitFor(() => {
    expect(schemaHost.getRootSchemaSnapshot().properties?.tags?.["x-editor"]?.options).toEqual([
      { value: "boss", label: "Boss", color: "gold" },
      { value: "fire", label: "Fire", color: "red" },
      { value: "elite", label: "Elite", color: "blue" },
    ]);
  });
});
