import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { getValueAtPath, setValueAtPath } from "../core/document";
import { createNavigationState, goBack, jumpToPage, jumpToPath, openPath, type NavigationPage } from "../core/navigation";
import type { JsonPath } from "../core/path";
import { formatPath } from "../core/path";
import { isReferenceValue, type EditorHost } from "./host";
import type { EditorSchema, EditorSchemaHost, EditorValidationResult, EditorValidationHandler } from "./schema";
import { resolveSchemaAtPath, updateSchemaAtDocumentPath, validateDocument as validateBySchema } from "./schema";
import {
  determineBackAnimation,
  determineJumpAnimation,
  determineNavigateAnimation,
  determinePinnedRootBackAnimation,
  determinePinnedRootNavigateAnimation,
  getVisiblePages,
  samePath,
  type StackAnimation,
} from "./stack-motion";
import { ValueInspector } from "./ValueInspector";

export type EditorDocuments = Record<string, unknown>;

export type EditorSaveHandler = (documents: EditorDocuments) => void | EditorDocuments | Promise<void | EditorDocuments>;
export type EditorReloadHandler = () => void | EditorDocuments | Promise<void | EditorDocuments>;

export function resolveCompactStack(
  compactBreakpoint: number,
  stackViewportWidth: number,
  windowViewportWidth: number,
) {
  if (compactBreakpoint <= 0) return false;
  const effectiveWidth = stackViewportWidth > 0 ? stackViewportWidth : windowViewportWidth;
  return effectiveWidth > 0 && effectiveWidth < compactBreakpoint;
}

export type EditorShellProps = {
  documents?: Record<string, unknown>;
  rootSourceId?: string;
  rootPageTitle?: string;
  showDocumentTitle?: boolean;
  layoutMode?: "stack-flow" | "pinned-root";
  leftPageFullscreen?: boolean;
  compactBreakpoint?: number;
  value?: unknown;
  host?: EditorHost;
  schemaHost?: EditorSchemaHost;
  onSave?: EditorSaveHandler;
  onUnavailableSaveAttempt?: () => void;
  onReload?: EditorReloadHandler;
  validateDocument?: EditorValidationHandler;
  readOnly?: boolean;
  enableRawEditor?: boolean;
  toolbarActions?: ReactNode;
};

const animationDurationMs = 500;
const stackedPushEnterDurationMs = 500;

