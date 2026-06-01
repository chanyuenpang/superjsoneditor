import { useMemo, useState } from "react";
import { getValueAtPath, setValueAtPath } from "../core/document";
import type { JsonPath } from "../core/path";
import { Breadcrumbs } from "./Breadcrumbs";
import { ValueInspector } from "./ValueInspector";

type EditorShellProps = {
  value: unknown;
};

export function EditorShell({ value }: EditorShellProps) {
  const [documentValue, setDocumentValue] = useState(value);
  const [path, setPath] = useState<JsonPath>([]);
  const currentValue = useMemo(() => getValueAtPath(documentValue, path), [documentValue, path]);

  return (
    <div className="editor-shell">
      <header className="editor-shell__header">
        <div>
          <div className="editor-shell__kicker">Universal JSON Editor</div>
          <h1>Super JSON Editor</h1>
        </div>
      </header>
      <section className="editor-shell__panel">
        <Breadcrumbs path={path} onNavigate={setPath} />
        <ValueInspector
          value={currentValue}
          path={path}
          onNavigate={setPath}
          onApplyValue={(nextValue) => setDocumentValue(setValueAtPath(documentValue, path, nextValue))}
        />
      </section>
    </div>
  );
}
