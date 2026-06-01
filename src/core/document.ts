import type { JsonPath } from "./path";

export function getValueAtPath(root: unknown, path: JsonPath): unknown {
  return path.reduce<unknown>((current, segment) => {
    if (current == null) return undefined;
    if (typeof segment === "number" && Array.isArray(current)) return current[segment];
    if (typeof segment === "string" && typeof current === "object") return (current as Record<string, unknown>)[segment];
    return undefined;
  }, root);
}

export function setValueAtPath(root: unknown, path: JsonPath, nextValue: unknown): unknown {
  if (path.length === 0) return nextValue;

  const [head, ...tail] = path;
  if (typeof head === "number") {
    const source = Array.isArray(root) ? root : [];
    const copy = [...source];
    copy[head] = setValueAtPath(copy[head], tail, nextValue);
    return copy;
  }

  const source = root && typeof root === "object" && !Array.isArray(root) ? (root as Record<string, unknown>) : {};
  return {
    ...source,
    [head]: setValueAtPath(source[head], tail, nextValue),
  };
}
