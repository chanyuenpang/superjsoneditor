import type { JsonPath } from "../core/path";
import { formatPath } from "../core/path";
import { useEffect, useState } from "react";
import type { EditorHost } from "./host";

type ValueInspectorProps = {
  value: unknown;
  path: JsonPath;
  host?: EditorHost;
  onNavigate: (path: JsonPath) => void;
  onApplyValue: (nextValue: unknown) => void;
};

export function ValueInspector({ value, path, host, onNavigate, onApplyValue }: ValueInspectorProps) {
  const entries = describeEntries(value, host);
  const typeLabel = describeType(value);
  const [draft, setDraft] = useState(() => JSON.stringify(value, null, 2));

  useEffect(() => {
    setDraft(JSON.stringify(value, null, 2));
  }, [value]);

  function handleApply() {
    onApplyValue(JSON.parse(draft));
  }

  return (
    <section className="inspector">
      <div className="inspector__list">
        {entries.length ? (
          entries.map((entry) => (
            <button
              key={entry.key}
              className="inspector-card"
              type="button"
              onClick={() => entry.canNavigate && onNavigate([...path, entry.segment])}
            >
              <span className="inspector-card__key">{entry.key}</span>
              <span className="inspector-card__type">{entry.type}</span>
              <span className="inspector-card__preview">{entry.preview}</span>
            </button>
          ))
        ) : (
          <div className="inspector-card" aria-disabled="true">
            <span className="inspector-card__key">Value</span>
            <span className="inspector-card__type">{typeLabel}</span>
            <span className="inspector-card__preview">{previewValue(value)}</span>
          </div>
        )}
      </div>
      <aside className="inspector__summary">
        <h2>{formatPath(path)}</h2>
        <p>{typeLabel}</p>
        <label className="inspector__editor-label" htmlFor="json-value-editor">
          JSON value editor
        </label>
        <textarea
          id="json-value-editor"
          className="inspector__editor"
          aria-label="JSON value editor"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="inspector__apply" type="button" onClick={handleApply}>
          Apply JSON
        </button>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </aside>
    </section>
  );
}

type InspectorEntry = {
  key: string;
  segment: string | number;
  type: string;
  preview: string;
  canNavigate: boolean;
};

function describeEntries(value: unknown, host?: EditorHost): InspectorEntry[] {
  if (Array.isArray(value)) {
    return value.map((item, index) => ({
      key: String(index),
      segment: index,
      type: describeType(item, host),
      preview: previewValue(item, host),
      canNavigate: isNavigable(item),
    }));
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([key, item]) => ({
      key,
      segment: key,
      type: describeType(item, host),
      preview: previewValue(item, host),
      canNavigate: isNavigable(item),
    }));
  }

  return [];
}

function describeType(value: unknown, host?: EditorHost): string {
  if (host?.isReferenceNode?.(value)) return "reference";
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function previewValue(value: unknown, host?: EditorHost): string {
  if (host?.isReferenceNode?.(value)) return host.getReferenceLabel?.(value) ?? "reference";
  if (Array.isArray(value)) return `${value.length} items`;
  if (value && typeof value === "object") return `${Object.keys(value as Record<string, unknown>).length} fields`;
  if (typeof value === "string") return value;
  return String(value);
}

function isNavigable(value: unknown): boolean {
  return Array.isArray(value) || Boolean(value && typeof value === "object");
}
