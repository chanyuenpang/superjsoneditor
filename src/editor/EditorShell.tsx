import { useMemo, useState } from "react";
import { getValueAtPath, setValueAtPath } from "../core/document";
import type { JsonPath } from "../core/path";
import { Breadcrumbs } from "./Breadcrumbs";
import type { EditorHost } from "./host";
import { ValueInspector } from "./ValueInspector";

type EditorShellProps = {
  value: unknown;
  host?: EditorHost;
};

type EditorPage = {
  path: JsonPath;
  value?: unknown;
  sourceValue?: unknown;
  isReference?: boolean;
};

export function EditorShell({ value, host }: EditorShellProps) {
  const [documentValue, setDocumentValue] = useState(value);
  const [pages, setPages] = useState<EditorPage[]>([{ path: [] }]);
  const currentPage = pages[pages.length - 1] ?? { path: [] };
  const path = currentPage.path;
  const currentValue = useMemo(
    () => currentPage.value ?? getValueAtPath(documentValue, path),
    [currentPage.value, documentValue, path],
  );

  function handleNavigate(nextPath: JsonPath) {
    const targetValue = getValueAtPath(documentValue, nextPath);
    const nextPage: EditorPage = host?.isReferenceNode?.(targetValue)
      ? {
          path: nextPath,
          value: host.resolveReference?.(targetValue) ?? targetValue,
          sourceValue: targetValue,
          isReference: true,
        }
      : { path: nextPath };

    setPages((current) => [...current, nextPage]);
  }

  function handleJump(targetPath: JsonPath) {
    setPages((current) => {
      const index = current.findIndex((page) => page.path.join("\u0000") === targetPath.join("\u0000"));
      if (index >= 0) return current.slice(0, index + 1);
      return [{ path: targetPath }];
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
          host={host}
          onNavigate={handleNavigate}
          onApplyValue={(nextValue) => {
            if (currentPage.isReference) {
              setPages((current) => current.map((page, index) => (
                index === current.length - 1 ? { ...page, value: nextValue } : page
              )));
              return;
            }
            setDocumentValue(setValueAtPath(documentValue, path, nextValue));
          }}
        />
      </section>
    </div>
  );
}
