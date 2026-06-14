import type { JsonPath } from "../core/path";
import type { EditorReferenceSchema, EditorSchema, EditorTableColumn } from "./schema";

export type EditorReferenceOption = {
  value: string;
  label: string;
  description?: string;
};

export type EditorHost = {
  loadReferenceSource?: (uri: string) => unknown;
  resolveReferenceSourceId?: (uri: string) => string | undefined;
  resolveDisplayUrl?: (value: string, schema?: EditorSchema) => string | undefined;
  getObjectProjectionConfig?: (context: {
    path: JsonPath;
    value: Record<string, unknown>;
    parentValue?: unknown;
    schema?: EditorSchema;
  }) => {
    columns: EditorTableColumn[];
    objectValueSchema: EditorSchema;
    objectValueMetadataByKey?: Record<string, Record<string, unknown>>;
  } | undefined;
  getObjectValueMetadata?: (context: {
    path: JsonPath;
    value: Record<string, unknown>;
    parentValue?: unknown;
    schema?: EditorSchema;
  }) => Record<string, Record<string, unknown>> | undefined;
  createReferenceRow?: (context: {
    path: JsonPath;
    value: unknown[];
    schema?: EditorSchema;
    reference?: EditorReferenceSchema;
  }) => unknown | undefined | Promise<unknown | undefined>;
  getFieldLabel?: (path: JsonPath, fieldName: string, value: unknown) => string;
  getArrayItemLabel?: (path: JsonPath, index: number, value: unknown) => string;
  getReferenceOptions?: (context: {
    path: JsonPath;
    value: unknown;
    schema?: EditorSchema;
    reference?: EditorReferenceSchema;
  }) => EditorReferenceOption[];
};

export type ReferenceErrorInfo = {
  uri: string;
  message: string;
};

export function getReferenceUri(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  if (!value.toLowerCase().endsWith(".json")) return null;

  try {
    // 支持 http(s)、asset、res 等标准/自定义 URI。
    new URL(value);
    return value;
  } catch {
    return null;
  }
}

export function isReferenceValue(value: unknown): boolean {
  return getReferenceUri(value) !== null;
}

export function getReferenceLabel(value: unknown): string {
  return getReferenceUri(value) ?? "reference";
}

export function resolveReferenceDocument(uri: string, host?: EditorHost): { ok: true; value: unknown } | { ok: false; error: ReferenceErrorInfo } {
  if (!host?.loadReferenceSource) {
    return {
      ok: false,
      error: { uri, message: "No reference loader configured" },
    };
  }

  try {
    const loaded = host.loadReferenceSource(uri);
    if (loaded === undefined) {
      return {
        ok: false,
        error: { uri, message: "Reference content not found" },
      };
    }

    if (typeof loaded === "string") {
      try {
        return { ok: true, value: JSON.parse(loaded) };
      } catch (error) {
        return {
          ok: false,
          error: {
            uri,
            message: error instanceof Error ? error.message : "JSON parse failed",
          },
        };
      }
    }

    return { ok: true, value: loaded };
  } catch (error) {
    return {
      ok: false,
      error: {
        uri,
        message: error instanceof Error ? error.message : "Reference load failed",
      },
    };
  }
}
