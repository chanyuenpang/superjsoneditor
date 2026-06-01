export type PathSegment = string | number;
export type JsonPath = PathSegment[];

export function formatPath(path: JsonPath): string {
  if (path.length === 0) return "Root";
  return path
    .map((segment, index) => {
      if (typeof segment === "number") return `[${segment}]`;
      return index === 0 ? segment : `.${segment}`;
    })
    .join("");
}
