import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCallback } from "react";
import { Fragment } from "react";
import { getValueAtPath, setValueAtPath } from "../core/document";
import { createPortal } from "react-dom";
import type { JsonPath } from "../core/path";
import { formatPath } from "../core/path";
import { getReferenceLabel, getReferenceUri, isReferenceValue, resolveReferenceDocument, type EditorHost, type EditorReferenceOption, type ReferenceErrorInfo } from "./host";
import {
  buildPreviewOrderFromSlots,
  collectColumnSlots,
  getPointerXInScrollSpace,
  resolveAutoScrollDirection,
  scrollColumnContainer,
} from "./column-dnd";
import {
  createDefaultArrayItem,
  createDefaultValue,
  createDefaultPropertyValue,
  resolveNode,
  resolveSchemaAtPath,
  switchUnionBranch,
  validateDocument as validateNodeBySchema,
  type EditorImageDisplayPreset,
  type EditorObjectPreset,
  type EditorSchema,
  type EditorTableColumn,
  type EditorValidationError,
  type EditorValidationResult,
  type EditorViewOption,
  type EditorViewOptionColor,
  editorOptionColors,
  namedChipPalette,
} from "./schema";
import { SchemaColumnHeader } from "./SchemaColumnHeader";
import { AssetPickerFieldEditor } from "./AssetPickerFieldEditor";
import { SchemaOptionFieldEditor } from "./SchemaOptionFieldEditor";
import { icons, jsonTypeIcons } from "./icons";

const MAX_INLINE_ARRAY_PREVIEW_COLUMNS = 3;
const IMAGE_VIEWER_SCALE_STEP = 0.25;
const IMAGE_VIEWER_MIN_SCALE = 0.25;
const IMAGE_VIEWER_MAX_SCALE = 5;

type ValueInspectorProps = {
  value: unknown;
  savedValue?: unknown;
  sourceId?: string;
  path: JsonPath;
  title?: string;
  host?: EditorHost;
  schema?: EditorSchema;
  resolveNamedSchema?: (name: string) => EditorSchema | undefined;
  onUpdateDocumentSchema?: (
    sourceId: string,
    path: JsonPath,
    target: "self" | "items",
    updater: (schema: EditorSchema) => EditorSchema,
  ) => void | Promise<void>;
  onUpdateNamedSchema?: (
    name: string,
    updater: (schema: EditorSchema) => EditorSchema,
  ) => void | Promise<void>;
  validationResult?: EditorValidationResult | null;
  referenceError?: ReferenceErrorInfo;
  isReference?: boolean;
  referenceScopeDepth?: number;
  referenceSourceLabel?: string;
  activeChildSegment?: string | number;
  activeReferenceSourceId?: string;
  readOnly?: boolean;
  onNavigateUp?: () => void;
  onClosePage?: () => void;
  pageHeaderActions?: ReactNode;
  onNavigate: (path: JsonPath) => void;
  onJumpToSource?: (sourceId: string) => void;
  onApplyValue: (nextValue: unknown) => void;
  onEditModeChange?: (isEditing: boolean) => void;
  toolbarPortalHost?: HTMLElement | null;
  enableRawEditor?: boolean;
  renderPageActionButtons?: () => ReactNode;
};

export function ValueInspector(props: ValueInspectorProps) {
  if (props.referenceError) {
    return <ReferenceErrorPage {...props} referenceError={props.referenceError} />;
  }

  if (Array.isArray(props.value)) {
    return <ArrayPage {...props} value={props.value} />;
  }

  if (isPlainObject(props.value)) {
    return <ObjectPage {...props} value={props.value} />;
  }

  return <PrimitivePage {...props} value={props.value} />;
}

function getSchemaClassNames(schema: EditorSchema | undefined): string[] {
  const raw = schema?.["x-editor"]?.className;
  if (!raw) {
    return [];
  }
  return (Array.isArray(raw) ? raw : [raw])
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

type ImagePreviewContext = "inline" | "field-editor";

const FLOATING_PANEL_MARGIN = 12;
const HIDDEN_FIELDS_PANEL_WIDTH = 240;
const HIDDEN_FIELDS_PANEL_ESTIMATED_HEIGHT = 280;

const IMAGE_PRESET_DEFAULTS: Record<EditorImageDisplayPreset, Record<ImagePreviewContext, { width: number; height: number; fit: "contain" | "cover" }>> = {
  icon: {
    inline: { width: 40, height: 40, fit: "contain" },
    "field-editor": { width: 72, height: 72, fit: "contain" },
  },
  "large-icon": {
    inline: { width: 56, height: 56, fit: "contain" },
    "field-editor": { width: 128, height: 128, fit: "contain" },
  },
  portrait: {
    inline: { width: 96, height: 128, fit: "cover" },
    "field-editor": { width: 144, height: 192, fit: "cover" },
  },
  banner: {
    inline: { width: 128, height: 48, fit: "cover" },
    "field-editor": { width: 192, height: 72, fit: "cover" },
  },
  image: {
    inline: { width: 72, height: 72, fit: "contain" },
    "field-editor": { width: 112, height: 112, fit: "contain" },
  },
};

const OBJECT_PRESET_FIELDS: Record<EditorObjectPreset, string[]> = {
  xy: ["x", "y"],
  xyz: ["x", "y", "z"],
  rgba: ["r", "g", "b", "a"],
};

function isCompactInlineObjectPreset(preset: EditorObjectPreset | null | undefined) {
  return preset === "xy" || preset === "xyz" || preset === "rgba";
}

function resolveImageDisplayConfig(
  schema: EditorSchema | undefined,
  context: ImagePreviewContext,
  path?: JsonPath,
) {
  const display = schema?.["x-editor"]?.display;
  const preset = resolveImageDisplayPreset(schema, path);
  const presetPreview = preset ? IMAGE_PRESET_DEFAULTS[preset][context] : null;
  const preview = display?.preview;
  return {
    kind: display?.kind ?? (preset ? "image" : inferImageDisplayKind(schema, path)),
    width: preview?.width ?? presetPreview?.width ?? 40,
    height: preview?.height ?? presetPreview?.height ?? preview?.width ?? presetPreview?.width ?? 40,
    fit: preview?.fit ?? presetPreview?.fit ?? "contain",
  };
}

function resolveImageDisplayPreset(schema: EditorSchema | undefined, path?: JsonPath) {
  return schema?.["x-editor"]?.display?.preset ?? inferImageDisplayPreset(schema, path);
}

function inferImageDisplayKind(schema: EditorSchema | undefined, path?: JsonPath) {
  return inferImageDisplayPreset(schema, path) ? "image" : undefined;
}

function inferImageDisplayPreset(
  schema: EditorSchema | undefined,
  path?: JsonPath,
): EditorImageDisplayPreset | null {
  const hintText = collectImageFieldHints(schema, path);
  if (hintText.length === 0) {
    return null;
  }
  if (hintText.includes("portrait") || hintText.includes("avatar") || hintText.includes("立绘")) {
    return "portrait";
  }
  if (hintText.includes("background") || hintText.includes("banner") || hintText.includes("背景") || hintText.includes("横幅")) {
    return "banner";
  }
  if (hintText.includes("thumbnail") || hintText.includes("texture")) {
    return "image";
  }
  const fieldName = getImageFieldName(path);
  if (fieldName === "icon") {
    return "large-icon";
  }
  if (fieldName.endsWith("_icon")) {
    return "icon";
  }
  if (hintText.includes("icon") || hintText.includes("图标")) {
    return "icon";
  }
  if (hintText.includes("image") || hintText.includes("图片") || hintText.includes("图像")) {
    return "image";
  }
  return null;
}

function collectImageFieldHints(schema: EditorSchema | undefined, path?: JsonPath) {
  return [
    schema?.title?.toLowerCase() ?? "",
    schema?.description?.toLowerCase() ?? "",
    getImageFieldName(path),
  ]
    .filter((entry) => entry.length > 0)
    .join(" ");
}

function getImageFieldName(path?: JsonPath) {
  if (!path?.length) {
    return "";
  }
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const segment = path[index];
    if (typeof segment === "string") {
      return segment.toLowerCase();
    }
  }
  return "";
}

function getEditorObjectPreset(schema: EditorSchema | undefined): EditorObjectPreset | null {
  const resolvedPreset = resolveEditorObjectPreset(schema);
  return resolvedPreset?.preset ?? null;
}

function resolveEditorObjectPreset(
  schema: EditorSchema | undefined,
): { preset: EditorObjectPreset; schema: EditorSchema } | null {
  if (!schema) {
    return null;
  }
  const explicitPreset = schema["x-editor"]?.object?.preset;
  if (explicitPreset) {
    const explicitTargetSchema = findObjectPresetSchema(schema, explicitPreset);
    if (explicitTargetSchema) {
      return {
        preset: explicitPreset,
        schema: explicitTargetSchema,
      };
    }
  }

  const inferredPreset = inferObjectPresetFromSchema(schema);
  if (inferredPreset) {
    return {
      preset: inferredPreset,
      schema,
    };
  }

  const unionOptions = schema.oneOf ?? schema.anyOf;
  if (!unionOptions?.length) {
    return null;
  }
  for (const option of unionOptions) {
    const optionPreset = resolveEditorObjectPreset(option);
    if (optionPreset) {
      return optionPreset;
    }
  }
  return null;
}

function findObjectPresetSchema(
  schema: EditorSchema | undefined,
  preset: EditorObjectPreset,
): EditorSchema | null {
  if (!schema) {
    return null;
  }
  if (inferObjectPresetFromSchema(schema) === preset) {
    return schema;
  }
  const unionOptions = schema.oneOf ?? schema.anyOf;
  if (!unionOptions?.length) {
    return null;
  }
  for (const option of unionOptions) {
    const matched = findObjectPresetSchema(option, preset);
    if (matched) {
      return matched;
    }
  }
  return null;
}

function inferObjectPresetFromSchema(schema: EditorSchema | undefined): EditorObjectPreset | null {
  if (schema?.type !== "object" || !schema.properties || Array.isArray(schema.type)) {
    return null;
  }
  const propertyKeys = Object.keys(schema.properties);
  for (const [preset, expectedKeys] of Object.entries(OBJECT_PRESET_FIELDS) as Array<[EditorObjectPreset, string[]]>) {
    const matchesExactKeys = propertyKeys.length === expectedKeys.length
      && expectedKeys.every((key) => propertyKeys.includes(key));
    if (!matchesExactKeys) {
      continue;
    }
    if (expectedKeys.every((key) => {
      const fieldType = schema.properties?.[key]?.type;
      return fieldType === "number" || fieldType === "integer";
    })) {
      return preset;
    }
  }

  return null;
}

function getObjectPresetProjectionConfig(schema: EditorSchema | undefined) {
  const resolvedPreset = resolveEditorObjectPreset(schema);
  if (!resolvedPreset || !resolvedPreset.schema.properties) {
    return null;
  }

  const { preset, schema: presetSchema } = resolvedPreset;
  const fields = OBJECT_PRESET_FIELDS[preset].filter((key) => presetSchema.properties?.[key]);
  if (fields.length === 0) {
    return null;
  }

  return {
      columns: fields.map((fieldName) => ({
      field: [fieldName],
      label: presetSchema.properties?.[fieldName]?.title ?? fieldName.toUpperCase(),
      width: preset === "rgba" ? 92 : 104,
    })),
    objectValueSchema: presetSchema,
    objectPreset: preset,
  };
}

function getObjectValueProjectionConfig(schema: EditorSchema | undefined) {
  const table = schema?.["x-editor"]?.table;
  if (table?.columns.length) {
    return {
      columns: table.columns,
      objectValueSchema: table.objectValueSchema ?? schema,
      objectValueMetadataByKey: table.objectValueMetadataByKey,
      metadataSchema: schema,
      objectPreset: getEditorObjectPreset(schema),
    };
  }
  const presetProjection = getObjectPresetProjectionConfig(schema);
  if (!presetProjection) {
    return null;
  }
  return {
    columns: presetProjection.columns,
    objectValueSchema: presetProjection.objectValueSchema,
    metadataSchema: schema,
    objectPreset: presetProjection.objectPreset,
  };
}

function getObjectFieldProjectionConfig(
  pageSchema: EditorSchema | undefined,
  fieldSchema: EditorSchema | undefined,
) {
  return getObjectValueProjectionConfig(fieldSchema) ?? getObjectValueProjectionConfig(pageSchema);
}

function resolveObjectProjectionConfig(props: {
  path: JsonPath;
  value: Record<string, unknown>;
  parentValue?: unknown;
  schema?: EditorSchema;
  host?: EditorHost;
}) {
  const hostProjection = props.host?.getObjectProjectionConfig?.({
    path: props.path,
    value: props.value,
    parentValue: props.parentValue,
    schema: props.schema,
  });
  if (hostProjection) {
    return {
      columns: hostProjection.columns,
      objectValueSchema: hostProjection.objectValueSchema,
      objectValueMetadataByKey: hostProjection.objectValueMetadataByKey,
      metadataSchema: props.schema,
      objectPreset: getEditorObjectPreset(props.schema),
    };
  }
  return getObjectValueProjectionConfig(props.schema);
}

function resolveObjectValueMetadataByKey(props: {
  path: JsonPath;
  value: Record<string, unknown>;
  parentValue?: unknown;
  schema?: EditorSchema;
  host?: EditorHost;
}) {
  const staticMetadata = props.schema?.["x-editor"]?.table?.objectValueMetadataByKey;
  const dynamicMetadata = props.host?.getObjectValueMetadata?.({
    path: props.path,
    value: props.value,
    parentValue: props.parentValue,
    schema: props.schema,
  });
  if (!staticMetadata) {
    return dynamicMetadata;
  }
  if (!dynamicMetadata) {
    return staticMetadata;
  }
  const merged: Record<string, Record<string, unknown>> = {};
  for (const key of new Set([...Object.keys(staticMetadata), ...Object.keys(dynamicMetadata)])) {
    merged[key] = {
      ...(staticMetadata[key] ?? {}),
      ...(dynamicMetadata[key] ?? {}),
    };
  }
  return merged;
}

function renderInlineObjectProjection(props: {
  fieldKey: string;
  fieldValue: Record<string, unknown>;
  fieldLabel: string;
  path: JsonPath;
  host?: EditorHost;
  resolveNamedSchema?: (name: string) => EditorSchema | undefined;
  parentValue?: unknown;
  readOnly: boolean;
  projectionColumns: EditorTableColumn[];
  projectionSchema?: EditorSchema;
  objectPreset?: EditorObjectPreset | null;
  projectionMetadataByKey?: Record<string, Record<string, unknown>>;
  projectionMetadataSchema?: EditorSchema;
  onNavigate: (path: JsonPath) => void;
  onJumpToSource?: (sourceId: string) => void;
  onChange: (nextValue: Record<string, unknown>) => void;
}) {
  const {
    fieldKey,
    fieldValue,
    fieldLabel,
    path,
    host,
    resolveNamedSchema,
    parentValue,
    readOnly,
    projectionColumns,
    projectionSchema,
    projectionMetadataByKey,
    projectionMetadataSchema,
    onNavigate,
    onJumpToSource,
    onChange,
  } = props;

  const resolvedProjectionMetadataByKey = projectionMetadataByKey
    ?? resolveObjectValueMetadataByKey({ path, value: fieldValue, parentValue, schema: projectionMetadataSchema ?? projectionSchema, host });
  const isMapProjection = isObjectMapProjectionValue(fieldValue, projectionColumns)
    || hasProjectedMapMetadataRows(resolvedProjectionMetadataByKey, projectionColumns);

  return (
    <div
      className="array-cell-inline-projection"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {isMapProjection
        ? renderProjectedObjectMapFieldEditor({
          rowKey: fieldKey,
          rowValue: fieldValue,
          rowLabel: fieldLabel,
          path,
          host,
          readOnly,
          projectionColumns,
          projectionSchema,
          objectPreset: props.objectPreset,
          projectionMetadataByKey: resolvedProjectionMetadataByKey,
          projectionMetadataSchema,
          onNavigate,
          onJumpToSource,
          onChange,
        })
        : renderProjectedObjectFieldEditor({
          rowKey: fieldKey,
          rowValue: fieldValue,
          rowLabel: fieldLabel,
          path,
          host,
          readOnly,
          projectionColumns,
          projectionSchema,
          objectPreset: props.objectPreset,
          resolveNamedSchema,
          onNavigate,
          onJumpToSource,
          onChange,
        })}
    </div>
  );
}

function getInlineArrayPreviewConfig(
  value: unknown[],
  schema: EditorSchema | undefined,
  host: EditorHost | undefined,
  resolveNamedSchema: ((name: string) => EditorSchema | undefined) | undefined,
) {
  const itemSchema = schema?.items;
  const referenceViewSchema = resolveReferenceViewSchema(itemSchema, resolveNamedSchema);
  const referenceViewColumns = getReferenceViewColumns(value, referenceViewSchema, itemSchema, host);
  const showReferenceProjectionTable = referenceViewColumns.length > 0;
  const tableSchema = getArrayTableSchema(schema, itemSchema);
  const hasExplicitTableColumns = hasSchemaTableColumns(tableSchema) && !usesAutomaticTableColumns(tableSchema);
  const configuredTableColumns = getConfiguredTableColumns(tableSchema);
  if (!showReferenceProjectionTable && !hasExplicitTableColumns) {
    return null;
  }
  const columns = getArrayColumns(
    value,
    host,
    itemSchema,
    referenceViewColumns,
    configuredTableColumns,
    hasExplicitTableColumns,
  ).filter((column) => column !== "#").slice(0, MAX_INLINE_ARRAY_PREVIEW_COLUMNS);
  if (columns.length === 0) {
    return null;
  }
  return {
    itemSchema,
    columns,
    configuredTableColumns,
    referenceViewColumns,
    showReferenceProjectionTable,
    rows: buildArrayDisplayRows(value, null, referenceViewColumns, configuredTableColumns, itemSchema, host, undefined, resolveNamedSchema).slice(0, 3),
    totalCount: value.length,
  };
}

function updateArrayItemAtIndex(items: unknown[], index: number, nextItem: unknown) {
  return items.map((item, itemIndex) => (itemIndex === index ? nextItem : item));
}

