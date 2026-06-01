import { describe, expect, test } from "vitest";
import { createNavigationState, goBack, openPath } from "../../src/core/navigation";

describe("navigation state", () => {
  test("opens a normal nested page from the document root", () => {
    const state = createNavigationState({ profile: { name: "Lans" } });
    const next = openPath(state, ["profile"]);

    expect(next.pages).toHaveLength(2);
    expect(next.pages[1]).toEqual({ path: ["profile"] });
  });

  test("opens a resolved reference page without mutating the source document", () => {
    const state = createNavigationState({ profile: { companion: { $ref: "characters/hero" } } });
    const next = openPath(state, ["profile", "companion"], {
      isReferenceNode(value) {
        return Boolean(value && typeof value === "object" && "$ref" in (value as Record<string, unknown>));
      },
      resolveReference() {
        return { id: "hero", stats: { hp: 10 } };
      },
    });

    expect(next.pages).toHaveLength(2);
    expect(next.pages[1]).toEqual({
      path: ["profile", "companion"],
      value: { id: "hero", stats: { hp: 10 } },
      sourceValue: { $ref: "characters/hero" },
      isReference: true,
    });
    expect(state.documentValue).toEqual({ profile: { companion: { $ref: "characters/hero" } } });
  });

  test("goes back by dropping the last page", () => {
    const state = {
      documentValue: { profile: { name: "Lans" } },
      pages: [{ path: [] }, { path: ["profile"] }],
    };

    const next = goBack(state);
    expect(next.pages).toEqual([{ path: [] }]);
  });
});
