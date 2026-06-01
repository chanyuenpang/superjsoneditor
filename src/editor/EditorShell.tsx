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
  const [pages, setPages] = useState<JsonPath[]>([[]]);
  const path = pages[pages.length - 1] ?? [];
  const currentValue = useMemo(() => getValueAtPath(documentValue, path), [documentValue, path]);

  function handleNavigate(nextPath: JsonPath) {
    setPages((current) => [...current, nextPath]);
  }

  function handleJump(targetPath: JsonPath) {
    setPages((current) => {
      const index = current.findIndex((page) => page.join("\u0000") === targetPath.join("\u0000"));
      if (index >= 0) return current.slice(0, index + 1);
      return [targetPath];
    });
  }

  function handleBack() {
    setPages((current) => current.length > 1 ? current.slice(0, -1) : current);
  }

  return (
    <div className="editor-shell">
      <header className="editor-shell__header">
        <div>
          <div className="editor-shell__kicker">Universal JSON Editor</div>
          <h1>Super JSON Editor</h1>
        </div>
      </header>
      <section className="editor-shell__panel">
        <div className="editor-shell__subpage-bar">
          <div className="editor-shell__subpage-meta">Page {pages.length}</div>
          {pages.length > 1 ? (
            <button className="editor-shell__back" type="button" onClick={handleBack}>
              Back
            </button>
          ) : null}
        </div>
        <Breadcrumbs path={path} onNavigate={handleJump} />
        <ValueInspector
          value={currentValue}
          path={path}
          onNavigate={handleNavigate}
          onApplyValue={(nextValue) => setDocumentValue(setValueAtPath(documentValue, path, nextValue))}
        />
      </section>
    </div>
  );
}
