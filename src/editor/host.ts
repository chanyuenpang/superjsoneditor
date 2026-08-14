import type { JsonPath } from "../core/path";
import type { EditorReferenceSchema, EditorSchema, EditorTableColumn, EditorViewOptionColor } from "./schema";

export type EditorReferenceOption = {
  value: string;
  label: string;
  description?: string;
};

export type EditorHost = {
  loadReferenceSource?: (uri: string) => unknown;
  resolveReferenceSourceId?: (uri: string) => string | undefined;
  /**
   * 将领域中的稳定 ID 投影为编辑器可导航的 URI，避免把显示/运行时路径写回 JSON。
   */
  resolveReferenceUri?: (context: {
    value: unknown;
    path?: JsonPath;
    schema?: EditorSchema;
  }) => string | undefined;
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
  setOptionsSourceOptionColor?: (context: {
    uri: string;
    optionValue: string | number;
    color: EditorViewOptionColor | null;
  }) => void | Promise<void>;
};

export type ReferenceErrorInfo = {
  uri: string;
  message: string;
};

export function getReferenceUri(
  value: unknown,
  host?: EditorHost,
  context: { path?: JsonPath; schema?: EditorSchema } = {},
): string | null {
	const resolvedByHost = host?.resolveReferenceUri?.({ value, ...context });
	if (resolvedByHost) return resolvedByHost;
	if (typeof value !== "string" || !value) return null;

	try {
		// 默认只将 JSON 文档视为引用；自定义领域引用必须由 host 显式解析。
		const uri = new URL(value);
		if (!value.toLowerCase().endsWith(".json")) return null;
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
