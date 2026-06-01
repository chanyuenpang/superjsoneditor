import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getValueAtPath, setValueAtPath } from "../core/document";
import { createNavigationState, goBack, jumpToPage, jumpToPath, openPath, type NavigationPage } from "../core/navigation";
import type { JsonPath } from "../core/path";
import { formatPath } from "../core/path";
import type { EditorHost } from "./host";
import { determineBackAnimation, determineJumpAnimation, determineNavigateAnimation, samePath, type StackAnimation } from "./stack-motion";
import { ValueInspector } from "./ValueInspector";

type EditorShellProps = {
  documents?: Record<string, unknown>;
  rootSourceId?: string;
  value?: unknown;
  host?: EditorHost;
};

const animationDurationMs = 500;
const stackedPushEnterDurationMs = 500;

export function EditorShell({ documents, rootSourceId = "main", value, host }: EditorShellProps) {
  const initialDocuments = documents ?? { [rootSourceId]: value };
  const [documentsBySourceId, setDocumentsBySourceId] = useState(initialDocuments);
  const [savedDocumentsBySourceId, setSavedDocumentsBySourceId] = useState(initialDocuments);
  const [pages, setPages] = useState(createNavigationState(rootSourceId, initialDocuments).pages);
  const [stackAnimation, setStackAnimation] = useState<StackAnimation | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isEditingCurrentPage, setIsEditingCurrentPage] = useState(false);
  const pageStackViewportRef = useRef<HTMLElement | null>(null);
  const [stackViewportWidth, setStackViewportWidth] = useState(0);
  const animationKeyRef = useRef(0);
  const currentPage = pages[pages.length - 1] ?? { sourceId: rootSourceId, path: [] };
  const visiblePages = pages.slice(Math.max(0, pages.length - 2));
  const rootLabel = inferDocumentLabel(documentsBySourceId[rootSourceId]);
  const isCompactStack = stackViewportWidth > 0 && stackViewportWidth < 768;
  const isDirty = useMemo(
    () => JSON.stringify(documentsBySourceId) !== JSON.stringify(savedDocumentsBySourceId),
    [documentsBySourceId, savedDocumentsBySourceId],
  );

  async function handleSave() {
    setSaveState("saving");
    try {
      const response = await fetch("/__save-demo-sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documents: documentsBySourceId }),
      });
      if (!response.ok) {
        throw new Error(`Save failed with status ${response.status}`);
      }
      setSavedDocumentsBySourceId(documentsBySourceId);
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
    }
  }

  function handleReload() {
    setDocumentsBySourceId(savedDocumentsBySourceId);
    setPages((currentPages) => currentPages.map((page) => ({ ...page, value: undefined })));
    setStackAnimation(null);
    setSaveState("idle");
    setIsEditingCurrentPage(false);
  }

  useEffect(() => {
    const node = pageStackViewportRef.current;
    if (!node || typeof node.scrollTo !== "function") return;
    node.scrollTo({ left: node.scrollWidth, behavior: "smooth" });
  }, [pages]);

  useEffect(() => {
    const node = pageStackViewportRef.current;
    if (!node) return;

    const updateWidth = () => setStackViewportWidth(node.clientWidth);
    updateWidth();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!stackAnimation) return;
    const timeoutId = window.setTimeout(() => setStackAnimation(null), getAnimationDuration(stackAnimation));
    return () => window.clearTimeout(timeoutId);
  }, [stackAnimation]);

  function resolvePageValue(page: NavigationPage) {
    const sourceId = page.sourceId ?? rootSourceId;
    const sourceDocument = documentsBySourceId[sourceId];
    if (sourceDocument !== undefined) {
      return getValueAtPath(sourceDocument, page.path);
    }
    if (page.value !== undefined) {
      return page.value;
    }
    return undefined;
  }

  function getPageTitle(page: NavigationPage) {
    if (page.navLabel) {
      if (page.path.some((segment) => typeof segment === "number")) {
        return formatPath(page.path);
      }
      return page.navLabel;
    }
    const sourceId = page.sourceId ?? rootSourceId;
    if (page.path.length > 0) {
      if (page.path.some((segment) => typeof segment === "number")) {
        return formatPath(page.path);
      }
      return String(page.path.at(-1));
    }
    if (sourceId !== rootSourceId) {
      return inferDocumentLabel(resolvePageValue(page));
    }
    return "Root";
  }

  function getPageCrumbs() {
    return pages.slice(1).map((page, index) => ({
      id: `${page.sourceId ?? rootSourceId}:${page.path.join("/") || "root"}:${index}`,
      label: getPageTitle(page),
      sourceId: page.sourceId ?? rootSourceId,
      path: page.path,
    }));
  }

  const leftSlotWidth = Math.max(0, stackViewportWidth / 2);
  const rightSlotWidth = Math.max(0, stackViewportWidth - leftSlotWidth);

  function getStackPageStyle(depthClass: string) {
    if (depthClass === "stack-page--single") {
      return { left: 0, right: 0 };
    }
    if (depthClass === "stack-page--background") {
      return { left: 0, width: `${leftSlotWidth}px` };
    }
    return { left: `${leftSlotWidth}px`, width: `${rightSlotWidth}px` };
  }

  function handleNavigate(fromIndex: number, nextPath: JsonPath) {
    animationKeyRef.current += 1;
    setPages((currentPages) => {
      const actualIndex = isCompactStack ? currentPages.length - 1 : Math.max(0, currentPages.length - 2) + fromIndex;
      const sourceIsForeground = actualIndex === currentPages.length - 1;
      const basePages = sourceIsForeground ? currentPages : currentPages.slice(0, actualIndex + 1);
      const nextPages = openPath({ documents: documentsBySourceId, rootSourceId, pages: basePages }, nextPath, host).pages;
      setStackAnimation(isCompactStack ? null : determineNavigateAnimation(currentPages, nextPages, actualIndex, animationKeyRef.current));
      return nextPages;
    });
  }

  function handleJump(targetPath: JsonPath, sourceId = currentPage.sourceId ?? rootSourceId) {
    animationKeyRef.current += 1;
    setPages((currentPages) => {
      const nextPages = sourceId === rootSourceId && targetPath.length === 0
        ? jumpToPath({ documents: documentsBySourceId, rootSourceId, pages: currentPages }, targetPath).pages
        : jumpToPage({ documents: documentsBySourceId, rootSourceId, pages: currentPages }, { sourceId, path: targetPath }).pages;
      setStackAnimation(isCompactStack ? null : determineJumpAnimation(currentPages, nextPages, animationKeyRef.current));
      return nextPages;
    });
  }

  function handleBack() {
    setPages((currentPages) => {
      const nextPages = goBack({ documents: documentsBySourceId, rootSourceId, pages: currentPages }).pages;
      setStackAnimation(null);
      return nextPages;
    });
  }

  function handleContextBack() {
    if (visiblePages.length < 2) return;
    const targetPath = visiblePages[0]?.path;
    if (!targetPath) return;

    animationKeyRef.current += 1;
    setPages((currentPages) => {
      const nextPages = jumpToPage(
        { documents: documentsBySourceId, rootSourceId, pages: currentPages },
        { sourceId: visiblePages[0].sourceId, path: targetPath },
      ).pages;
      setStackAnimation(isCompactStack ? null : determineBackAnimation(currentPages, nextPages, animationKeyRef.current));
      return nextPages;
    });
  }

  return (
    <div className="app-frame">
      <div className="workspace">
        <header className="toolbar">
          <div className="toolbar-title">
            <strong>{rootLabel}</strong>
            <span>{getPageTitle(currentPage)}</span>
          </div>
          {isCompactStack ? (
            <label className="breadcrumbs-select">
              <span className="breadcrumbs-select__label">Path</span>
              <select
                className="detail-input breadcrumbs-select__input"
                value={String(Math.max(0, pages.length - 1))}
                onChange={(event) => {
                  const nextIndex = Number(event.target.value);
                  if (nextIndex === 0) {
                    handleJump([], rootSourceId);
                    return;
                  }
                  const targetPage = pages[nextIndex];
                  if (!targetPage) return;
                  handleJump(targetPage.path, targetPage.sourceId ?? rootSourceId);
                }}
              >
                {buildCompactPathOptions(pages, rootSourceId).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="breadcrumbs" aria-label="Breadcrumb">
              <button className="breadcrumbs__button" type="button" onClick={() => handleJump([], rootSourceId)}>
                Root
              </button>
              {getPageCrumbs().map((crumb) => (
                <span key={crumb.id}>
                  <span className="breadcrumbs__separator">/</span>
                  <button className="breadcrumbs__button" type="button" onClick={() => handleJump(crumb.path, crumb.sourceId)}>
                    {crumb.label}
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="toolbar-spacer" />
          {saveState !== "idle" ? (
            <div className="toolbar-meta status-text">
              {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved source files" : "Save failed"}
            </div>
          ) : null}
          {isDirty && !isEditingCurrentPage ? (
            <>
              <button className="ghost-button" type="button" onClick={handleReload}>
                Reload
              </button>
              <button className="primary-button" type="button" onClick={handleSave}>
                Save
              </button>
            </>
          ) : null}
          {pages.length > 1 ? (
            <button className="ghost-button" type="button" onClick={handleBack}>
              Back
            </button>
          ) : null}
        </header>

        <main className="main-content" ref={pageStackViewportRef}>
          <div
            className={`page-stack ${isCompactStack ? "page-stack--compact" : ""}`}
            style={{
              ["--stack-left-slot-width" as "--stack-left-slot-width"]: `${leftSlotWidth}px`,
              ["--stack-right-slot-width" as "--stack-right-slot-width"]: `${rightSlotWidth}px`,
            } as CSSProperties}
          >
            {isCompactStack ? (
              (() => {
                const compactSourceId = currentPage.sourceId ?? rootSourceId;
                const compactPage = { ...currentPage, sourceId: compactSourceId };
                return (
              <section
                className={[
                  "stack-page",
                  "stack-page--single",
                  "stack-page--single-mobile",
                  Array.isArray(resolvePageValue(compactPage))
                    ? "stack-page--array"
                    : (resolvePageValue(compactPage) && typeof resolvePageValue(compactPage) === "object"
                        ? "stack-page--object"
                        : "stack-page--primitive"),
                  currentPage.isReference ? "is-reference" : "",
                  "is-current",
                ].filter(Boolean).join(" ")}
                key={`compact:${currentPage.path.join("/") || "root"}`}
                style={{ left: 0, right: 0 }}
              >
                <ValueInspector
                  value={resolvePageValue(compactPage)}
                  savedValue={getValueAtPath(savedDocumentsBySourceId[compactSourceId], currentPage.path)}
                  path={currentPage.path}
                  title={getPageTitle(compactPage)}
                  host={host}
                  isReference={currentPage.isReference}
                  activeChildSegment={undefined}
                  onNavigateUp={pages.length > 1 ? handleBack : undefined}
                  onNavigate={(nextPath) => handleNavigate(0, nextPath)}
                  onSave={handleSave}
                  onReload={handleReload}
                  showPersistenceActions={isDirty}
                  onEditModeChange={setIsEditingCurrentPage}
                  onApplyValue={(nextValue) => {
                    setDocumentsBySourceId((current) => ({
                      ...current,
                      [compactSourceId]: setValueAtPath(current[compactSourceId], currentPage.path, nextValue),
                    }));
                  }}
                />
              </section>
                );
              })()
            ) : null}
            {!isCompactStack ? (
              <>
            {visiblePages.map((page, index) => {
              const pageSourceId = page.sourceId ?? rootSourceId;
              const showRootPlaceholder = visiblePages.length === 1 && page.path.length === 0;
              const renderedPage =
                stackAnimation?.direction === "push" && stackAnimation.exitingPage && index === 0
                  ? { ...stackAnimation.exitingPage, sourceId: stackAnimation.exitingPage.sourceId ?? rootSourceId }
                  : { ...page, sourceId: pageSourceId };
              const pageValue = resolvePageValue(renderedPage);
              const isForeground = visiblePages.length > 1 ? index === visiblePages.length - 1 : !showRootPlaceholder;
              const depthClass = visiblePages.length > 1
                ? (isForeground ? "stack-page--foreground" : "stack-page--background")
                : (showRootPlaceholder ? "stack-page--background" : "stack-page--single");
              const kindClass = Array.isArray(pageValue)
                ? "stack-page--array"
                : (pageValue && typeof pageValue === "object" ? "stack-page--object" : "stack-page--primitive");
              const classes = [
                "stack-page",
                depthClass,
                kindClass,
                index === visiblePages.length - 1 ? "is-current" : "",
                renderedPage.isReference ? "is-reference" : "",
                stackAnimation?.direction === "push" && index === visiblePages.length - 1 && !stackAnimation.exitingPage
                  ? "stack-page--push-enter"
                  : "",
                stackAnimation?.direction === "push" && index === visiblePages.length - 1 && stackAnimation.exitingPage
                  ? "stack-page--push-enter-delayed"
                  : "",
                stackAnimation?.direction === "replace" && index === visiblePages.length - 1
                  ? "stack-page--replace-enter"
                  : "",
                stackAnimation?.direction === "push" && index === visiblePages.length - 2 && !stackAnimation.exitingPage
                  ? "stack-page--push-background"
                  : "",
                stackAnimation?.direction === "replace" &&
                index === visiblePages.length - 2 &&
                samePath(renderedPage.path, stackAnimation.exitingPage.path)
                  ? "stack-page--replace-promote"
                  : "",
                stackAnimation?.direction === "pop" && index === visiblePages.length - 1
                  ? "stack-page--pop-target-hidden"
                  : "",
              ].filter(Boolean).join(" ");
              return (
                <section
                  className={classes}
                  key={`${renderedPage.path.join("/")}:${index}:${stackAnimation?.direction === "push" && stackAnimation.exitingPage && index === 0 ? "hold" : "live"}`}
                  style={getStackPageStyle(depthClass)}
                >
                  <ValueInspector
                    value={pageValue}
                    savedValue={getValueAtPath(savedDocumentsBySourceId[renderedPage.sourceId], renderedPage.path)}
                    path={renderedPage.path}
                    title={getPageTitle(renderedPage)}
                    host={host}
                    isReference={renderedPage.isReference}
                    activeChildSegment={deriveActiveChildSegment(renderedPage.path, currentPage.path)}
                    onNavigateUp={
                      index === visiblePages.length - 1
                        ? (pages.length > 1 ? handleBack : undefined)
                        : (visiblePages.length === 2 && index === 0 && renderedPage.path.length > 0 ? handleContextBack : undefined)
                    }
                    onNavigate={(nextPath) => handleNavigate(index, nextPath)}
                    onSave={handleSave}
                    onReload={handleReload}
                    showPersistenceActions={isDirty}
                    onEditModeChange={index === visiblePages.length - 1 ? setIsEditingCurrentPage : undefined}
                    onApplyValue={(nextValue) => {
                      setDocumentsBySourceId((current) => ({
                        ...current,
                        [renderedPage.sourceId]: setValueAtPath(current[renderedPage.sourceId], renderedPage.path, nextValue),
                      }));
                    }}
                  />
                </section>
              );
            })}
            {visiblePages.length === 1 && visiblePages[0]?.path.length === 0 ? (
              <section
                className="stack-page stack-page--foreground stack-page--empty"
                aria-hidden="true"
                style={{ left: `${leftSlotWidth}px`, width: `${rightSlotWidth}px` }}
              >
                <div className="stack-page__empty-state">
                  <div className="stack-page__empty-title">Select a field to inspect</div>
                  <div className="stack-page__empty-copy">Root stays pinned on the left so editing controls keep a stable width.</div>
                </div>
                </section>
              ) : null}
            {stackAnimation?.direction === "push" && stackAnimation.exitingPage && visiblePages.length === 2 ? (
              <section
                className={`stack-page stack-page--foreground stack-page--overlay stack-page--push-promote-shell ${
                  visiblePages[0]?.isReference ? "is-reference" : ""
                } ${
                  Array.isArray(resolvePageValue(visiblePages[0]))
                    ? "stack-page--array"
                    : (resolvePageValue(visiblePages[0]) && typeof resolvePageValue(visiblePages[0]) === "object"
                        ? "stack-page--object"
                        : "stack-page--primitive")
                }`}
                key={`push-promote:${stackAnimation.key}:${visiblePages[0].path.join("/")}`}
                style={{ left: `${leftSlotWidth}px` }}
              >
                <div className="stack-page--push-promote-mask">
                  <ValueInspector
                    value={resolvePageValue(visiblePages[0])}
                    path={visiblePages[0].path}
                    title={getPageTitle(visiblePages[0])}
                    host={host}
                    isReference={visiblePages[0].isReference}
                    onNavigateUp={() => undefined}
                    onNavigate={() => undefined}
                    onApplyValue={() => undefined}
                  />
                </div>
              </section>
            ) : null}
            {stackAnimation?.direction === "pop" ? (
              <section
                className={`stack-page stack-page--foreground stack-page--overlay stack-page--pop-exit ${
                  resolvePageValue(stackAnimation.exitingPage) && typeof resolvePageValue(stackAnimation.exitingPage) === "object"
                    ? (Array.isArray(resolvePageValue(stackAnimation.exitingPage)) ? "stack-page--array" : "stack-page--object")
                    : "stack-page--primitive"
                } ${stackAnimation.exitingPage.isReference ? "is-reference" : ""}`}
                key={`pop-exit:${stackAnimation.key}:${stackAnimation.exitingPage.path.join("/")}`}
                style={{ left: `${leftSlotWidth}px`, width: `${rightSlotWidth}px` }}
              >
                <ValueInspector
                  value={resolvePageValue(stackAnimation.exitingPage)}
                  path={stackAnimation.exitingPage.path}
                  title={getPageTitle(stackAnimation.exitingPage)}
                  host={host}
                  isReference={stackAnimation.exitingPage.isReference}
                  onNavigate={() => undefined}
                  onApplyValue={() => undefined}
                />
              </section>
            ) : null}
            {stackAnimation?.direction === "pop" ? (
              <section
                className={`stack-page stack-page--background stack-page--overlay stack-page--pop-promote ${
                  stackAnimation.promotingPage.isReference ? "is-reference" : ""
                } ${
                  resolvePageValue(stackAnimation.promotingPage) && typeof resolvePageValue(stackAnimation.promotingPage) === "object"
                    ? (Array.isArray(resolvePageValue(stackAnimation.promotingPage)) ? "stack-page--array" : "stack-page--object")
                    : "stack-page--primitive"
                }`}
                key={`pop-promote:${stackAnimation.key}:${stackAnimation.promotingPage.path.join("/")}`}
                style={{ left: 0, width: `${rightSlotWidth}px` }}
              >
                <ValueInspector
                  value={resolvePageValue(stackAnimation.promotingPage)}
                  path={stackAnimation.promotingPage.path}
                  title={getPageTitle(stackAnimation.promotingPage)}
                  host={host}
                  isReference={stackAnimation.promotingPage.isReference}
                  onNavigateUp={() => undefined}
                  onNavigate={() => undefined}
                  onApplyValue={() => undefined}
                />
              </section>
            ) : null}
              </>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

function buildCompactPathOptions(pages: NavigationPage[], rootSourceId: string) {
  return [
    { label: "Root", value: "0" },
    ...pages.slice(1).map((page, index) => ({
      label: getCompactOptionLabel(page, rootSourceId),
      value: String(index + 1),
    })),
  ];
}

function isTopLevelNavigable(value: unknown) {
  return Array.isArray(value) || Boolean(value) && typeof value === "object";
}

function getAnimationDuration(animation: StackAnimation) {
  if (animation.direction === "push" && animation.exitingPage) {
    return stackedPushEnterDurationMs;
  }
  return animationDurationMs;
}

function inferDocumentLabel(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.title === "string" && record.title) return record.title;
    if (typeof record.id === "string" && record.id) return record.id;
  }
  return "JSON Document";
}

function describeType(value: unknown, host?: EditorHost): string {
  if (host?.isReferenceNode?.(value)) return "reference";
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function previewValue(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} items`;
  if (value && typeof value === "object") return `${Object.keys(value as Record<string, unknown>).length} fields`;
  if (typeof value === "string") return value;
  return String(value);
}

function deriveActiveChildSegment(pagePath: JsonPath, currentPath: JsonPath) {
  if (currentPath.length <= pagePath.length) return undefined;
  const isAncestor = pagePath.every((segment, index) => currentPath[index] === segment);
  return isAncestor ? currentPath[pagePath.length] : undefined;
}

function getCompactOptionLabel(page: NavigationPage, rootSourceId: string) {
  if ((page.sourceId ?? rootSourceId) === rootSourceId && page.path.length > 0) {
    return formatPath(page.path);
  }
  return page.navLabel ?? (page.path.length > 0 ? formatPath(page.path) : "Root");
}
