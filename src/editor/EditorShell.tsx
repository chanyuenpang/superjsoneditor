import { useMemo, useState } from "react";
import { getValueAtPath, setValueAtPath } from "../core/document";
import { createNavigationState, goBack, jumpToPath, openPath } from "../core/navigation";
import type { JsonPath } from "../core/path";
import { Breadcrumbs } from "./Breadcrumbs";
import type { EditorHost } from "./host";
import { ValueInspector } from "./ValueInspector";

type EditorShellProps = {
  value: unknown;
  host?: EditorHost;
};

export function EditorShell({ value, host }: EditorShellProps) {
  const [documentValue, setDocumentValue] = useState(value);
  const [pages, setPages] = useState(createNavigationState(value).pages);
  const currentPage = pages[pages.length - 1] ?? { path: [] };
  const path = currentPage.path;
  const currentValue = useMemo(
    () => currentPage.value ?? getValueAtPath(documentValue, path),
    [currentPage.value, documentValue, path],
  );

  function handleNavigate(nextPath: JsonPath) {
    setPages((currentPages) => openPath({ documentValue, pages: currentPages }, nextPath, host).pages);
  }

  function handleJump(targetPath: JsonPath) {
    setPages((currentPages) => jumpToPath({ documentValue, pages: currentPages }, targetPath).pages);
  }

  function handleBack() {
    setPages((currentPages) => goBack({ documentValue, pages: currentPages }).pages);
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