function renderInlineArrayFieldPreview(props: {
  rowKey: string;
  rowLabel: string;
  rowValue: unknown[];
  path: JsonPath;
  host?: EditorHost;
  schema?: EditorSchema;
  resolveNamedSchema?: (name: string) => EditorSchema | undefined;
  readOnly: boolean;
  onNavigate: (path: JsonPath) => void;
  onChange: (nextValue: unknown[]) => void;
}) {
  const preview = getInlineArrayPreviewConfig(props.rowValue, props.schema, props.host, props.resolveNamedSchema);
  if (!preview) {
    return null;
  }

  const arrayPath = [...props.path, props.rowKey];
  return (
    <div className="object-array-preview">
      <div className="object-array-preview__toolbar">
        <span className="object-array-preview__summary">
          Showing {preview.rows.length} of {preview.totalCount} items
        </span>
        <button
          aria-label={`Open ${props.rowLabel}`}
          className="ghost-button compact-button object-array-preview__open-array"
          type="button"
          onClick={() => props.onNavigate(arrayPath)}
        >
          <icons.next size={16} />
        </button>
      </div>
      <div className="table-shell object-array-preview__table-shell">
        <div className="table-scroll">
        <table className="data-table array-workspace object-array-preview__table">
          <thead>
            <tr>
              <th>#</th>
              {preview.columns.map((column) => {
                const configuredColumn = findConfiguredTableColumn(preview.configuredTableColumns, column);
                const referenceColumn = findReferenceColumn(
                  column,
                  preview.configuredTableColumns,
                  preview.referenceViewColumns,
                  preview.itemSchema,
                  props.resolveNamedSchema,
                );
                const label = getConfiguredColumnLabel(column, configuredColumn, referenceColumn, preview.itemSchema);
                return <th key={`${props.rowKey}:${column}`}>{label}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map(({ item, sourceIndex }) => {
              const rowLabel = summarizeRowIdentity(item, sourceIndex, arrayPath, props.host);
              return (
                <tr key={`${props.rowKey}:${sourceIndex}:${rowLabel}`}>
                  <td className="object-array-preview__index">
                    <button
                      className="ghost-button compact-button object-array-preview__row-open"
                      type="button"
                      onClick={() => props.onNavigate([...arrayPath, sourceIndex])}
                    >
                      {sourceIndex + 1}
                    </button>
                  </td>
                  {preview.columns.map((column) => {
                    if (preview.showReferenceProjectionTable) {
                      const referenceColumn = findReferenceColumn(
                        column,
                        preview.configuredTableColumns,
                        preview.referenceViewColumns,
                        preview.itemSchema,
                        props.resolveNamedSchema,
                      );
                      return (
                        <td key={`${props.rowKey}:${sourceIndex}:${column}`}>
                          {referenceColumn
                            ? renderReferenceTableCell(item, referenceColumn, preview.itemSchema, props.resolveNamedSchema, props.host)
                            : <span className="array-cell-summary">-</span>}
                        </td>
                      );
                    }

                    if (isPlainObject(item)) {
                      const record = item as Record<string, unknown>;
                      const configuredColumn = findConfiguredTableColumn(preview.configuredTableColumns, column);
                      const fieldPath = configuredColumn ? getTableColumnPath(configuredColumn) : [column];
                      const cellLabel = configuredColumn?.label ?? column;
                      const cellValue = fieldPath.length > 0 ? getValueAtPath(record, fieldPath) : record[column];
                      const cellSchema = resolveSchemaAtPath(preview.itemSchema, fieldPath, record);
                      const inlineProjection = isPlainObject(cellValue)
                        ? resolveObjectProjectionConfig({
                          path: [...arrayPath, sourceIndex, ...fieldPath],
                          value: cellValue,
                          parentValue: record,
                          schema: cellSchema,
                          host: props.host,
                        }) ?? getObjectFieldProjectionConfig(preview.itemSchema, cellSchema)
                        : null;

                      return (
                        <td key={`${props.rowKey}:${sourceIndex}:${column}`}>
                          {inlineProjection && isPlainObject(cellValue)
                            ? inlineProjection.objectPreset === "rgba"
                              ? renderInlineArrayPreviewSummary(cellValue, cellSchema, props.host, [...arrayPath, sourceIndex, ...fieldPath])
                              : isCompactInlineObjectPreset(inlineProjection.objectPreset)
                              ? renderInlineObjectProjection({
                                fieldKey: String(fieldPath.at(-1) ?? column),
                                fieldValue: cellValue,
                                fieldLabel: cellLabel,
                                path: [...arrayPath, sourceIndex],
                                host: props.host,
                                resolveNamedSchema: props.resolveNamedSchema,
                                parentValue: record,
                                readOnly: props.readOnly,
                                projectionColumns: inlineProjection.columns,
                                projectionSchema: inlineProjection.objectValueSchema,
                                objectPreset: inlineProjection.objectPreset,
                                projectionMetadataByKey: inlineProjection.objectValueMetadataByKey,
                                projectionMetadataSchema: inlineProjection.metadataSchema,
                                onNavigate: props.onNavigate,
                                onChange(nextValue) {
                                  props.onChange(updateArrayItemAtIndex(
                                    props.rowValue,
                                    sourceIndex,
                                    setValueAtPath(record, fieldPath, nextValue),
                                  ));
                                },
                              })
                              : (
                              <button
                                className={["nested-entry-button", "inline", getTypeToneClass(cellValue, props.host)].filter(Boolean).join(" ")}
                                  type="button"
                                  onClick={() => props.onNavigate([...arrayPath, sourceIndex, ...fieldPath])}
                                >
                                  <span className="nested-entry-icon" aria-hidden="true">
                                    {getStructureIcon(cellValue, props.host)}
                                  </span>
                                  {renderNestedEntryContent(cellValue, cellSchema, props.host, props.resolveNamedSchema, undefined, "compact")}
                                </button>
                              )
                            : isNavigable(cellValue)
                              ? (
                                <button
                                  className={["nested-entry-button", "inline", getTypeToneClass(cellValue, props.host)].filter(Boolean).join(" ")}
                                  type="button"
                                  onClick={() => props.onNavigate([...arrayPath, sourceIndex, ...fieldPath])}
                                >
                                  <span className="nested-entry-icon" aria-hidden="true">
                                    {getStructureIcon(cellValue, props.host)}
                                  </span>
                                  {renderNestedEntryContent(cellValue, cellSchema, props.host, props.resolveNamedSchema, undefined, "compact")}
                                </button>
                              )
                              : renderInlineArrayPreviewSummary(cellValue, cellSchema, props.host, [...arrayPath, sourceIndex, ...fieldPath])}
                        </td>
                      );
                    }

                    return (
                      <td key={`${props.rowKey}:${sourceIndex}:${column}`}>
                        {renderInlineArrayPreviewSummary(item, preview.itemSchema, props.host, [...arrayPath, sourceIndex])}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
      {preview.totalCount > preview.rows.length ? (
        <div className="object-array-preview__overflow-hint">
          {preview.totalCount - preview.rows.length} more items in detail view
        </div>
      ) : null}
    </div>
  );
}

function renderInlineArrayPreviewSummary(
  value: unknown,
  schema: EditorSchema | undefined,
  host?: EditorHost,
  path?: JsonPath,
) {
  const rgbaSummary = renderRgbaColorSummary(value, schema);
  if (rgbaSummary) {
    return <span className="array-cell-summary array-cell-summary--projection">{rgbaSummary}</span>;
  }
  const rendered = renderReferenceFieldValue(value, schema, host, path);
  if (typeof rendered === "string") {
    return <span className="array-cell-summary">{rendered}</span>;
  }
  return <span className="array-cell-summary array-cell-summary--projection">{rendered}</span>;
}

function isObjectMapProjectionValue(
  value: Record<string, unknown>,
  projectionColumns: EditorTableColumn[],
) {
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return false;
  }

  const directFieldKeys = projectionColumns
    .map((column) => getTableColumnPath(column))
    .filter((fieldPath) => fieldPath.length === 1 && typeof fieldPath[0] === "string")
    .map((fieldPath) => fieldPath[0] as string);
  if (directFieldKeys.length > 0 && entries.every(([key]) => directFieldKeys.includes(key))) {
    return false;
  }

  return entries.every(([, item]) => {
    if (!isPlainObject(item)) {
      return true;
    }
    return projectionColumns.some((column) => {
      const fieldPath = getTableColumnPath(column);
      return fieldPath.length > 0 && getValueAtPath(item, fieldPath) !== undefined;
    });
  });
}

function normalizeProjectedMapEntry(
  entryValue: unknown,
  projectionColumns: EditorTableColumn[],
): Record<string, unknown> | null {
  if (entryValue === undefined) {
    return {};
  }
  if (!isPlainObject(entryValue)) {
    return { default: entryValue };
  }

  const hasProjectedField = projectionColumns.some((column) => {
    const fieldPath = getTableColumnPath(column);
    return fieldPath.length > 0 && getValueAtPath(entryValue, fieldPath) !== undefined;
  });

  if (hasProjectedField) {
    return entryValue;
  }

  return { default: entryValue };
}

function updateProjectedMapEntry(
  originalEntryValue: unknown,
  normalizedEntryValue: Record<string, unknown>,
  fieldPath: JsonPath,
  nextValue: unknown,
) {
  if (!isPlainObject(originalEntryValue) && fieldPath.length === 1 && fieldPath[0] === "default") {
    return nextValue;
  }
  return setValueAtPath(normalizedEntryValue, fieldPath, nextValue);
}

function getProjectedMapEntryKeys(
  rowValue: Record<string, unknown>,
  projectionMetadataByKey?: Record<string, Record<string, unknown>>,
) {
  const keys = new Set<string>(Object.keys(rowValue));
  for (const key of Object.keys(projectionMetadataByKey ?? {})) {
    keys.add(key);
  }
  return [...keys];
}

function getDirectProjectionFieldKeys(projectionColumns: EditorTableColumn[]) {
  return projectionColumns
    .map((column) => getTableColumnPath(column))
    .filter((fieldPath) => fieldPath.length === 1 && typeof fieldPath[0] === "string")
    .map((fieldPath) => fieldPath[0] as string);
}

function hasProjectedMapMetadataRows(
  projectionMetadataByKey?: Record<string, Record<string, unknown>>,
  projectionColumns?: EditorTableColumn[],
) {
  const metadataKeys = Object.keys(projectionMetadataByKey ?? {});
  if (metadataKeys.length === 0) {
    return false;
  }
  const directFieldKeys = projectionColumns ? getDirectProjectionFieldKeys(projectionColumns) : [];
  if (directFieldKeys.length > 0 && metadataKeys.every((key) => directFieldKeys.includes(key))) {
    return false;
  }
  return true;
}

function ObjectPage({
  value,
  savedValue,
  sourceId,
  path,
  title,
  host,
  schema,
  resolveNamedSchema,
  onUpdateDocumentSchema,
  validationResult,
  isReference = false,
  referenceScopeDepth,
  referenceSourceLabel,
  onNavigateUp,
  onClosePage,
  pageHeaderActions,
  onNavigate,
  onJumpToSource,
  onApplyValue,
  onEditModeChange,
  readOnly = false,
  enableRawEditor = true,
  renderPageActionButtons,
}: ValueInspectorProps & { value: Record<string, unknown> }) {
  const [rawOpen, setRawOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [suppressEditToggleUntil, setSuppressEditToggleUntil] = useState(0);
  const [newKey, setNewKey] = useState("");
  const [newKeyType, setNewKeyType] = useState<ObjectDraftType>("string");
  const keyExists = newKey.trim().length > 0 && Object.prototype.hasOwnProperty.call(value, newKey.trim());
  const pathKey = path.join("/");
  const schemaState = schema
    ? resolveNode({
      rootSchema: schema,
      documents: { current: value },
      sourceId: "current",
      path: [],
      value,
    })
    : undefined;
  const pageReadOnly = readOnly || schemaState?.constraints.readOnly === true;
  const schemaAddablePropertyKeys = getAddablePropertyKeys(value, schema, schemaState?.objectCapabilities?.supportsDynamicKeys ?? false);
  const usesSchemaPropertyCreation = Boolean(schema) && (schemaAddablePropertyKeys.length > 0 || schemaState?.objectCapabilities?.supportsDynamicKeys);
  const hasSchemaPropertyChoices = schemaAddablePropertyKeys.some((key) => key.trim().length > 0);
  const defaultSchemaPropertyKey = schemaAddablePropertyKeys[0] ?? "";
  const canEditCurrentPage = Boolean(onEditModeChange);
  const extraPageActions = canEditCurrentPage ? renderPageActionButtons?.() : null;
  const canAuthorObjectSchema = Boolean(schema?.properties && onUpdateDocumentSchema && sourceId);
  const declaredFieldKeys = new Set(Object.keys(schema?.properties ?? {}));
  const schemaPropertyOrderSignature = Object.keys(schema?.properties ?? {}).join("\u0000");
  const valueKeySignature = Object.keys(value).join("\u0000");
  const [fieldOrder, setFieldOrder] = useState(() => getOrderedKeys(value, schema));
  const propertyItemRefs = useRef<Record<string, HTMLElement | null>>({});
  const [pressedField, setPressedField] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    field: string;
    order: string[];
    targetIndex: number;
    restOrder: string[];
    ghostTop: number;
    ghostLeft: number;
    ghostWidth: number;
    ghostHeight: number;
  } | null>(null);
  const fields = useMemo(
    () => fieldOrder
      .filter((key) => Object.prototype.hasOwnProperty.call(value, key))
      .map((key) => [key, value[key]] as const),
    [fieldOrder, value],
  );
  const declaredFieldCount = fields.filter(([key]) => declaredFieldKeys.has(key)).length;

  useEffect(() => {
    setRawOpen(false);
    setEditMode(false);
    setSuppressEditToggleUntil(0);
    setNewKey(usesSchemaPropertyCreation ? defaultSchemaPropertyKey : "");
    setNewKeyType("string");
    setFieldOrder(getOrderedKeys(value, schema));
  }, [defaultSchemaPropertyKey, pathKey, usesSchemaPropertyCreation]);

  useLayoutEffect(() => {
    setFieldOrder((current) => {
      const nextKeys = getOrderedKeys(value, schema);
      if (sameStringArray(nextKeys, current)) {
        return current;
      }
      return nextKeys;
    });
  }, [schemaPropertyOrderSignature, valueKeySignature]);

  useEffect(() => {
    onEditModeChange?.(editMode);
    return () => onEditModeChange?.(false);
  }, [editMode, onEditModeChange]);

  function handleEditModeToggle() {
    if (Date.now() < suppressEditToggleUntil) return;
    setSuppressEditToggleUntil(Date.now() + 250);
    if (editMode) {
      setEditMode(false);
      setNewKey("");
      setNewKeyType("string");
      return;
    }
    if (usesSchemaPropertyCreation) {
      setNewKey(defaultSchemaPropertyKey);
    }
    setEditMode(true);
  }

  function updateObjectSchema(updater: (currentSchema: EditorSchema) => EditorSchema) {
    if (!canAuthorObjectSchema || !sourceId) return;
    onUpdateDocumentSchema?.(sourceId, path, "self", updater);
  }

  function commitObjectFieldOrder(nextOrder: string[]) {
    if (!canAuthorObjectSchema) return;
    setFieldOrder(nextOrder);
    updateObjectSchema((currentSchema) => reorderSchemaPropertiesToMatch(currentSchema, nextOrder));
  }

  function handlePropertyHandlePointerDown(
    key: string,
    event: { button: number; clientY: number; preventDefault: () => void },
  ) {
    if (pageReadOnly || declaredFieldCount <= 1 || event.button !== 0) return;
    if (!declaredFieldKeys.has(key)) return;
    event.preventDefault();
    const startOrder = fields.map(([fieldKey]) => fieldKey);
    const startRect = propertyItemRefs.current[key]?.getBoundingClientRect();
    if (!startRect) return;
    const startY = event.clientY;
    let dragging = false;
    let currentTargetIndex = startOrder.indexOf(key);
    setPressedField(key);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      if (!dragging && Math.abs(deltaY) <= 4) return;
      if (!dragging) {
        dragging = true;
        document.body.classList.add("is-dragging-detail-property");
      }
      // 附加字段不参与 drop-slot：落点只在已声明字段之间，附加区恒为尾部。
      const restOrder = startOrder.filter((field) => field !== key && declaredFieldKeys.has(field));
      const slots = restOrder.map((field) => {
        const element = propertyItemRefs.current[field];
        const rect = element?.getBoundingClientRect();
        return rect ? { field, top: rect.top, center: rect.top + rect.height / 2 } : null;
      }).filter((entry): entry is { field: string; top: number; center: number } => Boolean(entry));
      currentTargetIndex = slots.length;
      for (let index = 0; index < slots.length; index += 1) {
        if (moveEvent.clientY <= slots[index].center) {
          currentTargetIndex = index;
          break;
        }
      }
      setDragState({
        field: key,
        order: startOrder,
        targetIndex: currentTargetIndex,
        restOrder,
        ghostTop: moveEvent.clientY - (startY - startRect.top),
        ghostLeft: startRect.left,
        ghostWidth: startRect.width,
        ghostHeight: startRect.height,
      });
    };

    const finish = (nextOrder: string[] | null) => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onPointerUp);
      document.body.classList.remove("is-dragging-detail-property");
      setPressedField(null);
      setDragState(null);
      if (nextOrder && !nextOrder.every((field, index) => field === fieldOrder[index])) {
        commitObjectFieldOrder(nextOrder);
      }
    };

    const onPointerUp = () => {
      finish(dragging ? insertDraggedItem(startOrder, key, currentTargetIndex) : null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onPointerUp);
  }

  const pageClassNames = getSchemaClassNames(schema);

  return (
    <section className={["node-page", "node-page--object", ...pageClassNames].join(" ")}>
      <PageHeader
        path={path}
        title={title}
        isReference={isReference}
        referenceScopeDepth={referenceScopeDepth}
        referenceSourceLabel={referenceSourceLabel}
        onNavigateUp={onNavigateUp}
        onClosePage={onClosePage}
        pageHeaderActions={pageHeaderActions}
      />
      <SchemaControlBar
        schema={schema}
        schemaState={schemaState}
        value={value}
        readOnly={pageReadOnly}
        onApplyValue={onApplyValue}
      />
      <div className="node-page__content">
        {rawOpen ? (
          <RawJsonEditor
            readOnly={pageReadOnly}
            value={value}
            schema={schema}
            onApplyValue={(nextValue) => {
              onApplyValue(nextValue);
              setRawOpen(false);
            }}
          />
        ) : (
          <div className="object-page-body">
            <div className="object-scroll">
              <div className="property-list">
                {fields.map(([key, fieldValue], index) => {
                  const isDragged = dragState?.field === key;
                  const visibleIndex = dragState ? dragState.restOrder.indexOf(key) : index;
                  const fieldSchema = resolveSchemaAtPath(schema, [key], value);
                  const fieldLabel = fieldSchema?.title ?? host?.getFieldLabel?.([...path, key], key, fieldValue) ?? key;
                  return (
                    <div className="detail-property-stack" key={key}>
                      {!isDragged && dragState && dragState.targetIndex === visibleIndex ? (
                        <div className="detail-drop-indicator" />
                      ) : null}
                      <div
                        className={[
                          "detail-property-item",
                          "object-field-row",
                          ...getSchemaClassNames(fieldSchema),
                          pressedField === key ? "is-pressed" : "",
                          isDragged ? "is-dragging" : "",
                          isFieldDirty(fieldValue, isPlainObject(savedValue) ? savedValue[key] : undefined) ? "object-field-row--dirty" : "",
                        ].filter(Boolean).join(" ")}
                        ref={(element) => {
                          propertyItemRefs.current[key] = element;
                        }}
                      >
                        {!pageReadOnly && canAuthorObjectSchema && declaredFieldCount > 1 && declaredFieldKeys.has(key) ? (
                          <button
                            aria-label={`Reorder ${fieldLabel}`}
                            className="detail-property-handle"
                            type="button"
                            onMouseDown={(event) => handlePropertyHandlePointerDown(key, event)}
                          >
                            <icons.dragHandle size={16} />
                          </button>
                        ) : (
                          <div className="detail-property-spacer" aria-hidden="true" />
                        )}
                        {isDragged ? (
                          <div
                            className="detail-property-placeholder"
                            style={{ minHeight: dragState?.ghostHeight ?? 72 }}
                          />
                        ) : (
                          <section className={["property-block", ...getSchemaClassNames(fieldSchema)].join(" ")}>
                            <div className="property-heading">
                              <span className="property-heading__label">
                                {renderTypeIcon(describeType(fieldValue, host))}
                                {editMode && canAuthorObjectSchema ? (
                                  <input
                                    aria-label={`Field label for ${fieldLabel}`}
                                    className="detail-input field-label-input"
                                    value={fieldSchema?.title ?? key}
                                    onChange={(event) => {
                                      const nextTitle = event.target.value;
                                      updateObjectSchema((currentSchema) => updatePropertySchema(
                                        currentSchema,
                                        key,
                                        (propertySchema) => setSchemaTitle(propertySchema, nextTitle),
                                      ));
                                    }}
                                  />
                                ) : (
                                  <span>{fieldLabel}</span>
                                )}
                              </span>
                              <div className="property-heading__actions">
                                {isRequiredField(schema, key) ? <small className="field-required">Required</small> : null}
                                {renderNullableTypeButton({
                                  value: fieldValue,
                                  schema: fieldSchema,
                                  readOnly: pageReadOnly,
                                  onSetNull: () => {
                                    onApplyValue({
                                      ...value,
                                      [key]: null,
                                    });
                                  },
                                })}
                                {editMode && !pageReadOnly ? (
                                  <button
                                    className="danger-icon-button"
                                    type="button"
                                    disabled={isRequiredField(schema, key)}
                                    onClick={() => {
                                      if (isRequiredField(schema, key)) return;
                                      const nextValue = { ...value };
                                      delete nextValue[key];
                                      onApplyValue(nextValue);
                                    }}
                                  >
                                    Delete
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            {fieldSchema?.description ? <div className="form-hint">{fieldSchema.description}</div> : null}
                            {editMode && isRequiredField(schema, key) ? (
                              <div className="form-hint">必填字段不能删除。</div>
                            ) : null}
                            {isInlineSchemaEditor(fieldValue, fieldSchema, host) ? (
                              renderPrimitiveEditor({
                                value: fieldValue,
                                ariaLabel: `Field ${fieldLabel}`,
                                schema: fieldSchema,
                                path: [...path, key],
                                host,
                                readOnly: pageReadOnly,
                                onOpenReference: onJumpToSource,
                                showOpenReferenceButton: true,
                                onUpdateSchema: canAuthorObjectSchema
                                  ? (updater) => updateObjectSchema((currentSchema) => updatePropertySchema(currentSchema, key, updater))
                                  : undefined,
                                onChange(nextValue) {
                                  onApplyValue({
                                    ...value,
                                    [key]: nextValue,
                                  });
                                },
                              })
                            ) : (() => {
                              if (!isPlainObject(fieldValue)) {
                                return null;
                              }
                              const projection = resolveObjectProjectionConfig({
                                path: [...path, key],
                                value: fieldValue,
                                parentValue: value,
                                schema: fieldSchema,
                                host,
                              }) ?? getObjectFieldProjectionConfig(schema, fieldSchema);
                              if (!projection) {
                                return null;
                              }
                              const resolvedProjectionMetadataByKey = projection.objectValueMetadataByKey
                                ?? resolveObjectValueMetadataByKey({
                                  path: [...path, key],
                                  value: fieldValue,
                                  parentValue: value,
                                  schema: projection.metadataSchema ?? projection.objectValueSchema,
                                  host,
                                });
                              if (
                                isObjectMapProjectionValue(fieldValue, projection.columns)
                                || hasProjectedMapMetadataRows(resolvedProjectionMetadataByKey, projection.columns)
                              ) {
                                return renderProjectedObjectMapFieldEditor({
                                  rowKey: key,
                                  rowValue: fieldValue,
                                  rowLabel: fieldLabel,
                                  path,
                                  host,
                                  parentValue: value,
                                  readOnly: pageReadOnly,
                                  projectionColumns: projection.columns,
                                  projectionSchema: projection.objectValueSchema,
                                  objectPreset: projection.objectPreset,
                                  projectionMetadataSchema: projection.metadataSchema,
                                  projectionMetadataByKey: resolvedProjectionMetadataByKey,
                                  onNavigate,
                                  onJumpToSource,
                                  onChange(nextRowValue) {
                                    onApplyValue({
                                      ...value,
                                      [key]: nextRowValue,
                                    });
                                  },
                                });
                              }
                              return renderProjectedObjectFieldEditor({
                                rowKey: key,
                                rowValue: fieldValue,
                                rowLabel: fieldLabel,
                                path,
                                host,
                                resolveNamedSchema,
                                readOnly: pageReadOnly,
                                projectionColumns: projection.columns,
                                projectionSchema: projection.objectValueSchema,
                                objectPreset: projection.objectPreset,
                                onNavigate,
                                onJumpToSource,
                                onChange(nextRowValue) {
                                  onApplyValue({
                                    ...value,
                                    [key]: nextRowValue,
                                  });
                                },
                              });
                            })() ?? (
                              Array.isArray(fieldValue) ? (
                                renderInlineArrayFieldPreview({
                                  rowKey: key,
                                  rowLabel: fieldLabel,
                                  rowValue: fieldValue,
                                  path,
                                  host,
                                  schema: fieldSchema,
                                  resolveNamedSchema,
                                  readOnly: pageReadOnly,
                                  onNavigate,
                                  onChange(nextValue) {
                                    onApplyValue({
                                      ...value,
                                      [key]: nextValue,
                                    });
                                  },
                                }) ?? (
                                  <button
                                    aria-label={`${key} ${describeType(fieldValue, host)} ${previewValue(fieldValue, host)}`}
                                    className={["nested-entry-button", getTypeToneClass(fieldValue, host)].filter(Boolean).join(" ")}
                                    type="button"
                                    onClick={() => onNavigate([...path, key])}
                                  >
                                    <span className="nested-entry-icon" aria-hidden="true">
                                      {getStructureIcon(fieldValue, host)}
                                    </span>
                                    {renderNestedEntryContent(
                                      fieldValue,
                                      fieldSchema,
                                      host,
                                      resolveNamedSchema,
                                      undefined,
                                      isReferenceValue(fieldValue) ? "compact" : "full",
                                    )}
                                  </button>
                                )
                              ) : isNavigable(fieldValue) ? (
                                <button
                                  aria-label={`${key} ${describeType(fieldValue, host)} ${previewValue(fieldValue, host)}`}
                                  className={["nested-entry-button", getTypeToneClass(fieldValue, host)].filter(Boolean).join(" ")}
                                  type="button"
                                  onClick={() => onNavigate([...path, key])}
                                >
                                  <span className="nested-entry-icon" aria-hidden="true">
                                    {getStructureIcon(fieldValue, host)}
                                  </span>
                                  {renderNestedEntryContent(
                                    fieldValue,
                                    fieldSchema,
                                    host,
                                    resolveNamedSchema,
                                    undefined,
                                    isReferenceValue(fieldValue) ? "compact" : "full",
                                  )}
                                </button>
                              ) : (
                                renderPrimitiveEditor({
                                  value: fieldValue,
                                  ariaLabel: `Field ${fieldLabel}`,
                                  schema: fieldSchema,
                                  path: [...path, key],
                                  host,
                                  readOnly: pageReadOnly,
                                  onOpenReference: onJumpToSource,
                                  showOpenReferenceButton: true,
                                  onUpdateSchema: canAuthorObjectSchema
                                    ? (updater) => updateObjectSchema((currentSchema) => updatePropertySchema(currentSchema, key, updater))
                                    : undefined,
                                  onChange(nextValue) {
                                    onApplyValue({
                                      ...value,
                                      [key]: nextValue,
                                    });
                                  },
                                })
                              )
                            )}
                            {getFieldError(validationResult, sourceId, [...path, key]) ? (
                              <div className="form-hint form-hint--danger">{getFieldError(validationResult, sourceId, [...path, key])?.message}</div>
                            ) : null}
                          </section>
                        )}
                      </div>
                    </div>
                  );
                })}
                {dragState && dragState.targetIndex === dragState.restOrder.length ? <div className="detail-drop-indicator" /> : null}
                {dragState ? (
                  <div
                    className="detail-property-ghost"
                    style={{
                      top: dragState.ghostTop,
                      left: dragState.ghostLeft,
                      width: dragState.ghostWidth,
                    }}
                  >
                    <icons.dragHandle size={16} />
                    <span className="detail-property-ghost-label">
                      {schema?.properties?.[dragState.field]?.title ?? dragState.field}
                    </span>
                  </div>
                ) : null}
                {Object.keys(value).length === 0 ? <div className="empty-state">This object has no fields.</div> : null}
                {editMode && !pageReadOnly ? (
                  <div className="detail-property-item detail-property-item--composer">
                    <div className="detail-property-spacer" aria-hidden="true" />
                    <section className="property-block add-object-form">
                      <div className="property-heading">
                        <span>New property</span>
                      </div>
                      {usesSchemaPropertyCreation ? (
                        <div className="add-object-form__fields">
                          {hasSchemaPropertyChoices ? (
                            <select className="detail-input" value={newKey} onChange={(event) => setNewKey(event.target.value)}>
                              <option value="">Choose property</option>
                              {schemaAddablePropertyKeys.map((key) => (
                                <option key={key} value={key}>
                                  {schema?.properties?.[key]?.title ?? key}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="detail-input"
                              placeholder="New property key"
                              value={newKey}
                              onChange={(event) => setNewKey(event.target.value)}
                            />
                          )}
                          <div className="form-hint">
                            {schemaState?.objectCapabilities?.patternPropertyEntries?.length
                              ? `动态字段需匹配: ${schemaState.objectCapabilities.patternPropertyEntries.map((entry) => entry.pattern).join(", ")}`
                              : "新增字段将按 schema 约束生成默认值。"}
                          </div>
                        </div>
                      ) : (
                        <div className="add-object-form__fields">
                          <input
                            className="detail-input"
                            placeholder="New property key"
                            value={newKey}
                            onChange={(event) => setNewKey(event.target.value)}
                          />
                          <select className="detail-input" value={newKeyType} onChange={(event) => setNewKeyType(event.target.value as ObjectDraftType)}>
                            <option value="string">string</option>
                            <option value="number">number</option>
                            <option value="object">object</option>
                            <option value="array">array</option>
                          </select>
                        </div>
                      )}
                      <div className="add-object-form__actions">
                        <button
                          className="primary-button"
                          aria-label="Add property"
                          disabled={newKey.trim().length === 0 || keyExists}
                          type="button"
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={() => {
                            const key = newKey.trim();
                            if (!key || Object.prototype.hasOwnProperty.call(value, key)) return;
                            setSuppressEditToggleUntil(Date.now() + 300);
                            onApplyValue({
                              ...value,
                              [key]: usesSchemaPropertyCreation ? createDefaultPropertyValue(schema, key) : createDefaultValueForType(newKeyType),
                            });
                            setNewKey(usesSchemaPropertyCreation ? getAddablePropertyKeys({ ...value, [key]: true }, schema)[0] ?? "" : "");
                            setNewKeyType("string");
                          }}
                        >
                          Add property
                        </button>
                      </div>
                      {keyExists ? <small className="form-hint form-hint--danger">Key already exists.</small> : null}
                    </section>
                  </div>
                ) : null}
              </div>
            </div>
            <section className="editor-actions-panel">
              <div className="editor-actions-row">
                {enableRawEditor && canEditCurrentPage ? (
                  <button className="ghost-button compact-button raw-toggle-button" type="button" onClick={() => setRawOpen((current) => !current)}>
                    Raw
                  </button>
                ) : null}
                {!pageReadOnly && canEditCurrentPage ? (
                  <button
                    className="ghost-button compact-button"
                    type="button"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={handleEditModeToggle}
                  >
                    {editMode ? "Done" : "Edit"}
                  </button>
                ) : null}
                {extraPageActions}
              </div>
            </section>
          </div>
        )}
      </div>
    </section>
  );
}

function ArrayPage({
  value,
  sourceId,
  path,
  title,
  host,
  schema,
  resolveNamedSchema,
  onUpdateDocumentSchema,
  validationResult,
  isReference = false,
  referenceScopeDepth,
  referenceSourceLabel,
  activeChildSegment,
  activeReferenceSourceId,
  onNavigateUp,
  onClosePage,
  pageHeaderActions,
  onNavigate,
  onJumpToSource,
  onApplyValue,
  onEditModeChange,
  toolbarPortalHost,
  readOnly = false,
  enableRawEditor = true,
  renderPageActionButtons,
}: ValueInspectorProps & { value: unknown[] }) {
  const actionColumnWidth = 136;
  const [rawOpen, setRawOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [suppressEditToggleUntil, setSuppressEditToggleUntil] = useState(0);
  const [pendingRow, setPendingRow] = useState<unknown | null>(null);
  const [suppressRowActionsUntil, setSuppressRowActionsUntil] = useState(0);
  const [hostActionError, setHostActionError] = useState<string | null>(null);
  const [schemaRepairNotice, setSchemaRepairNotice] = useState<string | null>(null);
  const [isCreatingReferenceRow, setIsCreatingReferenceRow] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const [tableViewportWidth, setTableViewportWidth] = useState(0);
  const pathKey = path.join("/");
  const canEditCurrentPage = Boolean(onEditModeChange);
  const extraPageActions = canEditCurrentPage ? renderPageActionButtons?.() : null;
  const schemaState = schema
    ? resolveNode({
      rootSchema: schema,
      documents: { current: value },
      sourceId: "current",
      path: [],
      value,
    })
    : undefined;
  const pageReadOnly = readOnly || schemaState?.constraints.readOnly === true;
  const minItemsReached = (schemaState?.arrayCapabilities?.minItems ?? 0) >= value.length;
  const maxItemsReached =
    schemaState?.arrayCapabilities?.maxItems !== undefined && value.length >= schemaState.arrayCapabilities.maxItems;
  const validationArrayError = getFieldError(validationResult, sourceId, path)?.message ?? getLocalSchemaError(schemaState);
  const schemaItemsSignature = JSON.stringify(schema?.items ?? null);
  const referenceViewSchema = useMemo(
    () => resolveReferenceViewSchema(schema?.items, resolveNamedSchema),
    [resolveNamedSchema, schema?.items],
  );
  const referenceItemSchema = schema?.items;
  const referenceSchema = referenceItemSchema?.["x-editor"]?.reference;
  const referenceTargetSchemaRef = referenceSchema?.target?.schemaRef;
  const referenceTargetSchema = useMemo(
    () => referenceTargetSchemaRef ? resolveNamedSchema?.(referenceTargetSchemaRef) : undefined,
    [referenceTargetSchemaRef, resolveNamedSchema],
  );
  const referenceViewColumns = useMemo(
    () => getReferenceViewColumns(value, referenceViewSchema, referenceItemSchema, host),
    [host, referenceItemSchema, referenceViewSchema, value],
  );
  const referenceOptions = useMemo(
    () => referenceSchema && host?.getReferenceOptions
      ? host.getReferenceOptions({
        path,
        value,
        schema: referenceItemSchema,
        reference: referenceSchema,
      })
      : [],
    [host, path, referenceItemSchema, referenceSchema, value],
  );
  const showReferenceProjectionTable = referenceViewColumns.length > 0;
  const showReferenceArrayPicker = referenceOptions.length > 0;
  const columnSourceSchema = showReferenceProjectionTable ? referenceViewSchema : referenceItemSchema;
  const tableSchema = getArrayTableSchema(schema, referenceItemSchema);
  const hasExplicitTableColumns = hasSchemaTableColumns(tableSchema) && !usesAutomaticTableColumns(tableSchema);
  const configuredTableColumns = useMemo(
    () => getConfiguredTableColumns(tableSchema),
    [tableSchema],
  );
  const hasEmptyPrimitiveColumnConfig = hasExplicitTableColumns
    && configuredTableColumns.length === 0
    && isPrimitiveArray(value, schema?.items, host);
  const arrayError = validationArrayError ?? schemaRepairNotice;
  const [sortState, setSortState] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [hiddenFieldsOpen, setHiddenFieldsOpen] = useState(false);
  const [pressedColumnKey, setPressedColumnKey] = useState<string | null>(null);
  const [dragPreviewKeys, setDragPreviewKeys] = useState<string[] | null>(null);
  const [dragPreviewWidths, setDragPreviewWidths] = useState<Record<string, number> | null>(null);
  const [realColumnWidths, setRealColumnWidths] = useState<Record<string, number> | null>(null);
  const [dragGhost, setDragGhost] = useState<{ key: string; label: string; x: number; y: number } | null>(null);
  const rowItemRefs = useRef<Record<number, HTMLTableRowElement | null>>({});
  const [pressedRowIndex, setPressedRowIndex] = useState<number | null>(null);
  const [rowDragState, setRowDragState] = useState<{
    sourceIndex: number;
    orderedSourceIndexes: number[];
    targetIndex: number;
    ghostTop: number;
    ghostLeft: number;
    ghostWidth: number;
    ghostHeight: number;
    ghostLabel: string;
  } | null>(null);
  const dragPreviewKeysRef = useRef<string[] | null>(null);
  const dragStateRef = useRef<{
    key: string;
    label: string;
    width: number;
    pointerOffsetX: number;
    pointerOffsetY: number;
    dragging: boolean;
  } | null>(null);
  const showStructuralRowActions = editMode && !pageReadOnly;
  const availableSchemaColumns = useMemo(() => {
    const schemaColumns = showReferenceProjectionTable
      ? getAvailableSchemaColumns(referenceTargetSchema)
      : getAvailableSchemaColumns(columnSourceSchema);
    const knownColumns = new Map(schemaColumns.map((column) => [column.key, column]));
    for (const key of getArrayColumns(value, host, schema?.items, referenceViewColumns).filter((column) => column !== "#")) {
      if (!knownColumns.has(key)) knownColumns.set(key, { key, field: [key], label: key });
    }
    return [...knownColumns.values()];
  }, [columnSourceSchema, host, referenceTargetSchema, referenceViewColumns, schema?.items, showReferenceProjectionTable, value]);
  const canAuthorTableSchema = Boolean(
    sourceId && onUpdateDocumentSchema,
  );
  useEffect(() => {
    if (!hasEmptyPrimitiveColumnConfig) return;
    setSchemaRepairNotice("原始值数组不能隐藏全部列；已恢复 Value 列。");
    if (!canAuthorTableSchema) return;
    void onUpdateDocumentSchema?.(sourceId as string, path, "self", (targetSchema) => setSchemaTableColumns(targetSchema, [{ key: "Value" }]));
  }, [canAuthorTableSchema, hasEmptyPrimitiveColumnConfig, onUpdateDocumentSchema, path, sourceId]);
  const columns = useMemo(
    () => getArrayColumns(value, host, schema?.items, referenceViewColumns, configuredTableColumns, hasExplicitTableColumns),
    [value, host, schema?.items, referenceViewColumns, configuredTableColumns, hasExplicitTableColumns],
  );
  const columnSetSignature = useMemo(
    () => [...columns].sort().join("|"),
    [columns],
  );
  const managedColumns = useMemo(
    () => getManagedTableColumns(configuredTableColumns, columns, availableSchemaColumns, hasExplicitTableColumns),
    [availableSchemaColumns, columns, configuredTableColumns, hasExplicitTableColumns],
  );
  const orderedColumns = useMemo(
    () => dragPreviewKeys ? ["#", ...dragPreviewKeys] : columns,
    [columns, dragPreviewKeys],
  );
  const objectRows = useMemo(() => hasObjectTableRows(value, host), [value, host]);
  const supportsColumnVisibility = canAuthorTableSchema && (objectRows || showReferenceProjectionTable);
  const visibilityColumns = useMemo(() => {
    if (!supportsColumnVisibility) {
      return [];
    }
    const ordered = managedColumns.map((column) => {
      const columnId = getTableColumnId(column);
      const referenceColumn = findReferenceColumn(columnId, configuredTableColumns, referenceViewColumns, referenceTargetSchema, resolveNamedSchema);
      return {
        key: columnId,
        column,
        label: getConfiguredColumnLabel(columnId, column, referenceColumn, showReferenceProjectionTable ? referenceTargetSchema : columnSourceSchema),
        visible: true,
      };
    });
    const hidden = availableSchemaColumns
      .filter((column) => !managedColumns.some((entry) => getTableColumnId(entry) === column.key))
      .map((column) => ({
        key: column.key,
        column,
        label: column.label,
        visible: false,
      }));
    return [...ordered, ...hidden];
  }, [availableSchemaColumns, columnSourceSchema, configuredTableColumns, managedColumns, referenceTargetSchema, referenceViewColumns, showReferenceProjectionTable, supportsColumnVisibility]);
  const displayRows = useMemo(
    () => buildArrayDisplayRows(value, sortState, referenceViewColumns, configuredTableColumns, referenceItemSchema, host, referenceTargetSchema, resolveNamedSchema),
    [value, sortState, referenceViewColumns, configuredTableColumns, referenceItemSchema, host, referenceTargetSchema, resolveNamedSchema],
  );
  const columnWidths = useMemo(
    () => getArrayColumnWidths(
      value,
      columns,
      host,
      showReferenceProjectionTable ? (referenceTargetSchema ?? columnSourceSchema) : columnSourceSchema,
      referenceViewColumns,
      configuredTableColumns,
      resolveNamedSchema,
    ),
    [value, columns, host, columnSourceSchema, referenceTargetSchema, referenceViewColumns, configuredTableColumns, showReferenceProjectionTable, resolveNamedSchema],
  );
  const stableColumnWidths = useMemo(
    () => realColumnWidths ?? columnWidths,
    [columnWidths, realColumnWidths],
  );
  const renderedColumnWidths = useMemo(
    () => dragPreviewWidths ? { ...stableColumnWidths, ...dragPreviewWidths } : stableColumnWidths,
    [dragPreviewWidths, stableColumnWidths],
  );
  const tableMinWidth = useMemo(
    () => orderedColumns.reduce((total, column) => total + (renderedColumnWidths[column] ?? 140), 0),
    [orderedColumns, renderedColumnWidths],
  );
  const tableWidth = tableMinWidth + (editMode ? actionColumnWidth : 0);
  const resolvedTableWidth = tableWidth;
  useEffect(() => {
    setRawOpen(false);
    setEditMode(false);
    setSuppressEditToggleUntil(0);
    setPendingRow(null);
    setSuppressRowActionsUntil(0);
    setHostActionError(null);
    setIsCreatingReferenceRow(false);
    setSortState(null);
    setDragPreviewKeys(null);
    setDragPreviewWidths(null);
    setRealColumnWidths(null);
    setDragGhost(null);
    setPressedRowIndex(null);
    setRowDragState(null);
    setHiddenFieldsOpen(false);
  }, [pathKey, schemaItemsSignature]);

  useEffect(() => {
    dragPreviewKeysRef.current = dragPreviewKeys;
  }, [dragPreviewKeys]);

  useEffect(() => {
    setRealColumnWidths((current) => {
      const next = applyViewportFillToColumnWidths(columnWidths, columns, tableViewportWidth, editMode);
      if (current && sameColumnWidthMap(current, next)) {
        return current;
      }
      return next;
    });
  }, [columnSetSignature, columnWidths, columns, editMode, tableViewportWidth]);

  useEffect(() => {
    onEditModeChange?.(editMode);
    return () => onEditModeChange?.(false);
  }, [editMode, onEditModeChange]);

  useEffect(() => {
    const node = tableScrollRef.current;
    if (!node) return;
    const updateWidth = () => setTableViewportWidth(node.clientWidth);
    updateWidth();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function handleEditModeToggle() {
    if (Date.now() < suppressEditToggleUntil) return;
    setSuppressEditToggleUntil(Date.now() + 250);
    if (editMode) {
      setEditMode(false);
      setPendingRow(null);
      return;
    }
    setEditMode(true);
    setHostActionError(null);
    if (showReferenceProjectionTable || referenceSchema) {
      setPendingRow(null);
      return;
    }
    setPendingRow(createDefaultArrayRow(value, schema?.items, host));
  }

  async function handleCreateReferenceRow() {
    if (maxItemsReached) {
      return;
    }
    if (!host?.createReferenceRow) {
      setHostActionError("当前宿主未接入引用行创建能力");
      return;
    }
    try {
      setIsCreatingReferenceRow(true);
      setHostActionError(null);
      const createdValue = await host.createReferenceRow({
        path,
        value,
        schema: referenceItemSchema,
        reference: referenceSchema,
      });
      if (createdValue === undefined) {
        return;
      }
      setSuppressRowActionsUntil(Date.now() + 450);
      onApplyValue([...value, cloneJsonValue(createdValue)]);
    } catch (error) {
      setHostActionError(error instanceof Error ? error.message : "创建引用行失败。");
    } finally {
      setIsCreatingReferenceRow(false);
    }
  }

  const updateTableSchemaColumns = useCallback((updater: (columns: EditorTableColumn[]) => EditorTableColumn[]) => {
    if (!canAuthorTableSchema) return;
    const currentColumns = hasExplicitTableColumns
      ? configuredTableColumns
      : getManagedTableColumns(configuredTableColumns, columns, availableSchemaColumns, hasExplicitTableColumns);
    const applyUpdate = (targetSchema: EditorSchema) => setSchemaTableColumns(targetSchema, updater(currentColumns));
    void onUpdateDocumentSchema?.(sourceId as string, path, "self", applyUpdate);
  }, [availableSchemaColumns, canAuthorTableSchema, columns, configuredTableColumns, hasExplicitTableColumns, onUpdateDocumentSchema, path, sourceId]);

  function updateSingleColumn(
    key: string,
    updater: (column: EditorTableColumn) => EditorTableColumn,
  ) {
    updateTableSchemaColumns((currentColumns) =>
      currentColumns.map((column) => (getTableColumnId(column) === key ? updater(column) : column)),
    );
  }

  function unhideColumn(column: AvailableSchemaColumn) {
    updateTableSchemaColumns((current) => [
      ...current,
      isSimpleKeyField(column.field, column.key) ? { key: column.key } : { field: column.field },
    ]);
  }

  function toggleColumnVisibility(columnKey: string) {
    if (!supportsColumnVisibility) {
      return;
    }
    const visibleEntry = managedColumns.find((column) => getTableColumnId(column) === columnKey);
    if (visibleEntry) {
      updateTableSchemaColumns((current) => current.filter((entry) => getTableColumnId(entry) !== columnKey));
      return;
    }
    const hiddenEntry = availableSchemaColumns.find((column) => column.key === columnKey);
    if (hiddenEntry) {
      unhideColumn(hiddenEntry);
    }
  }

  function handleAppendReferenceValue(nextValue: unknown) {
    setSuppressRowActionsUntil(Date.now() + 450);
    onApplyValue([...value, cloneJsonValue(nextValue)]);
  }

  function reorderVisibleColumns(orderedVisibleKeys: string[]) {
    updateTableSchemaColumns((current) => reorderColumnsByKeys(current, orderedVisibleKeys));
  }

  function commitArrayRowOrder(orderedSourceIndexes: number[]) {
    onApplyValue(orderedSourceIndexes.map((index) => value[index]));
  }

  function handleRowHandlePointerDown(
    sourceIndex: number,
    displayIndex: number,
    item: unknown,
    event: { button: number; clientY: number; preventDefault: () => void; stopPropagation: () => void },
  ) {
    if (pageReadOnly || value.length <= 1 || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startOrder = displayRows.map((row) => row.sourceIndex);
    const startRect = rowItemRefs.current[sourceIndex]?.getBoundingClientRect();
    if (!startRect) return;
    const startY = event.clientY;
    let dragging = false;
    let currentTargetIndex = startOrder.indexOf(sourceIndex);
    const ghostLabel = previewValue(item, host) || `Row ${displayIndex + 1}`;
    setPressedRowIndex(sourceIndex);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      if (!dragging && Math.abs(deltaY) <= 4) return;
      if (!dragging) {
        dragging = true;
        document.body.classList.add("is-dragging-detail-property");
      }
      const restOrder = startOrder.filter((index) => index !== sourceIndex);
      const slots = restOrder.map((index) => {
        const element = rowItemRefs.current[index];
        const rect = element?.getBoundingClientRect();
        return rect ? { index, center: rect.top + rect.height / 2 } : null;
      }).filter((entry): entry is { index: number; center: number } => Boolean(entry));
      currentTargetIndex = slots.length;
      for (let index = 0; index < slots.length; index += 1) {
        if (moveEvent.clientY <= slots[index].center) {
          currentTargetIndex = index;
          break;
        }
      }
      setRowDragState({
        sourceIndex,
        orderedSourceIndexes: startOrder,
        targetIndex: currentTargetIndex,
        ghostTop: moveEvent.clientY - (startY - startRect.top),
        ghostLeft: startRect.left,
        ghostWidth: startRect.width,
        ghostHeight: startRect.height,
        ghostLabel,
      });
    };

    const finish = (nextOrder: number[] | null) => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onPointerUp);
      document.body.classList.remove("is-dragging-detail-property");
      setPressedRowIndex(null);
      setRowDragState(null);
      if (nextOrder && !nextOrder.every((index, orderIndex) => index === startOrder[orderIndex])) {
        commitArrayRowOrder(nextOrder);
      }
    };

    const onPointerUp = () => {
      finish(dragging ? insertDraggedItem(startOrder, sourceIndex, currentTargetIndex) : null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onPointerUp);
  }

  function renderArrayDropIndicator(displayIndex: number) {
    if (!rowDragState || rowDragState.targetIndex !== displayIndex) return null;
    return (
      <tr className="array-drop-indicator-row" aria-hidden="true">
        <td
          className="array-drop-indicator-cell"
          colSpan={orderedColumns.length + (showStructuralRowActions ? 1 : 0)}
        >
          <div className="array-drop-indicator" />
        </td>
      </tr>
    );
  }

  function renderRowActions(sourceIndex: number, displayIndex: number, item: unknown) {
    const copyLabel = `Copy row ${displayIndex + 1}`;
    const deleteLabel = `Delete row ${displayIndex + 1}`;
    const reorderLabel = `Reorder row ${displayIndex + 1}`;
    return (
      <td className="array-column--sticky array-column--actions" onClick={(event) => event.stopPropagation()}>
        <div className="row-action-buttons row-action-buttons--icon-only">
          {value.length > 1 ? (
            <button
              aria-label={reorderLabel}
              className="detail-property-handle array-row-reorder-handle"
              title={reorderLabel}
              type="button"
              onMouseDown={(event) => handleRowHandlePointerDown(sourceIndex, displayIndex, item, event)}
            >
              <icons.dragHandle size={16} />
            </button>
          ) : (
            <div className="detail-property-spacer array-row-reorder-spacer" aria-hidden="true" />
          )}
          <button
            aria-label={copyLabel}
            className="ghost-button compact-button row-action-icon-button"
            disabled={Date.now() < suppressRowActionsUntil}
            title={copyLabel}
            type="button"
            onPointerDown={(event) => event.preventDefault()}
            onPointerUp={(event) => {
              event.stopPropagation();
              const next = [...value];
              next.splice(sourceIndex + 1, 0, cloneJsonValue(item));
              onApplyValue(next);
            }}
          >
            <icons.copy size={14} />
          </button>
          <button
            aria-label={deleteLabel}
            className="danger-icon-button row-action-icon-button"
            disabled={Date.now() < suppressRowActionsUntil || minItemsReached}
            title={deleteLabel}
            type="button"
            onPointerDown={(event) => event.preventDefault()}
            onPointerUp={(event) => {
              event.stopPropagation();
              if ((schemaState?.arrayCapabilities?.minItems ?? 0) >= value.length) return;
              onApplyValue(value.filter((_, rowIndex) => rowIndex !== sourceIndex));
            }}
          >
            <icons.delete size={14} />
          </button>
        </div>
      </td>
    );
  }

  const pageClassNames = getSchemaClassNames(schema);

  return (
    <section className={["node-page", "node-page--array", ...pageClassNames].join(" ")}>
      <PageHeader
        path={path}
        title={title}
        isReference={isReference}
        referenceScopeDepth={referenceScopeDepth}
        referenceSourceLabel={referenceSourceLabel}
        onNavigateUp={onNavigateUp}
        onClosePage={onClosePage}
        pageHeaderActions={pageHeaderActions}
      />
      <SchemaControlBar
        schema={schema}
        schemaState={schemaState}
        value={value}
        readOnly={pageReadOnly}
        onApplyValue={onApplyValue}
      />
      <div className="node-page__content">
        {rawOpen ? (
          <RawJsonEditor
            readOnly={pageReadOnly}
            value={value}
            schema={schema}
            onApplyValue={(nextValue) => {
              onApplyValue(nextValue);
              setRawOpen(false);
            }}
          />
        ) : (
          <div className="array-page-body">
            {arrayError ? <div className="form-hint form-hint--danger">{arrayError}</div> : null}
            {hostActionError ? <div className="form-hint form-hint--danger">{hostActionError}</div> : null}
            <div className={["table-shell", ...pageClassNames].join(" ")}>
              <div className="table-scroll" ref={tableScrollRef}>
              <table
                className="data-table array-workspace"
                style={{
                  width: `${resolvedTableWidth}px`,
                  minWidth: `${tableWidth}px`,
                }}
              >
                <colgroup>
                  {showStructuralRowActions ? <col data-column="__edit__" style={{ width: `${actionColumnWidth}px` }} /> : null}
                  {orderedColumns.map((column) => (
                    <col
                      data-column={column}
                      data-column-field={column === "#" ? undefined : column}
                      key={column}
                      style={{ width: `${renderedColumnWidths[column] ?? 140}px` }}
                    />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {showStructuralRowActions ? (
                      <th className="array-column--sticky array-column--actions" aria-label="Actions">
                        <div className="array-column-header">
                          <span>Actions</span>
                          <small>edit</small>
                        </div>
                      </th>
                    ) : null}
                    {orderedColumns.map((column, columnIndex) => (
                      (() => {
                        const referenceColumn = findReferenceColumn(column, configuredTableColumns, referenceViewColumns, referenceTargetSchema, resolveNamedSchema);
                        const configuredColumn = findConfiguredTableColumn(configuredTableColumns, column);
                        const columnLabel = getConfiguredColumnLabel(column, configuredColumn, referenceColumn, columnSourceSchema);
                        const isDescriptionColumn = referenceColumn?.key === "description";
                        const isSortable = Boolean(configuredColumn?.sortable);
                        const isWrapped = Boolean(configuredColumn?.wrap);
                        const typeLabel = column === "#"
                          ? undefined
                          : referenceColumn
                            ? describeSchemaType(referenceColumn.columnSchema) ?? describeArrayColumnType(value, column, host, schema?.items)
                            : describeArrayColumnType(value, column, host, schema?.items);
                        return (
                      <th
                        aria-label={columnLabel}
                        data-column-field={column === "#" ? undefined : column}
                            className={
                              [
                                columnIndex === 0 ? "array-column--sticky" : "",
                                showStructuralRowActions && columnIndex === 0 ? "array-column--after-actions" : "",
                                column === "#" ? "array-column--index" : "",
                                isImageDisplaySchema(referenceColumn?.columnSchema) ? "array-column--image" : "",
                                isDescriptionColumn ? "array-column--description" : "",
                              ].filter(Boolean).join(" ") || undefined
                        }
                        key={column}
                      >
                        {column === "#" ? (
                          supportsColumnVisibility ? (
                            <HiddenFieldsToolbarAction
                              columns={visibilityColumns}
                              isOpen={hiddenFieldsOpen}
                              onToggle={() => setHiddenFieldsOpen((current) => !current)}
                              onToggleColumn={toggleColumnVisibility}
                              onReorderVisible={reorderVisibleColumns}
                              triggerClassName="array-column-visibility-trigger"
                              triggerIconOnly
                            />
                          ) : (
                            <div className="array-column-header">
                              <span>#</span>
                            </div>
                          )
                        ) : canAuthorTableSchema ? (
                          <SchemaColumnHeader
                            fieldName={column}
                            isDragging={dragStateRef.current?.key === column && dragStateRef.current.dragging}
                            label={columnLabel}
                            onDragEnd={() => {
                              document.body.classList.remove("is-dragging-column");
                              const previewKeys = dragPreviewKeysRef.current;
                              const measuredWidths = getRenderedTableColumnWidths(tableScrollRef.current);
                              dragStateRef.current = null;
                              if (previewKeys) {
                                updateTableSchemaColumns((current) => reorderColumnsByKeys(applyMeasuredColumnWidths(current, measuredWidths), previewKeys));
                              }
                              dragPreviewKeysRef.current = null;
                              setDragPreviewKeys(null);
                              setDragPreviewWidths(null);
                              setDragGhost(null);
                              setPressedColumnKey(null);
                            }}
                            onDragMove={(_fieldName, clientX, clientY) => {
                              const state = dragStateRef.current;
                              if (!state) return;
                              const scrollContainer = tableScrollRef.current;
                              const direction = resolveAutoScrollDirection(scrollContainer, clientX);
                              if (direction !== 0) {
                                scrollColumnContainer(scrollContainer, direction);
                              }
                              const slots = collectColumnSlots(scrollContainer, state.key);
                              const pointerXInScrollSpace = getPointerXInScrollSpace(scrollContainer, clientX);
                              const currentOrder = dragPreviewKeysRef.current ?? managedColumns.map((managedColumn) => getTableColumnId(managedColumn));
                              const nextPreview = buildPreviewOrderFromSlots(
                                currentOrder,
                                state.key,
                                state.width,
                                slots,
                                pointerXInScrollSpace,
                              );
                              dragPreviewKeysRef.current = nextPreview;
                              setDragPreviewKeys(nextPreview);
                              setDragGhost({
                                key: state.key,
                                label: state.label,
                                x: clientX - state.pointerOffsetX,
                                y: clientY - state.pointerOffsetY,
                              });
                            }}
                            onDragStart={(_fieldName, rect, pointerOffsetX, pointerOffsetY) => {
                              setDragPreviewWidths(Object.fromEntries(getRenderedTableColumnWidths(tableScrollRef.current)));
                              dragStateRef.current = {
                                key: column,
                                label: columnLabel,
                                width: rect.width,
                                pointerOffsetX,
                                pointerOffsetY,
                                dragging: true,
                              };
                              document.body.classList.add("is-dragging-column");
                              setDragGhost({
                                key: column,
                                label: columnLabel,
                                x: rect.left,
                                y: rect.top,
                              });
                            }}
                            onHide={() => updateTableSchemaColumns((current) => current.filter((entry) => getTableColumnId(entry) !== column))}
                            canHide={supportsColumnVisibility}
                            onMove={(direction) => updateTableSchemaColumns((current) => moveTableColumn(current, column, direction))}
                            onPressChange={(_fieldName, pressed) => setPressedColumnKey(pressed ? column : null)}
                            onRenameLabel={(label) => {
                              updateSingleColumn(column, (current) => ({
                                ...current,
                                label: label.trim().length ? label : undefined,
                              }));
                            }}
                            onResetWidth={() => updateSingleColumn(column, (current) => {
                              const next = { ...current };
                              delete next.width;
                              return next;
                            })}
                            onResize={(width) => updateSingleColumn(column, (current) => ({ ...current, width }))}
                            onSort={(direction) => {
                              if (direction && tableSchema?.["x-editor"]?.table?.sort === "persist") {
                                const orderedRows = buildArrayDisplayRows(
                                  value,
                                  { key: column, direction },
                                  referenceViewColumns,
                                  configuredTableColumns,
                                  referenceItemSchema,
                                  host,
                                  referenceTargetSchema,
                                  resolveNamedSchema,
                                );
                                onApplyValue(orderedRows.map((row) => row.item));
                                setSortState(null);
                                return;
                              }
                              setSortState(direction ? { key: column, direction } : null);
                            }}
                            onToggleSortable={() => updateSingleColumn(column, (current) => ({ ...current, sortable: !current.sortable || undefined }))}
                            onToggleWrap={() => updateSingleColumn(column, (current) => ({ ...current, wrap: !current.wrap || undefined }))}
                            pressed={pressedColumnKey === column}
                            sortable={isSortable}
                            sortDirection={sortState?.key === column ? sortState.direction : null}
                            typeLabel={typeLabel}
                            wrapped={isWrapped}
                            width={renderedColumnWidths[column] ?? 140}
                          />
                        ) : (
                          <div className="array-column-header">
                            <span className="array-column-header__label">
                              {typeLabel ? renderTypeIcon(typeLabel) : null}
                              <span>{columnLabel}</span>
                            </span>
                          </div>
                        )}
                      </th>
                        );
                      })()
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {value.length === 0 ? (
                    <tr className="array-empty-row">
                      <td className="array-empty-cell" colSpan={orderedColumns.length + (showStructuralRowActions ? 1 : 0)}>
                        This array has no items.
                      </td>
                    </tr>
                  ) : null}
                  {displayRows.map(({ item, sourceIndex }, displayIndex) => {
                    const clickable = isNavigable(item);
                    const isActiveReferenceRow = activeReferenceSourceId != null && inferReferenceSourceId(item, host) === activeReferenceSourceId;
                    if (showReferenceProjectionTable) {
                      return (
                        <Fragment key={`${sourceIndex}:${summarizeRowIdentity(item, sourceIndex, path, host)}`}>
                          {renderArrayDropIndicator(displayIndex)}
                          <tr
                            className={[
                              clickable ? "is-clickable" : "",
                              activeChildSegment === sourceIndex || isActiveReferenceRow ? "is-active-row" : "",
                              pressedRowIndex === sourceIndex ? "array-row--pressed" : "",
                              rowDragState?.sourceIndex === sourceIndex ? "array-row--dragging" : "",
                            ].filter(Boolean).join(" ")}
                            data-row-index={sourceIndex}
                            key={`${sourceIndex}:${summarizeRowIdentity(item, sourceIndex, path, host)}`}
                            onClick={clickable ? () => onNavigate([...path, sourceIndex]) : undefined}
                            ref={(element) => {
                              rowItemRefs.current[sourceIndex] = element;
                            }}
                          >
                            {showStructuralRowActions ? renderRowActions(sourceIndex, displayIndex, item) : null}
                            {orderedColumns.map((column, columnIndex) => {
                            if (column === "#") {
                              return (
                                <td
                                  className={[
                                    "array-column--sticky",
                                    "array-column--index",
                                    showStructuralRowActions ? "array-column--after-actions" : "",
                                  ].filter(Boolean).join(" ")}
                                  key={`${sourceIndex}:index`}
                                >
                                  <span className="array-cell-summary array-cell-summary--identity array-cell-summary--index">{displayIndex + 1}</span>
                                </td>
                              );
                            }
                            const referenceColumn = findReferenceColumn(column, configuredTableColumns, referenceViewColumns, referenceTargetSchema, resolveNamedSchema);
                            if (!referenceColumn) {
                              return <td key={`${sourceIndex}:${column}`} />;
                            }
                            const imageColumn = isImageDisplaySchema(referenceColumn.columnSchema);
                            const configuredColumn = findConfiguredTableColumn(configuredTableColumns, column);
                            return (
                              <td
                                className={[
                                  columnIndex === 0 ? "array-column--sticky" : "",
                                  imageColumn ? "array-column--image" : "",
                                  referenceColumn.key === "description" ? "array-column--description" : "",
                                  configuredColumn?.wrap ? "wrapped-cell" : "",
                                ].filter(Boolean).join(" ") || undefined}
                                key={`${sourceIndex}:${column}`}
                              >
                                {renderReferenceTableCell(item, referenceColumn, schema?.items, resolveNamedSchema, host)}
                              </td>
                            );
                            })}
                          </tr>
                        </Fragment>
                      );
                    }
                    if (objectRows) {
                      const objectRow = isObjectTableRow(item, host);
                      if (!objectRow) {
                        const mixedPreview = previewValue(item, host);
                        return (
                          <Fragment key={`${sourceIndex}:${summarizeRowIdentity(item, sourceIndex, path, host)}`}>
                            {renderArrayDropIndicator(displayIndex)}
                            <tr
                              className={[
                                "array-row--mixed",
                                clickable ? "is-clickable" : "",
                                activeChildSegment === sourceIndex || isActiveReferenceRow ? "is-active-row" : "",
                                pressedRowIndex === sourceIndex ? "array-row--pressed" : "",
                                rowDragState?.sourceIndex === sourceIndex ? "array-row--dragging" : "",
                              ].filter(Boolean).join(" ")}
                              data-row-index={sourceIndex}
                              key={`${sourceIndex}:${summarizeRowIdentity(item, sourceIndex, path, host)}`}
                              onClick={clickable ? () => onNavigate([...path, sourceIndex]) : undefined}
                              ref={(element) => {
                                rowItemRefs.current[sourceIndex] = element;
                              }}
                            >
                              {showStructuralRowActions ? renderRowActions(sourceIndex, displayIndex, item) : null}
                              {columns.length > 0 ? (
                                <td className="array-column--sticky array-cell--mixed array-cell--mixed-primary">
                                  <span className="array-cell-summary array-cell-summary--mixed-type">{columns[0] === "#" ? String(displayIndex + 1) : describeType(item, host)}</span>
                                </td>
                              ) : null}
                              {columns.length > 1 ? (
                                <td className="array-cell--mixed array-cell--mixed-secondary">
                                  <span className="array-cell-summary array-cell-summary--mixed-count">{mixedPreview}</span>
                                </td>
                              ) : null}
                              {columns.length > 2 ? (
                                <td className="array-cell--mixed array-cell--mixed-merged" colSpan={columns.length - 2}>
                                  <span className="array-cell-merged-placeholder" aria-hidden="true" />
                                </td>
                              ) : null}
                            </tr>
                          </Fragment>
                        );
                      }

                      const record = item as Record<string, unknown>;
                      const rowLabel = summarizeRowIdentity(item, sourceIndex, path, host);
                      return (
                        <Fragment key={`${sourceIndex}:${summarizeRowIdentity(item, sourceIndex, path, host)}`}>
                          {renderArrayDropIndicator(displayIndex)}
                          <tr
                            className={[
                              clickable ? "is-clickable" : "",
                              activeChildSegment === sourceIndex ? "is-active-row" : "",
                              pressedRowIndex === sourceIndex ? "array-row--pressed" : "",
                              rowDragState?.sourceIndex === sourceIndex ? "array-row--dragging" : "",
                            ].filter(Boolean).join(" ")}
                            data-row-index={sourceIndex}
                            key={`${sourceIndex}:${summarizeRowIdentity(item, sourceIndex, path, host)}`}
                            onClick={clickable ? () => onNavigate([...path, sourceIndex]) : undefined}
                            ref={(element) => {
                              rowItemRefs.current[sourceIndex] = element;
                            }}
                          >
                            {showStructuralRowActions ? renderRowActions(sourceIndex, displayIndex, item) : null}
                            {orderedColumns.map((column, columnIndex) => {
                            if (column === "#") {
                              return (
                                <td
                                  className={[
                                    "array-column--sticky",
                                    "array-column--index",
                                    showStructuralRowActions ? "array-column--after-actions" : "",
                                  ].filter(Boolean).join(" ")}
                                  key={`${sourceIndex}:index`}
                                >
                                  <span className="array-cell-summary array-cell-summary--identity array-cell-summary--index">{displayIndex + 1}</span>
                                </td>
                              );
                            }
                            const configuredColumn = findConfiguredTableColumn(configuredTableColumns, column);
                            const fieldPath = configuredColumn ? getTableColumnPath(configuredColumn) : [column];
                            const isDirectProperty = fieldPath.length === 1 && typeof fieldPath[0] === "string";
                            const cellValue = fieldPath.length > 0 ? getValueAtPath(record, fieldPath) : record[column];
                            const cellSchema = resolveSchemaAtPath(schema?.items, fieldPath, record);
                            const cellProjectionConfig = isPlainObject(cellValue)
                              ? resolveObjectProjectionConfig({
                                path: [...path, sourceIndex, ...fieldPath],
                                value: cellValue,
                                parentValue: item,
                                schema: cellSchema,
                                host,
                              })
                              : null;
                            const hasColumn = isDirectProperty
                              ? Object.prototype.hasOwnProperty.call(record, fieldPath[0] as string)
                              : cellValue !== undefined;
                            const showInlineProjection = hasColumn && cellProjectionConfig && isPlainObject(cellValue);
                            const cellLabel = configuredColumn?.label ?? column;
                            const showInlineEditor = hasColumn && !showInlineProjection && isInlineSchemaEditor(cellValue, cellSchema, host);
                            return (
                            <td
                              className={
                                [
                                  columnIndex === 0 ? "array-column--sticky" : "",
                                  showStructuralRowActions && columnIndex === 0 ? "array-column--after-actions" : "",
                                  !hasColumn ? "array-cell--missing" : "",
                                  configuredColumn?.wrap ? "wrapped-cell" : "",
                                ].filter(Boolean).join(" ") || undefined
                              }
                              key={`${sourceIndex}:${column}`}
                            >
                              {!showInlineProjection && !showInlineEditor ? (
                                <span
                                  className={[
                                    "array-cell-summary",
                                    columnIndex === 0 ? "array-cell-summary--identity" : "",
                                    !hasColumn ? "array-cell-summary--missing" : "",
                                  ].filter(Boolean).join(" ")}
                                >
                                  {hasColumn ? previewValue(cellValue, host) : "-"}
                                </span>
                              ) : null}
                              {showInlineEditor ? (
                                <div
                                  onClick={(event) => event.stopPropagation()}
                                  onPointerDown={(event) => event.stopPropagation()}
                                >
                                  {renderPrimitiveEditor({
                                    value: cellValue,
                                    ariaLabel: `Array item ${sourceIndex} ${cellLabel}`,
                                    schema: cellSchema,
                                    path: [...path, sourceIndex, ...fieldPath],
                                    host,
                                    readOnly: pageReadOnly,
                                    onOpenReference: onJumpToSource,
                                    onUpdateSchema: canAuthorTableSchema && sourceId
                                      ? (updater) => onUpdateDocumentSchema?.(sourceId, [...path, sourceIndex, ...fieldPath], "self", updater)
                                      : undefined,
                                    discoverOptions: () => [...new Set(value
                                      .filter((row) => isPlainObject(row))
                                      .map((row) => getValueAtPath(row, fieldPath))
                                      .flatMap((cell) => Array.isArray(cell) ? cell : [cell])
                                      .filter((entry): entry is string | number => typeof entry === "string" || typeof entry === "number"))],
                                    onChange(nextValue) {
                                      onApplyValue(setValueAtPath(value, [sourceIndex, ...fieldPath], nextValue));
                                    },
                                  })}
                                </div>
                              ) : null}
                              {showInlineProjection
                                ? cellProjectionConfig.objectPreset === "rgba"
                                  ? renderInlineArrayPreviewSummary(cellValue, cellSchema, host, [...path, sourceIndex, ...fieldPath])
                                  : renderInlineObjectProjection({
                                  fieldKey: column,
                                  fieldValue: cellValue,
                                  fieldLabel: cellLabel,
                                  path: [...path, sourceIndex, ...fieldPath],
                                  host,
                                  resolveNamedSchema,
                                  parentValue: item,
                                  readOnly: pageReadOnly,
                                  projectionColumns: cellProjectionConfig.columns,
                                  projectionSchema: cellProjectionConfig.objectValueSchema,
                                  objectPreset: cellProjectionConfig.objectPreset,
                                  projectionMetadataSchema: cellProjectionConfig.metadataSchema,
                                  projectionMetadataByKey: cellProjectionConfig.objectValueMetadataByKey
                                    ?? resolveObjectValueMetadataByKey({
                                      path: [...path, sourceIndex, ...fieldPath],
                                      value: cellValue,
                                      parentValue: item,
                                      schema: cellProjectionConfig.metadataSchema ?? cellProjectionConfig.objectValueSchema,
                                      host,
                                    }),
                                  onNavigate,
                                  onJumpToSource,
                                  onChange(nextValue) {
                                    onApplyValue(setValueAtPath(value, [sourceIndex, ...fieldPath], nextValue));
                                  },
                                })
                                : null}
                            </td>
                            );
                            })}
                          </tr>
                        </Fragment>
                      );
                    }

                    return (
                      <Fragment key={`${sourceIndex}:${String(item)}`}>
                        {renderArrayDropIndicator(displayIndex)}
                        {(() => {
                          const itemSchema = schema?.items;
                          const showInlineItemEditor = path.length > 0 && isInlineSchemaEditor(item, itemSchema, host);
                          return (
                        <tr
                          className={[
                            clickable ? "is-clickable" : "",
                            activeChildSegment === sourceIndex || isActiveReferenceRow ? "is-active-row" : "",
                            pressedRowIndex === sourceIndex ? "array-row--pressed" : "",
                            rowDragState?.sourceIndex === sourceIndex ? "array-row--dragging" : "",
                          ].filter(Boolean).join(" ")}
                          data-row-index={sourceIndex}
                          key={`${sourceIndex}:${String(item)}`}
                          onClick={clickable ? () => onNavigate([...path, sourceIndex]) : undefined}
                          ref={(element) => {
                            rowItemRefs.current[sourceIndex] = element;
                          }}
                        >
                          {showStructuralRowActions ? renderRowActions(sourceIndex, displayIndex, item) : null}
                          <td className={["array-column--sticky", "array-column--index", showStructuralRowActions ? "array-column--after-actions" : ""].filter(Boolean).join(" ")}>
                            <span className="array-cell-summary array-cell-summary--identity array-cell-summary--index">{displayIndex + 1}</span>
                          </td>
                          <td>
                            {showInlineItemEditor ? (
                              <div
                                onClick={(event) => event.stopPropagation()}
                                onPointerDown={(event) => event.stopPropagation()}
                              >
                                {renderPrimitiveEditor({
                                  value: item,
                                  ariaLabel: `Array item ${sourceIndex}`,
                                  schema: itemSchema,
                                  path: [...path, sourceIndex],
                                  host,
                                  readOnly: pageReadOnly,
                                  onOpenReference: onJumpToSource,
                                  showOpenReferenceButton: true,
                                  onUpdateSchema: canAuthorTableSchema && sourceId
                                    ? (updater) => onUpdateDocumentSchema?.(sourceId, [...path, sourceIndex], "self", updater)
                                    : undefined,
                                  discoverOptions: () => [...new Set(value
                                    .filter((entry): entry is string | number => typeof entry === "string" || typeof entry === "number"))],
                                  onChange(nextValue) {
                                    onApplyValue(setValueAtPath(value, [sourceIndex], nextValue));
                                  },
                                })}
                              </div>
                            ) : isNavigable(item) ? (
                              <button
                                className={["nested-entry-button", "inline", getTypeToneClass(item, host)].filter(Boolean).join(" ")}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onNavigate([...path, sourceIndex]);
                                }}
                              >
                                <span className="nested-entry-icon" aria-hidden="true">
                                  {getStructureIcon(item, host)}
                                </span>
                                {renderNestedEntryContent(item, schema?.items, host, resolveNamedSchema, summarizeRowIdentity(item, sourceIndex, path, host))}
                              </button>
                            ) : (
                              renderPrimitiveEditor({
                                value: item,
                                ariaLabel: `Array item ${sourceIndex}`,
                                path: [...path, sourceIndex],
                                host,
                                readOnly: pageReadOnly,
                                onOpenReference: onJumpToSource,
                                showOpenReferenceButton: true,
                                onUpdateSchema: canAuthorTableSchema && sourceId
                                  ? (updater) => onUpdateDocumentSchema?.(sourceId, [...path, sourceIndex], "self", updater)
                                  : undefined,
                                discoverOptions: () => [...new Set(value
                                  .filter((entry): entry is string | number => typeof entry === "string" || typeof entry === "number"))],
                                onChange(nextValue) {
                                  onApplyValue(setValueAtPath(value, [sourceIndex], nextValue));
                                },
                              })
                            )}
                          </td>
                        </tr>
                          );
                        })()}
                      </Fragment>
                    );
                  })}
                    {rowDragState && rowDragState.targetIndex === rowDragState.orderedSourceIndexes.length ? renderArrayDropIndicator(rowDragState.targetIndex) : null}
                    {showStructuralRowActions && (showReferenceProjectionTable || showReferenceArrayPicker) ? (
                      renderReferenceAddRow({
                        columns: orderedColumns,
                        pickerAriaLabel: `${inferReferenceFieldLabel(schema, path)} 添加引用`,
                        pickerOptions: referenceOptions,
                        pickerDisabled: maxItemsReached,
                        onPick(valueToAdd) {
                          handleAppendReferenceValue(valueToAdd);
                        },
                        createDisabled: maxItemsReached || isCreatingReferenceRow,
                        onCreate: host?.createReferenceRow ? handleCreateReferenceRow : undefined,
                      })
                    ) : null}
                    {showStructuralRowActions && !showReferenceProjectionTable && !showReferenceArrayPicker && pendingRow !== null ? (
                      renderPendingArrayRow({
                        value,
                        pendingRow,
                        columns: orderedColumns,
                        objectRows,
                        host,
                        useMergedValueCell: showReferenceProjectionTable,
                        onChangePendingRow: setPendingRow,
                        onCreate() {
                          if (maxItemsReached) {
                            return;
                          }
                          setSuppressRowActionsUntil(Date.now() + 450);
                          onApplyValue([...value, cloneJsonValue(pendingRow)]);
                          setPendingRow(createDefaultArrayRow([...value, pendingRow], schema?.items, host));
                        },
                        createDisabled: maxItemsReached,
                      })
                    ) : null}
                </tbody>
              </table>
            </div>
            </div>
            <section className="editor-actions-panel editor-actions-panel--table">
              <div className="editor-actions-row">
                {enableRawEditor && canEditCurrentPage ? (
                  <button className="ghost-button compact-button raw-toggle-button" type="button" onClick={() => setRawOpen((current) => !current)}>
                    Raw
                  </button>
                ) : null}
                {!pageReadOnly && canEditCurrentPage ? (
                  <button
                    className="ghost-button compact-button"
                    type="button"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={handleEditModeToggle}
                  >
                    {editMode ? "Done" : "Edit"}
                  </button>
                ) : null}
                {extraPageActions}
              </div>
            </section>
            {typeof document !== "undefined" && dragGhost ? createPortal(
              <div
                className="column-drag-ghost"
                style={{ left: dragGhost.x, top: dragGhost.y }}
              >
                <div className="column-drag-ghost-name">{dragGhost.label}</div>
              </div>,
              document.body,
            ) : null}
            {typeof document !== "undefined" && rowDragState ? createPortal(
              <div
                className="detail-property-ghost array-row-drag-ghost"
                style={{
                  top: rowDragState.ghostTop,
                  left: rowDragState.ghostLeft,
                  width: rowDragState.ghostWidth,
                  minHeight: rowDragState.ghostHeight,
                }}
              >
                <icons.dragHandle size={16} />
                <span className="detail-property-ghost-label">{rowDragState.ghostLabel}</span>
              </div>,
              document.body,
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

function HiddenFieldsToolbarAction({
  columns,
  isOpen,
  onToggle,
  onToggleColumn,
  onReorderVisible,
  triggerClassName,
  triggerIconOnly = false,
}: {
  columns: Array<{ key: string; label: string; visible: boolean }>;
  isOpen: boolean;
  onToggle: () => void;
  onToggleColumn: (columnKey: string) => void;
  onReorderVisible?: (orderedVisibleKeys: string[]) => void;
  triggerClassName?: string;
  triggerIconOnly?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLElement | null>>({});
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number } | null>(null);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    key: string;
    visibleKeys: string[];
    targetIndex: number;
    ghostTop: number;
    ghostLeft: number;
    ghostWidth: number;
    ghostHeight: number;
    ghostLabel: string;
  } | null>(null);

  const visibleColumns = columns.filter((column) => column.visible);
  const hiddenColumns = columns.filter((column) => !column.visible);

  useEffect(() => {
    if (!isOpen) return;
    const syncPanelPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const maxLeft = Math.max(FLOATING_PANEL_MARGIN, window.innerWidth - HIDDEN_FIELDS_PANEL_WIDTH - FLOATING_PANEL_MARGIN);
      const belowTop = rect.bottom + 8;
      const top = belowTop + HIDDEN_FIELDS_PANEL_ESTIMATED_HEIGHT <= window.innerHeight
        ? belowTop
        : Math.max(FLOATING_PANEL_MARGIN, rect.top - HIDDEN_FIELDS_PANEL_ESTIMATED_HEIGHT - 8);
      setPanelPosition({ left: Math.min(Math.max(FLOATING_PANEL_MARGIN, rect.left), maxLeft), top });
    };
    syncPanelPosition();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onToggle();
    };
    window.addEventListener("resize", syncPanelPosition);
    window.addEventListener("scroll", syncPanelPosition, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("resize", syncPanelPosition);
      window.removeEventListener("scroll", syncPanelPosition, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [isOpen, onToggle]);

  function handleVisibleDragStart(
    key: string,
    label: string,
    event: { button: number; clientY: number; preventDefault: () => void; stopPropagation: () => void },
  ) {
    if (visibleColumns.length <= 1) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startOrder = visibleColumns.map((column) => column.key);
    const startRect = itemRefs.current[key]?.getBoundingClientRect();
    if (!startRect) return;
    const startY = event.clientY;
    let dragging = false;
    let currentTargetIndex = startOrder.indexOf(key);
    setPressedKey(key);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      if (!dragging && Math.abs(deltaY) <= 4) return;
      if (!dragging) {
        dragging = true;
        document.body.classList.add("is-dragging-detail-property");
      }
      const restOrder = startOrder.filter((entry) => entry !== key);
      const slots = restOrder.map((entry) => {
        const element = itemRefs.current[entry];
        const rect = element?.getBoundingClientRect();
        return rect ? { key: entry, center: rect.top + rect.height / 2 } : null;
      }).filter((entry): entry is { key: string; center: number } => Boolean(entry));
      currentTargetIndex = slots.length;
      for (let index = 0; index < slots.length; index += 1) {
        if (moveEvent.clientY <= slots[index].center) {
          currentTargetIndex = index;
          break;
        }
      }
      setDragState({
        key,
        visibleKeys: startOrder,
        targetIndex: currentTargetIndex,
        ghostTop: moveEvent.clientY - (startY - startRect.top),
        ghostLeft: startRect.left,
        ghostWidth: startRect.width,
        ghostHeight: startRect.height,
        ghostLabel: label,
      });
    };

    const finish = (nextOrder: string[] | null) => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.classList.remove("is-dragging-detail-property");
      setPressedKey(null);
      setDragState(null);
      if (nextOrder && !nextOrder.every((entry, index) => entry === startOrder[index])) {
        onReorderVisible?.(nextOrder);
      }
    };

    const onMouseUp = () => {
      finish(dragging ? insertDraggedItem(startOrder, key, currentTargetIndex) : null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function renderDropIndicator(index: number) {
    if (!dragState || dragState.targetIndex !== index) return null;
    return <div className="hidden-field-drop-indicator" aria-hidden="true" />;
  }

  return (
    <div className="toolbar-hidden-fields">
      <button
        aria-label="Column visibility"
        className={triggerClassName ?? "ghost-button icon-button toolbar-action-button"}
        ref={triggerRef}
        title="Column visibility"
        type="button"
        onClick={onToggle}
      >
        {triggerIconOnly ? <icons.visible size={15} /> : <icons.visible size={16} />}
      </button>
      {isOpen && panelPosition && typeof document !== "undefined" ? createPortal(
        <div
          className="hidden-fields-panel"
          ref={panelRef}
          style={{ left: `${panelPosition.left}px`, top: `${panelPosition.top}px` }}
        >
          <div className="hidden-fields-list">
            {visibleColumns.length > 0 ? <div className="hidden-fields-group-label">Visible</div> : null}
            {visibleColumns.map((column, index) => (
              <div className="hidden-field-stack" key={column.key}>
                {renderDropIndicator(index)}
                <div
                  className={[
                    "hidden-field-item",
                    "hidden-field-item--visible",
                    pressedKey === column.key ? "is-pressed" : "",
                    dragState?.key === column.key ? "is-dragging" : "",
                  ].filter(Boolean).join(" ")}
                  ref={(element) => {
                    itemRefs.current[column.key] = element;
                  }}
                >
                  {visibleColumns.length > 1 ? (
                    <button
                      aria-label={`Reorder ${column.label}`}
                      className="detail-property-handle hidden-field-reorder-handle"
                      title={`Reorder ${column.label}`}
                      type="button"
                      onMouseDown={(event) => handleVisibleDragStart(column.key, column.label, event)}
                    >
                      <icons.dragHandle size={14} />
                    </button>
                  ) : (
                    <div className="detail-property-spacer hidden-field-reorder-spacer" aria-hidden="true" />
                  )}
                  <button className="hidden-field-toggle" type="button" onClick={() => onToggleColumn(column.key)}>
                    <span>{column.label}</span>
                    <icons.visible size={15} />
                  </button>
                </div>
              </div>
            ))}
            {dragState && dragState.targetIndex === visibleColumns.length ? renderDropIndicator(visibleColumns.length) : null}
            {hiddenColumns.length > 0 ? <div className="hidden-fields-group-label">Hidden</div> : null}
            {hiddenColumns.map((column) => (
              <div className="hidden-field-item hidden-field-item--hidden" key={column.key}>
                <div className="detail-property-spacer hidden-field-reorder-spacer" aria-hidden="true" />
                <button className="hidden-field-toggle" type="button" onClick={() => onToggleColumn(column.key)}>
                  <span>{column.label}</span>
                  <icons.hidden size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function PrimitivePage({
  value,
  savedValue,
  sourceId,
  path,
  title,
  host,
  schema,
  validationResult,
  isReference = false,
  referenceScopeDepth,
  referenceSourceLabel,
  onNavigateUp,
  onClosePage,
  pageHeaderActions,
  onJumpToSource,
  onApplyValue,
  onEditModeChange,
  readOnly = false,
  enableRawEditor = true,
  renderPageActionButtons,
}: ValueInspectorProps) {
  const [rawOpen, setRawOpen] = useState(false);
  const pathKey = path.join("/");
  const canEditCurrentPage = Boolean(onEditModeChange);
  const extraPageActions = canEditCurrentPage ? renderPageActionButtons?.() : null;
  const schemaState = schema
    ? resolveNode({
      rootSchema: schema,
      documents: { current: value },
      sourceId: "current",
      path: [],
      value,
    })
    : undefined;
  const pageReadOnly = readOnly || schemaState?.constraints.readOnly === true;

  useEffect(() => {
    setRawOpen(false);
  }, [pathKey, value]);

  return (
    <section className={["node-page", "node-page--primitive", ...getSchemaClassNames(schema)].join(" ")}>
      <PageHeader
        path={path}
        title={title}
        isReference={isReference}
        referenceScopeDepth={referenceScopeDepth}
        referenceSourceLabel={referenceSourceLabel}
        onNavigateUp={onNavigateUp}
        onClosePage={onClosePage}
        pageHeaderActions={pageHeaderActions}
      />
      <SchemaControlBar
        schema={schema}
        schemaState={schemaState}
        value={value}
        readOnly={pageReadOnly}
        onApplyValue={onApplyValue}
      />
      <div className="node-page__content">
        {rawOpen ? (
          <RawJsonEditor
            readOnly={pageReadOnly}
            value={value}
            schema={schema}
            onApplyValue={(nextValue) => {
              onApplyValue(nextValue);
              setRawOpen(false);
            }}
          />
        ) : (
          <div className="object-page-body">
            <div className="object-scroll">
              <div className="property-list">
                <section className={["property-block", "object-field-row", ...getSchemaClassNames(schema), isFieldDirty(value, savedValue) ? "object-field-row--dirty" : ""].filter(Boolean).join(" ")}>
                  <div className="property-heading">
                    <span className="property-heading__label">
                      {renderTypeIcon(describeType(value))}
                      <span>{schema?.title ?? (path.at(-1) == null ? "value" : String(path.at(-1)))}</span>
                    </span>
                    <div className="property-heading__actions">
                      {renderNullableTypeButton({
                        value,
                        schema,
                        readOnly: pageReadOnly,
                        onSetNull: () => onApplyValue(null),
                      })}
                    </div>
                  </div>
                  {schema?.description ? <div className="form-hint">{schema.description}</div> : null}
                  {renderPrimitiveEditor({
                    value,
                    ariaLabel: `Field ${path.at(-1) == null ? "value" : String(path.at(-1))}`,
                    schema,
                    path,
                    host,
                    readOnly: pageReadOnly,
                    onOpenReference: onJumpToSource,
                    showOpenReferenceButton: true,
                    onChange: onApplyValue,
                  })}
                  {getFieldError(validationResult, sourceId, path) ? (
                    <div className="form-hint form-hint--danger">{getFieldError(validationResult, sourceId, path)?.message}</div>
                  ) : null}
                </section>
              </div>
            </div>
            <section className="editor-actions-panel">
              <div className="editor-actions-row">
                {enableRawEditor && canEditCurrentPage ? (
                  <button className="ghost-button compact-button raw-toggle-button" type="button" onClick={() => setRawOpen((current) => !current)}>
                    Raw
                  </button>
                ) : null}
                {extraPageActions}
              </div>
            </section>
          </div>
        )}
      </div>
    </section>
  );
}

function ReferenceErrorPage({
  path,
  title,
  schema,
  referenceError,
  referenceScopeDepth,
  referenceSourceLabel,
  onNavigateUp,
  onClosePage,
  pageHeaderActions,
}: ValueInspectorProps & { referenceError: ReferenceErrorInfo }) {
  return (
    <section className={["node-page", "node-page--primitive", ...getSchemaClassNames(schema)].join(" ")}>
      <PageHeader
        path={path}
        title={title ?? "Reference Error"}
        isReference
        referenceScopeDepth={referenceScopeDepth}
        referenceSourceLabel={referenceSourceLabel}
        onNavigateUp={onNavigateUp}
        onClosePage={onClosePage}
        pageHeaderActions={pageHeaderActions}
      />
      <div className="node-page__content">
        <div className="object-page-body">
          <div className="object-scroll">
            <div className="property-list">
              <section className={["property-block", "object-field-row", ...getSchemaClassNames(schema)].join(" ")}>
                <div className="property-heading">
                  <span>Reference Error</span>
                  {renderTypeIcon("reference")}
                </div>
                <div className="form-hint form-hint--danger">{referenceError.message}</div>
                <div className="form-hint">{referenceError.uri}</div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PageHeader(props: {
  path: JsonPath;
  title?: string;
  isReference: boolean;
  referenceScopeDepth?: number;
  referenceSourceLabel?: string;
  onNavigateUp?: () => void;
  onClosePage?: () => void;
  pageHeaderActions?: ReactNode;
}) {
  return (
    <div
      className={[
        "detail-header",
        "detail-header--page",
        props.referenceScopeDepth ? `detail-header--ref-scope-${((props.referenceScopeDepth - 1) % 7) + 1}` : "",
      ].filter(Boolean).join(" ")}
    >
      <div className="page-header__title">
        {props.onNavigateUp ? (
          <button aria-label="Go up one level" className="ghost-button compact-button page-back-button" type="button" onClick={props.onNavigateUp}>
            {"<"}
          </button>
        ) : null}
        {props.pageHeaderActions}
        <div className="detail-title">{props.title ?? formatPath(props.path)}</div>
      </div>
      <div className="page-header__actions">
        {props.referenceSourceLabel ? <div className="detail-source-label">{props.referenceSourceLabel}</div> : null}
        {props.onClosePage ? (
          <button aria-label="Close right page" className="ghost-button compact-button" type="button" onClick={props.onClosePage}>
            <icons.closeRightPage size={16} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SchemaControlBar(props: {
  schema?: EditorSchema;
  schemaState?: ReturnType<typeof resolveNode>;
  value: unknown;
  readOnly?: boolean;
  onApplyValue: (nextValue: unknown) => void;
}) {
  const unionCapabilities = props.schemaState?.unionCapabilities;
  if (!unionCapabilities || props.readOnly) {
    return null;
  }

  const activeOption = unionCapabilities.activeOptionIndex;
  return (
    <div className="property-list" style={{ paddingTop: 10, paddingBottom: 0 }}>
      <section className={["property-block", "object-field-row", ...getSchemaClassNames(props.schema)].join(" ")}>
        <div className="property-heading">
          <span>Schema branch</span>
          <small className="field-type">{unionCapabilities.kind}</small>
        </div>
        <select
          aria-label="Schema branch"
          className="detail-input"
          value={String(activeOption ?? 0)}
          onChange={(event) => {
            const targetIndex = Number(event.target.value);
            props.onApplyValue(switchUnionBranch(props.value, props.schema, targetIndex));
          }}
        >
          {unionCapabilities.options.map((option) => (
            <option key={option.index} value={option.index}>
              {option.title}
            </option>
          ))}
        </select>
      </section>
    </div>
  );
}

function RawJsonEditor(props: { value: unknown; schema?: EditorSchema; readOnly?: boolean; onApplyValue: (nextValue: unknown) => void }) {
  const [draft, setDraft] = useState(() => JSON.stringify(props.value, null, 2));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(JSON.stringify(props.value, null, 2));
    setErrorMessage(null);
  }, [props.value]);

  function handleApplyJson() {
    try {
      const nextValue = JSON.parse(draft);
      if (props.schema) {
        const validation = validateNodeBySchema(props.schema, nextValue);
        if (!validation.valid) {
          const fieldMessage = validation.fieldErrors?.[0]?.message;
          const documentMessage = validation.documentErrors?.[0];
          setErrorMessage(fieldMessage ?? documentMessage ?? "Schema validation failed");
          return;
        }
      }
      setErrorMessage(null);
      props.onApplyValue(nextValue);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Invalid JSON");
    }
  }

  return (
    <section className="property-block raw-json-panel">
      <div className="property-heading">
        <span>Raw JSON</span>
      </div>
      <div className="json-editor">
        <textarea
          aria-invalid={errorMessage ? "true" : "false"}
          aria-label="JSON value editor"
          readOnly={props.readOnly}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (errorMessage) {
              setErrorMessage(null);
            }
          }}
        />
        <div className="json-actions">
          {errorMessage ? (
            <div className="raw-json-error-banner" role="alert">
              {errorMessage}
            </div>
          ) : null}
          {!props.readOnly ? (
            <button className="primary-button" type="button" onClick={handleApplyJson}>
              Apply JSON
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function renderPrimitiveEditor(props: {
  value: unknown;
  ariaLabel: string;
  schema?: EditorSchema;
  path: JsonPath;
  host?: EditorHost;
  readOnly?: boolean;
  onOpenReference?: (sourceId: string) => void;
  showOpenReferenceButton?: boolean;
  onUpdateSchema?: (updater: (schema: EditorSchema) => EditorSchema) => void;
  /** 字段未声明 options/optionsSource/reference 时，从数据行发现候选值供 label 管理。 */
  discoverOptions?: () => Array<string | number>;
  onChange: (nextValue: unknown) => void;
}) {
  const effectiveSchema = resolveImplicitAssetPickerSchema(props.value, props.schema, props.path);
  const readOnly = props.readOnly || effectiveSchema?.readOnly === true || effectiveSchema?.const !== undefined;
  const nullableBranch = getNullableBranchSchema(effectiveSchema);
  const nullableLabel = getNullableBranchLabel(nullableBranch);
  const usesImplicitAssetPicker = Boolean(
    effectiveSchema?.["x-editor"]?.fieldType === "asset-picker"
    && !props.schema?.["x-editor"]?.fieldType
    && !props.schema?.["x-editor"]?.optionsSource,
  );
  const rawEditorOptionsState = resolveEditorOptions(effectiveSchema, props.host);
  const editorOptionsState = rawEditorOptionsState.error && usesImplicitAssetPicker
    ? { options: [], error: null }
    : rawEditorOptionsState;
  const disableImplicitAssetPickerUi = usesImplicitAssetPicker && editorOptionsState.options.length === 0;
  const selectFieldOptions = resolveSelectFieldOptions(effectiveSchema, props.host, { path: props.path, value: props.value }, props.discoverOptions);
  // reference 字段开放颜色与排序编辑（物化写回 schema options，合并时覆盖引用选项显示）；
  // 快速创建、重命名、删除仍关闭——选项存在性与名称归属宿主引用。
  const isReferenceField = Boolean(
    effectiveSchema?.["x-editor"]?.reference
    || effectiveSchema?.items?.["x-editor"]?.reference,
  );
  const canAuthorOptions = Boolean(
    props.onUpdateSchema
    && (effectiveSchema?.["x-editor"]?.options || props.discoverOptions || isReferenceField),
  );
  const canAuthorOptionValue = canAuthorOptions && !isReferenceField;
  const commitOptionSchema = canAuthorOptions
    ? (updater: (schema: EditorSchema) => EditorSchema) => props.onUpdateSchema?.((currentSchema) => {
      // 首次编辑前把当前解析出的选项（静态/引用/发现）物化为 schema options，编辑才有操作对象。
      if (!currentSchema["x-editor"]?.options?.length && selectFieldOptions.length > 0) {
        return updater({
          ...currentSchema,
          "x-editor": {
            ...currentSchema["x-editor"],
            options: selectFieldOptions.map((option) => ({ value: option.value, label: option.label, color: option.color ?? undefined })),
          },
        });
      }
      return updater(currentSchema);
    })
    : undefined;
  const referenceOptions = effectiveSchema?.["x-editor"]?.reference && props.host?.getReferenceOptions
    ? props.host.getReferenceOptions({
      path: props.path,
      value: props.value,
      schema: effectiveSchema,
      reference: effectiveSchema["x-editor"]?.reference,
    })
    : [];
  const shouldRenderOpenReferenceButton = props.showOpenReferenceButton && getReferenceUri(props.value, props.host, { path: props.path, schema: effectiveSchema }) != null;
  const openReferenceSourceId = inferOpenableReferenceSourceId(props.value, props.host, props.path, effectiveSchema);
  const canOpenReference = Boolean(shouldRenderOpenReferenceButton && props.onOpenReference && openReferenceSourceId);

  if (editorOptionsState.error) {
    return (
      <div className="schema-editor-error">
        <input
          aria-label={props.ariaLabel}
          className="detail-input"
          disabled={readOnly}
          value={typeof props.value === "string" ? props.value : String(props.value ?? "")}
          onChange={(event) => props.onChange(event.target.value)}
        />
        <div className="form-hint form-hint--danger">{editorOptionsState.error}</div>
      </div>
    );
  }

  if (effectiveSchema?.["x-editor"]?.fieldType === "multi-select" && (props.value == null || Array.isArray(props.value))) {
    const supportsOptionsSourceColorEditing = Boolean(
      effectiveSchema?.["x-editor"]?.optionsSource?.colorField
      && props.host?.setOptionsSourceOptionColor,
    );
    return withNullableControls(
      <SchemaOptionFieldEditor
        allowAuthoring={canAuthorOptions}
        ariaLabel={props.ariaLabel}
        mode="multi"
        options={selectFieldOptions}
        readOnly={readOnly}
        value={Array.isArray(props.value) ? props.value as Array<string | number> : []}
        onEdit={(nextValue) => props.onChange(nextValue)}
        onCreateOption={canAuthorOptionValue
          ? (nextValue) => commitOptionSchema?.((currentSchema) => appendEditorOption(currentSchema, nextValue))
          : undefined}
        onDeleteOption={canAuthorOptionValue
          ? (optionValue) => commitOptionSchema?.((currentSchema) => deleteEditorOption(currentSchema, optionValue))
          : undefined}
        onMoveOption={commitOptionSchema
          ? (optionValue, direction) => commitOptionSchema?.((currentSchema) => moveEditorOption(currentSchema, optionValue, direction))
          : undefined}
        onReorderOptions={commitOptionSchema
          ? (orderedValues) => commitOptionSchema?.((currentSchema) => reorderEditorOptions(currentSchema, orderedValues))
          : undefined}
        onRenameOption={canAuthorOptionValue
          ? (previousValue, nextValue) => commitOptionSchema?.((currentSchema) => renameEditorOption(currentSchema, previousValue, nextValue))
          : undefined}
        onSetOptionColor={
          commitOptionSchema
            ? (optionValue, color) => commitOptionSchema?.((currentSchema) => recolorEditorOption(currentSchema, optionValue, color))
            : supportsOptionsSourceColorEditing
            ? (optionValue, color) => props.host?.setOptionsSourceOptionColor?.({
              uri: effectiveSchema?.["x-editor"]?.optionsSource?.uri ?? "",
              optionValue,
              color,
            })
            : undefined
        }
        placeholder="Select or create options"
      />,
      nullableBranch,
      readOnly,
      () => props.onChange(null),
    );
  }

  if (effectiveSchema?.["x-editor"]?.fieldType === "asset-picker" && !disableImplicitAssetPickerUi) {
    const assetPickerValue = Array.isArray(props.value)
      ? props.value as Array<string | number>
      : props.value == null || props.value === ""
        ? []
        : [props.value as string | number];
    const assetPickerMode = Array.isArray(props.value) || effectiveSchema?.type === "array" ? "multi" : "single";
    const imageDisplay = resolveImageDisplayConfig(effectiveSchema, "field-editor", props.path);
    if (assetPickerMode === "single" && imageDisplay.kind === "image") {
      const textValue = typeof props.value === "string" ? props.value : "";
      return withNullableControls(
        <div
          className={[
            "image-field-editor",
            "image-field-editor--picker",
            ...getSchemaClassNames(effectiveSchema),
          ].filter(Boolean).join(" ")}
        >
          {textValue.trim().length > 0 ? (
            <ImagePreview value={textValue} schema={effectiveSchema} host={props.host} context="field-editor" path={props.path} />
          ) : (
            <span className="image-field-editor__empty">未设置图片</span>
          )}
          <div className="image-field-editor__control">
            <AssetPickerFieldEditor
              ariaLabel={props.ariaLabel}
              mode="single"
              options={editorOptionsState.options}
              previewVisibility="options-only"
              readOnly={readOnly}
              resolvePreviewUrl={(value) => props.host?.resolveDisplayUrl?.(value, effectiveSchema) ?? value}
              schema={effectiveSchema}
              value={assetPickerValue}
              onEdit={(nextValue) => props.onChange(nextValue[0] ?? "")}
              placeholder="选择图片"
            />
          </div>
        </div>,
        nullableBranch,
        readOnly,
        () => props.onChange(null),
      );
    }
    return withNullableControls(
      <AssetPickerFieldEditor
        ariaLabel={props.ariaLabel}
        mode={assetPickerMode}
        options={editorOptionsState.options}
        readOnly={readOnly}
        resolvePreviewUrl={(value) => props.host?.resolveDisplayUrl?.(value, effectiveSchema) ?? value}
        schema={effectiveSchema}
        value={assetPickerValue}
        onEdit={(nextValue) => props.onChange(assetPickerMode === "multi" ? nextValue : (nextValue[0] ?? ""))}
        placeholder={assetPickerMode === "multi" ? "添加资源" : "选择资源"}
      />,
      nullableBranch,
      readOnly,
      () => props.onChange(null),
    );
  }

  if (selectFieldOptions.length > 0 && effectiveSchema?.["x-editor"]?.fieldType === "select") {
    const supportsOptionsSourceColorEditing = Boolean(
      effectiveSchema?.["x-editor"]?.optionsSource?.colorField
      && props.host?.setOptionsSourceOptionColor,
    );
    return withNullableControls(
      <SchemaOptionFieldEditor
        allowAuthoring={canAuthorOptions}
        ariaLabel={props.ariaLabel}
        mode="single"
        options={selectFieldOptions}
        readOnly={readOnly}
        value={props.value == null || props.value === "" ? [] : [props.value as string | number]}
        onEdit={(nextValue) => props.onChange(nextValue[0] ?? "")}
        onCreateOption={canAuthorOptionValue
          ? (nextValue) => commitOptionSchema?.((currentSchema) => appendEditorOption(currentSchema, nextValue))
          : undefined}
        onDeleteOption={canAuthorOptionValue
          ? (optionValue) => commitOptionSchema?.((currentSchema) => deleteEditorOption(currentSchema, optionValue))
          : undefined}
        onMoveOption={commitOptionSchema
          ? (optionValue, direction) => commitOptionSchema?.((currentSchema) => moveEditorOption(currentSchema, optionValue, direction))
          : undefined}
        onReorderOptions={commitOptionSchema
          ? (orderedValues) => commitOptionSchema?.((currentSchema) => reorderEditorOptions(currentSchema, orderedValues))
          : undefined}
        onRenameOption={canAuthorOptionValue
          ? (previousValue, nextValue) => commitOptionSchema?.((currentSchema) => renameEditorOption(currentSchema, previousValue, nextValue))
          : undefined}
        onSetOptionColor={
          commitOptionSchema
            ? (optionValue, color) => commitOptionSchema?.((currentSchema) => recolorEditorOption(currentSchema, optionValue, color))
            : supportsOptionsSourceColorEditing
            ? (optionValue, color) => props.host?.setOptionsSourceOptionColor?.({
              uri: effectiveSchema?.["x-editor"]?.optionsSource?.uri ?? "",
              optionValue,
              color,
            })
            : undefined
        }
        placeholder="Select an option"
      />,
      nullableBranch,
      readOnly,
      () => props.onChange(null),
    );
  }

  if (nullableBranch) {
    if (props.value === null) {
      return (
        <div className="nullable-editor">
          <button
            className="ghost-button compact-button"
            type="button"
            disabled={readOnly}
            onClick={() => props.onChange(createDefaultValue(nullableBranch))}
          >
            {`Set ${nullableLabel} value`}
          </button>
          <div className="form-hint">This field currently stores null.</div>
        </div>
      );
    }
  }

  if (referenceOptions.length > 0) {
    return withNullableControls(
      <div className="reference-picker-field">
        <div className="reference-picker-field__picker">
          <AssetPickerFieldEditor
            ariaLabel={props.ariaLabel}
            mode="single"
            options={referenceOptions.map((option) => ({
              value: option.value,
              label: option.label,
              color: null,
              description: option.description,
            }))}
            readOnly={readOnly}
            schema={effectiveSchema}
            value={props.value == null || props.value === "" ? [] : [String(props.value)]}
            onEdit={(nextValue) => props.onChange(nextValue[0] ?? "")}
            placeholder="选择引用"
          />
        </div>
        {shouldRenderOpenReferenceButton ? (
          <button
            aria-label={`Open ${props.ariaLabel}`}
            className="ghost-button compact-button reference-picker-field__open"
            disabled={!canOpenReference}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (!props.onOpenReference || !openReferenceSourceId) {
                return;
              }
              props.onOpenReference(openReferenceSourceId);
            }}
          >
            <icons.next size={14} />
          </button>
        ) : null}
      </div>,
      nullableBranch,
      readOnly,
      () => props.onChange(null),
    );
  }

  if (props.schema?.enum?.length) {
    return withNullableControls(
      <select
        aria-label={props.ariaLabel}
        className="detail-input"
        disabled={readOnly}
        value={String(props.value ?? "")}
        onChange={(event) => props.onChange(coerceSchemaEnumValue(event.target.value, props.schema?.enum ?? []))}
      >
        {props.schema.enum.map((option) => (
          <option key={String(option)} value={String(option)}>
            {String(option)}
          </option>
        ))}
      </select>,
      nullableBranch,
      readOnly,
      () => props.onChange(null),
    );
  }

  if (typeof props.value === "boolean") {
    return withNullableControls(
      <label className="checkbox-field">
        <input
          aria-label={props.ariaLabel}
          checked={props.value}
          disabled={readOnly}
          type="checkbox"
          onChange={(event) => props.onChange(event.target.checked)}
        />
        <span>{props.value ? "True" : "False"}</span>
      </label>,
      nullableBranch,
      readOnly,
      () => props.onChange(null),
    );
  }

  if (typeof props.value === "number") {
    return withNullableControls(
        <input
          aria-label={props.ariaLabel}
          className="detail-input"
          disabled={readOnly}
          type="number"
          step={props.schema?.multipleOf ?? (props.schema?.type === "integer" ? 1 : "any")}
          min={props.schema?.exclusiveMinimum ?? props.schema?.minimum}
          max={props.schema?.exclusiveMaximum ?? props.schema?.maximum}
          value={String(props.value)}
          onChange={(event) => props.onChange(Number(event.target.value))}
        />,
      nullableBranch,
      readOnly,
      () => props.onChange(null),
    );
  }

  if (props.value === null && !props.schema?.enum?.length) {
    return (
      <input
        aria-label={props.ariaLabel}
        className="detail-input"
        disabled={readOnly}
        value="null"
        onChange={(event) => props.onChange(event.target.value === "null" ? null : event.target.value)}
      />
    );
  }

  const text = typeof props.value === "string" ? props.value : String(props.value ?? "");
  const imageDisplay = resolveImageDisplayConfig(props.schema, "field-editor", props.path);
  const imagePreset = resolveImageDisplayPreset(props.schema, props.path);
  if (typeof props.value === "string" && imageDisplay.kind === "image") {
    return withNullableControls(
      <div
        className={[
          "image-field-editor",
          imagePreset ? `image-field-editor--${imagePreset}` : "",
          ...getSchemaClassNames(props.schema),
        ].filter(Boolean).join(" ")}
      >
        {text.trim().length > 0 ? (
          <ImagePreview value={text} schema={props.schema} host={props.host} context="field-editor" path={props.path} />
        ) : (
          <span className="image-field-editor__empty">未设置图片</span>
        )}
        <input
          aria-label={props.ariaLabel}
          className="detail-input"
          disabled={readOnly}
          maxLength={props.schema?.maxLength}
          minLength={props.schema?.minLength}
          pattern={props.schema?.pattern}
          value={text}
          onChange={(event) => props.onChange(event.target.value)}
        />
      </div>,
      nullableBranch,
      readOnly,
      () => props.onChange(null),
    );
  }
  if (props.schema?.["x-editor"]?.fieldType === "textarea") {
    return withNullableControls(
      <textarea
        aria-label={props.ariaLabel}
        className="detail-input detail-textarea"
        disabled={readOnly}
        rows={getMultilineEditorRows(text)}
        value={text}
        onChange={(event) => props.onChange(event.target.value)}
      />,
      nullableBranch,
      readOnly,
      () => props.onChange(null),
    );
  }
  if (shouldUseMultilineEditor(text)) {
    return withNullableControls(
        <textarea
          aria-label={props.ariaLabel}
          className="detail-input detail-textarea"
          disabled={readOnly}
          rows={getMultilineEditorRows(text)}
          value={text}
          onChange={(event) => props.onChange(event.target.value)}
      />,
      nullableBranch,
      readOnly,
      () => props.onChange(null),
    );
  }

  return withNullableControls(
    <input
      aria-label={props.ariaLabel}
      className="detail-input"
      disabled={readOnly}
      maxLength={props.schema?.maxLength}
      minLength={props.schema?.minLength}
      pattern={props.schema?.pattern}
      value={text}
      onChange={(event) => props.onChange(event.target.value)}
    />,
    nullableBranch,
    readOnly,
    () => props.onChange(null),
  );
}

function withNullableControls(
  control: ReactNode,
  nullableBranch: EditorSchema | undefined,
  readOnly: boolean,
  onSetNull: () => void,
) {
  void nullableBranch;
  void readOnly;
  void onSetNull;
  return control;
}

function renderNullableTypeButton(props: {
  value: unknown;
  schema?: EditorSchema;
  readOnly: boolean;
  onSetNull: () => void;
}) {
  if (props.value === null || !getNullableBranchSchema(props.schema)) {
    return null;
  }
  return (
    <button
      aria-label="Set null"
      className="field-type-button"
      type="button"
      disabled={props.readOnly}
      onClick={props.onSetNull}
    >
      null
    </button>
  );
}

function getNullableBranchSchema(schema?: EditorSchema): EditorSchema | undefined {
  if (!schema) return undefined;
  if (Array.isArray(schema.type) && schema.type.includes("null")) {
    const nonNullTypes = schema.type.filter((type) => type !== "null");
    if (nonNullTypes.length === 1) {
      return {
        ...schema,
        type: nonNullTypes[0],
      };
    }
  }
  const unionOptions = schema.oneOf ?? schema.anyOf;
  if (!unionOptions?.length) return undefined;
  return unionOptions.find((option) => {
    if (option.const === null) return false;
    if (Array.isArray(option.type)) return !option.type.every((type) => type === "null");
    return option.type !== "null";
  });
}

function getNullableBranchLabel(schema?: EditorSchema): string {
  if (!schema) return "value";
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (typeof type === "string") return type;
  if (schema.properties || schema.additionalProperties || schema.patternProperties) return "object";
  if (schema.items) return "array";
  if (schema.enum?.length) return typeof schema.enum[0];
  const fallback = createDefaultValue(schema);
  if (fallback === null) return "value";
  if (Array.isArray(fallback)) return "array";
  return typeof fallback === "object" ? "object" : typeof fallback;
}

type ReferenceViewColumn = {
  key: string;
  title: string;
  path: JsonPath;
  columnSchema?: EditorSchema;
};

type AvailableSchemaColumn = {
  key: string;
  field: JsonPath;
  label: string;
};

type ResolvedEditorOption = {
  value: string | number;
  label: string;
  color: EditorViewOptionColor | null;
  description?: string;
  preview?: string;
};

type ArrayDisplayRow = {
  item: unknown;
  sourceIndex: number;
};

function getArrayColumns(
  items: unknown[],
  host?: EditorHost,
  itemSchema?: EditorSchema,
  referenceViewColumns: ReferenceViewColumn[] = [],
  configuredColumns: EditorTableColumn[] = [],
  hasExplicitConfiguredColumns = false,
) {
  if (hasExplicitConfiguredColumns && (configuredColumns.length > 0 || !isPrimitiveArray(items, itemSchema, host))) {
    return ["#", ...configuredColumns.map((column) => getTableColumnId(column))];
  }
  if (referenceViewColumns.length > 0) {
    return ["#", ...referenceViewColumns.map((column) => column.key)];
  }
  if (hasObjectTableRows(items, host)) {
    const columns = new Set<string>();
    for (const key of Object.keys(itemSchema?.properties ?? {})) {
      columns.add(key);
    }
    for (const item of items) {
      if (!isObjectTableRow(item, host)) continue;
      for (const key of Object.keys(item as Record<string, unknown>)) columns.add(key);
    }
    return prioritizeArrayColumns([...columns]);
  }

  return ["#", "Value"];
}

/** 原始值数组恒有 Value 列；空 columns 只对 object / 引用投影有“隐藏字段”语义。 */
function isPrimitiveArray(items: unknown[], itemSchema?: EditorSchema, host?: EditorHost) {
  if (items.some((item) => Array.isArray(item) || isPlainObject(item) || isReferenceValue(item))) return false;
  const type = itemSchema?.type;
  if (Array.isArray(type)) return type.every((entry) => entry === "string" || entry === "number" || entry === "integer" || entry === "boolean" || entry === "null");
  return type === undefined || type === "string" || type === "number" || type === "integer" || type === "boolean" || type === "null";
}

function describeObjectFields(value: Record<string, unknown>) {
  return Object.entries(value);
}

function prioritizeArrayColumns(columns: string[]) {
  const preferredOrder = ["id", "name", "title", "label", "key"];
  const preferred = preferredOrder.filter((column) => columns.includes(column));
  const remaining = columns.filter((column) => !preferred.includes(column));
  return [...preferred, ...remaining];
}

function getArrayColumnWidths(
  items: unknown[],
  columns: string[],
  host?: EditorHost,
  itemSchema?: EditorSchema,
  referenceViewColumns: ReferenceViewColumn[] = [],
  configuredColumns: EditorTableColumn[] = [],
  resolveNamedSchema?: (name: string) => EditorSchema | undefined,
) {
  const widths: Record<string, number> = {};
  const sampleSize = Math.min(items.length, 40);

  for (const column of columns) {
    const referenceColumn = findReferenceColumn(column, configuredColumns, referenceViewColumns, itemSchema, resolveNamedSchema);
    const configuredColumn = findConfiguredTableColumn(configuredColumns, column);
    if (configuredColumn?.width) {
      widths[column] = configuredColumn.width;
      continue;
    }
    if (referenceColumn) {
      if (isImageDisplaySchema(referenceColumn.columnSchema)) {
        const preview = referenceColumn.columnSchema?.["x-editor"]?.display?.preview;
        const previewWidth = preview?.width ?? 40;
        widths[column] = Math.max(72, Math.min(120, previewWidth + 32));
        continue;
      }
      const headerWidth = measureColumnText(configuredColumn?.label ?? referenceColumn.title);
      let contentWidth = headerWidth;
      for (let index = 0; index < sampleSize; index += 1) {
        const cellText = getReferenceTableCellText(items[index], referenceColumn, itemSchema, host, resolveNamedSchema);
        contentWidth = Math.max(contentWidth, measureColumnText(cellText));
      }
      widths[column] = clampColumnWidth(contentWidth, configuredColumn?.label ?? referenceColumn.title);
      continue;
    }

    if (column === "#") {
      widths[column] = 45;
      continue;
    }

    const configuredPath = configuredColumn ? getTableColumnPath(configuredColumn) : [];
    const propertyKey = configuredPath.length === 1 && typeof configuredPath[0] === "string" ? configuredPath[0] : column;
    const headerWidth = measureColumnText(configuredColumn?.label ?? itemSchema?.properties?.[propertyKey]?.title ?? column);
    let contentWidth = headerWidth;

    if (hasObjectTableRows(items, host)) {
      for (let index = 0; index < sampleSize; index += 1) {
        const item = items[index];
        if (!isObjectTableRow(item, host)) continue;
        const record = item as Record<string, unknown>;
        const cellValue = configuredPath.length > 0 ? getValueAtPath(record, configuredPath) : record[column];
        contentWidth = Math.max(contentWidth, measureColumnText(previewValue(cellValue, host)));
      }
      widths[column] = clampColumnWidth(contentWidth, column);
      continue;
    }

    for (let index = 0; index < sampleSize; index += 1) {
      contentWidth = Math.max(contentWidth, measureColumnText(previewValue(items[index], host)));
    }
    widths[column] = clampColumnWidth(contentWidth, column);
  }

  return widths;
}

function applyViewportFillToColumnWidths(
  widths: Record<string, number>,
  columns: string[],
  tableViewportWidth: number,
  editMode: boolean,
) {
  const next = { ...widths };
  const trailingColumn = columns.at(-1);
  if (!trailingColumn) {
    return next;
  }
  const total = columns.reduce((sum, column) => sum + (next[column] ?? 140), 0);
  const extra = Math.max(0, tableViewportWidth - (total + (editMode ? 144 : 0)) - 1);
  if (extra > 0) {
    next[trailingColumn] = (next[trailingColumn] ?? 140) + extra;
  }
  return next;
}

function sameColumnWidthMap(left: Record<string, number>, right: Record<string, number>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => left[key] === right[key]);
}

function describeArrayColumnType(items: unknown[], column: string, host?: EditorHost, itemSchema?: EditorSchema) {
  if (column === "#") return "index";
  if (column === "Value" && !hasObjectTableRows(items, host)) {
    return describeSchemaType(itemSchema?.items ? itemSchema.items : itemSchema) ?? describeType(items[0], host);
  }
  if (column === "Value") return "value";

  const sample = items.find((item) => isPlainObject(item) && (item as Record<string, unknown>)[column] !== undefined) as
    | Record<string, unknown>
    | undefined;
  return describeType(sample?.[column], host);
}

function describeSchemaType(schema: EditorSchema | undefined) {
  if (!schema) return undefined;
  if (Array.isArray(schema.type)) {
    return schema.type.filter((type) => type !== "null")[0] ?? schema.type[0];
  }
  if (schema.type) return schema.type;
  if (schema.properties || schema.additionalProperties || schema.patternProperties) return "object";
  if (schema.items) return "array";
  return undefined;
}

function getConfiguredTableColumns(schema: EditorSchema | undefined) {
  return schema?.["x-editor"]?.table?.columns ?? [];
}

function hasSchemaTableColumns(schema: EditorSchema | undefined) {
  return Array.isArray(schema?.["x-editor"]?.table?.columns);
}

function usesAutomaticTableColumns(schema: EditorSchema | undefined) {
  return schema?.["x-editor"]?.table?.autoColumns === true;
}

function getArrayTableSchema(arraySchema: EditorSchema | undefined, itemSchema: EditorSchema | undefined) {
  if (arraySchema?.["x-editor"]?.table) {
    return arraySchema;
  }
  if (itemSchema?.["x-editor"]?.table) {
    return itemSchema;
  }
  return arraySchema;
}

function getAvailableSchemaColumns(schema: EditorSchema | undefined): AvailableSchemaColumn[] {
  if (!schema?.properties) return [];
  return Object.entries(schema.properties).map(([key, propertySchema]) => ({
    key,
    field: propertySchema["x-editor"]?.projection?.path ?? [key],
    label: propertySchema.title ?? key,
  }));
}

function getManagedTableColumns(
  configuredColumns: EditorTableColumn[],
  renderedColumns: string[],
  availableColumns: AvailableSchemaColumn[],
  hasExplicitConfiguredColumns = false,
) {
  if (hasExplicitConfiguredColumns) {
    return configuredColumns;
  }
  return renderedColumns
    .filter((key) => key !== "#")
    .filter((key) => availableColumns.some((entry) => entry.key === key))
    .map((key) => {
      const available = availableColumns.find((entry) => entry.key === key);
      return available && !isSimpleKeyField(available.field, key)
        ? { key, field: available.field }
        : { key };
    });
}

function setSchemaTableColumns(schema: EditorSchema, columns: EditorTableColumn[]): EditorSchema {
  return {
    ...schema,
    "x-editor": {
      ...schema["x-editor"],
      table: {
        autoColumns: false,
        columns,
      },
    },
  };
}

function moveTableColumn(columns: EditorTableColumn[], key: string, direction: "left" | "right") {
  const currentIndex = columns.findIndex((column) => getTableColumnId(column) === key);
  if (currentIndex < 0) return columns;
  const targetIndex = direction === "left" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= columns.length) return columns;
  const next = [...columns];
  const [entry] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, entry);
  return next;
}

function reorderColumnsByKeys(columns: EditorTableColumn[], orderedKeys: string[]) {
  if (orderedKeys.length === 0) return columns;
  const rank = new Map(orderedKeys.map((key, index) => [key, index]));
  return [...columns].sort((left, right) => {
    const leftRank = rank.get(getTableColumnId(left));
    const rightRank = rank.get(getTableColumnId(right));
    if (leftRank == null && rightRank == null) return 0;
    if (leftRank == null) return 1;
    if (rightRank == null) return -1;
    return leftRank - rightRank;
  });
}

function applyMeasuredColumnWidths(columns: EditorTableColumn[], measuredWidths: Map<string, number>) {
  if (measuredWidths.size === 0) return columns;
  return columns.map((column) => {
    const key = getTableColumnId(column);
    const measuredWidth = measuredWidths.get(key);
    if (!measuredWidth) return column;
    return { ...column, width: measuredWidth };
  });
}

function getRenderedTableColumnWidths(scrollContainer: HTMLElement | null) {
  const widths = new Map<string, number>();
  if (!scrollContainer) return widths;
  for (const cell of scrollContainer.querySelectorAll<HTMLElement>("th[data-column-field]")) {
    const key = cell.dataset.columnField;
    if (!key) continue;
    const measuredWidth = Math.round(cell.getBoundingClientRect().width);
    if (measuredWidth > 0) {
      widths.set(key, measuredWidth);
    }
  }
  return widths;
}

function getTableColumnId(column: EditorTableColumn) {
  if (column.key?.trim()) return column.key;
  return formatTableColumnPath(getTableColumnPath(column));
}

function getTableColumnPath(column: EditorTableColumn): JsonPath {
  if (Array.isArray(column.field)) return column.field;
  if (typeof column.field === "string" && column.field.trim()) return [column.field];
  if (column.key?.trim()) return [column.key];
  return [];
}

function formatTableColumnPath(path: JsonPath) {
  return path.join(".");
}

function isSimpleKeyField(path: JsonPath, key: string) {
  return path.length === 1 && path[0] === key;
}

function isSameJsonPath(left: JsonPath, right: JsonPath) {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

function findConfiguredTableColumn(columns: EditorTableColumn[], columnId: string) {
  return columns.find((entry) => getTableColumnId(entry) === columnId);
}

function findReferenceColumn(
  columnId: string,
  configuredColumns: EditorTableColumn[],
  referenceColumns: ReferenceViewColumn[],
  targetSchema?: EditorSchema,
  resolveNamedSchema?: (name: string) => EditorSchema | undefined,
) {
  const configuredColumn = findConfiguredTableColumn(configuredColumns, columnId);
  const configuredPath = configuredColumn ? getTableColumnPath(configuredColumn) : [];
  if (configuredPath.length > 0) {
    const matchedByPath = referenceColumns.find((entry) => isSameJsonPath(entry.path, configuredPath));
    if (matchedByPath) return matchedByPath;
    const targetFieldSchema = resolveReferenceProjectedFieldSchema(
      targetSchema,
      configuredPath,
      undefined,
      undefined,
      resolveNamedSchema,
    );
    if (targetFieldSchema) {
      return {
        key: columnId,
        title: targetFieldSchema.title ?? formatTableColumnPath(configuredPath),
        path: configuredPath,
        columnSchema: targetFieldSchema,
      };
    }
  }
  return referenceColumns.find((entry) => entry.key === columnId);
}

function getConfiguredColumnLabel(
  column: string,
  configuredColumn: EditorTableColumn | undefined,
  referenceColumn: ReferenceViewColumn | undefined,
  itemSchema: EditorSchema | undefined,
) {
  if (column === "#") return "#";
  const configuredPath = configuredColumn ? getTableColumnPath(configuredColumn) : [];
  const propertyKey = configuredPath.length === 1 && typeof configuredPath[0] === "string" ? configuredPath[0] : column;
  return configuredColumn?.label ?? referenceColumn?.title ?? itemSchema?.properties?.[propertyKey]?.title ?? column;
}

function buildArrayDisplayRows(
  items: unknown[],
  sortState: { key: string; direction: "asc" | "desc" } | null,
  referenceViewColumns: ReferenceViewColumn[],
  configuredColumns: EditorTableColumn[],
  itemSchema: EditorSchema | undefined,
  host?: EditorHost,
  targetSchema?: EditorSchema,
  resolveNamedSchema?: (name: string) => EditorSchema | undefined,
): ArrayDisplayRow[] {
  const rows = items.map((item, sourceIndex) => ({ item, sourceIndex }));
  if (!sortState) return rows;
  const configuredColumn = findConfiguredTableColumn(configuredColumns, sortState.key);
  if (!configuredColumn?.sortable) return rows;
  const referenceColumn = findReferenceColumn(sortState.key, configuredColumns, referenceViewColumns, targetSchema, resolveNamedSchema);
  return [...rows].sort((left, right) => {
    const leftValue = normalizeSortValue(left.item, sortState.key, configuredColumn, referenceColumn, itemSchema, host, resolveNamedSchema);
    const rightValue = normalizeSortValue(right.item, sortState.key, configuredColumn, referenceColumn, itemSchema, host, resolveNamedSchema);
    const result = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });
    return sortState.direction === "asc" ? result : -result;
  });
}

function normalizeSortValue(
  item: unknown,
  key: string,
  configuredColumn: EditorTableColumn | undefined,
  referenceColumn: ReferenceViewColumn | undefined,
  itemSchema: EditorSchema | undefined,
  host?: EditorHost,
  resolveNamedSchema?: (name: string) => EditorSchema | undefined,
) {
  if (referenceColumn) {
    return getReferenceTableCellText(item, referenceColumn, itemSchema, host, resolveNamedSchema).trim();
  }
  if (isPlainObject(item)) {
    const fieldPath = configuredColumn ? getTableColumnPath(configuredColumn) : [];
    const value = fieldPath.length > 0 ? getValueAtPath(item, fieldPath) : (item as Record<string, unknown>)[key];
    return previewValue(value, host).trim();
  }
  return previewValue(item, host).trim();
}

function clampColumnWidth(width: number, column: string) {
  const baseMin = isIdentityColumn(column) ? 96 : 120;
  const baseMax = isIdentityColumn(column) ? 220 : 360;
  return Math.max(baseMin, Math.min(baseMax, width));
}

function isIdentityColumn(column: string) {
  return ["id", "name", "title", "label", "key"].includes(column);
}

function measureColumnText(value: string) {
  const normalized = value.trim();
  const visibleLength = normalized.length || 4;
  return 32 + Math.min(visibleLength, 48) * 7.5;
}

function hasObjectTableRows(items: unknown[], host?: EditorHost) {
  return items.some((item) => isObjectTableRow(item, host));
}

function isObjectTableRow(item: unknown, host?: EditorHost) {
  return isPlainObject(item) && !isReferenceValue(item);
}

function summarizeRowIdentity(value: unknown, index: number, path: JsonPath, host?: EditorHost) {
  return host?.getArrayItemLabel?.(path, index, value)
    ?? inferValueTitle(value)
    ?? String(index);
}

function inferValueTitle(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (isPlainObject(value)) {
    const preferred = ["title", "name", "label", "id"];
    for (const key of preferred) {
      const candidate = value[key];
      if (typeof candidate === "string" && candidate) return candidate;
      if (typeof candidate === "number") return String(candidate);
    }
  }
  return null;
}

function inferReferenceSourceId(value: unknown, host?: EditorHost): string | null {
  const uri = getRenderableReferenceUri(value);
  if (!uri) {
    return null;
  }
  return host?.resolveReferenceSourceId?.(uri) ?? uri;
}

function inferOpenableReferenceSourceId(value: unknown, host?: EditorHost, path?: JsonPath, schema?: EditorSchema): string | null {
  const uri = getReferenceUri(value, host, { path, schema });
  if (!uri) {
    return null;
  }
  return host?.resolveReferenceSourceId?.(uri) ?? uri;
}

function isUriLikeString(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function getRenderableReferenceUri(value: unknown, schema?: EditorSchema): string | null {
  const jsonReferenceUri = getReferenceUri(value);
  if (jsonReferenceUri) {
    return jsonReferenceUri;
  }
  if (!schema?.["x-editor"]?.reference || !isUriLikeString(value)) {
    return null;
  }
  return value;
}

function describeType(value: unknown, host?: EditorHost): string {
  if (isReferenceValue(value)) return "reference";
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

type ObjectDraftType = "string" | "number" | "object" | "array";

function createDefaultValueForType(type: ObjectDraftType) {
  if (type === "number") return 0;
  if (type === "object") return {};
  if (type === "array") return [];
  return "";
}

function createDefaultArrayRow(items: unknown[], itemsSchema?: EditorSchema, host?: EditorHost) {
  if (itemsSchema) {
    return createDefaultArrayItem(itemsSchema);
  }

  if (items.length === 0) return {};

  if (hasObjectTableRows(items, host)) {
    const columns = getArrayColumns(items, host);
    const seed = items.find((item) => isObjectTableRow(item, host)) as Record<string, unknown> | undefined;
    const nextRow: Record<string, unknown> = {};
    for (const column of columns) {
      nextRow[column] = createEmptyValueFromSample(seed?.[column]);
    }
    return nextRow;
  }

  const sample = items[0];
  return createEmptyValueFromSample(sample);
}

function getAddablePropertyKeys(value: Record<string, unknown>, schema?: EditorSchema, supportsDynamicKeys = false) {
  if (!schema?.properties) {
    return supportsDynamicKeys ? [""] : [];
  }

  const keys = Object.keys(schema.properties).filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  return keys.length > 0 ? keys : (supportsDynamicKeys ? [""] : []);
}

function createEmptyValueFromSample(sample: unknown): unknown {
  if (Array.isArray(sample)) return [];
  if (isPlainObject(sample)) {
    const nextValue: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(sample)) {
      nextValue[key] = createEmptyValueFromSample(nestedValue);
    }
    return nextValue;
  }
  if (typeof sample === "number") return 0;
  if (typeof sample === "boolean") return false;
  if (sample === null) return null;
  return "";
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isFieldDirty(currentValue: unknown, savedValue: unknown) {
  if (savedValue === undefined) return false;
  return JSON.stringify(currentValue) !== JSON.stringify(savedValue);
}

function renderPendingArrayRow(props: {
  value: unknown[];
  pendingRow: unknown;
  columns: string[];
  objectRows: boolean;
  host?: EditorHost;
  useMergedValueCell?: boolean;
  onChangePendingRow: (nextRow: unknown) => void;
  onCreate: () => void;
  createDisabled?: boolean;
}) {
  if (props.useMergedValueCell) {
    const span = Math.max(1, props.columns.length);
    return (
      <tr className="array-row--pending" data-row-index="pending">
        <td className="array-column--sticky array-column--actions">
          <div className="row-action-buttons">
            <button
              className="primary-button compact-button"
              type="button"
              disabled={props.createDisabled}
              onPointerDown={(event) => event.preventDefault()}
              onClick={props.onCreate}
            >
              Create row
            </button>
          </div>
        </td>
        <td className="array-cell--pending-merged" colSpan={span}>
          {renderPendingArrayCell(props.pendingRow, props.onChangePendingRow)}
        </td>
      </tr>
    );
  }

  if (props.objectRows) {
    const record = isPlainObject(props.pendingRow) ? props.pendingRow : {};
		const editableColumns = props.columns.filter((column) => column !== "#");
    return (
      <tr className="array-row--pending" data-row-index="pending">
        <td className="array-column--sticky array-column--actions">
          <div className="row-action-buttons">
            <button
              className="primary-button compact-button"
              type="button"
              disabled={props.createDisabled}
              onPointerDown={(event) => event.preventDefault()}
              onClick={props.onCreate}
            >
              Create row
            </button>
          </div>
        </td>
        {editableColumns.map((column, columnIndex) => (
          <td
            className={columnIndex === 0 ? "array-column--sticky array-column--after-actions" : undefined}
            key={`pending:${column}`}
          >
            {renderPendingArrayCell(record[column], (nextValue) => {
              props.onChangePendingRow({
                ...record,
                [column]: nextValue,
              });
            })}
          </td>
        ))}
      </tr>
    );
  }

  return (
    <tr className="array-row--pending" data-row-index="pending">
      <td className="array-column--sticky array-column--actions">
        <div className="row-action-buttons">
          <button
            className="primary-button compact-button"
            type="button"
            disabled={props.createDisabled}
            onPointerDown={(event) => event.preventDefault()}
            onClick={props.onCreate}
          >
            Create row
          </button>
        </div>
      </td>
      <td className="array-column--sticky array-column--after-actions">new</td>
      <td>
        {renderPendingArrayCell(props.pendingRow, props.onChangePendingRow)}
      </td>
    </tr>
  );
}

function renderReferenceAddRow(props: {
  columns: string[];
  pickerAriaLabel: string;
  pickerOptions: EditorReferenceOption[];
  pickerDisabled?: boolean;
  onPick: (value: string) => void;
  createDisabled?: boolean;
  onCreate?: () => void;
}) {
  const span = Math.max(1, props.columns.length);
  return (
    <tr className="array-row--pending" data-row-index="pending">
      <td className="array-column--sticky array-column--actions">
        <div className="row-action-buttons">
          {props.onCreate ? (
            <button
              className="ghost-button compact-button"
              type="button"
              disabled={props.createDisabled}
              onPointerDown={(event) => event.preventDefault()}
              onClick={props.onCreate}
            >
              新建资源
            </button>
          ) : null}
        </div>
      </td>
      <td className="array-cell--pending-merged" colSpan={span}>
        <div className="reference-array-create-row">
          <div className="reference-array-create-row__picker">
            <AssetPickerFieldEditor
              ariaLabel={props.pickerAriaLabel}
              mode="single"
              options={props.pickerOptions.map((option) => ({
                value: option.value,
                label: option.label,
                color: null,
                description: option.description,
              }))}
              readOnly={Boolean(props.pickerDisabled)}
              value={[]}
              onEdit={(nextValue) => {
                const picked = nextValue[0];
                if (typeof picked === "string" && picked.trim()) {
                  props.onPick(picked);
                }
              }}
              placeholder="添加已有引用"
            />
          </div>
          <span className="array-cell-summary array-cell-summary--pending">
            {props.onCreate ? "可直接选择已有引用，也可新建资源后回填" : "请选择已有引用加入数组"}
          </span>
        </div>
      </td>
    </tr>
  );
}

function renderPendingArrayCell(value: unknown, onChange: (nextValue: unknown) => void) {
  if (isNavigable(value)) {
    return (
      <span className="array-cell-summary array-cell-summary--pending">
        {previewValue(value)}
      </span>
    );
  }

  return renderPrimitiveEditor({
    value,
    ariaLabel: "Pending array item",
    path: [],
    onChange,
  });
}

function getTypeToneClass(value: unknown, host?: EditorHost) {
  return getTypeToneClassForType(describeType(value, host));
}

function getTypeToneClassForType(type: string) {
  if (type === "reference") return "tone-reference";
  if (type === "array") return "tone-array";
  if (type === "object") return "tone-object";
  return "";
}

function renderTypeIcon(type: string) {
  const TypeIcon = jsonTypeIcons[type as keyof typeof jsonTypeIcons];
  if (!TypeIcon) return null;
  return (
    <small
      aria-label={type}
      className={["field-type", "field-type--icon", getTypeToneClassForType(type)].filter(Boolean).join(" ")}
      title={type}
    >
      <TypeIcon aria-hidden="true" size={14} stroke={1.9} />
    </small>
  );
}

function describeStructureIcon(value: unknown, host?: EditorHost) {
  if (isReferenceValue(value)) return "->";
  if (Array.isArray(value)) return "[]";
  if (isPlainObject(value)) return "{}";
  return ".";
}

function previewValue(value: unknown, host?: EditorHost): string {
  if (isReferenceValue(value)) return getReferenceLabel(value);
  if (Array.isArray(value)) return `${value.length} items`;
  if (isPlainObject(value)) return `${Object.keys(value).length} fields`;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null) return "null";
  return String(value);
}

function renderNestedEntryContent(
  value: unknown,
  schema: EditorSchema | undefined,
  host?: EditorHost,
  resolveNamedSchema?: (name: string) => EditorSchema | undefined,
  fallbackLabel?: string,
  mode: "full" | "compact" = "full",
) {
  if (!isReferenceValue(value)) {
    return <span className="entry-key">{fallbackLabel ?? previewValue(value, host)}</span>;
  }

  const referenceSchema = schema?.["x-editor"]?.reference;
  const targetSchemaRef = referenceSchema?.target?.schemaRef;
  const targetSchema = targetSchemaRef ? resolveNamedSchema?.(targetSchemaRef) : undefined;
  const referenceViewSchema = resolveReferenceViewSchema(schema, resolveNamedSchema);
  const referenceViewColumns = getReferenceViewColumnsFromSchema(referenceViewSchema);
  if (!targetSchema || referenceViewColumns.length === 0) {
    return <span className="entry-key">{fallbackLabel ?? previewValue(value, host)}</span>;
  }

  const uri = getReferenceUri(value);
  if (!uri) {
    return <span className="entry-key">{fallbackLabel ?? previewValue(value, host)}</span>;
  }

  const resolved = resolveReferenceDocument(uri, host);
  if (!resolved.ok) {
    return <span className="entry-key">{fallbackLabel ?? previewValue(value, host)}</span>;
  }

  if (mode === "compact") {
    return renderCompactReferenceProjection(resolved.value, targetSchema, referenceViewColumns, host, resolveNamedSchema);
  }

  return (
    <div className={`reference-preview reference-preview--${referenceSchema?.view?.layout ?? "inline"}`.trim()}>
      {renderReferenceProjection(resolved.value, targetSchema, referenceViewColumns, host, resolveNamedSchema)}
    </div>
  );
}

function renderCompactReferenceProjection(
  targetValue: unknown,
  targetSchema: EditorSchema,
  columns: ReferenceViewColumn[],
  host?: EditorHost,
  resolveNamedSchema?: (name: string) => EditorSchema | undefined,
) {
  const entries = columns
    .map((column) => {
      const fieldValue = getValueAtPath(targetValue, column.path);
      const fieldSchema = resolveReferenceProjectedFieldSchema(
        targetSchema,
        column.path,
        targetValue,
        column.columnSchema,
        resolveNamedSchema,
      );
      if (fieldValue == null || fieldValue === "") {
        return null;
      }
      return {
        key: column.key,
        value: renderReferenceFieldValue(fieldValue, fieldSchema, host),
      };
    })
    .filter((entry): entry is { key: string; value: ReactNode } => entry != null);

  if (entries.length === 0) {
    return <span className="entry-key">{previewValue(targetValue, host)}</span>;
  }

  const entryMap = new Map(entries.map((entry) => [entry.key, entry.value]));
  const iconValue = entryMap.get("icon");
  const primaryValue = entryMap.get("name")
    ?? entryMap.get("title")
    ?? entryMap.get("id")
    ?? entries.find((entry) => entry.key !== "icon" && entry.key !== "description")?.value
    ?? entries[0]?.value;
  const secondaryValue = entryMap.get("description")
    ?? (primaryValue !== entryMap.get("title") ? entryMap.get("title") : null)
    ?? entries.find((entry) => entry.key !== "icon" && entry.key !== "name" && entry.key !== "title" && entry.key !== "id")?.value
    ?? null;

  return (
    <span className="reference-preview__compact">
      {iconValue ? <span className="reference-preview__compact-icon">{iconValue}</span> : null}
      <span className="reference-preview__compact-text">
        {primaryValue ? <span className="reference-preview__compact-main">{primaryValue}</span> : null}
        {secondaryValue ? <span className="reference-preview__compact-meta">{secondaryValue}</span> : null}
      </span>
    </span>
  );
}

function renderReferenceProjection(
  targetValue: unknown,
  targetSchema: EditorSchema,
  columns: ReferenceViewColumn[],
  host?: EditorHost,
  resolveNamedSchema?: (name: string) => EditorSchema | undefined,
) {
  const entries = columns
    .map((column) => {
      const fieldValue = getValueAtPath(targetValue, column.path);
      const fieldSchema = resolveReferenceProjectedFieldSchema(
        targetSchema,
        column.path,
        targetValue,
        column.columnSchema,
        resolveNamedSchema,
      );
      if (fieldValue == null || fieldValue === "") {
        return null;
      }
      return {
        key: column.key,
        label: column.title || inferReferenceFieldLabel(fieldSchema, column.path),
        value: renderReferenceFieldValue(fieldValue, fieldSchema, host),
      };
    })
    .filter((entry: { key: string; label: string; value: ReactNode } | null): entry is { key: string; label: string; value: ReactNode } => entry != null);

  if (entries.length === 0) {
    return <span className="entry-key">{previewValue(targetValue, host)}</span>;
  }

  return (
    <div className="reference-preview__group">
        {entries.map((entry: { key: string; label: string; value: ReactNode }) => (
          <div className="reference-preview__row" key={entry.key}>
          <span className="reference-preview__label">{entry.label}</span>
          <span className="reference-preview__value">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function getReferenceTableCellText(
  value: unknown,
  column: ReferenceViewColumn,
  itemSchema: EditorSchema | undefined,
  host?: EditorHost,
  resolveNamedSchema?: (name: string) => EditorSchema | undefined,
) {
  const uri = getRenderableReferenceUri(value, itemSchema);
  if (!uri) {
    return previewValue(value, host);
  }
  const resolved = resolveReferenceDocument(uri, host);
  if (!resolved.ok) {
    return previewValue(value, host);
  }
  const fieldValue = getValueAtPath(resolved.value, column.path);
  if (fieldValue == null || fieldValue === "") {
    return "";
  }

  const targetSchemaRef = itemSchema?.["x-editor"]?.reference?.target?.schemaRef;
  const targetSchema = targetSchemaRef ? resolveNamedSchema?.(targetSchemaRef) : undefined;
  if (targetSchema) {
    const fieldSchema = resolveReferenceProjectedFieldSchema(
      targetSchema,
      column.path,
      resolved.value,
      column.columnSchema,
      resolveNamedSchema,
    );
    const rendered = renderReferenceFieldValue(fieldValue, fieldSchema, host);
    if (typeof rendered === "string" || typeof rendered === "number") {
      return String(rendered);
    }
  }

  if (typeof fieldValue === "string") {
    return fieldValue;
  }
  if (typeof fieldValue === "number" || typeof fieldValue === "boolean") {
    return String(fieldValue);
  }
  if (Array.isArray(fieldValue)) {
    return `${fieldValue.length} items`;
  }
  return previewValue(fieldValue, host);
}

function renderReferenceTableCell(
  value: unknown,
  column: ReferenceViewColumn,
  itemSchema: EditorSchema | undefined,
  resolveNamedSchema?: (name: string) => EditorSchema | undefined,
  host?: EditorHost,
) {
  const uri = getRenderableReferenceUri(value, itemSchema);
  if (!uri) {
    return <span className="array-cell-summary">{previewValue(value, host)}</span>;
  }

  const referenceSchema = itemSchema?.["x-editor"]?.reference;
  const targetSchemaRef = referenceSchema?.target?.schemaRef;
  const targetSchema = targetSchemaRef ? resolveNamedSchema?.(targetSchemaRef) : undefined;
  if (!targetSchema) {
    const summary = getReferenceTableCellText(value, column, itemSchema, host, resolveNamedSchema);
    return summary
      ? <span className="array-cell-summary">{summary}</span>
      : <span className="array-cell-summary array-cell-summary--missing">-</span>;
  }

  const resolved = resolveReferenceDocument(uri, host);
  if (!resolved.ok) {
    return <span className="array-cell-summary">{previewValue(value, host)}</span>;
  }

  const fieldValue = getValueAtPath(resolved.value, column.path);
  const fieldSchema = resolveReferenceProjectedFieldSchema(
    targetSchema,
    column.path,
    resolved.value,
    column.columnSchema,
    resolveNamedSchema,
  );
  if (fieldValue == null || fieldValue === "") {
    return <span className="array-cell-summary array-cell-summary--missing">-</span>;
  }

  const rendered = renderReferenceFieldValue(fieldValue, fieldSchema, host);
  if (typeof rendered === "string") {
    return <span className="array-cell-summary">{rendered}</span>;
  }
  return <span className="array-cell-summary array-cell-summary--projection">{rendered}</span>;
}

function resolveReferenceProjectedFieldSchema(
  targetSchema: EditorSchema | undefined,
  fieldPath: JsonPath,
  targetValue: unknown,
  viewSchema: EditorSchema | undefined,
  resolveNamedSchema?: (name: string) => EditorSchema | undefined,
) {
  const resolvedTargetFieldSchema = resolveNamedReferenceFieldSchema(
    resolveSchemaAtPath(targetSchema, fieldPath, targetValue),
    resolveNamedSchema,
  );
  return mergeProjectedFieldSchema(resolvedTargetFieldSchema, viewSchema);
}

function resolveNamedReferenceFieldSchema(
  schema: EditorSchema | undefined,
  resolveNamedSchema?: (name: string) => EditorSchema | undefined,
) {
  if (!schema?.$ref || schema.$ref.startsWith("#") || !resolveNamedSchema) {
    return schema;
  }

  const refFileName = schema.$ref.replace(/\\/g, "/").split("/").at(-1) ?? schema.$ref;
  const referencedSchema = [
    schema.$ref,
    refFileName,
    refFileName.replace(/\.schema\.json$/i, ""),
    refFileName.replace(/\.json$/i, ""),
  ]
    .map((candidate) => resolveNamedSchema(candidate))
    .find((candidate): candidate is EditorSchema => candidate !== undefined);

  if (!referencedSchema) {
    return schema;
  }

  return mergeProjectedFieldSchema(referencedSchema, {
    ...schema,
    $ref: undefined,
  });
}

function resolveReferenceViewSchema(
  schema: EditorSchema | undefined,
  resolveNamedSchema?: (name: string) => EditorSchema | undefined,
) {
  const schemaRef = schema?.["x-editor"]?.reference?.view?.schemaRef;
  return schemaRef ? resolveNamedSchema?.(schemaRef) : undefined;
}

function getReferenceViewColumns(
  items: unknown[],
  viewSchema: EditorSchema | undefined,
  itemSchema: EditorSchema | undefined,
  host?: EditorHost,
) {
  const columns = getReferenceViewColumnsFromSchema(viewSchema);
  if (columns.length === 0) {
    return [];
  }

  return columns.filter((column) =>
    items.some((item) => {
      const uri = getRenderableReferenceUri(item, itemSchema);
      if (!uri) return false;
      const resolved = resolveReferenceDocument(uri, host);
      if (!resolved.ok) return false;
      const fieldValue = getValueAtPath(resolved.value, column.path);
      return fieldValue != null && fieldValue !== "";
    }),
  );
}

function getReferenceViewColumnsFromSchema(viewSchema: EditorSchema | undefined): ReferenceViewColumn[] {
  if (!viewSchema?.properties) {
    return [];
  }

  const columns: ReferenceViewColumn[] = [];
  for (const [key, propertySchema] of Object.entries(viewSchema.properties)) {
    const projectionPath = propertySchema["x-editor"]?.projection?.path;
    if (!projectionPath?.length) {
      continue;
    }
    columns.push({
      key,
      title: propertySchema.title ?? key,
      path: projectionPath,
      columnSchema: propertySchema,
    });
  }
  return columns;
}

function resolveEditorOptions(schema: EditorSchema | undefined, host?: EditorHost): { options: ResolvedEditorOption[]; error: string | null } {
  const editor = schema?.["x-editor"];
  if (!editor) return { options: [], error: null };
  if (editor.options?.length && editor.optionsSource) {
    return { options: [], error: "Schema cannot declare both inline options and optionsSource" };
  }
  if (editor.options?.length) {
    return { options: editor.options.map(normalizeEditorOption), error: null };
  }
  if (!editor.optionsSource) {
    return { options: [], error: null };
  }
  if (editor.optionsSource.kind !== "json-file") {
    return { options: [], error: `Unsupported options source kind: ${editor.optionsSource.kind}` };
  }
  const resolved = resolveReferenceDocument(editor.optionsSource.uri, host);
  if (!resolved.ok) {
    return { options: [], error: resolved.error.message };
  }
  if (!Array.isArray(resolved.value)) {
    return { options: [], error: "Options source must resolve to a JSON array" };
  }
  return {
    options: resolved.value
      .map((entry) => mapEditorOptionRecord(entry, editor.optionsSource!))
      .filter((entry): entry is ResolvedEditorOption => entry != null),
    error: null,
  };
}

/**
 * select / multi-select 字段的选项解析：静态 options 或 optionsSource 优先；
 * 两者都缺省且 schema（或其 items）声明了 reference 时，回退到 host 引用选项，
 * 使引用字段可以投影为 select 类型编辑。
 */
function resolveSelectFieldOptions(
  schema: EditorSchema | undefined,
  host: EditorHost | undefined,
  context: { path: JsonPath; value: unknown },
  discoverOptions?: () => Array<string | number>,
): ResolvedEditorOption[] {
  const staticOptions = resolveEditorOptions(schema, host);
  if (staticOptions.error) return [];
  const referenceOptionSchema = schema?.["x-editor"]?.reference
    ? schema
    : schema?.items?.["x-editor"]?.reference
      ? schema.items
      : undefined;
  const reference = referenceOptionSchema?.["x-editor"]?.reference;
  const referenceOptions = referenceOptionSchema && reference && host?.getReferenceOptions
    ? host.getReferenceOptions({ path: context.path, value: context.value, schema: referenceOptionSchema, reference })
      .map((option) => ({ value: option.value, label: option.label, color: null, description: option.description }))
    : [];
  // 发现模式：字段未声明 options/optionsSource 且未声明 reference 时，从数据行收集现有值。
  const discovered = !reference && discoverOptions
    ? discoverOptions().map((entry) => ({ value: entry, label: String(entry), color: null }))
    : [];
  // 合并语义（对齐 data-editor）：静态 options 的顺序与 label/颜色优先，reference/发现补充新值。
  const staticKeys = new Set(staticOptions.options.map((option) => String(option.value)));
  return [...staticOptions.options, ...[...referenceOptions, ...discovered].filter((option) => !staticKeys.has(String(option.value)))];
}

function normalizeEditorOption(option: EditorViewOption): ResolvedEditorOption {
  return {
    value: option.value,
    label: option.label ?? String(option.value),
    color: option.color ?? null,
  };
}

function mapEditorOptionRecord(
  entry: unknown,
  source: Exclude<NonNullable<EditorSchema["x-editor"]>["optionsSource"], undefined>,
): ResolvedEditorOption | null {
  if (!isPlainObject(entry)) return null;
  const rawValue = entry[source.valueField];
  if (typeof rawValue !== "string" && typeof rawValue !== "number") return null;
  const rawLabel = source.labelField ? entry[source.labelField] : undefined;
  const rawColor = source.colorField ? entry[source.colorField] : undefined;
  const rawDescription = source.descriptionField ? entry[source.descriptionField] : undefined;
  const rawPreview = source.previewField ? entry[source.previewField] : undefined;
  return {
    value: rawValue,
    label: typeof rawLabel === "string" && rawLabel.trim().length > 0 ? rawLabel : String(rawValue),
    color: isEditorOptionColor(rawColor) ? rawColor : null,
    description: typeof rawDescription === "string" && rawDescription.trim().length > 0 ? rawDescription : undefined,
    preview: typeof rawPreview === "string" && rawPreview.trim().length > 0 ? rawPreview : undefined,
  };
}

function isEditorOptionColor(value: unknown): value is EditorViewOptionColor {
  return (editorOptionColors as readonly string[]).includes(String(value));
}

function resolveImplicitAssetPickerSchema(
  value: unknown,
  schema: EditorSchema | undefined,
  path: JsonPath,
): EditorSchema | undefined {
  if (typeof value !== "string") {
    return schema;
  }
  if (schema?.["x-editor"]?.fieldType || schema?.["x-editor"]?.reference || schema?.["x-editor"]?.display?.kind === "image") {
    return schema;
  }
  const implicitEditor = inferImplicitAssetPickerEditor(value, path);
  if (!implicitEditor) {
    return schema;
  }
  return {
    ...(schema ?? { type: "string" as const }),
    "x-editor": {
      ...(schema?.["x-editor"] ?? {}),
      ...implicitEditor,
    },
  };
}

function inferImplicitAssetPickerEditor(
  value: string,
  path: JsonPath,
): NonNullable<EditorSchema["x-editor"]> | null {
  const normalizedPath = String(path.at(-1) ?? "").toLowerCase();
  const lowerValue = value.toLowerCase();

  if (lowerValue.startsWith("asset://")) {
    const match = /^asset:\/\/([^/]+)\/[^/]+\.json$/i.exec(value);
    if (!match) {
      return null;
    }
    return {
      fieldType: "asset-picker",
      optionsSource: {
        kind: "json-file",
        uri: `asset://schema-data-resource-options/${match[1]}.json`,
        valueField: "value",
        labelField: "text",
        descriptionField: "value",
      },
    };
  }

  if (!lowerValue.startsWith("res://")) {
    return null;
  }

  if (/\.(png|jpg|jpeg|webp|svg)$/i.test(value) || /(icon|image|portrait|banner)/.test(normalizedPath)) {
    return {
      fieldType: "asset-picker",
      optionsSource: {
        kind: "json-file",
        uri: "asset://editor-picker/image.json",
        valueField: "value",
        labelField: "text",
        descriptionField: "path",
        previewField: "preview",
      },
      display: {
        kind: "image",
      },
    };
  }

  if (/\.tscn$/i.test(value) || /(scene|outfit|prefab|panel)/.test(normalizedPath)) {
    return {
      fieldType: "asset-picker",
      optionsSource: {
        kind: "json-file",
        uri: "asset://editor-picker/tscn.json",
        valueField: "value",
        labelField: "text",
        descriptionField: "path",
      },
    };
  }

  if (/\.(gd|tscn)$/i.test(value) || /(script|executable)/.test(normalizedPath)) {
    return {
      fieldType: "asset-picker",
      optionsSource: {
        kind: "json-file",
        uri: "asset://editor-picker/executable.json",
        valueField: "value",
        labelField: "text",
        descriptionField: "path",
      },
    };
  }

  return null;
}

function chipStyleForSummaryColor(color: EditorViewOptionColor | null): React.CSSProperties | undefined {
  if (!color) {
    return undefined;
  }
  const palette = namedChipPalette[color];
  return { background: palette.background, color: palette.color };
}

function isInlineSchemaEditor(value: unknown, schema: EditorSchema | undefined, host?: EditorHost) {
  const fieldType = schema?.["x-editor"]?.fieldType;
  if (schema?.["x-editor"]?.reference) {
    return Boolean(host?.getReferenceOptions) && (value == null || typeof value === "string");
  }
  if (fieldType === "select") {
    return value == null || typeof value === "string" || typeof value === "number";
  }
  if (fieldType === "multi-select") {
    return value == null || Array.isArray(value);
  }
  if (fieldType === "asset-picker") {
    return value == null || typeof value === "string" || typeof value === "number" || Array.isArray(value);
  }
  return false;
}

function renderReferenceFieldValue(value: unknown, schema: EditorSchema | undefined, host?: EditorHost, path?: JsonPath): ReactNode {
  const display = schema?.["x-editor"]?.display;
  const imageDisplay = resolveImageDisplayConfig(schema, "inline", path);
  const rgbaSummary = renderRgbaColorSummary(value, schema);
  if (rgbaSummary) {
    return rgbaSummary;
  }
  if (typeof value === "string" && imageDisplay.kind === "image") {
    return <ImagePreview value={value} schema={schema} host={host} context="inline" path={path} />;
  }
  if ((typeof value === "string" || typeof value === "number") && schema?.["x-editor"]?.fieldType === "select") {
    const editorOptionsState = { options: resolveSelectFieldOptions(schema, host, { path: path ?? [], value }) };
    const option = editorOptionsState.options.find((entry) => String(entry.value) === String(value));
    if (option) {
      return <span className="chip" style={chipStyleForSummaryColor(option.color)}>{option.label}</span>;
    }
  }
  if ((typeof value === "string" || typeof value === "number") && schema?.["x-editor"]?.fieldType === "asset-picker") {
    const editorOptionsState = resolveEditorOptions(schema, host);
    const option = editorOptionsState.options.find((entry) => String(entry.value) === String(value));
    if (option?.label) {
      return option.label;
    }
  }
  if (typeof value === "string" && (display?.text?.sentenceLimit ?? 0) > 0) {
    return extractLeadingSentences(value, display?.text?.sentenceLimit ?? 1);
  }
  if (typeof value === "string" && isIconLikeField(schema, path)) {
    return <span className="reference-preview__icon-path">{value}</span>;
  }
  if (Array.isArray(value)) {
    if (schema?.["x-editor"]?.fieldType === "multi-select") {
      const editorOptionsState = { options: resolveSelectFieldOptions(schema, host, { path: path ?? [], value }) };
      const optionMap = new Map(editorOptionsState.options.map((option) => [String(option.value), option]));
      return (
        <span className="chips-cell">
          {value.map((item, index) => {
            const option = optionMap.get(String(item));
            return (
              <span className="chip" key={`${String(item)}-${index}`} style={chipStyleForSummaryColor(option?.color ?? null)}>
                {option?.label ?? previewValue(item, host)}
              </span>
            );
          })}
        </span>
      );
    }
    if (schema?.["x-editor"]?.fieldType === "asset-picker") {
      const editorOptionsState = resolveEditorOptions(schema, host);
      const optionMap = new Map(editorOptionsState.options.map((option) => [String(option.value), option]));
      const previewItems = value
        .slice(0, 3)
        .map((item) => optionMap.get(String(item))?.label ?? previewValue(item, host));
      const suffix = value.length > 3 ? ` +${value.length - 3}` : "";
      return `${previewItems.join(", ")}${suffix}`;
    }
    const previewItems = value.slice(0, 3).map((item) => previewValue(item, host));
    const suffix = value.length > 3 ? ` +${value.length - 3}` : "";
    return `${previewItems.join(", ")}${suffix}`;
  }
  if (typeof value === "boolean") {
    return (
      <label className="checkbox-field checkbox-field--summary">
        <input
          aria-label={schema?.title ?? String(path?.at(-1) ?? "Boolean")}
          checked={value}
          disabled
          readOnly
          tabIndex={-1}
          type="checkbox"
        />
        <span>{value ? "True" : "False"}</span>
      </label>
    );
  }
  if (value === null) {
    return "null";
  }
  return previewValue(value, host);
}

function extractLeadingSentences(value: string, sentenceLimit: number) {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }
  if (sentenceLimit <= 0) {
    return normalized;
  }

  const matches = normalized.match(/[^.!?。！？]+[.!?。！？]?/g) ?? [];
  const sentences = matches
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (sentences.length === 0) {
    return normalized;
  }

  return sentences.slice(0, sentenceLimit).join(" ");
}

function isImageDisplaySchema(schema: EditorSchema | undefined, path?: JsonPath) {
  return resolveImageDisplayConfig(schema, "inline", path).kind === "image";
}

function mergeProjectedFieldSchema(targetSchema: EditorSchema | undefined, viewSchema: EditorSchema | undefined): EditorSchema | undefined {
  if (!targetSchema) {
    return viewSchema;
  }
  if (!viewSchema) {
    return targetSchema;
  }

  return {
    ...targetSchema,
    ...viewSchema,
    "x-editor": {
      ...(targetSchema["x-editor"] ?? {}),
      ...(viewSchema["x-editor"] ?? {}),
    },
  };
}

function getStructureIcon(value: unknown, host?: EditorHost) {
  if (isReferenceValue(value)) return "->";
  if (Array.isArray(value)) return "[]";
  if (isPlainObject(value)) return "{}";
  return ".";
}

function inferReferenceFieldLabel(schema: EditorSchema | undefined, path: JsonPath) {
  return schema?.title ?? String(path.at(-1) ?? "value");
}

function isIconLikeField(schema: EditorSchema | undefined, path?: JsonPath) {
  const preset = inferImageDisplayPreset(schema, path);
  return preset === "icon" || preset === "large-icon";
}

function isNavigable(value: unknown): boolean {
  return isReferenceValue(value) || Array.isArray(value) || isPlainObject(value);
}

function clampImageViewerScale(value: number) {
  return Math.min(IMAGE_VIEWER_MAX_SCALE, Math.max(IMAGE_VIEWER_MIN_SCALE, Number(value.toFixed(2))));
}

function ImagePreview(
  { value, schema, host, context = "inline", path }: { value: string; schema?: EditorSchema; host?: EditorHost; context?: ImagePreviewContext; path?: JsonPath },
) {
  const [loadFailed, setLoadFailed] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerScale, setViewerScale] = useState(1);
  const preview = resolveImageDisplayConfig(schema, context, path);
  const preset = resolveImageDisplayPreset(schema, path);
  const width = preview.width;
  const height = preview.height;
  const fit = preview.fit;
  const label = schema?.title ?? "Image";
  const resolvedValue = host?.resolveDisplayUrl?.(value, schema) ?? value;
  const canOpenViewer = context === "field-editor" && !loadFailed;

  const closeViewer = useCallback(() => {
    setIsViewerOpen(false);
    setViewerScale(1);
  }, []);

  const openViewer = useCallback(() => {
    if (!canOpenViewer) return;
    setViewerScale(1);
    setIsViewerOpen(true);
  }, [canOpenViewer]);

  const adjustViewerScale = useCallback((delta: number) => {
    setViewerScale((current) => clampImageViewerScale(current + delta));
  }, []);

  useEffect(() => {
    if (!isViewerOpen) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeViewer();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeViewer, isViewerOpen]);

  if (loadFailed) {
    return (
      <span
        className={[
          "reference-preview__image-fallback",
          preset ? `reference-preview__image-fallback--${preset}` : "",
          `reference-preview__image-fallback--${context}`,
        ].join(" ")}
        style={{ width, height }}
        title={value}
      >
        {value}
      </span>
    );
  }

  const previewImage = (
    <img
      alt={label}
      className={[
        "reference-preview__image",
        preset ? `reference-preview__image--${preset}` : "",
        `reference-preview__image--${context}`,
      ].join(" ")}
      height={height}
      src={resolvedValue}
      style={{ width: `${width}px`, height: `${height}px`, objectFit: fit }}
      title={value}
      width={width}
      onError={() => setLoadFailed(true)}
    />
  );

  return (
    <>
      {canOpenViewer ? (
        <button
          aria-label={`打开 ${label} 图片浏览`}
          className="image-preview-trigger"
          type="button"
          onClick={openViewer}
        >
          {previewImage}
        </button>
      ) : previewImage}
      {isViewerOpen && typeof document !== "undefined" ? createPortal(
        <div className="image-viewer-backdrop" onClick={closeViewer}>
          <div
            aria-label={`${label} 图片浏览`}
            aria-modal="true"
            className="image-viewer"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="image-viewer__viewport"
              onClick={(event) => {
                if (event.target !== event.currentTarget) return;
                closeViewer();
              }}
              onWheel={(event) => {
                event.preventDefault();
                adjustViewerScale(event.deltaY < 0 ? IMAGE_VIEWER_SCALE_STEP : -IMAGE_VIEWER_SCALE_STEP);
              }}
            >
              <img
                alt={label}
                className="image-viewer__image"
                src={resolvedValue}
                style={{ transform: `scale(${viewerScale})` }}
              />
            </div>
            <div className="image-viewer__toolbar">
              <button
                aria-label="缩小图片"
                className="image-viewer__toolbar-button"
                type="button"
                onClick={() => adjustViewerScale(-IMAGE_VIEWER_SCALE_STEP)}
              >
                <icons.zoomOut size={16} strokeWidth={2} />
              </button>
              <button
                aria-label="恢复图片大小"
                className="image-viewer__toolbar-button"
                type="button"
                onClick={() => setViewerScale(1)}
              >
                <icons.reset size={16} strokeWidth={2} />
              </button>
              <button
                aria-label="放大图片"
                className="image-viewer__toolbar-button"
                type="button"
                onClick={() => adjustViewerScale(IMAGE_VIEWER_SCALE_STEP)}
              >
                <icons.zoomIn size={16} strokeWidth={2} />
              </button>
              <button
                aria-label="关闭图片浏览"
                className="image-viewer__toolbar-button"
                type="button"
                onClick={closeViewer}
              >
                <icons.close size={16} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function shouldUseMultilineEditor(value: string) {
  if (value.includes("\n")) return true;
  if (value.length >= 60) return true;
  return value.length >= 40 && /\s/.test(value) && /[.,;:!?]/.test(value);
}

function getMultilineEditorRows(value: string) {
  if (value.includes("\n")) {
    return Math.max(4, Math.min(8, value.split("\n").length + 1));
  }

  if (value.length >= 180) return 6;
  return 4;
}

function getOrderedKeys(value: Record<string, unknown>, schema?: EditorSchema) {
  const currentKeys = Object.keys(value);
  const schemaKeys = Object.keys(schema?.properties ?? {});
  const prioritized = schemaKeys.filter((key) => currentKeys.includes(key));
  const remaining = currentKeys.filter((key) => !prioritized.includes(key));
  return [...prioritized, ...remaining];
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function reorderSchemaPropertiesToMatch(schema: EditorSchema, orderedKeys: string[]) {
  if (!schema.properties) return schema;
  const rank = new Map(orderedKeys.map((key, index) => [key, index]));
  // 只重排 schema 已声明键；附加字段（数据有、schema 未声明）不属于顺序真相，
  // 拖拽永不改写 properties 的键集合。
  const entries = Object.entries(schema.properties).sort((left, right) => {
    const leftRank = rank.get(left[0]);
    const rightRank = rank.get(right[0]);
    if (leftRank == null && rightRank == null) return 0;
    if (leftRank == null) return 1;
    if (rightRank == null) return -1;
    return leftRank - rightRank;
  });
  return {
    ...schema,
    properties: Object.fromEntries(entries),
  };
}

function insertDraggedItem<T>(order: T[], item: T, targetIndex: number) {
  const restOrder = order.filter((entry) => entry !== item);
  const next = [...restOrder];
  const clampedIndex = Math.max(0, Math.min(targetIndex, next.length));
  next.splice(clampedIndex, 0, item);
  return next;
}

function renderProjectedObjectFieldEditor(props: {
  rowKey: string;
  rowValue: Record<string, unknown>;
  rowLabel: string;
  path: JsonPath;
  host?: EditorHost;
  resolveNamedSchema?: (name: string) => EditorSchema | undefined;
  readOnly: boolean;
  projectionColumns: EditorTableColumn[];
  projectionSchema?: EditorSchema;
  objectPreset?: EditorObjectPreset | null;
  onNavigate: (path: JsonPath) => void;
  onJumpToSource?: (sourceId: string) => void;
  onChange: (nextValue: Record<string, unknown>) => void;
}) {
  const {
    rowKey,
    rowValue,
    rowLabel,
    path,
    host,
    resolveNamedSchema,
    readOnly,
    projectionColumns,
    projectionSchema,
    objectPreset,
    onNavigate,
    onJumpToSource,
    onChange,
  } = props;

  return (
    <div className={["object-field-projection", objectPreset ? `object-field-projection--${objectPreset}` : ""].filter(Boolean).join(" ")}>
      {projectionColumns.map((column, columnIndex) => {
        const columnId = getTableColumnId(column);
        const fieldPath = getTableColumnPath(column);
        const cellValue = fieldPath.length > 0 ? getValueAtPath(rowValue, fieldPath) : rowValue[columnId];
        const cellSchema = resolveSchemaAtPath(projectionSchema, fieldPath, rowValue);
        const cellLabel = column.label ?? column.key ?? formatPath(fieldPath) ?? columnId;
        const hasValue = fieldPath.length > 0 ? cellValue !== undefined : Object.prototype.hasOwnProperty.call(rowValue, columnId);
        const showRgbaPicker = objectPreset === "rgba" && columnIndex === 0;

        return (
          <div
            className={[
              "object-field-projection__cell",
              column.wrap ? "is-wrapped" : "",
              showRgbaPicker ? "object-field-projection__cell--rgba-picker" : "",
            ].filter(Boolean).join(" ")}
            key={`${rowKey}:${columnId}`}
          >
            <span className="object-field-projection__label">{cellLabel}</span>
            <div className={["object-field-projection__value", showRgbaPicker ? "object-field-projection__value--rgba-picker" : ""].filter(Boolean).join(" ")}>
              {showRgbaPicker ? (
                renderRgbaColorPicker({
                  value: rowValue,
                  label: rowLabel,
                  readOnly,
                  onChange,
                })
              ) : null}
              {hasValue && Array.isArray(cellValue) ? (
                renderInlineArrayFieldPreview({
                  rowKey: String(fieldPath.at(-1) ?? columnId),
                  rowLabel: cellLabel,
                  rowValue: cellValue,
                  path: [...path, rowKey, ...fieldPath.slice(0, -1)],
                  host,
                  schema: cellSchema,
                  resolveNamedSchema,
                  readOnly,
                  onNavigate,
                  onChange(nextValue) {
                    onChange(setValueAtPath(rowValue, fieldPath, nextValue) as Record<string, unknown>);
                  },
                }) ?? (
                  <button
                    className={["nested-entry-button", "inline", getTypeToneClass(cellValue, host)].filter(Boolean).join(" ")}
                    type="button"
                    onClick={() => onNavigate([...path, rowKey, ...fieldPath])}
                  >
                    <span className="nested-entry-icon" aria-hidden="true">
                      {getStructureIcon(cellValue, host)}
                    </span>
                    {renderNestedEntryContent(cellValue, cellSchema, host, resolveNamedSchema)}
                  </button>
                )
              ) : hasValue && isNavigable(cellValue) ? (
                <button
                  className={["nested-entry-button", "inline", getTypeToneClass(cellValue, host)].filter(Boolean).join(" ")}
                  type="button"
                  onClick={() => onNavigate([...path, rowKey, ...fieldPath])}
                >
                  <span className="nested-entry-icon" aria-hidden="true">
                    {getStructureIcon(cellValue, host)}
                  </span>
                  {renderNestedEntryContent(cellValue, cellSchema, host, undefined)}
                </button>
              ) : (
                renderPrimitiveEditor({
                  value: cellValue,
                  ariaLabel: `${rowLabel} ${cellLabel}`,
                  schema: cellSchema,
                  path: [...path, rowKey, ...fieldPath],
                  host,
                  readOnly,
                  onOpenReference: onJumpToSource,
                  showOpenReferenceButton: true,
                  onChange(nextValue) {
                    onChange(setValueAtPath(rowValue, fieldPath, nextValue) as Record<string, unknown>);
                  },
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderProjectedObjectMapFieldEditor(props: {
  rowKey: string;
  rowValue: Record<string, unknown>;
  rowLabel: string;
  path: JsonPath;
  host?: EditorHost;
  parentValue?: unknown;
  readOnly: boolean;
  projectionColumns: EditorTableColumn[];
  projectionSchema?: EditorSchema;
  objectPreset?: EditorObjectPreset | null;
  projectionMetadataByKey?: Record<string, Record<string, unknown>>;
  projectionMetadataSchema?: EditorSchema;
  onNavigate: (path: JsonPath) => void;
  onJumpToSource?: (sourceId: string) => void;
  onChange: (nextValue: Record<string, unknown>) => void;
}) {
  const {
    rowKey,
    rowValue,
    rowLabel,
    path,
    host,
    parentValue,
    readOnly,
    projectionColumns,
    projectionSchema,
    objectPreset,
    projectionMetadataByKey,
    projectionMetadataSchema,
    onNavigate,
    onJumpToSource,
    onChange,
  } = props;
  const entryRows = getProjectedMapEntryKeys(rowValue, projectionMetadataByKey).map((entryKey) => [
    entryKey,
    rowValue[entryKey],
  ] as const);

  return (
    <div className={["object-field-projection", "object-field-projection--map", objectPreset ? `object-field-projection--${objectPreset}` : ""].filter(Boolean).join(" ")}>
      {entryRows.map(([entryKey, entryValue]) => {
        const entryLabel = host?.getFieldLabel?.([...path, rowKey, entryKey], entryKey, entryValue) ?? entryKey;
        const normalizedEntryValue = normalizeProjectedMapEntry(entryValue, projectionColumns);
        const entryMetadata = projectionMetadataByKey?.[entryKey]
          ?? resolveObjectValueMetadataByKey({
            path: [...path, rowKey],
            value: rowValue,
            parentValue,
            schema: projectionMetadataSchema ?? projectionSchema,
            host,
          })?.[entryKey];
        if (!normalizedEntryValue) {
          return null;
        }

        return (
          <div className="object-field-projection__row" key={`${rowKey}:${entryKey}`}>
            <span className="object-field-projection__row-label">{entryLabel}</span>
            <div className="object-field-projection__row-cells">
              {projectionColumns.map((column, columnIndex) => {
                const columnId = getTableColumnId(column);
                const fieldPath = getTableColumnPath(column);
                const cellPath = [...path, rowKey, entryKey, ...fieldPath];
                const documentCellValue = fieldPath.length > 0
                  ? getValueAtPath(normalizedEntryValue, fieldPath)
                  : normalizedEntryValue[columnId];
                const metadataCellValue = entryMetadata
                  ? fieldPath.length > 0
                    ? getValueAtPath(entryMetadata, fieldPath)
                    : entryMetadata[columnId]
                  : undefined;
                const cellValue = documentCellValue ?? metadataCellValue;
                const cellSchema = resolveSchemaAtPath(projectionSchema, fieldPath, normalizedEntryValue);
                const cellLabel = column.label ?? column.key ?? formatPath(fieldPath) ?? columnId;
                const hasValue = fieldPath.length > 0
                  ? documentCellValue !== undefined || metadataCellValue !== undefined
                  : Object.prototype.hasOwnProperty.call(normalizedEntryValue, columnId)
                    || Boolean(entryMetadata && Object.prototype.hasOwnProperty.call(entryMetadata, columnId));
                const inlineProjection = isPlainObject(cellValue)
                  ? resolveObjectProjectionConfig({
                    path: cellPath,
                    value: cellValue,
                    parentValue,
                    schema: cellSchema,
                    host,
                  })
                  : null;
                const showRgbaPicker = objectPreset === "rgba" && columnIndex === 0;

                return (
                  <div
                    className={[
                      "object-field-projection__cell",
                      column.wrap ? "is-wrapped" : "",
                      showRgbaPicker ? "object-field-projection__cell--rgba-picker" : "",
                    ].filter(Boolean).join(" ")}
                    key={`${rowKey}:${entryKey}:${columnId}`}
                  >
                    <span className="object-field-projection__label">{cellLabel}</span>
                    <div className={["object-field-projection__value", showRgbaPicker ? "object-field-projection__value--rgba-picker" : ""].filter(Boolean).join(" ")}>
                      {showRgbaPicker ? (
                        renderRgbaColorPicker({
                          value: normalizedEntryValue,
                          label: `${rowLabel} ${entryLabel}`,
                          readOnly,
                          onChange(nextValue) {
                            onChange({
                              ...rowValue,
                              [entryKey]: updateProjectedMapEntry(entryValue, normalizedEntryValue, [], nextValue),
                            });
                          },
                        })
                      ) : null}
                      {hasValue && inlineProjection && isPlainObject(cellValue) ? (
                        renderInlineObjectProjection({
                          fieldKey: entryKey,
                          fieldValue: cellValue,
                          fieldLabel: `${rowLabel} ${entryLabel}`,
                          path: [...path, rowKey],
                          host,
                          resolveNamedSchema: undefined,
                          parentValue,
                          readOnly,
                          projectionColumns: inlineProjection.columns,
                          projectionSchema: inlineProjection.objectValueSchema,
                          objectPreset: inlineProjection.objectPreset,
                          projectionMetadataByKey: inlineProjection.objectValueMetadataByKey,
                          projectionMetadataSchema: inlineProjection.metadataSchema,
                          onNavigate,
                          onJumpToSource,
                          onChange(nextValue) {
                            onChange({
                              ...rowValue,
                              [entryKey]: updateProjectedMapEntry(entryValue, normalizedEntryValue, fieldPath, nextValue),
                            });
                          },
                        })
                      ) : hasValue && Array.isArray(cellValue) ? (
                        renderInlineArrayFieldPreview({
                          rowKey: String(fieldPath.at(-1) ?? columnId),
                          rowLabel: cellLabel,
                          rowValue: cellValue,
                          path: [...path, rowKey, entryKey, ...fieldPath.slice(0, -1)],
                          host,
                          schema: cellSchema,
                          resolveNamedSchema: undefined,
                          readOnly,
                          onNavigate,
                          onChange(nextValue) {
                            onChange({
                              ...rowValue,
                              [entryKey]: updateProjectedMapEntry(entryValue, normalizedEntryValue, fieldPath, nextValue),
                            });
                          },
                        }) ?? (
                          <button
                            className={["nested-entry-button", "inline", getTypeToneClass(cellValue, host)].filter(Boolean).join(" ")}
                            type="button"
                            onClick={() => onNavigate(cellPath)}
                          >
                            <span className="nested-entry-icon" aria-hidden="true">
                              {getStructureIcon(cellValue, host)}
                            </span>
                            {renderNestedEntryContent(cellValue, cellSchema, host, undefined)}
                          </button>
                        )
                      ) : hasValue && isNavigable(cellValue) ? (
                        <button
                          className={["nested-entry-button", "inline", getTypeToneClass(cellValue, host)].filter(Boolean).join(" ")}
                          type="button"
                          onClick={() => onNavigate(cellPath)}
                        >
                          <span className="nested-entry-icon" aria-hidden="true">
                            {getStructureIcon(cellValue, host)}
                          </span>
                          {renderNestedEntryContent(cellValue, cellSchema, host, undefined)}
                        </button>
                      ) : (
                        renderPrimitiveEditor({
                          value: cellValue,
                          ariaLabel: `${rowLabel} ${entryLabel} ${cellLabel}`,
                          schema: cellSchema,
                          path: [...path, rowKey, entryKey, ...fieldPath],
                          host,
                          readOnly,
                          onOpenReference: onJumpToSource,
                          showOpenReferenceButton: true,
                          onChange(nextValue) {
                            onChange({
                              ...rowValue,
                              [entryKey]: updateProjectedMapEntry(entryValue, normalizedEntryValue, fieldPath, nextValue),
                            });
                          },
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderRgbaColorPicker(props: {
  value: Record<string, unknown>;
  label: string;
  readOnly: boolean;
  onChange: (nextValue: Record<string, unknown>) => void;
}) {
  const rgbaValue = getRgbaProjectionValue(props.value);
  if (!rgbaValue) {
    return null;
  }
  const hex = rgbaValueToHex(rgbaValue);
  return (
    <input
      aria-label={`${props.label} color picker`}
      className="object-field-projection__rgba-picker"
      disabled={props.readOnly}
      title={hex.toUpperCase()}
      type="color"
      value={hex}
      onChange={(event) => props.onChange(applyHexToRgbaValue(props.value, event.target.value))}
    />
  );
}

function renderRgbaColorSummary(value: unknown, schema: EditorSchema | undefined) {
  if (!isPlainObject(value) || getEditorObjectPreset(schema) !== "rgba") {
    return null;
  }
  const rgbaValue = getRgbaProjectionValue(value);
  if (!rgbaValue) {
    return null;
  }
  const hex = rgbaValueToHex(rgbaValue).toUpperCase();
  return (
    <span className="array-color-summary">
      <span
        aria-hidden="true"
        className="array-color-summary__swatch"
        style={{ backgroundColor: `rgba(${rgbaValue.r * 255}, ${rgbaValue.g * 255}, ${rgbaValue.b * 255}, ${rgbaValue.a})` }}
      />
      <span className="array-color-summary__value">{hex}</span>
    </span>
  );
}

function getRgbaProjectionValue(value: Record<string, unknown>) {
  const r = getUnitNumber(value.r);
  const g = getUnitNumber(value.g);
  const b = getUnitNumber(value.b);
  const a = getUnitNumber(value.a) ?? 1;
  if (r == null || g == null || b == null) {
    return null;
  }
  return { r, g, b, a };
}

function getUnitNumber(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return Math.max(0, Math.min(1, value));
}

function rgbaValueToHex(value: { r: number; g: number; b: number }) {
  const channels = [value.r, value.g, value.b].map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0"));
  return `#${channels.join("")}`;
}

function applyHexToRgbaValue(value: Record<string, unknown>, hex: string) {
  const normalized = hex.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return value;
  }
  return {
    ...value,
    r: Number((parseInt(normalized.slice(1, 3), 16) / 255).toFixed(3)),
    g: Number((parseInt(normalized.slice(3, 5), 16) / 255).toFixed(3)),
    b: Number((parseInt(normalized.slice(5, 7), 16) / 255).toFixed(3)),
  };
}

function updatePropertySchema(schema: EditorSchema, key: string, updater: (propertySchema: EditorSchema) => EditorSchema) {
  if (!schema.properties?.[key]) return schema;
  return {
    ...schema,
    properties: {
      ...schema.properties,
      [key]: updater(schema.properties[key]),
    },
  };
}

function setSchemaTitle(schema: EditorSchema, title: string): EditorSchema {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    const nextSchema = { ...schema };
    delete nextSchema.title;
    return nextSchema;
  }
  return {
    ...schema,
    title: normalizedTitle,
  };
}

function appendEditorOption(schema: EditorSchema, nextValue: string) {
  const currentOptions = schema["x-editor"]?.options ?? [];
  return {
    ...schema,
    "x-editor": {
      ...schema["x-editor"],
      options: [...currentOptions, { value: nextValue, label: nextValue }],
    },
  };
}

function renameEditorOption(schema: EditorSchema, previousValue: string | number, nextValue: string) {
  const currentOptions = schema["x-editor"]?.options ?? [];
  return {
    ...schema,
    "x-editor": {
      ...schema["x-editor"],
      options: currentOptions.map((option) => String(option.value) === String(previousValue)
        ? { ...option, value: castLikeOptionValue(option.value, nextValue), label: nextValue }
        : option),
    },
  };
}

function deleteEditorOption(schema: EditorSchema, optionValue: string | number) {
  const currentOptions = schema["x-editor"]?.options ?? [];
  return {
    ...schema,
    "x-editor": {
      ...schema["x-editor"],
      options: currentOptions.filter((option) => String(option.value) !== String(optionValue)),
    },
  };
}

function reorderEditorOptions(schema: EditorSchema, orderedValues: Array<string | number>) {
  const currentOptions = schema["x-editor"]?.options ?? [];
  const byKey = new Map(currentOptions.map((option) => [String(option.value), option]));
  const orderedKeys = new Set(orderedValues.map((value) => String(value)));
  const ordered = orderedValues
    .map((value) => byKey.get(String(value)))
    .filter((option): option is NonNullable<typeof option> => option != null);
  const rest = currentOptions.filter((option) => !orderedKeys.has(String(option.value)));
  return {
    ...schema,
    "x-editor": {
      ...schema["x-editor"],
      options: [...ordered, ...rest],
    },
  };
}

function moveEditorOption(schema: EditorSchema, optionValue: string | number, direction: "up" | "down") {
  const currentOptions = [...(schema["x-editor"]?.options ?? [])];
  const currentIndex = currentOptions.findIndex((option) => String(option.value) === String(optionValue));
  if (currentIndex < 0) return schema;
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= currentOptions.length) return schema;
  const [moved] = currentOptions.splice(currentIndex, 1);
  currentOptions.splice(targetIndex, 0, moved);
  return {
    ...schema,
    "x-editor": {
      ...schema["x-editor"],
      options: currentOptions,
    },
  };
}

function recolorEditorOption(schema: EditorSchema, optionValue: string | number, color: EditorViewOptionColor | null) {
  const currentOptions = schema["x-editor"]?.options ?? [];
  return {
    ...schema,
    "x-editor": {
      ...schema["x-editor"],
      options: currentOptions.map((option) => String(option.value) === String(optionValue) ? { ...option, color: color ?? undefined } : option),
    },
  };
}

function castLikeOptionValue(previousValue: string | number, nextValue: string) {
  if (typeof previousValue === "number" && /^-?\d+(\.\d+)?$/.test(nextValue)) return Number(nextValue);
  return nextValue;
}


function isRequiredField(schema: EditorSchema | undefined, key: string) {
  return schema?.required?.includes(key) ?? false;
}

function getFieldError(
  validationResult: EditorValidationResult | null | undefined,
  sourceId: string | undefined,
  path: JsonPath,
): EditorValidationError | undefined {
  return validationResult?.fieldErrors?.find((error) => {
    const sameSource = !error.sourceId || !sourceId || error.sourceId === sourceId;
    return sameSource && sameJsonPath(error.path, path);
  });
}

function getLocalSchemaError(schemaState: ReturnType<typeof resolveNode> | undefined): string | undefined {
  if (!schemaState?.errors?.length) return undefined;
  return schemaState.errors.find((error) => error.path.length === 0)?.message ?? schemaState.errors[0]?.message;
}

function sameJsonPath(left: JsonPath, right: JsonPath) {
  if (left.length !== right.length) return false;
  return left.every((segment, index) => segment === right[index]);
}

function coerceSchemaEnumValue(rawValue: string, options: unknown[]) {
  const match = options.find((option) => String(option) === rawValue);
  return match ?? rawValue;
}
