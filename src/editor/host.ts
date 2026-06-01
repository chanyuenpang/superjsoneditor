import type { ReferenceResolver } from "../core/navigation";
import type { JsonPath } from "../core/path";

export type EditorHost = ReferenceResolver & {
  isReferenceNode?: (value: unknown) => boolean;
  getReferenceLabel?: (value: unknown) => string;
  resolveReference?: (value: unknown) => unknown;
  getFieldLabel?: (path: JsonPath, fieldName: string, value: unknown) => string;
  getArrayItemLabel?: (path: JsonPath, index: number, value: unknown) => string;
};