export function EditorShell({
  documents,
  rootSourceId = "main",
  rootPageTitle = "Root",
  showDocumentTitle = true,
  layoutMode = "stack-flow",
  leftPageFullscreen = false,
  compactBreakpoint = 768,
  value,
  host,
  schemaHost,
  onSave,
  onUnavailableSaveAttempt,
  onReload,
  validateDocument,
  readOnly = false,
  enableRawEditor = true,
  toolbarActions,
}: EditorShellProps) {
  const initialDocuments = useMemo(() => normalizeDocuments(documents, rootSourceId, value), [documents, rootSourceId, value]);
  const initialDocumentsSnapshot = useMemo(() => JSON.stringify(initialDocuments), [initialDocuments]);
  const [documentsBySourceId, setDocumentsBySourceId] = useState(initialDocuments);
  const [savedDocumentsBySourceId, setSavedDocumentsBySourceId] = useState(initialDocuments);
  const [pages, setPages] = useState(createNavigationState(rootSourceId, initialDocuments).pages);
  const [stackAnimation, setStackAnimation] = useState<StackAnimation | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [validationResult, setValidationResult] = useState<EditorValidationResult | null>(null);
  const [isEditingCurrentPage, setIsEditingCurrentPage] = useState(false);
  const [, setSchemaRevision] = useState(0);
  const pageStackViewportRef = useRef<HTMLElement | null>(null);
  const lastExternalDocumentsSnapshotRef = useRef(initialDocumentsSnapshot);
  const [stackViewportWidth, setStackViewportWidth] = useState(0);
  const [windowViewportWidth, setWindowViewportWidth] = useState(
    typeof window === "undefined" ? 0 : window.innerWidth,
  );
  const animationKeyRef = useRef(0);
  const rootPage = pages[0] ?? { sourceId: rootSourceId, path: [] };
  const currentPage = pages[pages.length - 1] ?? { sourceId: rootSourceId, path: [] };
  const isCompactStack = resolveCompactStack(compactBreakpoint, stackViewportWidth, windowViewportWidth);
  const isPinnedRootLayout = layoutMode === "pinned-root" && !isCompactStack;
  const prefersDualPageStackFlow = layoutMode === "stack-flow" && !isCompactStack;
  const visiblePages = isPinnedRootLayout
    ? ((currentPage.sourceId ?? rootSourceId) === rootSourceId && currentPage.path.length === 0 ? [rootPage] : [rootPage, currentPage])
    : (prefersDualPageStackFlow ? getVisiblePages(pages) : [currentPage]);
  const hasVisibleRightPage = visiblePages.length > 1;
  const useFullscreenLeftPage = leftPageFullscreen && !hasVisibleRightPage;
  const showsRootPlaceholder = !isCompactStack && visiblePages.length === 1 && currentPage.path.length === 0 && !useFullscreenLeftPage;
  const usesSplitLayout = !isCompactStack && (isPinnedRootLayout || (prefersDualPageStackFlow && (hasVisibleRightPage || showsRootPlaceholder)));
  const referenceScopeDepths = useMemo(() => buildReferenceScopeDepths(pages), [pages]);
  const rootLabel = inferDocumentLabel(documentsBySourceId[rootSourceId], rootPageTitle);
  const isAtRootPage = (currentPage.sourceId ?? rootSourceId) === rootSourceId && currentPage.path.length === 0;
  const isDirty = useMemo(
    () => JSON.stringify(documentsBySourceId) !== JSON.stringify(savedDocumentsBySourceId),
    [documentsBySourceId, savedDocumentsBySourceId],
  );

  useEffect(() => {
    if (lastExternalDocumentsSnapshotRef.current === initialDocumentsSnapshot) {
      return;
    }

    lastExternalDocumentsSnapshotRef.current = initialDocumentsSnapshot;
    setDocumentsBySourceId(initialDocuments);
    setSavedDocumentsBySourceId(initialDocuments);
    setPages((currentPages) => currentPages.map((page) => ({ ...page, value: undefined })));
    setStackAnimation(null);
    setSaveState("idle");
    setValidationResult(null);
    setIsEditingCurrentPage(false);
  }, [initialDocuments, initialDocumentsSnapshot]);

  async function handleSave() {
    if (readOnly || !onSave) return;
    setSaveState("saving");
    try {
      const nextValidation = await runValidation(documentsBySourceId);
      if (nextValidation) {
        setValidationResult(nextValidation);
        if (!nextValidation.valid) {
          setSaveState("error");
          return;
        }
      } else {
        setValidationResult(null);
      }
      const maybeNextDocuments = await onSave(documentsBySourceId);
      const nextDocuments = maybeNextDocuments ? maybeNextDocuments : documentsBySourceId;
      setDocumentsBySourceId(nextDocuments);
      setSavedDocumentsBySourceId(nextDocuments);
      setValidationResult(null);
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
    }
  }

  async function handleReload() {
    try {
      const nextDocuments = onReload ? await onReload() : savedDocumentsBySourceId;
      const resolvedDocuments = nextDocuments ?? savedDocumentsBySourceId;
      setDocumentsBySourceId(resolvedDocuments);
      setSavedDocumentsBySourceId(resolvedDocuments);
      setPages((currentPages) => currentPages.map((page) => ({ ...page, value: undefined })));
      setStackAnimation(null);
      setSaveState("idle");
      setValidationResult(null);
      setIsEditingCurrentPage(false);
    } catch {
      setSaveState("error");
    }
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
    if (typeof window === "undefined") return;
    const updateViewportWidth = () => setWindowViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
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

  function resolvePageSchema(page: NavigationPage): EditorSchema | undefined {
    if (!schemaHost) return undefined;
    const sourceId = page.sourceId ?? rootSourceId;
    const directSchema = schemaHost.getSchema({
      sourceId,
      path: page.path,
      value: resolvePageValue(page),
      documents: documentsBySourceId,
    });
    if (directSchema) {
      return directSchema;
    }

    const rootSchema = schemaHost.getSchema({
      sourceId,
      path: [],
      value: documentsBySourceId[sourceId],
      documents: documentsBySourceId,
    });
    return resolveSchemaAtPath(rootSchema, page.path);
  }

  function resolveNamedSchema(name: string): EditorSchema | undefined {
    return schemaHost?.getNamedSchema?.(name);
  }

  function handleUpdateDocumentSchema(
    sourceId: string,
    path: JsonPath,
    target: "self" | "items",
    updater: (schema: EditorSchema) => EditorSchema,
  ) {
    if (!schemaHost?.setRootSchema) return;
    const rootValue = documentsBySourceId[sourceId];
    const rootSchema = schemaHost.getSchema({
      sourceId,
      path: [],
      value: rootValue,
      documents: documentsBySourceId,
    });
    if (!rootSchema) return;
    const nextSchema = updateSchemaAtDocumentPath(rootSchema, path, target, updater);
    const result = schemaHost.setRootSchema(nextSchema, {
      sourceId,
      documents: documentsBySourceId,
    });
    if (result instanceof Promise) {
      void result.then(() => setSchemaRevision((current) => current + 1));
      return;
    }
    setSchemaRevision((current) => current + 1);
  }

  function handleUpdateNamedSchema(
    name: string,
    updater: (schema: EditorSchema) => EditorSchema,
  ) {
    if (!schemaHost?.setNamedSchema) return;
    const currentSchema = schemaHost.getNamedSchema?.(name);
    if (!currentSchema) return;
    const result = schemaHost.setNamedSchema(name, updater(currentSchema), {
      sourceId: rootSourceId,
      documents: documentsBySourceId,
    });
    if (result instanceof Promise) {
      void result.then(() => setSchemaRevision((current) => current + 1));
      return;
    }
    setSchemaRevision((current) => current + 1);
  }

  async function runValidation(nextDocuments: EditorDocuments): Promise<EditorValidationResult | null> {
    if (validateDocument) {
      return validateDocument(nextDocuments);
    }
    if (!schemaHost) {
      return null;
    }

    const rootSchema = schemaHost.getSchema({
      sourceId: rootSourceId,
      path: [],
      value: nextDocuments[rootSourceId],
      documents: nextDocuments,
    });

    if (!rootSchema) {
      return null;
    }

    return validateBySchema(rootSchema, nextDocuments[rootSourceId], { sourceId: rootSourceId });
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
      return inferDocumentLabel(resolvePageValue(page), rootPageTitle);
    }
    return rootPageTitle;
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
    if (!usesSplitLayout || depthClass === "stack-page--single" || depthClass === "stack-page--fullscreen-left") {
      return { left: 0, right: 0 };
    }
    if (depthClass === "stack-page--background") {
      return { left: 0, width: `${leftSlotWidth}px` };
    }
    return { left: `${leftSlotWidth}px`, width: `${rightSlotWidth}px` };
  }

  function getPinnedVisiblePagesForPages(targetPages: NavigationPage[]) {
    const pinnedRootPage = targetPages[0] ?? { sourceId: rootSourceId, path: [] };
    const pinnedCurrentPage = targetPages[targetPages.length - 1] ?? pinnedRootPage;
    const isPinnedAtRoot =
      (pinnedCurrentPage.sourceId ?? rootSourceId) === rootSourceId &&
      pinnedCurrentPage.path.length === 0;
    return isPinnedAtRoot ? [pinnedRootPage] : [pinnedRootPage, pinnedCurrentPage];
  }

  function handleNavigate(fromIndex: number, nextPath: JsonPath) {
    animationKeyRef.current += 1;
    setPages((currentPages) => {
      const actualIndex = isCompactStack || !isPinnedRootLayout
        ? currentPages.length - 1
        : (fromIndex === 0 ? 0 : currentPages.length - 1);
      const sourceIsForeground = actualIndex === currentPages.length - 1;
      const basePages = sourceIsForeground ? currentPages : currentPages.slice(0, actualIndex + 1);
      const nextState = openPath({ documents: documentsBySourceId, rootSourceId, pages: basePages }, nextPath, host);
      const nextPages = nextState.pages;
      if (nextState.documents) {
        setDocumentsBySourceId((currentDocuments) => (
          currentDocuments === nextState.documents
            ? currentDocuments
            : nextState.documents ?? currentDocuments
        ));
        setSavedDocumentsBySourceId((currentSavedDocuments) => {
          const merged = { ...currentSavedDocuments };
          let changed = false;
          for (const [sourceId, value] of Object.entries(nextState.documents ?? {})) {
            if (!(sourceId in merged)) {
              merged[sourceId] = value;
              changed = true;
            }
          }
          return changed ? merged : currentSavedDocuments;
        });
      }
      if (isCompactStack) {
        setStackAnimation(null);
      } else if (isPinnedRootLayout) {
        const currentAnimationPages = getPinnedVisiblePagesForPages(currentPages);
        const nextAnimationPages = getPinnedVisiblePagesForPages(nextPages);
        const animation =
          currentAnimationPages.length === 2
            ? determinePinnedRootNavigateAnimation(currentAnimationPages, nextAnimationPages, animationKeyRef.current)
            : determineNavigateAnimation(currentAnimationPages, nextAnimationPages, 0, animationKeyRef.current);
        setStackAnimation(animation);
      } else {
        setStackAnimation(determineNavigateAnimation(currentPages, nextPages, actualIndex, animationKeyRef.current));
      }
      return nextPages;
    });
  }

  function handleJump(targetPath: JsonPath, sourceId = currentPage.sourceId ?? rootSourceId) {
    animationKeyRef.current += 1;
    setPages((currentPages) => {
      const nextPages = sourceId === rootSourceId && targetPath.length === 0
        ? jumpToPath({ documents: documentsBySourceId, rootSourceId, pages: currentPages }, targetPath).pages
        : jumpToPage({ documents: documentsBySourceId, rootSourceId, pages: currentPages }, { sourceId, path: targetPath }).pages;
      if (isCompactStack) {
        setStackAnimation(null);
      } else if (!isPinnedRootLayout) {
        setStackAnimation(determineJumpAnimation(currentPages, nextPages, animationKeyRef.current));
      } else {
        setStackAnimation(
          determineJumpAnimation(
            getPinnedVisiblePagesForPages(currentPages),
            getPinnedVisiblePagesForPages(nextPages),
            animationKeyRef.current,
          ),
        );
      }
      return nextPages;
    });
  }

  function handleBack() {
    animationKeyRef.current += 1;
    setPages((currentPages) => {
      const nextPages = goBack({ documents: documentsBySourceId, rootSourceId, pages: currentPages }).pages;
      if (isCompactStack) {
        setStackAnimation(null);
      } else if (isPinnedRootLayout) {
        setStackAnimation(
          determinePinnedRootBackAnimation(
            getPinnedVisiblePagesForPages(currentPages),
            getPinnedVisiblePagesForPages(nextPages),
            animationKeyRef.current,
          ),
        );
      } else {
        setStackAnimation(determineBackAnimation(currentPages, nextPages, animationKeyRef.current));
      }
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
      if (isCompactStack) {
        setStackAnimation(null);
      } else if (isPinnedRootLayout) {
        setStackAnimation(
          determinePinnedRootBackAnimation(
            getPinnedVisiblePagesForPages(currentPages),
            getPinnedVisiblePagesForPages(nextPages),
            animationKeyRef.current,
          ),
        );
      } else {
        setStackAnimation(determineBackAnimation(currentPages, nextPages, animationKeyRef.current));
      }
      return nextPages;
    });
  }

  return (
    <div className="app-frame">
      <div className="workspace">
        <header className="toolbar">
          {showDocumentTitle ? (
            <div className="toolbar-title">
              <strong>{rootLabel}</strong>
              <span>{getPageTitle(currentPage)}</span>
            </div>
          ) : null}
          {isCompactStack ? (
            <label className="breadcrumbs-select" aria-label="Path">
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
                {buildCompactPathOptions(pages, rootSourceId, rootPageTitle).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className={`breadcrumbs ${showDocumentTitle ? "" : "breadcrumbs--align-left"}`.trim()} aria-label="Breadcrumb">
              <button className="breadcrumbs__button" type="button" onClick={() => handleJump([], rootSourceId)}>
                {rootPageTitle}
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
          {toolbarActions}
          {saveState !== "idle" ? (
            <div className="toolbar-meta status-text">
              {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : "Save failed"}
            </div>
          ) : null}
          {validationResult?.documentErrors?.length ? (
            <div className="toolbar-meta status-text">
              {validationResult.documentErrors.join(" ")}
            </div>
          ) : null}
          {isDirty && !isEditingCurrentPage && !readOnly ? (
            <>
              <button className="ghost-button" type="button" onClick={handleReload}>
                Reload
              </button>
              {onSave || onUnavailableSaveAttempt ? (
                <button className="primary-button" type="button" onClick={onSave ? handleSave : onUnavailableSaveAttempt}>
                  Save
                </button>
              ) : null}
            </>
          ) : null}
          {!isAtRootPage && stackAnimation?.direction !== "pop" ? (
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
                const compactPageIndex = Math.max(0, pages.length - 1);
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
                    sourceId={compactSourceId}
                    path={currentPage.path}
                  title={getPageTitle(compactPage)}
                    host={host}
                    schema={resolvePageSchema(compactPage)}
                    resolveNamedSchema={resolveNamedSchema}
                    onUpdateDocumentSchema={handleUpdateDocumentSchema}
                    onUpdateNamedSchema={handleUpdateNamedSchema}
                  validationResult={validationResult}
                  enableRawEditor={enableRawEditor}
                    referenceError={currentPage.referenceError}
                    isReference={currentPage.isReference}
                    referenceScopeDepth={referenceScopeDepths[compactPageIndex]}
                    referenceSourceLabel={getReferenceSourceLabel(compactPage.sourceId, rootSourceId, referenceScopeDepths[compactPageIndex])}
                    activeChildSegment={undefined}
                    activeReferenceSourceId={undefined}
                    onNavigateUp={!isAtRootPage ? handleBack : undefined}
                  onNavigate={(nextPath) => handleNavigate(0, nextPath)}
                  readOnly={readOnly}
                  onEditModeChange={setIsEditingCurrentPage}
                  onApplyValue={(nextValue) => {
                    if (readOnly) return;
                    setValidationResult(null);
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
            {!isCompactStack && !isPinnedRootLayout ? (
              <>
            {visiblePages.map((page, index) => {
              const fullPageIndex = pages.length - visiblePages.length + index;
              const previousVisiblePage = index > 0 ? visiblePages[index - 1] : undefined;
              const pageSourceId = page.sourceId ?? rootSourceId;
              const pageValue = resolvePageValue(page);
              const showRootPlaceholder =
                showsRootPlaceholder &&
                visiblePages.length === 1 &&
                page.path.length === 0;
              const isForeground = visiblePages.length > 1 ? index === visiblePages.length - 1 : !showRootPlaceholder;
              const depthClass = !usesSplitLayout
                ? (useFullscreenLeftPage ? "stack-page--fullscreen-left" : "stack-page--single")
                : visiblePages.length > 1
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
                page.isReference ? "is-reference" : "",
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
                stackAnimation?.direction === "push" && index === visiblePages.length - 2 && stackAnimation.exitingPage
                  ? "stack-page--push-promote"
                  : "",
                stackAnimation?.direction === "replace" &&
                index === visiblePages.length - 2 &&
                samePath(page.path, stackAnimation.exitingPage.path)
                  ? "stack-page--replace-promote"
                  : "",
                stackAnimation?.direction === "pop" && index === visiblePages.length - 1
                  ? "stack-page--pop-target-hidden"
                  : "",
              ].filter(Boolean).join(" ");
              return (
                <section
                  className={classes}
                  key={`${page.path.join("/")}:${pageSourceId}:${index}`}
                  style={getStackPageStyle(depthClass)}
                >
                  <ValueInspector
                    value={pageValue}
                    savedValue={getValueAtPath(savedDocumentsBySourceId[pageSourceId], page.path)}
                    sourceId={pageSourceId}
                    path={page.path}
                    title={getPageTitle(page)}
                    host={host}
                    schema={resolvePageSchema(page)}
                    resolveNamedSchema={resolveNamedSchema}
                    onUpdateDocumentSchema={handleUpdateDocumentSchema}
                    onUpdateNamedSchema={handleUpdateNamedSchema}
                    validationResult={validationResult}
                    enableRawEditor={enableRawEditor}
                    referenceError={page.referenceError}
                    isReference={page.isReference}
                    referenceScopeDepth={referenceScopeDepths[fullPageIndex]}
                    referenceSourceLabel={getReferenceSourceLabel(pageSourceId, rootSourceId, referenceScopeDepths[fullPageIndex])}
                    activeChildSegment={deriveActiveChildSegment(page.path, currentPage.path)}
                    activeReferenceSourceId={deriveActiveReferenceSourceId(pageSourceId, currentPage.sourceId ?? rootSourceId, rootSourceId)}
                    onNavigateUp={
                      visiblePages.length === 2 && index === 0 && (page.path.length > 0 || page.isReference)
                        ? handleContextBack
                        : undefined
                    }
                    onClosePage={
                      leftPageFullscreen && index === visiblePages.length - 1 && hasVisibleRightPage
                        ? handleContextBack
                        : undefined
                    }
                    onNavigate={(nextPath) => handleNavigate(index, nextPath)}
                    readOnly={readOnly}
                    onEditModeChange={
                      index === visiblePages.length - 1
                        ? setIsEditingCurrentPage
                        : (visiblePages.length === 2 ? (() => undefined) : undefined)
                    }
                    onApplyValue={(nextValue) => {
                      if (readOnly) return;
                      setValidationResult(null);
                      setDocumentsBySourceId((current) => ({
                        ...current,
                        [pageSourceId]: setValueAtPath(current[pageSourceId], page.path, nextValue),
                      }));
                    }}
                  />
                </section>
              );
            })}
            {stackAnimation?.direction === "push" && stackAnimation.exitingPage ? (
              <section
                className={`stack-page stack-page--background stack-page--overlay stack-page--push-exit ${
                  stackAnimation.exitingPage.isReference ? "is-reference" : ""
                }`}
                aria-hidden="true"
                key={`push-exit:${stackAnimation.key}:${stackAnimation.exitingPage.path.join("/")}`}
                style={usesSplitLayout ? { left: 0, width: `${leftSlotWidth}px` } : { left: 0, right: 0 }}
              >
                <ValueInspector
                  value={resolvePageValue(stackAnimation.exitingPage)}
                  savedValue={getValueAtPath(
                    savedDocumentsBySourceId[stackAnimation.exitingPage.sourceId ?? rootSourceId],
                    stackAnimation.exitingPage.path,
                  )}
                  sourceId={stackAnimation.exitingPage.sourceId ?? rootSourceId}
                  path={stackAnimation.exitingPage.path}
                  title={getPageTitle(stackAnimation.exitingPage)}
                  host={host}
                  schema={resolvePageSchema(stackAnimation.exitingPage)}
                  resolveNamedSchema={resolveNamedSchema}
                  onUpdateDocumentSchema={handleUpdateDocumentSchema}
                  onUpdateNamedSchema={handleUpdateNamedSchema}
                  validationResult={validationResult}
                  enableRawEditor={enableRawEditor}
                  referenceError={stackAnimation.exitingPage.referenceError}
                  isReference={stackAnimation.exitingPage.isReference}
                  referenceScopeDepth={getReferenceScopeDepthForPage(pages, stackAnimation.exitingPage)}
                  referenceSourceLabel={getReferenceSourceLabel(
                    stackAnimation.exitingPage.sourceId,
                    rootSourceId,
                    getReferenceScopeDepthForPage(pages, stackAnimation.exitingPage),
                  )}
                  activeReferenceSourceId={undefined}
                  onClosePage={undefined}
                  onNavigate={() => undefined}
                  onApplyValue={() => undefined}
                />
              </section>
            ) : null}
            {stackAnimation?.direction === "pop" ? (
              <section
                className={`stack-page stack-page--foreground stack-page--overlay stack-page--pop-exit ${
                  resolvePageValue(stackAnimation.exitingPage) && typeof resolvePageValue(stackAnimation.exitingPage) === "object"
                    ? (Array.isArray(resolvePageValue(stackAnimation.exitingPage)) ? "stack-page--array" : "stack-page--object")
                    : "stack-page--primitive"
                } ${stackAnimation.exitingPage.isReference ? "is-reference" : ""}`}
                aria-hidden="true"
                key={`pop-exit:${stackAnimation.key}:${stackAnimation.exitingPage.path.join("/")}`}
                style={usesSplitLayout ? { left: `${leftSlotWidth}px`, width: `${rightSlotWidth}px` } : { left: 0, right: 0 }}
              >
                <ValueInspector
                  value={resolvePageValue(stackAnimation.exitingPage)}
                  sourceId={stackAnimation.exitingPage.sourceId ?? rootSourceId}
                  path={stackAnimation.exitingPage.path}
                  title={getPageTitle(stackAnimation.exitingPage)}
                  host={host}
                  schema={resolvePageSchema(stackAnimation.exitingPage)}
                  resolveNamedSchema={resolveNamedSchema}
                  onUpdateDocumentSchema={handleUpdateDocumentSchema}
                  onUpdateNamedSchema={handleUpdateNamedSchema}
                  validationResult={validationResult}
                  enableRawEditor={enableRawEditor}
                  referenceError={stackAnimation.exitingPage.referenceError}
                  isReference={stackAnimation.exitingPage.isReference}
                  referenceScopeDepth={getReferenceScopeDepthForPage(pages, stackAnimation.exitingPage)}
                  referenceSourceLabel={getReferenceSourceLabel(stackAnimation.exitingPage.sourceId, rootSourceId, getReferenceScopeDepthForPage(pages, stackAnimation.exitingPage))}
                  activeReferenceSourceId={undefined}
                  onClosePage={undefined}
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
                aria-hidden="true"
                key={`pop-promote:${stackAnimation.key}:${stackAnimation.promotingPage.path.join("/")}`}
                style={{ left: 0, width: `${rightSlotWidth}px` }}
              >
                <ValueInspector
                  value={resolvePageValue(stackAnimation.promotingPage)}
                  savedValue={getValueAtPath(
                    savedDocumentsBySourceId[stackAnimation.promotingPage.sourceId ?? rootSourceId],
                    stackAnimation.promotingPage.path,
                  )}
                  sourceId={stackAnimation.promotingPage.sourceId ?? rootSourceId}
                  path={stackAnimation.promotingPage.path}
                  title={getPageTitle(stackAnimation.promotingPage)}
                  host={host}
                  schema={resolvePageSchema(stackAnimation.promotingPage)}
                  resolveNamedSchema={resolveNamedSchema}
                  onUpdateNamedSchema={handleUpdateNamedSchema}
                  validationResult={validationResult}
                  enableRawEditor={enableRawEditor}
                  referenceError={stackAnimation.promotingPage.referenceError}
                  isReference={stackAnimation.promotingPage.isReference}
                  referenceScopeDepth={getReferenceScopeDepthForPage(pages, stackAnimation.promotingPage)}
                  referenceSourceLabel={getReferenceSourceLabel(
                    stackAnimation.promotingPage.sourceId,
                    rootSourceId,
                    getReferenceScopeDepthForPage(pages, stackAnimation.promotingPage),
                  )}
                  activeReferenceSourceId={undefined}
                  onNavigateUp={undefined}
                  onClosePage={undefined}
                  onNavigate={() => undefined}
                  onApplyValue={() => undefined}
                />
              </section>
            ) : null}
            {showsRootPlaceholder ? (
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
              </>
            ) : null}
            {!isCompactStack && isPinnedRootLayout ? (
              <>
                {(() => {
                  const pinnedRootSourceId = rootPage.sourceId ?? rootSourceId;
                  const pinnedRootValue = resolvePageValue(rootPage);
                  const pinnedRootKindClass = Array.isArray(pinnedRootValue)
                    ? "stack-page--array"
                    : (pinnedRootValue && typeof pinnedRootValue === "object" ? "stack-page--object" : "stack-page--primitive");
                  return (
                    <section
                      className={[
                        "stack-page",
                        useFullscreenLeftPage ? "stack-page--fullscreen-left" : "stack-page--background",
                        pinnedRootKindClass,
                        rootPage.isReference ? "is-reference" : "",
                      ].filter(Boolean).join(" ")}
                      key="pinned-root:left"
                      style={getStackPageStyle(useFullscreenLeftPage ? "stack-page--fullscreen-left" : "stack-page--background")}
                    >
                      <ValueInspector
                        value={pinnedRootValue}
                        savedValue={getValueAtPath(savedDocumentsBySourceId[pinnedRootSourceId], rootPage.path)}
                        sourceId={pinnedRootSourceId}
                        path={rootPage.path}
                        title={getPageTitle(rootPage)}
                        host={host}
                        schema={resolvePageSchema(rootPage)}
                        resolveNamedSchema={resolveNamedSchema}
                        onUpdateDocumentSchema={handleUpdateDocumentSchema}
                        onUpdateNamedSchema={handleUpdateNamedSchema}
                        validationResult={validationResult}
                        enableRawEditor={enableRawEditor}
                        referenceError={rootPage.referenceError}
                        isReference={rootPage.isReference}
                        referenceScopeDepth={referenceScopeDepths[0]}
                        referenceSourceLabel={getReferenceSourceLabel(rootPage.sourceId, rootSourceId, referenceScopeDepths[0])}
                        activeChildSegment={deriveActiveChildSegment(rootPage.path, currentPage.path)}
                        activeReferenceSourceId={deriveActiveReferenceSourceId(pinnedRootSourceId, currentPage.sourceId ?? rootSourceId, rootSourceId)}
                        onNavigateUp={undefined}
                        onClosePage={undefined}
                        onNavigate={(nextPath) => handleNavigate(0, nextPath)}
                        readOnly={readOnly}
                        onEditModeChange={setIsEditingCurrentPage}
                        onApplyValue={(nextValue) => {
                          if (readOnly) return;
                          setValidationResult(null);
                          setDocumentsBySourceId((current) => ({
                            ...current,
                            [pinnedRootSourceId]: setValueAtPath(current[pinnedRootSourceId], rootPage.path, nextValue),
                          }));
                        }}
                      />
                    </section>
                  );
                })()}
                {visiblePages.length === 1 ? (
                  useFullscreenLeftPage ? null : (
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
                  )
                ) : (() => {
                  const pinnedRightPage = visiblePages[1];
                  const pinnedRightSourceId = pinnedRightPage.sourceId ?? rootSourceId;
                  const pinnedRightValue = resolvePageValue(pinnedRightPage);
                  const pinnedRightKindClass = Array.isArray(pinnedRightValue)
                    ? "stack-page--array"
                    : (pinnedRightValue && typeof pinnedRightValue === "object" ? "stack-page--object" : "stack-page--primitive");
                  const pinnedRightClasses = [
                    "stack-page",
                    "stack-page--foreground",
                    pinnedRightKindClass,
                    "is-current",
                    pinnedRightPage.isReference ? "is-reference" : "",
                    stackAnimation?.direction === "push" ? "stack-page--push-enter" : "",
                    stackAnimation?.direction === "replace" ? "stack-page--replace-enter" : "",
                    stackAnimation?.direction === "pop" ? "stack-page--pop-target-hidden" : "",
                  ].filter(Boolean).join(" ");

                  return (
                    <section
                      className={pinnedRightClasses}
                      key={`pinned-root:right:${pinnedRightSourceId}:${pinnedRightPage.path.join("/")}:${stackAnimation?.key ?? "live"}`}
                      style={getStackPageStyle("stack-page--foreground")}
                    >
                      <ValueInspector
                        value={pinnedRightValue}
                        savedValue={getValueAtPath(savedDocumentsBySourceId[pinnedRightSourceId], pinnedRightPage.path)}
                        sourceId={pinnedRightSourceId}
                        path={pinnedRightPage.path}
                        title={getPageTitle(pinnedRightPage)}
                        host={host}
                        schema={resolvePageSchema(pinnedRightPage)}
                        resolveNamedSchema={resolveNamedSchema}
                        onUpdateDocumentSchema={handleUpdateDocumentSchema}
                        onUpdateNamedSchema={handleUpdateNamedSchema}
                        validationResult={validationResult}
                        enableRawEditor={enableRawEditor}
                        referenceError={pinnedRightPage.referenceError}
                        isReference={pinnedRightPage.isReference}
                        referenceScopeDepth={referenceScopeDepths[Math.max(0, pages.length - 1)]}
                        referenceSourceLabel={getReferenceSourceLabel(pinnedRightPage.sourceId, rootSourceId, referenceScopeDepths[Math.max(0, pages.length - 1)])}
                        activeChildSegment={undefined}
                        activeReferenceSourceId={deriveActiveReferenceSourceId(pinnedRightSourceId, currentPage.sourceId ?? rootSourceId, rootSourceId)}
                        onNavigateUp={undefined}
                        onClosePage={handleContextBack}
                        onNavigate={(nextPath) => handleNavigate(1, nextPath)}
                        readOnly={readOnly}
                        onEditModeChange={setIsEditingCurrentPage}
                        onApplyValue={(nextValue) => {
                          if (readOnly) return;
                          setValidationResult(null);
                          setDocumentsBySourceId((current) => ({
                            ...current,
                            [pinnedRightSourceId]: setValueAtPath(current[pinnedRightSourceId], pinnedRightPage.path, nextValue),
                          }));
                        }}
                      />
                    </section>
                  );
                })()}
                {stackAnimation?.direction === "pop" ? (
                  <section
                    className={`stack-page stack-page--foreground stack-page--overlay stack-page--pop-exit ${
                      resolvePageValue(stackAnimation.exitingPage) && typeof resolvePageValue(stackAnimation.exitingPage) === "object"
                        ? (Array.isArray(resolvePageValue(stackAnimation.exitingPage)) ? "stack-page--array" : "stack-page--object")
                        : "stack-page--primitive"
                    } ${stackAnimation.exitingPage.isReference ? "is-reference" : ""}`}
                    aria-hidden="true"
                    key={`pop-exit:${stackAnimation.key}:${stackAnimation.exitingPage.path.join("/")}`}
                    style={{ left: `${leftSlotWidth}px`, width: `${rightSlotWidth}px` }}
                  >
                    <ValueInspector
                      value={resolvePageValue(stackAnimation.exitingPage)}
                      sourceId={stackAnimation.exitingPage.sourceId ?? rootSourceId}
                      path={stackAnimation.exitingPage.path}
                      title={getPageTitle(stackAnimation.exitingPage)}
                      host={host}
                      schema={resolvePageSchema(stackAnimation.exitingPage)}
                      resolveNamedSchema={resolveNamedSchema}
                      onUpdateDocumentSchema={handleUpdateDocumentSchema}
                      onUpdateNamedSchema={handleUpdateNamedSchema}
                      validationResult={validationResult}
                      enableRawEditor={enableRawEditor}
                      referenceError={stackAnimation.exitingPage.referenceError}
                      isReference={stackAnimation.exitingPage.isReference}
                      referenceScopeDepth={getReferenceScopeDepthForPage(pages, stackAnimation.exitingPage)}
                      referenceSourceLabel={getReferenceSourceLabel(stackAnimation.exitingPage.sourceId, rootSourceId, getReferenceScopeDepthForPage(pages, stackAnimation.exitingPage))}
                      activeReferenceSourceId={undefined}
                      onClosePage={undefined}
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

function normalizeDocuments(documents: EditorDocuments | undefined, rootSourceId: string, value: unknown) {
  if (documents) return documents;
  return { [rootSourceId]: value };
}

function buildCompactPathOptions(pages: NavigationPage[], rootSourceId: string, rootPageTitle: string) {
  return [
    { label: rootPageTitle, value: "0" },
    ...pages.slice(1).map((page, index) => ({
      label: getCompactOptionLabel(page, rootSourceId, rootPageTitle),
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

function inferDocumentLabel(value: unknown, fallback = "JSON Document") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.title === "string" && record.title) return record.title;
    if (typeof record.id === "string" && record.id) return record.id;
  }
  return fallback;
}

function describeType(value: unknown, host?: EditorHost): string {
  if (isReferenceValue(value)) return "reference";
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

function deriveActiveReferenceSourceId(
  pageSourceId: string,
  currentSourceId: string,
  rootSourceId: string,
) {
  if (pageSourceId !== rootSourceId) return undefined;
  if (currentSourceId === rootSourceId) return undefined;
  return currentSourceId;
}

function getCompactOptionLabel(page: NavigationPage, rootSourceId: string, rootPageTitle: string) {
  if ((page.sourceId ?? rootSourceId) === rootSourceId && page.path.length > 0) {
    return formatPath(page.path);
  }
  return page.navLabel ?? (page.path.length > 0 ? formatPath(page.path) : rootPageTitle);
}

function buildReferenceScopeDepths(pages: NavigationPage[]) {
  let depth = 0;
  return pages.map((page) => {
    if (page.isReference) {
      depth += 1;
    }
    return depth;
  });
}

function getReferenceSourceLabel(sourceId: string | undefined, rootSourceId: string, referenceScopeDepth = 0) {
  if (!sourceId || sourceId === rootSourceId || referenceScopeDepth <= 0) return undefined;
  const segments = sourceId.split("/");
  return segments[segments.length - 1] || sourceId;
}

function getReferenceScopeDepthForPage(pages: NavigationPage[], page: NavigationPage) {
  const depths = buildReferenceScopeDepths(pages);
  const pageIndex = pages.findIndex((candidate) => candidate === page);
  if (pageIndex >= 0) {
    return depths[pageIndex];
  }

  let depth = 0;
  for (const candidate of pages) {
    if (candidate.isReference) {
      depth += 1;
    }
  }
  return page.isReference ? depth + 1 : depth;
}
