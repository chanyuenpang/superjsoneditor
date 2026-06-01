import { describe, expect, test } from "vitest";
import { getValueAtPath, setValueAtPath } from "../../src/core/document";

describe("document helpers", () => {
  test("reads a nested object value by path", () => {
    const value = { user: { profile: { name: "Lans" } } };
    expect(getValueAtPath(value, ["user", "profile", "name"])).toBe("Lans");
  });

  test("reads an array item by path", () => {
    const value = { items: [{ id: "a" }, { id: "b" }] };
    expect(getValueAtPath(value, ["items", 1, "id"])).toBe("b");
  });

  test("writes a nested value without losing siblings", () => {
    const value = { user: { profile: { name: "Lans", role: "designer" } } };
    const next = setValueAtPath(value, ["user", "profile", "name"], "Pang");
    expect(next).toEqual({ user: { profile: { name: "Pang", role: "designer" } } });
    expect(value.user.profile.name).toBe("Lans");
  });
});
