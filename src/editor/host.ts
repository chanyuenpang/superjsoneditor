export type EditorHost = {
  isReferenceNode?: (value: unknown) => boolean;
  getReferenceLabel?: (value: unknown) => string;
  resolveReference?: (value: unknown) => unknown;
};
