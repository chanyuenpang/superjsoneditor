import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getValueAtPath, setValueAtPath } from "../core/document";
import type { JsonPath } from "../core/path";
import { formatPath } from "../core/path";
import { getReferenceLabel, getReferenceUri, isReferenceValue, resolveReferenceDocument, type EditorHost, type ReferenceErrorInfo } from "./host";
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
  type EditorSchema,
  type EditorTableColumn,
  type EditorValidationError,
  type EditorValidationResult,
  type EditorViewOption,
  type EditorViewOptionColor,
} from "./schema";
import { SchemaColumnHeader } from "./SchemaColumnHeader";
import { SchemaOptionFieldEditor } from "./SchemaOptionFieldEditor";
import { icons } from "./icons";

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
  onNavigate: (path: JsonPath) => void;
  onApplyValue: (nextValue: unknown) => void;
  onEditModeChange?: (isEditing: boolean) => void;
  enableRawEditor?: boolean;
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
  onNavigate,
  onApplyValue,
  onEditModeChange,
  readOnly = false,
  enableRawEditor = true,
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
  const canAuthorObjectSchema = Boolean(schema?.properties && onUpdateDocumentSchema && sourceId);
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

  useEffect(() => {
    setRawOpen(false);
    setEditMode(false);
    setSuppressEditToggleUntil(0);
    setNewKey(usesSchemaPropertyCreation ? defaultSchemaPropertyKey : "");
    setNewKeyType("string");
    setFieldOrder(getOrderedKeys(value, schema));
  }, [defaultSchemaPropertyKey, pathKey, usesSchemaPropertyCreation]);

  useEffect(() => {
    setFieldOrder((current) => {
      const nextKeys = getOrderedKeys(value, schema);
      const preserved = current.filter((key) => nextKeys.includes(key));
      const appended = nextKeys.filter((key) => !preserved.includes(key));
      const nextOrder = [...preserved, ...appended];
      if (nextOrder.length === current.length && nextOrder.every((key, index) => key === current[index])) {
        return current;
      }
      return nextOrder;
    });
  }, [schema, value]);

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
    setFieldOrder(nextOrder);
    updateObjectSchema((currentSchema) => reorderSchemaPropertiesToMatch(currentSchema, nextOrder));
  }

  function handlePropertyHandlePointerDown(
    key: string,
    event: { button: number; clientY: number; preventDefault: () => void },
  ) {
    if (!editMode || !canAuthorObjectSchema || event.button !== 0) return;
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
      const restOrder = startOrder.filter((field) => field !== key);
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
      finish(dragging ? insertDraggedField(startOrder, key, currentTargetIndex) : null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onPointerUp);
  }

  return (
    <section className="node-page node-page--object">
      <PageHeader
        path={path}
        title={title}
        isReference={isReference}
        referenceScopeDepth={referenceScopeDepth}
        referenceSourceLabel={referenceSourceLabel}
        onNavigateUp={onNavigateUp}
        onClosePage={onClosePage}
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
                  const fieldLabel = schema?.properties?.[key]?.title ?? host?.getFieldLabel?.([...path, key], key, fieldValue) ?? key;
                  return (
                    <div className="detail-property-stack" key={key}>
                      {!isDragged && dragState && dragState.targetIndex === visibleIndex ? (
                        <div className="detail-drop-indicator" />
                      ) : null}
                      <div
                        className={[
                          "detail-property-item",
                          "object-field-row",
                          pressedField === key ? "is-pressed" : "",
                          isDragged ? "is-dragging" : "",
                          isFieldDirty(fieldValue, isPlainObject(savedValue) ? savedValue[key] : undefined) ? "object-field-row--dirty" : "",
                        ].filter(Boolean).join(" ")}
                        ref={(element) => {
                          propertyItemRefs.current[key] = element;
                        }}
                      >
                        {editMode && canAuthorObjectSchema && schema?.properties?.[key] ? (
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
                          <section className="property-block">
                            <div className="property-heading">
                              <span>{fieldLabel}</span>
                              <div className="property-heading__actions">
                                {isRequiredField(schema, key) ? <small className="field-required">Required</small> : null}
                                <small className={["field-type", getTypeToneClass(fieldValue, host)].filter(Boolean).join(" ")}>{describeType(fieldValue, host)}</small>
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
                            {schema?.properties?.[key]?.description ? <div className="form-hint">{schema.properties[key]?.description}</div> : null}
                            {editMode && isRequiredField(schema, key) ? (
                              <div className="form-hint">必填字段不能删除。</div>
                            ) : null}
                            {isInlineSchemaEditor(fieldValue, schema?.properties?.[key]) ? (
                              renderPrimitiveEditor({
                                value: fieldValue,
                                ariaLabel: `Field ${fieldLabel}`,
                                schema: schema?.properties?.[key],
                                path: [...path, key],
                                host,
                                readOnly: pageReadOnly,
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
                                {renderNestedEntryContent(fieldValue, schema?.properties?.[key], host, resolveNamedSchema)}
                              </button>
                            ) : (
                              renderPrimitiveEditor({
                                value: fieldValue,
                                ariaLabel: `Field ${fieldLabel}`,
                                schema: schema?.properties?.[key],
                                path: [...path, key],
                                host,
                                readOnly: pageReadOnly,
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
                {(editMode || usesSchemaPropertyCreation) && !pageReadOnly ? (
                  <div className="add-object-form">
                    {usesSchemaPropertyCreation ? (
                      <div className="add-object-form__fields">
                        {hasSchemaPropertyChoices ? (
                          <select className="detail-input" value={newKey} onChange={(event) => setNewKey(event.target.value)}>
                            <option value="">Select property</option>
                            {schemaAddablePropertyKeys.map((key) => (
                              <option key={key} value={key}>
                                {schema?.properties?.[key]?.title ?? key}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="detail-input"
                            placeholder="newKey"
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
                          placeholder="newKey"
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
  onUpdateNamedSchema,
  validationResult,
  isReference = false,
  referenceScopeDepth,
  referenceSourceLabel,
  activeChildSegment,
  activeReferenceSourceId,
  onNavigateUp,
  onClosePage,
  onNavigate,
  onApplyValue,
  onEditModeChange,
  readOnly = false,
  enableRawEditor = true,
}: ValueInspectorProps & { value: unknown[] }) {
  const [rawOpen, setRawOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [suppressEditToggleUntil, setSuppressEditToggleUntil] = useState(0);
  const [pendingRow, setPendingRow] = useState<unknown | null>(null);
  const [suppressRowActionsUntil, setSuppressRowActionsUntil] = useState(0);
  const [hostActionError, setHostActionError] = useState<string | null>(null);
  const [isCreatingReferenceRow, setIsCreatingReferenceRow] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const [tableViewportWidth, setTableViewportWidth] = useState(0);
  const pathKey = path.join("/");
  const canEditCurrentPage = Boolean(onEditModeChange);
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
  const arrayError = getFieldError(validationResult, sourceId, path)?.message ?? getLocalSchemaError(schemaState);
  const schemaItemsSignature = JSON.stringify(schema?.items ?? null);
  const referenceViewSchema = useMemo(
    () => resolveReferenceViewSchema(schema?.items, resolveNamedSchema),
    [resolveNamedSchema, schema?.items],
  );
  const referenceViewSchemaRef = schema?.items?.["x-editor"]?.reference?.view?.schemaRef;
  const referenceViewColumns = useMemo(
    () => getReferenceViewColumns(value, referenceViewSchema, host),
    [host, referenceViewSchema, value],
  );
  const showReferenceProjectionTable = referenceViewColumns.length > 0;
  const referenceItemSchema = schema?.items;
  const referenceSchema = referenceItemSchema?.["x-editor"]?.reference;
  const configuredTableColumns = useMemo(
    () => getConfiguredTableColumns(showReferenceProjectionTable ? referenceViewSchema : referenceItemSchema),
    [referenceItemSchema, referenceViewSchema, showReferenceProjectionTable],
  );
  const [sortState, setSortState] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [isColumnManagerOpen, setIsColumnManagerOpen] = useState(false);
  const [pressedColumnKey, setPressedColumnKey] = useState<string | null>(null);
  const [dragPreviewKeys, setDragPreviewKeys] = useState<string[] | null>(null);
  const [dragGhost, setDragGhost] = useState<{ key: string; label: string; x: number; y: number } | null>(null);
  const dragPreviewKeysRef = useRef<string[] | null>(null);
  const dragStateRef = useRef<{
    key: string;
    label: string;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);
  const showStructuralRowActions = editMode && !pageReadOnly;
  const availableSchemaColumns = useMemo(
    () => getAvailableSchemaColumns(showReferenceProjectionTable ? referenceViewSchema : referenceItemSchema),
    [referenceItemSchema, referenceViewSchema, showReferenceProjectionTable],
  );
  const canAuthorTableSchema = Boolean(
    !pageReadOnly && (
      (showReferenceProjectionTable && referenceViewSchemaRef && onUpdateNamedSchema) ||
      (!showReferenceProjectionTable && referenceItemSchema && onUpdateDocumentSchema && sourceId)
    ),
  );
  const columns = useMemo(
    () => getArrayColumns(value, host, schema?.items, referenceViewColumns, configuredTableColumns),
    [value, host, schema?.items, referenceViewColumns, configuredTableColumns],
  );
  const managedColumns = useMemo(
    () => getManagedTableColumns(configuredTableColumns, columns, availableSchemaColumns),
    [availableSchemaColumns, columns, configuredTableColumns],
  );
  const orderedColumns = useMemo(
    () => dragPreviewKeys ? ["#", ...dragPreviewKeys] : columns,
    [columns, dragPreviewKeys],
  );
  const objectRows = useMemo(() => hasObjectTableRows(value, host), [value, host]);
  const displayRows = useMemo(
    () => buildArrayDisplayRows(value, sortState, referenceViewColumns, configuredTableColumns, host),
    [value, sortState, referenceViewColumns, configuredTableColumns, host],
  );
  const columnWidths = useMemo(
    () => getArrayColumnWidths(value, orderedColumns, host, schema?.items, referenceViewColumns, configuredTableColumns),
    [value, orderedColumns, host, schema?.items, referenceViewColumns, configuredTableColumns],
  );
  const tableMinWidth = useMemo(
    () => orderedColumns.reduce((total, column) => total + (columnWidths[column] ?? 140), 0),
    [orderedColumns, columnWidths],
  );
  const tableWidth = tableMinWidth + (editMode ? 144 : 0);
  const trailingColumnKey = orderedColumns.at(-1) ?? null;
  const resolvedTableWidth = Math.max(tableWidth, tableViewportWidth);
  const expandedTrailingWidth = Math.max(0, tableViewportWidth - tableWidth - 1);
  // 预留 1px，避免 collapsed border / sticky 分隔线导致横向滚动条。

  // 棰勭暀 1px锛岄伩鍏?collapsed border / sticky 鍒嗛殧绾挎妸 filler 琛ㄦ牸鎾戝嚭妯悜婊氬姩鏉°€?
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
    setDragGhost(null);
  }, [pathKey, schemaItemsSignature]);

  useEffect(() => {
    dragPreviewKeysRef.current = dragPreviewKeys;
  }, [dragPreviewKeys]);

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
    if (showReferenceProjectionTable) {
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
      setHostActionError("褰撳墠瀹夸富鏈帴鍏ュ紩鐢ㄨ鍒涘缓鑳藉姏");
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

  function updateTableSchemaColumns(updater: (columns: EditorTableColumn[]) => EditorTableColumn[]) {
    if (!canAuthorTableSchema) return;
    const applyUpdate = (targetSchema: EditorSchema) => setSchemaTableColumns(targetSchema, updater(getManagedTableColumns(
      getConfiguredTableColumns(targetSchema),
      columns,
      getAvailableSchemaColumns(targetSchema),
    )));
    if (showReferenceProjectionTable && referenceViewSchemaRef) {
      void onUpdateNamedSchema?.(referenceViewSchemaRef, applyUpdate);
      return;
    }
    if (sourceId) {
      void onUpdateDocumentSchema?.(sourceId, path, "items", applyUpdate);
    }
  }

  function updateSingleColumn(
    key: string,
    updater: (column: EditorTableColumn) => EditorTableColumn,
  ) {
    updateTableSchemaColumns((currentColumns) =>
      currentColumns.map((column) => (column.key === key ? updater(column) : column)),
    );
  }

  return (
    <section className="node-page node-page--array">
      <PageHeader
        path={path}
        title={title}
        isReference={isReference}
        referenceScopeDepth={referenceScopeDepth}
        referenceSourceLabel={referenceSourceLabel}
        onNavigateUp={onNavigateUp}
        onClosePage={onClosePage}
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
            <div className="table-shell">
              <div className="table-scroll" ref={tableScrollRef}>
              <table
                className="data-table array-workspace"
                style={{
                  width: `${resolvedTableWidth}px`,
                  minWidth: `${tableWidth}px`,
                }}
              >
                <colgroup>
                  {showStructuralRowActions ? <col data-column="__edit__" style={{ width: "144px" }} /> : null}
                  {orderedColumns.map((column) => (
                    <col
                      data-column={column}
                      data-column-field={column === "#" ? undefined : column}
                      key={column}
                      style={{ width: `${(columnWidths[column] ?? 140) + (column === trailingColumnKey ? expandedTrailingWidth : 0)}px` }}
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
                        const referenceColumn = referenceViewColumns.find((entry) => entry.key === column);
                        const configuredColumn = configuredTableColumns.find((entry) => entry.key === column);
                        const columnLabel = getConfiguredColumnLabel(column, configuredColumn, referenceColumn, schema?.items);
                        const isDescriptionColumn = referenceColumn?.key === "description";
                        const isSortable = Boolean(configuredColumn?.sortable);
                        const isWrapped = Boolean(configuredColumn?.wrap);
                        const typeLabel = column === "#"
                          ? undefined
                          : (showReferenceProjectionTable || configuredColumn
                            ? describeArrayColumnType(value, column, host)
                            : describeArrayColumnType(value, column, host));
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
                        {canAuthorTableSchema && column !== "#" ? (
                          <SchemaColumnHeader
                            fieldName={column}
                            isDragging={dragStateRef.current?.key === column && dragStateRef.current.dragging}
                            label={columnLabel}
                            onDragEnd={() => {
                              document.body.classList.remove("is-dragging-column");
                              const previewKeys = dragPreviewKeysRef.current;
                              dragStateRef.current = null;
                              if (previewKeys) {
                                updateTableSchemaColumns((current) => reorderColumnsByKeys(current, previewKeys));
                              }
                              dragPreviewKeysRef.current = null;
                              setDragPreviewKeys(null);
                              setDragGhost(null);
                              setPressedColumnKey(null);
                            }}
                            onDragMove={(_fieldName, clientX) => {
                              const state = dragStateRef.current;
                              if (!state) return;
                              const scrollContainer = tableScrollRef.current;
                              const direction = resolveAutoScrollDirection(scrollContainer, clientX);
                              if (direction !== 0) {
                                scrollColumnContainer(scrollContainer, direction);
                              }
                              const slots = collectColumnSlots(scrollContainer, state.key);
                              const pointerXInScrollSpace = getPointerXInScrollSpace(scrollContainer, clientX);
                              const nextPreview = buildPreviewOrderFromSlots(managedColumns.map((managedColumn) => managedColumn.key), state.key, slots, pointerXInScrollSpace);
                              dragPreviewKeysRef.current = nextPreview;
                              setDragPreviewKeys(nextPreview);
                              setDragGhost({
                                key: state.key,
                                label: state.label,
                                x: clientX + 14,
                                y: state.startY + 14,
                              });
                            }}
                            onDragStart={(_fieldName, rect, pointerOffsetX) => {
                              dragStateRef.current = {
                                key: column,
                                label: columnLabel,
                                startX: rect.left + pointerOffsetX,
                                startY: rect.top,
                                dragging: true,
                              };
                              document.body.classList.add("is-dragging-column");
                              setIsColumnManagerOpen(false);
                              setDragGhost({
                                key: column,
                                label: columnLabel,
                                x: rect.left + pointerOffsetX,
                                y: rect.top,
                              });
                            }}
                            onHide={() => updateTableSchemaColumns((current) => current.filter((entry) => entry.key !== column))}
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
                              setSortState(direction ? { key: column, direction } : null);
                            }}
                            onToggleSortable={() => updateSingleColumn(column, (current) => ({ ...current, sortable: !current.sortable || undefined }))}
                            onToggleWrap={() => updateSingleColumn(column, (current) => ({ ...current, wrap: !current.wrap || undefined }))}
                            pressed={pressedColumnKey === column}
                            sortable={isSortable}
                            sortDirection={sortState?.key === column ? sortState.direction : null}
                            typeLabel={typeLabel}
                            wrapped={isWrapped}
                            width={columnWidths[column] ?? 140}
                          />
                        ) : (
                          <div className="array-column-header">
                            <span>{columnLabel}</span>
                            {typeLabel ? <small className={getTypeToneClassForType(typeLabel)}>{typeLabel}</small> : null}
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
                        <tr
                          className={[
                            clickable ? "is-clickable" : "",
                            activeChildSegment === sourceIndex || isActiveReferenceRow ? "is-active-row" : "",
                          ].filter(Boolean).join(" ")}
                          data-row-index={sourceIndex}
                          key={`${sourceIndex}:${summarizeRowIdentity(item, sourceIndex, path, host)}`}
                          onClick={clickable ? () => onNavigate([...path, sourceIndex]) : undefined}
                        >
                          {showStructuralRowActions ? (
                            <td className="array-column--sticky array-column--actions" onClick={(event) => event.stopPropagation()}>
                              <div className="row-action-buttons">
                                <button
                                  className="ghost-button compact-button"
                                  disabled={Date.now() < suppressRowActionsUntil}
                                  type="button"
                                  onPointerDown={(event) => event.preventDefault()}
                                  onPointerUp={(event) => {
                                    event.stopPropagation();
                                    const next = [...value];
                                    next.splice(sourceIndex + 1, 0, cloneJsonValue(item));
                                    onApplyValue(next);
                                  }}
                                >
                                  Copy
                                </button>
                                <button
                                  className="danger-icon-button"
                                  disabled={Date.now() < suppressRowActionsUntil || minItemsReached}
                                  type="button"
                                  onPointerDown={(event) => event.preventDefault()}
                                  onPointerUp={(event) => {
                                    event.stopPropagation();
                                    if ((schemaState?.arrayCapabilities?.minItems ?? 0) >= value.length) return;
                                    onApplyValue(value.filter((_, rowIndex) => rowIndex !== sourceIndex));
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          ) : null}
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
                            const referenceColumn = referenceViewColumns.find((entry) => entry.key === column);
                            if (!referenceColumn) {
                              return <td key={`${sourceIndex}:${column}`} />;
                            }
                            const imageColumn = isImageDisplaySchema(referenceColumn.columnSchema);
                            const configuredColumn = configuredTableColumns.find((entry) => entry.key === column);
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
                      );
                    }
                    if (objectRows) {
                      const objectRow = isObjectTableRow(item, host);
                      if (!objectRow) {
                        const mixedPreview = previewValue(item, host);
                        return (
                          <tr
                            className={[
                              "array-row--mixed",
                              clickable ? "is-clickable" : "",
                              activeChildSegment === sourceIndex || isActiveReferenceRow ? "is-active-row" : "",
                            ].filter(Boolean).join(" ")}
                            data-row-index={sourceIndex}
                            key={`${sourceIndex}:${summarizeRowIdentity(item, sourceIndex, path, host)}`}
                            onClick={clickable ? () => onNavigate([...path, sourceIndex]) : undefined}
                          >
                            {showStructuralRowActions ? (
                              <td className="array-column--sticky array-column--actions" onClick={(event) => event.stopPropagation()}>
                                <div className="row-action-buttons">
                                  <button
                                    className="ghost-button compact-button"
                                    disabled={Date.now() < suppressRowActionsUntil}
                                    type="button"
                                    onPointerDown={(event) => event.preventDefault()}
                                    onPointerUp={(event) => {
                                      event.stopPropagation();
                                      const next = [...value];
                                      next.splice(sourceIndex + 1, 0, cloneJsonValue(item));
                                      onApplyValue(next);
                                    }}
                                  >
                                    Copy
                                  </button>
                                  <button
                                    className="danger-icon-button"
                                    disabled={Date.now() < suppressRowActionsUntil || minItemsReached}
                                    type="button"
                                    onPointerDown={(event) => event.preventDefault()}
                                    onPointerUp={(event) => {
                                      event.stopPropagation();
                                      if ((schemaState?.arrayCapabilities?.minItems ?? 0) >= value.length) return;
                                      onApplyValue(value.filter((_, rowIndex) => rowIndex !== sourceIndex));
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            ) : null}
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
                        );
                      }

                      const record = item as Record<string, unknown>;
                      return (
                        <tr
                          className={[
                            clickable ? "is-clickable" : "",
                            activeChildSegment === sourceIndex ? "is-active-row" : "",
                          ].filter(Boolean).join(" ")}
                          data-row-index={sourceIndex}
                          key={`${sourceIndex}:${summarizeRowIdentity(item, sourceIndex, path, host)}`}
                          onClick={clickable ? () => onNavigate([...path, sourceIndex]) : undefined}
                      >
                        {showStructuralRowActions ? (
                          <td className="array-column--sticky array-column--actions" onClick={(event) => event.stopPropagation()}>
                            <div className="row-action-buttons">
                                  <button
                                    className="ghost-button compact-button"
                                    disabled={Date.now() < suppressRowActionsUntil}
                                    type="button"
                                onPointerDown={(event) => event.preventDefault()}
                                onPointerUp={(event) => {
                                  event.stopPropagation();
                                  const next = [...value];
                                  next.splice(sourceIndex + 1, 0, cloneJsonValue(item));
                                  onApplyValue(next);
                                }}
                              >
                                Copy
                              </button>
                              <button
                                className="danger-icon-button"
                                disabled={Date.now() < suppressRowActionsUntil || minItemsReached}
                                type="button"
                                onPointerDown={(event) => event.preventDefault()}
                                onPointerUp={(event) => {
                                  event.stopPropagation();
                                  if ((schemaState?.arrayCapabilities?.minItems ?? 0) >= value.length) return;
                                  onApplyValue(value.filter((_, rowIndex) => rowIndex !== sourceIndex));
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        ) : null}
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
                            const hasColumn = Object.prototype.hasOwnProperty.call(record, column);
                            const configuredColumn = configuredTableColumns.find((entry) => entry.key === column);
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
                              <span
                                className={[
                                  "array-cell-summary",
                                  columnIndex === 0 ? "array-cell-summary--identity" : "",
                                  !hasColumn ? "array-cell-summary--missing" : "",
                                ].filter(Boolean).join(" ")}
                              >
                                {hasColumn ? previewValue(record[column], host) : "-"}
                              </span>
                            </td>
                            );
                          })}
                        </tr>
                      );
                    }

                    return (
                        <tr
                          className={[
                            clickable ? "is-clickable" : "",
                            activeChildSegment === sourceIndex || isActiveReferenceRow ? "is-active-row" : "",
                          ].filter(Boolean).join(" ")}
                        data-row-index={sourceIndex}
                        key={`${sourceIndex}:${String(item)}`}
                        onClick={clickable ? () => onNavigate([...path, sourceIndex]) : undefined}
                      >
                        {showStructuralRowActions ? (
                          <td className="array-column--sticky array-column--actions" onClick={(event) => event.stopPropagation()}>
                            <div className="row-action-buttons">
                              <button
                                className="ghost-button compact-button"
                                disabled={Date.now() < suppressRowActionsUntil}
                                type="button"
                                onPointerDown={(event) => event.preventDefault()}
                                onPointerUp={(event) => {
                                  event.stopPropagation();
                                  const next = [...value];
                                  next.splice(sourceIndex + 1, 0, cloneJsonValue(item));
                                  onApplyValue(next);
                                }}
                              >
                                Copy
                              </button>
                              <button
                                className="danger-icon-button"
                                disabled={Date.now() < suppressRowActionsUntil || minItemsReached}
                                type="button"
                                onPointerDown={(event) => event.preventDefault()}
                                onPointerUp={(event) => {
                                  event.stopPropagation();
                                  if ((schemaState?.arrayCapabilities?.minItems ?? 0) >= value.length) return;
                                  onApplyValue(value.filter((_, rowIndex) => rowIndex !== sourceIndex));
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        ) : null}
                        <td className={["array-column--sticky", "array-column--index", showStructuralRowActions ? "array-column--after-actions" : ""].filter(Boolean).join(" ")}>
                          <span className="array-cell-summary array-cell-summary--identity array-cell-summary--index">{displayIndex + 1}</span>
                        </td>
                        <td>{describeType(item, host)}</td>
                        <td>
                          {isNavigable(item) ? (
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
                              onChange(nextValue) {
                                onApplyValue(setValueAtPath(value, [sourceIndex], nextValue));
                              },
                            })
                          )}
                        </td>
                      </tr>
                    );
                  })}
                    {showStructuralRowActions && showReferenceProjectionTable ? (
                      renderReferenceCreateRow({
                        columns: orderedColumns,
                        createDisabled: maxItemsReached || isCreatingReferenceRow,
                        onCreate: handleCreateReferenceRow,
                      })
                    ) : null}
                    {showStructuralRowActions && !showReferenceProjectionTable && pendingRow !== null ? (
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
                {canAuthorTableSchema ? (
                  <button
                    className="ghost-button compact-button"
                    type="button"
                    onClick={() => {
                      setIsColumnManagerOpen((current) => !current);
                    }}
                  >
                    Columns
                  </button>
                ) : null}
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
              </div>
              {canAuthorTableSchema && isColumnManagerOpen ? (
                <div className="schema-column-manager">
                  <div className="schema-column-manager__section">
                    <strong>Visible columns</strong>
                    <div className="form-hint">Rename, reorder, resize, and wrap columns from the table headers.</div>
                    {managedColumns.map((column) => {
                      const label = getConfiguredColumnLabel(column.key, column, referenceViewColumns.find((entry) => entry.key === column.key), schema?.items);
                      return (
                        <div className="schema-column-manager__row" key={column.key}>
                          <span>{label}</span>
                          <button
                            aria-label={`Hide column ${label}`}
                            type="button"
                            onClick={() => updateTableSchemaColumns((current) => current.filter((entry) => entry.key !== column.key))}
                          >
                            Hide
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="schema-column-manager__section">
                    <strong>Hidden columns</strong>
                    {availableSchemaColumns.filter((column) => !managedColumns.some((entry) => entry.key === column.key)).map((column) => (
                      <div className="schema-column-manager__row" key={column.key}>
                        <span>{column.label}</span>
                        <button
                          aria-label={`Show column ${column.label}`}
                          type="button"
                          onClick={() => updateTableSchemaColumns((current) => [...current, { key: column.key }])}
                        >
                          Show
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
            {dragGhost ? (
              <div
                className="column-drag-ghost"
                style={{ left: dragGhost.x, top: dragGhost.y }}
              >
                <div className="column-drag-ghost-name">{dragGhost.label}</div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
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
  onApplyValue,
  onEditModeChange,
  readOnly = false,
  enableRawEditor = true,
}: ValueInspectorProps) {
  const [rawOpen, setRawOpen] = useState(false);
  const pathKey = path.join("/");
  const canEditCurrentPage = Boolean(onEditModeChange);
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
    <section className="node-page node-page--primitive">
      <PageHeader
        path={path}
        title={title}
        isReference={isReference}
        referenceScopeDepth={referenceScopeDepth}
        referenceSourceLabel={referenceSourceLabel}
        onNavigateUp={onNavigateUp}
        onClosePage={onClosePage}
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
                <section className={["property-block", "object-field-row", isFieldDirty(value, savedValue) ? "object-field-row--dirty" : ""].filter(Boolean).join(" ")}>
                  <div className="property-heading">
                    <span>{schema?.title ?? (path.at(-1) == null ? "value" : String(path.at(-1)))}</span>
                    <small className={["field-type", getTypeToneClass(value)].filter(Boolean).join(" ")}>{describeType(value)}</small>
                  </div>
                  {schema?.description ? <div className="form-hint">{schema.description}</div> : null}
                  {renderPrimitiveEditor({
                    value,
                    ariaLabel: `Field ${path.at(-1) == null ? "value" : String(path.at(-1))}`,
                    schema,
                    path,
                    host,
                    readOnly: pageReadOnly,
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
  referenceError,
  referenceScopeDepth,
  referenceSourceLabel,
  onNavigateUp,
  onClosePage,
}: ValueInspectorProps & { referenceError: ReferenceErrorInfo }) {
  return (
    <section className="node-page node-page--primitive">
      <PageHeader
        path={path}
        title={title ?? "Reference Error"}
        isReference
        referenceScopeDepth={referenceScopeDepth}
        referenceSourceLabel={referenceSourceLabel}
        onNavigateUp={onNavigateUp}
        onClosePage={onClosePage}
      />
      <div className="node-page__content">
        <div className="object-page-body">
          <div className="object-scroll">
            <div className="property-list">
              <section className="property-block object-field-row">
                <div className="property-heading">
                  <span>Reference Error</span>
                  <small className="field-type tone-reference">reference</small>
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
        <div className="detail-title">{props.title ?? formatPath(props.path)}</div>
      </div>
      <div className="page-header__actions">
        {props.referenceSourceLabel ? <div className="detail-source-label">{props.referenceSourceLabel}</div> : null}
        {props.onClosePage ? (
          <button className="ghost-button compact-button" type="button" onClick={props.onClosePage}>
            Close
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
      <section className="property-block object-field-row">
        <div className="property-heading">
          <span>Schema 鍒嗘敮</span>
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
          {!props.readOnly ? (
            <button className="primary-button" type="button" onClick={handleApplyJson}>
              Apply JSON
            </button>
          ) : null}
        </div>
        {errorMessage ? <div className="form-hint form-hint--danger">{errorMessage}</div> : null}
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
  onUpdateSchema?: (updater: (schema: EditorSchema) => EditorSchema) => void;
  onChange: (nextValue: unknown) => void;
}) {
  const readOnly = props.readOnly || props.schema?.const !== undefined;
  const nullableBranch = getNullableBranchSchema(props.schema);
  const nullableLabel = getNullableBranchLabel(nullableBranch);
  const editorOptionsState = resolveEditorOptions(props.schema, props.host);
  const referenceOptions = props.schema?.["x-editor"]?.reference && props.host?.getReferenceOptions
    ? props.host.getReferenceOptions({
      path: props.path,
      value: props.value,
      schema: props.schema,
      reference: props.schema["x-editor"]?.reference,
    })
    : [];

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

  if (props.schema?.["x-editor"]?.fieldType === "multi-select" && Array.isArray(props.value)) {
    return withNullableControls(
      <SchemaOptionFieldEditor
        allowAuthoring={Boolean(props.onUpdateSchema && props.schema?.["x-editor"]?.options)}
        ariaLabel={props.ariaLabel}
        mode="multi"
        options={editorOptionsState.options}
        readOnly={readOnly}
        value={props.value as Array<string | number>}
        onEdit={(nextValue) => props.onChange(nextValue)}
        onCreateOption={props.onUpdateSchema && props.schema?.["x-editor"]?.options
          ? (nextValue) => props.onUpdateSchema?.((currentSchema) => appendEditorOption(currentSchema, nextValue))
          : undefined}
        onDeleteOption={props.onUpdateSchema && props.schema?.["x-editor"]?.options
          ? (optionValue) => props.onUpdateSchema?.((currentSchema) => deleteEditorOption(currentSchema, optionValue))
          : undefined}
        onMoveOption={props.onUpdateSchema && props.schema?.["x-editor"]?.options
          ? (optionValue, direction) => props.onUpdateSchema?.((currentSchema) => moveEditorOption(currentSchema, optionValue, direction))
          : undefined}
        onRenameOption={props.onUpdateSchema && props.schema?.["x-editor"]?.options
          ? (previousValue, nextValue) => props.onUpdateSchema?.((currentSchema) => renameEditorOption(currentSchema, previousValue, nextValue))
          : undefined}
        onSetOptionColor={props.onUpdateSchema && props.schema?.["x-editor"]?.options
          ? (optionValue, color) => props.onUpdateSchema?.((currentSchema) => recolorEditorOption(currentSchema, optionValue, color))
          : undefined}
        placeholder="Select or create options"
      />,
      nullableBranch,
      readOnly,
      () => props.onChange(null),
    );
  }

  if (editorOptionsState.options.length > 0 && props.schema?.["x-editor"]?.fieldType === "select") {
    return withNullableControls(
      <SchemaOptionFieldEditor
        allowAuthoring={Boolean(props.onUpdateSchema && props.schema?.["x-editor"]?.options)}
        ariaLabel={props.ariaLabel}
        mode="single"
        options={editorOptionsState.options}
        readOnly={readOnly}
        value={props.value == null || props.value === "" ? [] : [props.value as string | number]}
        onEdit={(nextValue) => props.onChange(nextValue[0] ?? "")}
        onCreateOption={props.onUpdateSchema && props.schema?.["x-editor"]?.options
          ? (nextValue) => props.onUpdateSchema?.((currentSchema) => appendEditorOption(currentSchema, nextValue))
          : undefined}
        onDeleteOption={props.onUpdateSchema && props.schema?.["x-editor"]?.options
          ? (optionValue) => props.onUpdateSchema?.((currentSchema) => deleteEditorOption(currentSchema, optionValue))
          : undefined}
        onMoveOption={props.onUpdateSchema && props.schema?.["x-editor"]?.options
          ? (optionValue, direction) => props.onUpdateSchema?.((currentSchema) => moveEditorOption(currentSchema, optionValue, direction))
          : undefined}
        onRenameOption={props.onUpdateSchema && props.schema?.["x-editor"]?.options
          ? (previousValue, nextValue) => props.onUpdateSchema?.((currentSchema) => renameEditorOption(currentSchema, previousValue, nextValue))
          : undefined}
        onSetOptionColor={props.onUpdateSchema && props.schema?.["x-editor"]?.options
          ? (optionValue, color) => props.onUpdateSchema?.((currentSchema) => recolorEditorOption(currentSchema, optionValue, color))
          : undefined}
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
      <select
        aria-label={props.ariaLabel}
        className="detail-input"
        disabled={readOnly}
        value={String(props.value ?? "")}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {referenceOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>,
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
  if (!nullableBranch) return control;
  return (
    <div className="nullable-editor">
      {control}
      <button className="ghost-button compact-button" type="button" disabled={readOnly} onClick={onSetNull}>
        Set null
      </button>
    </div>
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

type ResolvedEditorOption = {
  value: string | number;
  label: string;
  color: EditorViewOptionColor | null;
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
) {
  if (configuredColumns.length > 0) {
    return ["#", ...configuredColumns.map((column) => column.key)];
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

  return ["#", "Type", "Value"];
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
) {
  const widths: Record<string, number> = {};
  const sampleSize = Math.min(items.length, 40);

  for (const column of columns) {
    const referenceColumn = referenceViewColumns.find((entry) => entry.key === column);
    const configuredColumn = configuredColumns.find((entry) => entry.key === column);
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
        const cellText = getReferenceTableCellText(items[index], referenceColumn, itemSchema, host);
        contentWidth = Math.max(contentWidth, measureColumnText(cellText));
      }
      widths[column] = clampColumnWidth(contentWidth, configuredColumn?.label ?? referenceColumn.title);
      continue;
    }

    if (column === "#") {
      widths[column] = 45;
      continue;
    }

    const headerWidth = measureColumnText(configuredColumn?.label ?? itemSchema?.properties?.[column]?.title ?? column);
    let contentWidth = headerWidth;

    if (hasObjectTableRows(items, host)) {
      for (let index = 0; index < sampleSize; index += 1) {
        const item = items[index];
        if (!isObjectTableRow(item, host)) continue;
        const record = item as Record<string, unknown>;
        contentWidth = Math.max(contentWidth, measureColumnText(previewValue(record[column], host)));
      }
      widths[column] = clampColumnWidth(contentWidth, column);
      continue;
    }

    if (column === "Type") {
      widths[column] = 110;
      continue;
    }

    for (let index = 0; index < sampleSize; index += 1) {
      contentWidth = Math.max(contentWidth, measureColumnText(previewValue(items[index], host)));
    }
    widths[column] = clampColumnWidth(contentWidth, column);
  }

  return widths;
}

function describeArrayColumnType(items: unknown[], column: string, host?: EditorHost) {
  if (column === "#") return "index";
  if (column === "Type") return "type";
  if (column === "Value") return "value";

  const sample = items.find((item) => isPlainObject(item) && (item as Record<string, unknown>)[column] !== undefined) as
    | Record<string, unknown>
    | undefined;
  return describeType(sample?.[column], host);
}

function getConfiguredTableColumns(schema: EditorSchema | undefined) {
  return schema?.["x-editor"]?.table?.columns ?? [];
}

function getAvailableSchemaColumns(schema: EditorSchema | undefined): Array<{ key: string; label: string }> {
  if (!schema?.properties) return [];
  return Object.entries(schema.properties).map(([key, propertySchema]) => ({
    key,
    label: propertySchema.title ?? key,
  }));
}

function getManagedTableColumns(
  configuredColumns: EditorTableColumn[],
  renderedColumns: string[],
  availableColumns: Array<{ key: string; label: string }>,
) {
  if (configuredColumns.length > 0) {
    return configuredColumns;
  }
  return renderedColumns
    .filter((key) => key !== "#")
    .filter((key) => availableColumns.some((entry) => entry.key === key))
    .map((key) => ({ key }));
}

function setSchemaTableColumns(schema: EditorSchema, columns: EditorTableColumn[]): EditorSchema {
  return {
    ...schema,
    "x-editor": {
      ...schema["x-editor"],
      table: {
        columns,
      },
    },
  };
}

function moveTableColumn(columns: EditorTableColumn[], key: string, direction: "left" | "right") {
  const currentIndex = columns.findIndex((column) => column.key === key);
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
    const leftRank = rank.get(left.key);
    const rightRank = rank.get(right.key);
    if (leftRank == null && rightRank == null) return 0;
    if (leftRank == null) return 1;
    if (rightRank == null) return -1;
    return leftRank - rightRank;
  });
}

function getConfiguredColumnLabel(
  column: string,
  configuredColumn: EditorTableColumn | undefined,
  referenceColumn: ReferenceViewColumn | undefined,
  itemSchema: EditorSchema | undefined,
) {
  if (column === "#") return "#";
  return configuredColumn?.label ?? referenceColumn?.title ?? itemSchema?.properties?.[column]?.title ?? column;
}

function buildArrayDisplayRows(
  items: unknown[],
  sortState: { key: string; direction: "asc" | "desc" } | null,
  referenceViewColumns: ReferenceViewColumn[],
  configuredColumns: EditorTableColumn[],
  host?: EditorHost,
): ArrayDisplayRow[] {
  const rows = items.map((item, sourceIndex) => ({ item, sourceIndex }));
  if (!sortState) return rows;
  const configuredColumn = configuredColumns.find((column) => column.key === sortState.key);
  if (!configuredColumn?.sortable) return rows;
  const referenceColumn = referenceViewColumns.find((column) => column.key === sortState.key);
  return [...rows].sort((left, right) => {
    const leftValue = normalizeSortValue(left.item, sortState.key, referenceColumn, host);
    const rightValue = normalizeSortValue(right.item, sortState.key, referenceColumn, host);
    const result = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });
    return sortState.direction === "asc" ? result : -result;
  });
}

function normalizeSortValue(
  item: unknown,
  key: string,
  referenceColumn: ReferenceViewColumn | undefined,
  host?: EditorHost,
) {
  if (referenceColumn) {
    return getReferenceTableCellText(item, referenceColumn, undefined, host).trim();
  }
  if (isPlainObject(item)) {
    return previewValue((item as Record<string, unknown>)[key], host).trim();
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
  return getReferenceUri(value);
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
        {props.columns.map((column, columnIndex) => (
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

  const pendingType = describeType(props.pendingRow, props.host);
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
      <td>{pendingType}</td>
      <td>
        {renderPendingArrayCell(props.pendingRow, props.onChangePendingRow)}
      </td>
    </tr>
  );
}

function renderReferenceCreateRow(props: {
  columns: string[];
  createDisabled?: boolean;
  onCreate: () => void;
}) {
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
        <span className="array-cell-summary array-cell-summary--pending">鏂板缓寮曠敤椤瑰皢鐢卞涓诲垱寤哄苟鍥炲～</span>
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

  return (
    <div className={`reference-preview reference-preview--${referenceSchema?.view?.layout ?? "inline"}`.trim()}>
      {renderReferenceProjection(resolved.value, targetSchema, referenceViewColumns, host)}
    </div>
  );
}

function renderReferenceProjection(
  targetValue: unknown,
  targetSchema: EditorSchema,
  columns: ReferenceViewColumn[],
  host?: EditorHost,
) {
  const entries = columns
    .map((column) => {
      const fieldValue = getValueAtPath(targetValue, column.path);
      const fieldSchema = mergeProjectedFieldSchema(
        resolveSchemaAtPath(targetSchema, column.path, targetValue),
        column.columnSchema,
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
) {
  if (!isReferenceValue(value)) {
    return previewValue(value, host);
  }
  const uri = getReferenceUri(value);
  if (!uri) {
    return previewValue(value, host);
  }
  const resolved = resolveReferenceDocument(uri, host);
  if (!resolved.ok) {
    return previewValue(value, host);
  }
  const targetSchemaRef = itemSchema?.["x-editor"]?.reference?.target?.schemaRef;
  const fieldValue = getValueAtPath(resolved.value, column.path);
  if (fieldValue == null || fieldValue === "") {
    return "";
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
  if (targetSchemaRef) {
    return previewValue(fieldValue, host);
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
  if (!isReferenceValue(value)) {
    return <span className="array-cell-summary">{previewValue(value, host)}</span>;
  }

  const referenceSchema = itemSchema?.["x-editor"]?.reference;
  const targetSchemaRef = referenceSchema?.target?.schemaRef;
  const targetSchema = targetSchemaRef ? resolveNamedSchema?.(targetSchemaRef) : undefined;
  const uri = getReferenceUri(value);
  if (!uri || !targetSchema) {
    return <span className="array-cell-summary">{previewValue(value, host)}</span>;
  }

  const resolved = resolveReferenceDocument(uri, host);
  if (!resolved.ok) {
    return <span className="array-cell-summary">{previewValue(value, host)}</span>;
  }

  const fieldValue = getValueAtPath(resolved.value, column.path);
  const fieldSchema = mergeProjectedFieldSchema(
    resolveSchemaAtPath(targetSchema, column.path, resolved.value),
    column.columnSchema,
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
  host?: EditorHost,
) {
  const columns = getReferenceViewColumnsFromSchema(viewSchema);
  if (columns.length === 0) {
    return [];
  }

  return columns.filter((column) =>
    items.some((item) => {
      if (!isReferenceValue(item)) return false;
      const uri = getReferenceUri(item);
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
  return {
    value: rawValue,
    label: typeof rawLabel === "string" && rawLabel.trim().length > 0 ? rawLabel : String(rawValue),
    color: isEditorOptionColor(rawColor) ? rawColor : null,
  };
}

function isEditorOptionColor(value: unknown): value is EditorViewOptionColor {
  return ["red", "orange", "yellow", "green", "blue", "gray", "gold"].includes(String(value));
}

function isInlineSchemaEditor(value: unknown, schema: EditorSchema | undefined) {
  const fieldType = schema?.["x-editor"]?.fieldType;
  if (fieldType === "select") {
    return value == null || typeof value === "string" || typeof value === "number";
  }
  if (fieldType === "multi-select") {
    return Array.isArray(value);
  }
  return false;
}

function renderReferenceFieldValue(value: unknown, schema: EditorSchema | undefined, host?: EditorHost): ReactNode {
  const display = schema?.["x-editor"]?.display;
  if (typeof value === "string" && display?.kind === "image") {
    return <ImagePreview value={value} schema={schema} host={host} />;
  }
  if (typeof value === "string" && (display?.text?.sentenceLimit ?? 0) > 0) {
    return extractLeadingSentences(value, display?.text?.sentenceLimit ?? 1);
  }
  if (typeof value === "string" && isIconLikeField(schema)) {
    return <span className="reference-preview__icon-path">{value}</span>;
  }
  if (Array.isArray(value)) {
    const previewItems = value.slice(0, 3).map((item) => previewValue(item, host));
    const suffix = value.length > 3 ? ` +${value.length - 3}` : "";
    return `${previewItems.join(", ")}${suffix}`;
  }
  if (typeof value === "boolean") {
    return value ? "True" : "False";
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

function isImageDisplaySchema(schema: EditorSchema | undefined) {
  return schema?.["x-editor"]?.display?.kind === "image";
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

function isIconLikeField(schema: EditorSchema | undefined) {
  const schemaTitle = schema?.title?.toLowerCase() ?? "";
  const schemaDescription = schema?.description?.toLowerCase() ?? "";
  return schemaTitle.includes("icon") || schemaDescription.includes("icon");
}

function isNavigable(value: unknown): boolean {
  return isReferenceValue(value) || Array.isArray(value) || isPlainObject(value);
}

function ImagePreview({ value, schema, host }: { value: string; schema?: EditorSchema; host?: EditorHost }) {
  const [loadFailed, setLoadFailed] = useState(false);
  const preview = schema?.["x-editor"]?.display?.preview;
  const width = preview?.width ?? 40;
  const height = preview?.height ?? width;
  const fit = preview?.fit ?? "contain";
  const label = schema?.title ?? "Image";
  const resolvedValue = host?.resolveDisplayUrl?.(value, schema) ?? value;

  if (loadFailed) {
    return (
      <span className="reference-preview__image-fallback" style={{ width, height }} title={value}>
        {value}
      </span>
    );
  }

  return (
    <img
      alt={label}
      className="reference-preview__image"
      height={height}
      src={resolvedValue}
      style={{ width: `${width}px`, height: `${height}px`, objectFit: fit }}
      title={value}
      width={width}
      onError={() => setLoadFailed(true)}
    />
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

function reorderSchemaPropertiesToMatch(schema: EditorSchema, orderedKeys: string[]) {
  if (!schema.properties) return schema;
  const rank = new Map(orderedKeys.map((key, index) => [key, index]));
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

function insertDraggedField(order: string[], field: string, targetIndex: number) {
  const restOrder = order.filter((entry) => entry !== field);
  const next = [...restOrder];
  const clampedIndex = Math.max(0, Math.min(targetIndex, next.length));
  next.splice(clampedIndex, 0, field);
  return next;
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
