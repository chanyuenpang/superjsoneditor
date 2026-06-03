import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { test, vi } from "vitest";
import { App } from "../../src/App";
import { EditorShell } from "../../src/editor/EditorShell";
import type { EditorSchema, EditorSchemaHost, EditorValidationResult } from "../../src/editor/schema";

test("renders a generic root document with the root breadcrumb only", () => {
  render(<EditorShell value={{ hello: "world" }} />);

  expect(screen.queryByText("JSON Document")).toBeNull();
  expect(screen.getAllByText("Root").length).toBeGreaterThanOrEqual(2);
  expect(screen.getByLabelText("Field hello")).toHaveValue("world");
  expect(screen.queryByText("Select a field to inspect")).toBeNull();
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

test("array pages stay in browse mode until Edit is enabled", () => {
  render(<EditorShell value={{ party: ["asset://quests/intro.json"] }} />);

  fireEvent.click(screen.getByRole("button", { name: "party array 1 items" }));

  expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Create row" })).toBeNull();
  expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
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

test("默认 stack-flow 模式导航后不会保留左侧 root 页", () => {
  const { container } = render(<EditorShell value={{ profile: { hp: 10 } }} />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));

  expect(container.querySelector(".stack-page--background")).toBeNull();
  expect(container.querySelector(".stack-page--foreground")).toBeNull();
  expect(container.querySelector(".stack-page--single")).not.toBeNull();
});

test("back from a right page with root pinned on the left uses pop animation", () => {
  const { container } = render(<EditorShell value={{ profile: { hp: 10 } }} layoutMode="pinned-root" />);

  fireEvent.click(screen.getByRole("button", { name: "profile object 1 fields" }));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));

  expect(container.querySelector(".stack-page--pop-exit")).not.toBeNull();
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
  expect(screen.getByLabelText("Field hp")).toHaveValue(10);

  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.click(screen.getByRole("button", { name: "tags array 1 items" }));
  expect(screen.getByLabelText("Array item 0")).toHaveValue("vanguard");
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

  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.queryByPlaceholderText("newKey")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add property" }));

  expect(screen.getByDisplayValue("New Quest")).toBeInTheDocument();
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

  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
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

  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  expect(screen.getByLabelText("Field hp")).toBeDisabled();
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
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Create row" }));

  expect(screen.getByDisplayValue("unit_001")).toBeInTheDocument();
  expect(screen.getByDisplayValue("10")).toBeInTheDocument();
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
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument());

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
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument());

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

  expect(screen.getByText("Array items must be unique")).toBeInTheDocument();
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
  fireEvent.change(screen.getByLabelText("Schema branch"), { target: { value: "1" } });

  expect(screen.getByLabelText("Field amount")).toHaveValue(5);
  expect(screen.queryByLabelText("Field power")).toBeNull();
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
