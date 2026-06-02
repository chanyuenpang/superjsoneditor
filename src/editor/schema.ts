import type { JsonPath } from "../core/path";

export type EditorSchemaType = "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";

export type EditorSchema = {
  type?: EditorSchemaType;
  title?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  required?: string[];
  properties?: Record<string, EditorSchema>;
  items?: EditorSchema;
};

export type EditorSchemaContext = {
  sourceId: string;
  path: JsonPath;
  value: unknown;
  documents: Record<string, unknown>;
};

export type EditorSchemaHost = {
  getSchema: (context: EditorSchemaContext) => EditorSchema | undefined;
};

export type EditorValidationError = {
  sourceId?: string;
  path: JsonPath;
  message: string;
};

export type EditorValidationResult = {
  valid: boolean;
  documentErrors?: string[];
  fieldErrors?: EditorValidationError[];
};

export type EditorValidationHandler = (
  documents: Record<string, unknown>,
) => EditorValidationResult | Promise<EditorValidationResult>;
