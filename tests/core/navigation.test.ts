import { describe, expect, test } from "vitest";
import { createNavigationState, goBack, jumpToPath, openPath, openReferenceSource } from "../../src/core/navigation";

describe("navigation state", () => {
  test("opens a normal nested page from the document root", () => {
    const state = createNavigationState({ profile: { name: "Lans" } });
    const next = openPath(state, ["profile"]);

    expect(next.pages).toHaveLength(2);
    expect(next.pages[1]).toEqual({ sourceId: "main", path: ["profile"], navLabel: "profile" });
  });

  test("opens a resolved reference page without mutating the source document", () => {
    const documents: Record<string, unknown> = {
      main: { profile: { companion: "asset://characters/hero.json" } },
      "asset://characters/hero.json": { id: "hero", stats: { hp: 10 } },
    };
    const state = createNavigationState("main", documents);
    const next = openPath(state, ["profile", "companion"], {
      loadReferenceSource(uri) {
        return documents[uri];
      },
    });

    expect(next.pages).toHaveLength(2);
    expect(next.pages[1]).toEqual({
      sourceId: "asset://characters/hero.json",
      path: [],
      navLabel: "companion",
      value: { id: "hero", stats: { hp: 10 } },
      sourceValue: "asset://characters/hero.json",
      isReference: true,
    });
    expect(state.documents?.main).toEqual({ profile: { companion: "asset://characters/hero.json" } });
  });

  test("goes back by dropping the last page", () => {
    const state = {
      documents: { main: { profile: { name: "Lans" } } },
      rootSourceId: "main",
      pages: [{ sourceId: "main", path: [] }, { sourceId: "main", path: ["profile"], navLabel: "profile" }],
    };

    const next = goBack(state);
    expect(next.pages).toEqual([{ sourceId: "main", path: [] }]);
  });

  test("opens an existing reference source without discarding the calling path", () => {
    const state = {
      documents: {
        tasks: [{ relatedRefs: ["asset://development-ledgers/example.json"] }],
        "management-ledger/example": [{ id: "example" }],
      },
      rootSourceId: "tasks",
      pages: [
        { sourceId: "tasks", path: [] },
        { sourceId: "tasks", path: [0], navLabel: "[0]" },
        { sourceId: "tasks", path: [0, "relatedRefs"], navLabel: "relatedRefs" },
      ],
    };

    const next = openReferenceSource(state, "management-ledger/example");

    expect(next.pages).toEqual([
      ...state.pages,
      { sourceId: "management-ledger/example", path: [], isReference: true },
    ]);
  });

  test("keeps the breadcrumb path when drilling deeper", () => {
    const state = createNavigationState({ dic: { array: [{ dic2: { value: 1 } }] } });
    const first = openPath(state, ["dic"]);
    const second = openPath(first, ["dic", "array"]);
    const third = openPath(second, ["dic", "array", 0]);

    expect(second.pages).toEqual([
      { sourceId: "main", path: [] },
      { sourceId: "main", path: ["dic"], navLabel: "dic" },
      { sourceId: "main", path: ["dic", "array"], navLabel: "array" },
    ]);
    expect(third.pages).toEqual([
      { sourceId: "main", path: [] },
      { sourceId: "main", path: ["dic"], navLabel: "dic" },
      { sourceId: "main", path: ["dic", "array"], navLabel: "array" },
      { sourceId: "main", path: ["dic", "array", 0], navLabel: "[0]" },
    ]);
  });

  test("rebuilds visible pages from the target breadcrumb path", () => {
    const state = createNavigationState({ dic: { array: [{ dic2: { value: 1 } }] } });
    const next = jumpToPath(state, ["dic", "array", 0, "dic2"]);

    expect(next.pages).toEqual([
      { sourceId: "main", path: [] },
      { sourceId: "main", path: ["dic"], navLabel: "dic" },
      { sourceId: "main", path: ["dic", "array"], navLabel: "array" },
      { sourceId: "main", path: ["dic", "array", 0], navLabel: "[0]" },
      { sourceId: "main", path: ["dic", "array", 0, "dic2"], navLabel: "dic2" },
    ]);
  });
});
