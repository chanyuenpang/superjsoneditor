import { useEffect, useMemo, useState } from "react";
import { setValueAtPath } from "../core/document";
import type { JsonPath } from "../core/path";
import { formatPath } from "../core/path";
import type { EditorHost } from "./host";

type ValueInspectorProps = {
  value: unknown;
  savedValue?: unknown;
  path: JsonPath;
  title?: string;
  host?: EditorHost;
  isReference?: boolean;
  activeChildSegment?: string | number;
  readOnly?: boolean;
  onNavigateUp?: () => void;
  onNavigate: (path: JsonPath) => void;
  onApplyValue: (nextValue: unknown) => void;
  onSave?: () => void;
  onReload?: () => void;
  canSave?: boolean;
  canReload?: boolean;
  showPersistenceActions?: boolean;
  onEditModeChange?: (isEditing: boolean) => void;
};

export function ValueInspector(props: ValueInspectorProps) {
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
  path,
  title,
  host,
  isReference = false,
  onNavigateUp,
  onNavigate,
  onApplyValue,
  onSave,
  onReload,
  canSave = true,
  canReload = true,
  showPersistenceActions = false,
  onEditModeChange,
  readOnly = false,
}: ValueInspectorProps & { value: Record<string, unknown> }) {
  const [rawOpen, setRawOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [suppressEditToggleUntil, setSuppressEditToggleUntil] = useState(0);
  const [newKey, setNewKey] = useState("");
  const [newKeyType, setNewKeyType] = useState<ObjectDraftType>("string");
  const keyExists = newKey.trim().length > 0 && Object.prototype.hasOwnProperty.call(value, newKey.trim());
  const pathKey = path.join("/");
  const [fieldOrder, setFieldOrder] = useState(() => Object.keys(value));
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
    setNewKey("");
    setNewKeyType("string");
    setFieldOrder(Object.keys(value));
  }, [pathKey]);

  useEffect(() => {
    setFieldOrder((current) => {
      const nextKeys = Object.keys(value);
      const preserved = current.filter((key) => nextKeys.includes(key));
      const appended = nextKeys.filter((key) => !preserved.includes(key));
      const nextOrder = [...preserved, ...appended];
      if (nextOrder.length === current.length && nextOrder.every((key, index) => key === current[index])) {
        return current;
      }
      return nextOrder;
    });
  }, [value]);

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
    setEditMode(true);
  }

  return (
    <section className="node-page node-page--object">
      <PageHeader
        path={path}
        title={title}
        isReference={isReference}
        onNavigateUp={onNavigateUp}
        rawOpen={rawOpen}
        onToggleRaw={() => setRawOpen((current) => !current)}
      />
      <div className="node-page__content">
        {rawOpen ? (
          <RawJsonEditor readOnly={readOnly} value={value} onApplyValue={onApplyValue} />
        ) : (
          <div className="object-page-body">
            <div className="object-scroll">
              <div className="property-list">
                {fields.map(([key, fieldValue]) => (
                  <section
                    className={[
                      "property-block",
                      "object-field-row",
                      isFieldDirty(fieldValue, isPlainObject(savedValue) ? savedValue[key] : undefined) ? "object-field-row--dirty" : "",
                    ].filter(Boolean).join(" ")}
                    key={key}
                  >
                    <div className="property-heading">
                      <span>{host?.getFieldLabel?.([...path, key], key, fieldValue) ?? key}</span>
                      <div className="property-heading__actions">
                        <small className={["field-type", getTypeToneClass(fieldValue, host)].filter(Boolean).join(" ")}>{describeType(fieldValue, host)}</small>
                        {editMode && !readOnly ? (
                          <button
                            className="danger-icon-button"
                            type="button"
                            onClick={() => {
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
                    {isNavigable(fieldValue) ? (
                      <button
                        aria-label={`${key} ${describeType(fieldValue, host)} ${previewValue(fieldValue, host)}`}
                        className={["nested-entry-button", getTypeToneClass(fieldValue, host)].filter(Boolean).join(" ")}
                        type="button"
                        onClick={() => onNavigate([...path, key])}
                      >
                        <span className="nested-entry-icon" aria-hidden="true">
                          {getStructureIcon(fieldValue, host)}
                        </span>
                        <span className="entry-key">{previewValue(fieldValue, host)}</span>
                        <span className={["entry-type", getTypeToneClass(fieldValue, host)].filter(Boolean).join(" ")}>{describeType(fieldValue, host)}</span>
                        <span className="entry-preview">{key}</span>
                      </button>
                    ) : (
                          renderPrimitiveEditor({
                            value: fieldValue,
                            ariaLabel: `Field ${key}`,
                            readOnly,
                            onChange(nextValue) {
                              onApplyValue({
                                ...value,
                            [key]: nextValue,
                          });
                        },
                      })
                    )}
                  </section>
                ))}
                {Object.keys(value).length === 0 ? <div className="empty-state">This object has no fields.</div> : null}
                {editMode && !readOnly ? (
                  <div className="add-object-form">
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
                    <div className="add-object-form__actions">
                      <button
                        className="primary-button"
                        disabled={newKey.trim().length === 0 || keyExists}
                        type="button"
                        onPointerDown={(event) => event.preventDefault()}
                        onPointerUp={() => {
                          const key = newKey.trim();
                          if (!key || Object.prototype.hasOwnProperty.call(value, key)) return;
                          setSuppressEditToggleUntil(Date.now() + 300);
                          onApplyValue({
                            ...value,
                            [key]: createDefaultValueForType(newKeyType),
                          });
                          setNewKey("");
                          setNewKeyType("string");
                        }}
                        onClick={(event) => {
                          if (event.detail !== 0) return;
                          const key = newKey.trim();
                          if (!key || Object.prototype.hasOwnProperty.call(value, key)) return;
                          setSuppressEditToggleUntil(Date.now() + 300);
                          onApplyValue({
                            ...value,
                            [key]: createDefaultValueForType(newKeyType),
                          });
                          setNewKey("");
                          setNewKeyType("string");
                        }}
                      >
                        Create key
                      </button>
                    </div>
                    {keyExists ? <small className="form-hint form-hint--danger">Key already exists.</small> : null}
                  </div>
                ) : null}
              </div>
            </div>
            <section className="editor-actions-panel">
              <div className="editor-actions-row">
                {!readOnly ? (
                  <button
                    className="ghost-button compact-button"
                    type="button"
                    onPointerDown={(event) => event.preventDefault()}
                    onPointerUp={handleEditModeToggle}
                    onClick={(event) => {
                      if (event.detail !== 0) return;
                      handleEditModeToggle();
                    }}
                  >
                    {editMode ? "Done" : "Edit"}
                  </button>
                ) : null}
                {showPersistenceActions && !editMode ? (
                  <>
                    {canReload ? (
                      <button className="ghost-button compact-button" type="button" onClick={onReload}>
                        Reload
                      </button>
                    ) : null}
                    {canSave ? (
                      <button className="ghost-button compact-button" type="button" onClick={onSave}>
                        Save
                      </button>
                    ) : null}
                  </>
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
  path,
  title,
  host,
  isReference = false,
  activeChildSegment,
  onNavigateUp,
  onNavigate,
  onApplyValue,
  onSave,
  onReload,
  canSave = true,
  canReload = true,
  showPersistenceActions = false,
  onEditModeChange,
  readOnly = false,
}: ValueInspectorProps & { value: unknown[] }) {
  const [rawOpen, setRawOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [suppressEditToggleUntil, setSuppressEditToggleUntil] = useState(0);
  const [pendingRow, setPendingRow] = useState<unknown | null>(null);
  const [suppressRowActionsUntil, setSuppressRowActionsUntil] = useState(0);
  const pathKey = path.join("/");
  const columns = useMemo(() => getArrayColumns(value, host), [value, host]);
  const objectRows = useMemo(() => isObjectRowArray(value, host), [value, host]);
  const columnWidths = useMemo(() => getArrayColumnWidths(value, columns, host), [value, columns, host]);
  const tableWidth = useMemo(
    () => columns.reduce((total, column) => total + (columnWidths[column] ?? 140), 0),
    [columns, columnWidths],
  );

  useEffect(() => {
    setRawOpen(false);
    setEditMode(false);
    setSuppressEditToggleUntil(0);
    setPendingRow(null);
    setSuppressRowActionsUntil(0);
  }, [pathKey]);

  useEffect(() => {
    onEditModeChange?.(editMode);
    return () => onEditModeChange?.(false);
  }, [editMode, onEditModeChange]);

  function handleEditModeToggle() {
    if (Date.now() < suppressEditToggleUntil) return;
    setSuppressEditToggleUntil(Date.now() + 250);
    if (editMode) {
      setEditMode(false);
      setPendingRow(null);
      return;
    }
    setEditMode(true);
    setPendingRow(createDefaultArrayRow(value, host));
  }

  return (
    <section className="node-page node-page--array">
      <PageHeader
        path={path}
        title={title}
        isReference={isReference}
        onNavigateUp={onNavigateUp}
        rawOpen={rawOpen}
        onToggleRaw={() => setRawOpen((current) => !current)}
      />
      <div className="node-page__content">
        {rawOpen ? (
          <RawJsonEditor readOnly={readOnly} value={value} onApplyValue={onApplyValue} />
        ) : (
          <div className="array-page-body">
            <div className="table-shell">
              <div className="table-scroll">
              <table
                className="data-table array-workspace"
                style={{ width: `${tableWidth + (editMode ? 144 : 0)}px`, minWidth: `${tableWidth + (editMode ? 144 : 0)}px` }}
              >
                <colgroup>
                  {editMode ? <col data-column="__edit__" style={{ width: "144px" }} /> : null}
                  {columns.map((column) => (
                    <col
                      data-column={column}
                      key={column}
                      style={{ width: `${columnWidths[column] ?? 140}px` }}
                    />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {editMode ? (
                      <th className="array-column--sticky array-column--actions" aria-label="Actions">
                        <div className="array-column-header">
                          <span>Actions</span>
                          <small>edit</small>
                        </div>
                      </th>
                    ) : null}
                    {columns.map((column, columnIndex) => (
                      <th
                        aria-label={column}
                        className={
                          columnIndex === 0
                            ? ["array-column--sticky", editMode ? "array-column--after-actions" : ""].filter(Boolean).join(" ")
                            : undefined
                        }
                        key={column}
                      >
                        <div className="array-column-header">
                          <span>{column}</span>
                          <small className={getTypeToneClassForType(describeArrayColumnType(value, column, host))}>{describeArrayColumnType(value, column, host)}</small>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {value.length === 0 ? (
                    <tr className="array-empty-row">
                      <td className="array-empty-cell" colSpan={columns.length + (editMode ? 1 : 0)}>
                        This array has no items.
                      </td>
                    </tr>
                  ) : null}
                  {value.map((item, index) => {
                    if (objectRows) {
                      const record = item as Record<string, unknown>;
                      const clickable = isNavigable(item);
                      return (
                        <tr
                          className={[
                            clickable ? "is-clickable" : "",
                            activeChildSegment === index ? "is-active-row" : "",
                          ].filter(Boolean).join(" ")}
                          data-row-index={index}
                          key={`${index}:${summarizeRowIdentity(item, index, path, host)}`}
                          onClick={clickable ? () => onNavigate([...path, index]) : undefined}
                      >
                        {editMode && !readOnly ? (
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
                                  next.splice(index + 1, 0, cloneJsonValue(item));
                                  onApplyValue(next);
                                }}
                              >
                                Copy
                              </button>
                              <button
                                className="danger-icon-button"
                                disabled={Date.now() < suppressRowActionsUntil}
                                type="button"
                                onPointerDown={(event) => event.preventDefault()}
                                onPointerUp={(event) => {
                                  event.stopPropagation();
                                  onApplyValue(value.filter((_, rowIndex) => rowIndex !== index));
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        ) : null}
                          {columns.map((column, columnIndex) => (
                            <td
                              className={
                                columnIndex === 0
                                  ? ["array-column--sticky", editMode ? "array-column--after-actions" : ""].filter(Boolean).join(" ")
                                  : undefined
                              }
                              key={`${index}:${column}`}
                            >
                              <span
                                className={[
                                  "array-cell-summary",
                                  columnIndex === 0 ? "array-cell-summary--identity" : "",
                                ].filter(Boolean).join(" ")}
                              >
                                {previewValue(record[column], host)}
                              </span>
                            </td>
                          ))}
                        </tr>
                      );
                    }

                    return (
                      <tr className={activeChildSegment === index ? "is-active-row" : undefined} data-row-index={index} key={`${index}:${String(item)}`}>
                        {editMode && !readOnly ? (
                          <td className="array-column--sticky array-column--actions">
                            <div className="row-action-buttons">
                              <button
                                className="ghost-button compact-button"
                                disabled={Date.now() < suppressRowActionsUntil}
                                type="button"
                                onPointerDown={(event) => event.preventDefault()}
                                onPointerUp={() => {
                                  const next = [...value];
                                  next.splice(index + 1, 0, cloneJsonValue(item));
                                  onApplyValue(next);
                                }}
                              >
                                Copy
                              </button>
                              <button
                                className="danger-icon-button"
                                disabled={Date.now() < suppressRowActionsUntil}
                                type="button"
                                onPointerDown={(event) => event.preventDefault()}
                                onPointerUp={() => onApplyValue(value.filter((_, rowIndex) => rowIndex !== index))}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        ) : null}
                        <td className={["array-column--sticky", editMode ? "array-column--after-actions" : ""].filter(Boolean).join(" ")}>{index}</td>
                        <td>{describeType(item, host)}</td>
                        <td>
                          {isNavigable(item) ? (
                            <button
                              className={["nested-entry-button", "inline", getTypeToneClass(item, host)].filter(Boolean).join(" ")}
                              type="button"
                              onClick={() => onNavigate([...path, index])}
                            >
                              <span className="entry-key">{summarizeRowIdentity(item, index, path, host)}</span>
                              <span className={["entry-type", getTypeToneClass(item, host)].filter(Boolean).join(" ")}>{describeType(item, host)}</span>
                              <span className="entry-preview">{previewValue(item, host)}</span>
                            </button>
                          ) : (
                            renderPrimitiveEditor({
                              value: item,
                              ariaLabel: `Array item ${index}`,
                              readOnly,
                              onChange(nextValue) {
                                onApplyValue(setValueAtPath(value, [index], nextValue));
                              },
                            })
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {editMode && !readOnly && pendingRow !== null ? (
                    renderPendingArrayRow({
                      value,
                      pendingRow,
                      columns,
                      objectRows,
                      host,
                      onChangePendingRow: setPendingRow,
                      onCreate() {
                        setSuppressRowActionsUntil(Date.now() + 450);
                        onApplyValue([...value, cloneJsonValue(pendingRow)]);
                        setPendingRow(createDefaultArrayRow(value.length > 0 ? [...value, pendingRow] : value, host));
                      },
                    })
                  ) : null}
                </tbody>
              </table>
            </div>
            </div>
            <section className="editor-actions-panel editor-actions-panel--table">
              <div className="editor-actions-row">
                {!readOnly ? (
                  <button
                    className="ghost-button compact-button"
                    type="button"
                    onPointerDown={(event) => event.preventDefault()}
                    onPointerUp={handleEditModeToggle}
                    onClick={(event) => {
                      if (event.detail !== 0) return;
                      handleEditModeToggle();
                    }}
                  >
                    {editMode ? "Done" : "Edit"}
                  </button>
                ) : null}
                {showPersistenceActions && !editMode ? (
                  <>
                    {canReload ? (
                      <button className="ghost-button compact-button" type="button" onClick={onReload}>
                        Reload
                      </button>
                    ) : null}
                    {canSave ? (
                      <button className="ghost-button compact-button" type="button" onClick={onSave}>
                        Save
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </section>
          </div>
        )}
      </div>
    </section>
  );
}

function PrimitivePage({ value, savedValue, path, title, isReference = false, onNavigateUp, onApplyValue, readOnly = false }: ValueInspectorProps) {
  const [rawOpen, setRawOpen] = useState(false);
  const pathKey = path.join("/");

  useEffect(() => {
    setRawOpen(false);
  }, [pathKey, value]);

  return (
    <section className="node-page node-page--primitive">
      <PageHeader
        path={path}
        title={title}
        isReference={isReference}
        onNavigateUp={onNavigateUp}
        rawOpen={rawOpen}
        onToggleRaw={() => setRawOpen((current) => !current)}
      />
      <div className="node-page__content">
        {rawOpen ? (
          <RawJsonEditor readOnly={readOnly} value={value} onApplyValue={onApplyValue} />
        ) : (
          <div className="property-list">
            <section className={["property-block", "object-field-row", isFieldDirty(value, savedValue) ? "object-field-row--dirty" : ""].filter(Boolean).join(" ")}>
              <div className="property-heading">
                <span>{path.at(-1) == null ? "value" : String(path.at(-1))}</span>
                <small className={["field-type", getTypeToneClass(value)].filter(Boolean).join(" ")}>{describeType(value)}</small>
              </div>
              {renderPrimitiveEditor({
                value,
                ariaLabel: `Field ${path.at(-1) == null ? "value" : String(path.at(-1))}`,
                readOnly,
                onChange: onApplyValue,
              })}
            </section>
          </div>
        )}
      </div>
    </section>
  );
}

function PageHeader(props: {
  path: JsonPath;
  title?: string;
  isReference: boolean;
  onNavigateUp?: () => void;
  rawOpen: boolean;
  onToggleRaw: () => void;
}) {
  return (
    <div className="detail-header detail-header--page">
      <div className="page-header__title">
        {props.onNavigateUp ? (
          <button aria-label="Go up one level" className="ghost-button compact-button page-back-button" type="button" onClick={props.onNavigateUp}>
            {"<"}
          </button>
        ) : null}
        <div className="detail-title">{props.title ?? formatPath(props.path)}</div>
      </div>
      <div className="page-header__actions">
        {props.isReference ? <span className="page-chip page-chip--reference">Ref</span> : null}
        <button className="ghost-button compact-button" type="button" onClick={props.onToggleRaw}>
          {props.rawOpen ? "Hide Raw JSON" : "Raw JSON"}
        </button>
      </div>
    </div>
  );
}

function RawJsonEditor(props: { value: unknown; readOnly?: boolean; onApplyValue: (nextValue: unknown) => void }) {
  const [draft, setDraft] = useState(() => JSON.stringify(props.value, null, 2));

  useEffect(() => {
    setDraft(JSON.stringify(props.value, null, 2));
  }, [props.value]);

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
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="json-actions">
          {!props.readOnly ? (
            <button className="primary-button" type="button" onClick={() => props.onApplyValue(JSON.parse(draft))}>
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
  readOnly?: boolean;
  onChange: (nextValue: unknown) => void;
}) {
  if (typeof props.value === "boolean") {
    return (
      <label className="checkbox-field">
        <input
          aria-label={props.ariaLabel}
          checked={props.value}
          disabled={props.readOnly}
          type="checkbox"
          onChange={(event) => props.onChange(event.target.checked)}
        />
        <span>{props.value ? "True" : "False"}</span>
      </label>
    );
  }

  if (typeof props.value === "number") {
    return (
      <input
        aria-label={props.ariaLabel}
        className="detail-input"
        disabled={props.readOnly}
        type="number"
        value={String(props.value)}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    );
  }

  if (props.value === null) {
    return (
      <input
        aria-label={props.ariaLabel}
        className="detail-input"
        disabled={props.readOnly}
        value="null"
        onChange={(event) => props.onChange(event.target.value === "null" ? null : event.target.value)}
      />
    );
  }

  const text = typeof props.value === "string" ? props.value : String(props.value ?? "");
  if (shouldUseMultilineEditor(text)) {
    return (
      <textarea
        aria-label={props.ariaLabel}
        className="detail-input detail-textarea"
        disabled={props.readOnly}
        rows={getMultilineEditorRows(text)}
        value={text}
        onChange={(event) => props.onChange(event.target.value)}
      />
    );
  }

  return (
    <input
      aria-label={props.ariaLabel}
      className="detail-input"
      disabled={props.readOnly}
      value={text}
      onChange={(event) => props.onChange(event.target.value)}
    />
  );
}

function getArrayColumns(items: unknown[], host?: EditorHost) {
  if (isObjectRowArray(items, host)) {
    const columns = new Set<string>();
    for (const item of items) {
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

function getArrayColumnWidths(items: unknown[], columns: string[], host?: EditorHost) {
  const widths: Record<string, number> = {};
  const sampleSize = Math.min(items.length, 40);

  for (const column of columns) {
    if (column === "#") {
      widths[column] = 64;
      continue;
    }

    const headerWidth = measureColumnText(column);
    let contentWidth = headerWidth;

    if (isObjectRowArray(items, host)) {
      for (let index = 0; index < sampleSize; index += 1) {
        const item = items[index] as Record<string, unknown>;
        contentWidth = Math.max(contentWidth, measureColumnText(previewValue(item[column], host)));
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

function isObjectRowArray(items: unknown[], host?: EditorHost) {
  return items.length > 0 && items.every((item) => isPlainObject(item) && !host?.isReferenceNode?.(item));
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

function describeType(value: unknown, host?: EditorHost): string {
  if (host?.isReferenceNode?.(value)) return "reference";
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

function createDefaultArrayRow(items: unknown[], host?: EditorHost) {
  if (items.length === 0) return {};

  if (isObjectRowArray(items, host)) {
    const columns = getArrayColumns(items, host);
    const seed = items.find((item) => isPlainObject(item) && !host?.isReferenceNode?.(item)) as Record<string, unknown> | undefined;
    const nextRow: Record<string, unknown> = {};
    for (const column of columns) {
      nextRow[column] = createEmptyValueFromSample(seed?.[column]);
    }
    return nextRow;
  }

  const sample = items[0];
  return createEmptyValueFromSample(sample);
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
  onChangePendingRow: (nextRow: unknown) => void;
  onCreate: () => void;
}) {
  if (props.objectRows) {
    const record = isPlainObject(props.pendingRow) ? props.pendingRow : {};
    return (
      <tr className="array-row--pending" data-row-index="pending">
        <td className="array-column--sticky array-column--actions">
          <div className="row-action-buttons">
            <button
              className="primary-button compact-button"
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onPointerUp={props.onCreate}
            >
              Create
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
            onPointerDown={(event) => event.preventDefault()}
            onPointerUp={props.onCreate}
          >
            Create
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
  if (host?.isReferenceNode?.(value)) return "↗";
  if (Array.isArray(value)) return "[]";
  if (isPlainObject(value)) return "{}";
  return "·";
}

function previewValue(value: unknown, host?: EditorHost): string {
  if (host?.isReferenceNode?.(value)) return host.getReferenceLabel?.(value) ?? "reference";
  if (Array.isArray(value)) return `${value.length} items`;
  if (isPlainObject(value)) return `${Object.keys(value).length} fields`;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null) return "null";
  return String(value);
}

function getStructureIcon(value: unknown, host?: EditorHost) {
  if (host?.isReferenceNode?.(value)) return "->";
  if (Array.isArray(value)) return "[]";
  if (isPlainObject(value)) return "{}";
  return ".";
}

function isNavigable(value: unknown): boolean {
  return Array.isArray(value) || isPlainObject(value);
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
