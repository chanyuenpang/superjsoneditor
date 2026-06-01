import { useEffect, useMemo, useState } from "react";
import { setValueAtPath } from "../core/document";
import type { JsonPath } from "../core/path";
import { formatPath } from "../core/path";
import type { EditorHost } from "./host";

type ValueInspectorProps = {
  value: unknown;
  path: JsonPath;
  host?: EditorHost;
  isReference?: boolean;
  activeChildSegment?: string | number;
  onNavigate: (path: JsonPath) => void;
  onApplyValue: (nextValue: unknown) => void;
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

function ObjectPage({ value, path, host, isReference = false, onNavigate, onApplyValue }: ValueInspectorProps & { value: Record<string, unknown> }) {
  const [rawOpen, setRawOpen] = useState(false);
  const fields = useMemo(() => describeObjectFields(value), [value]);

  useEffect(() => {
    setRawOpen(false);
  }, [path, value]);

  return (
    <section className="node-page node-page--object">
      <PageHeader
        path={path}
        isReference={isReference}
        rawOpen={rawOpen}
        onToggleRaw={() => setRawOpen((current) => !current)}
      />
      <div className="node-page__content">
        <div className="property-list">
          {fields.map(([key, fieldValue]) => (
            <section className="property-block object-field-row" key={key}>
              <div className="property-heading">
                <span>{host?.getFieldLabel?.([...path, key], key, fieldValue) ?? key}</span>
                <small className="field-type">{describeType(fieldValue, host)}</small>
              </div>
              {isNavigable(fieldValue) ? (
                <button
                  aria-label={`${key} ${describeType(fieldValue, host)} ${previewValue(fieldValue, host)}`}
                  className="nested-entry-button"
                  type="button"
                  onClick={() => onNavigate([...path, key])}
                >
                  <span className="nested-entry-icon" aria-hidden="true">
                    {getStructureIcon(fieldValue, host)}
                  </span>
                  <span className="entry-key">{previewValue(fieldValue, host)}</span>
                  <span className="entry-type">{describeType(fieldValue, host)}</span>
                  <span className="entry-preview">{key}</span>
                </button>
              ) : (
                renderPrimitiveEditor({
                  value: fieldValue,
                  ariaLabel: `Field ${key}`,
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
        </div>
        {rawOpen ? <RawJsonEditor value={value} onApplyValue={onApplyValue} /> : null}
      </div>
    </section>
  );
}

function ArrayPage({ value, path, host, isReference = false, activeChildSegment, onNavigate, onApplyValue }: ValueInspectorProps & { value: unknown[] }) {
  const [rawOpen, setRawOpen] = useState(false);
  const columns = useMemo(() => getArrayColumns(value, host), [value, host]);
  const objectRows = useMemo(() => isObjectRowArray(value, host), [value, host]);
  const columnWidths = useMemo(() => getArrayColumnWidths(value, columns, host), [value, columns, host]);
  const tableWidth = useMemo(
    () => columns.reduce((total, column) => total + (columnWidths[column] ?? 140), 0),
    [columns, columnWidths],
  );

  useEffect(() => {
    setRawOpen(false);
  }, [path, value]);

  return (
    <section className="node-page node-page--array">
      <PageHeader
        path={path}
        isReference={isReference}
        rawOpen={rawOpen}
        onToggleRaw={() => setRawOpen((current) => !current)}
      />
      <div className="node-page__content">
        <div className="table-shell">
          <div className="table-scroll">
            <table
              className="data-table array-workspace"
              style={{ width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}
            >
              <colgroup>
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
                  {columns.map((column, columnIndex) => (
                    <th
                      aria-label={column}
                      className={columnIndex === 0 ? "array-column--sticky" : undefined}
                      key={column}
                    >
                      <div className="array-column-header">
                        <span>{column}</span>
                        <small>{describeArrayColumnType(value, column, host)}</small>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {value.length === 0 ? (
                  <tr className="array-empty-row">
                    <td className="array-empty-cell" colSpan={columns.length}>
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
                        {columns.map((column, columnIndex) => (
                          <td className={columnIndex === 0 ? "array-column--sticky" : undefined} key={`${index}:${column}`}>
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
                      <td className="array-column--sticky">{index}</td>
                      <td>{describeType(item, host)}</td>
                      <td>
                        {isNavigable(item) ? (
                          <button className="nested-entry-button inline" type="button" onClick={() => onNavigate([...path, index])}>
                            <span className="entry-key">{summarizeRowIdentity(item, index, path, host)}</span>
                            <span className="entry-type">{describeType(item, host)}</span>
                            <span className="entry-preview">{previewValue(item, host)}</span>
                          </button>
                        ) : (
                          renderPrimitiveEditor({
                            value: item,
                            ariaLabel: `Array item ${index}`,
                            onChange(nextValue) {
                              onApplyValue(setValueAtPath(value, [index], nextValue));
                            },
                          })
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {rawOpen ? <RawJsonEditor value={value} onApplyValue={onApplyValue} /> : null}
      </div>
    </section>
  );
}

function PrimitivePage({ value, path, isReference = false, onApplyValue }: ValueInspectorProps) {
  const [rawOpen, setRawOpen] = useState(false);

  useEffect(() => {
    setRawOpen(false);
  }, [path, value]);

  return (
    <section className="node-page node-page--primitive">
      <PageHeader
        path={path}
        isReference={isReference}
        rawOpen={rawOpen}
        onToggleRaw={() => setRawOpen((current) => !current)}
      />
      <div className="node-page__content">
        <div className="property-list">
          <section className="property-block object-field-row">
            <div className="property-heading">
              <span>{path.at(-1) == null ? "value" : String(path.at(-1))}</span>
              <small className="field-type">{describeType(value)}</small>
            </div>
            {renderPrimitiveEditor({
              value,
              ariaLabel: `Field ${path.at(-1) == null ? "value" : String(path.at(-1))}`,
              onChange: onApplyValue,
            })}
          </section>
        </div>
        {rawOpen ? <RawJsonEditor value={value} onApplyValue={onApplyValue} /> : null}
      </div>
    </section>
  );
}

function PageHeader(props: { path: JsonPath; isReference: boolean; rawOpen: boolean; onToggleRaw: () => void }) {
  return (
    <div className="detail-header detail-header--page">
      <div className="detail-title">{formatPath(props.path)}</div>
      <div className="page-header__actions">
        {props.isReference ? <span className="page-chip">Ref</span> : null}
        <button className="ghost-button compact-button" type="button" onClick={props.onToggleRaw}>
          {props.rawOpen ? "Hide Raw JSON" : "Raw JSON"}
        </button>
      </div>
    </div>
  );
}

function RawJsonEditor(props: { value: unknown; onApplyValue: (nextValue: unknown) => void }) {
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
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="json-actions">
          <button className="primary-button" type="button" onClick={() => props.onApplyValue(JSON.parse(draft))}>
            Apply JSON
          </button>
        </div>
      </div>
    </section>
  );
}

function renderPrimitiveEditor(props: {
  value: unknown;
  ariaLabel: string;
  onChange: (nextValue: unknown) => void;
}) {
  if (typeof props.value === "boolean") {
    return (
      <label className="checkbox-field">
        <input
          aria-label={props.ariaLabel}
          checked={props.value}
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
  return Object.entries(value).sort((left, right) => {
    return describeObjectFieldPriority(left[1]) - describeObjectFieldPriority(right[1]);
  });
}

function describeObjectFieldPriority(value: unknown) {
  return isNavigable(value) ? 1 : 0;
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
