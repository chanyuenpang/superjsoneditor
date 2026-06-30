import type { EditorSchema } from "./schema";

export function resolveViewSchema(
  defaultSchema: EditorSchema | undefined,
  viewSchema: EditorSchema | undefined,
): EditorSchema | undefined {
  if (!defaultSchema) {
    return viewSchema ? cloneJsonValue(viewSchema) : undefined;
  }
  if (!viewSchema) {
    return cloneJsonValue(defaultSchema);
  }
  return mergeSchemaValue(defaultSchema, viewSchema) as EditorSchema;
}

function mergeSchemaValue(baseValue: unknown, overrideValue: unknown): unknown {
  if (overrideValue === undefined) return cloneJsonValue(baseValue);
  if (baseValue === undefined) return cloneJsonValue(overrideValue);
  if (Array.isArray(overrideValue)) return cloneJsonValue(overrideValue);
  if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
    const merged: Record<string, unknown> = {};
    for (const key of [...Object.keys(overrideValue), ...Object.keys(baseValue).filter((baseKey) => !(baseKey in overrideValue))]) {
      merged[key] = mergeSchemaValue(baseValue[key], overrideValue[key]);
    }
    return merged;
  }
  return cloneJsonValue(overrideValue);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
