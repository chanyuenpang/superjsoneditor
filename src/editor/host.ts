import type { ReferenceResolver } from "../core/navigation";

export type EditorHost = ReferenceResolver & {
  isReferenceNode?: (value: unknown) => boolean;
  getReferenceLabel?: (value: unknown) => string;
  resolveReference?: (value: unknown) => unknown;
};
