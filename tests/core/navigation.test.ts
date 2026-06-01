import { describe, expect, test } from "vitest";
import { createNavigationState, goBack, jumpToPath, openPath } from "../../src/core/navigation";

describe("navigation state", () => {
  test("opens a normal nested page from the document root", () => {
    const state = createNavigationState({ profile: { name: "Lans" } });
    const next = openPath(state, ["profile"]);

    expect(next.pages).toHaveLength(2);
    expect(next.pages[1]).toEqual({ sourceId: "main", path: ["profile"], navLabel: "profile" });
  });

  test("opens a resolved reference page without mutating the source document", () => {
    const state = createNavigationState("main", {
      main: { profile: { companion: { $ref: "characters/hero" } } },
      "characters/hero": { id: "hero", stats: { hp: 10 } },
    });
    const next = openPath(state, ["profile", "companion"], {
      isReferenceNode(value) {
        return Boolean(value && typeof value === "object" && "$ref" in (value as Record<string, unknown>));
      },
      resolveReferenceTarget(value, documents) {
        const sourceId = String((value as { $ref: string }).$ref);
        return {
          sourceId,
          path: [],
          value: documents[sourceId],
        };
      },
    });

    expect(next.pages).toHaveLength(2);
    expect(next.pages[1]).toEqual({
      sourceId: "characters/hero",
      path: [],
      navLabel: "companion",
      sourceValue: { $ref: "characters/hero" },
      isReference: true,
    });
    expect(state.documents?.main).toEqual({ profile: { companion: { $ref: "characters/hero" } } });
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
