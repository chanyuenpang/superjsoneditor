import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { getValueAtPath, setValueAtPath } from "../core/document";
import { createNavigationState, goBack, jumpToPage, jumpToPath, openPath, type NavigationPage } from "../core/navigation";
import type { JsonPath } from "../core/path";
import { formatPath } from "../core/path";
import { isReferenceValue, type EditorHost } from "./host";
import type { EditorSchema, EditorSchemaHost, EditorSchemaLayerTarget, EditorValidationResult } from "./schema";
import { inferSchemaFromValue, resolveSchemaAtPath, updateSchemaAtDocumentPath } from "./schema";
import {
  determineBackAnimation,
  determineJumpAnimation,
  determineNavigateAnimation,
  determinePinnedRootBackAnimation,
  determinePinnedRootNavigateAnimation,
  getVisiblePages,
  resolvePinnedRootMotionPlan,
  resolveStackFlowMotionPlan,
  samePath,
  type StackAnimation,
} from "./stack-motion";
import { usePressSlopGuard } from "./usePressSlopGuard";
import { ValueInspector } from "./ValueInspector";
import { icons } from "./icons";

export type EditorDocuments = Record<string, unknown>;

export type EditorSaveHandler = (documents: EditorDocuments) => void | EditorDocuments | Promise<void | EditorDocuments>;
export type EditorReloadHandler = () => void | EditorDocuments | Promise<void | EditorDocuments>;
export type EditorChangeHandler = (documents: EditorDocuments) => void;

export function resolveCompactStack(
  compactBreakpoint: number,
  stackViewportWidth: number,
  windowViewportWidth: number,
) {
  if (compactBreakpoint <= 0) return false;
  const effectiveWidth = stackViewportWidth > 0 ? stackViewportWidth : windowViewportWidth;
  return effectiveWidth > 0 && effectiveWidth < compactBreakpoint;
}

function getSchemaOverrideKey(sourceId: string, target: EditorSchemaLayerTarget) {
  return target.mode === "view"
    ? `${sourceId}:view:${target.path}`
    : `${sourceId}:default`;
}

type StackFlowRenderPage = {
  page: NavigationPage;
  pageStack: "current" | "source";
  fullPageIndex: number;
  depthClass: "stack-page--background" | "stack-page--foreground" | "stack-page--single" | "stack-page--fullscreen-left";
  isCurrent: boolean;
  replaceEnter: boolean;
  hideClass?: "stack-page--push-target-hidden" | "stack-page--pop-target-hidden";
};

function findRenderedPageIndex(pages: NavigationPage[], targetPage: NavigationPage) {
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    const candidate = pages[index];
    if ((candidate.sourceId ?? "") === (targetPage.sourceId ?? "") && samePath(candidate.path, targetPage.path)) {
      return index;
    }
  }
  return Math.max(0, pages.length - 1);
}

function buildStackFlowRenderPages({
  pages,
  visiblePages,
  sourcePages,
  sourceVisiblePages,
  stackAnimation,
  usesSplitLayout,
  useFullscreenLeftPage,
  showsRootPlaceholder,
  forceSinglePageBackground,
  preferFullscreenSinglePage,
}: {
  pages: NavigationPage[];
  visiblePages: NavigationPage[];
  sourcePages: NavigationPage[] | null;
  sourceVisiblePages: NavigationPage[] | null;
  stackAnimation: StackAnimation | null;
  usesSplitLayout: boolean;
  useFullscreenLeftPage: boolean;
  showsRootPlaceholder: boolean;
  forceSinglePageBackground: boolean;
  preferFullscreenSinglePage: boolean;
}): StackFlowRenderPage[] {
  const renderedPages =
    stackAnimation?.direction === "push" &&
    sourcePages &&
    sourceVisiblePages?.length === 2 &&
    visiblePages.length === 2
      ? [
          { page: sourceVisiblePages[0], pageStack: "source" as const, fullPageIndex: findRenderedPageIndex(sourcePages, sourceVisiblePages[0]) },
          { page: visiblePages[1], pageStack: "current" as const, fullPageIndex: findRenderedPageIndex(pages, visiblePages[1]) },
        ]
      : visiblePages.map((page) => ({
          page,
          pageStack: "current" as const,
          fullPageIndex: findRenderedPageIndex(pages, page),
        }));

  return renderedPages.map(({ page, pageStack, fullPageIndex }, index) => {
    const showRootPlaceholder = showsRootPlaceholder && renderedPages.length === 1 && page.path.length === 0;
    const isForeground = renderedPages.length > 1 ? index === renderedPages.length - 1 : !showRootPlaceholder;
    const depthClass = renderedPages.length === 1 && preferFullscreenSinglePage
      ? "stack-page--fullscreen-left"
      : !usesSplitLayout
      ? (useFullscreenLeftPage ? "stack-page--fullscreen-left" : "stack-page--single")
      : renderedPages.length > 1
      ? (isForeground ? "stack-page--foreground" : "stack-page--background")
      : forceSinglePageBackground
      ? "stack-page--background"
      : (showRootPlaceholder ? "stack-page--background" : "stack-page--single");

    let hideClass: StackFlowRenderPage["hideClass"];
    if (stackAnimation?.direction === "push" && renderedPages.length > 1 && isForeground) {
      hideClass = "stack-page--push-target-hidden";
    } else if (stackAnimation?.direction === "pop" && visiblePages.length > 1 && isForeground) {
      hideClass = "stack-page--pop-target-hidden";
    }

    return {
      page,
      pageStack,
      fullPageIndex,
      depthClass,
      isCurrent: index === renderedPages.length - 1,
      replaceEnter: stackAnimation?.direction === "replace" && !forceSinglePageBackground && index === visiblePages.length - 1,
      hideClass,
    };
  });
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
  activeSchemaLayer?: EditorSchemaLayerTarget;
  onSave?: EditorSaveHandler;
  onUnavailableSaveAttempt?: () => void;
  onReload?: EditorReloadHandler;
  onChange?: EditorChangeHandler;
  readOnly?: boolean;
  enableRawEditor?: boolean;
  toolbarActions?: ReactNode;
  renderPageActionButtons?: () => ReactNode;
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
  activeSchemaLayer = { mode: "default" },
  onSave,
  onUnavailableSaveAttempt,
  onReload,
  onChange,
  readOnly = false,
  enableRawEditor = true,
  toolbarActions,
  renderPageActionButtons,
}: EditorShellProps) {
  const initialDocuments = useMemo(() => normalizeDocuments(documents, rootSourceId, value), [documents, rootSourceId, value]);
  const initialDocumentsSnapshot = useMemo(() => JSON.stringify(initialDocuments), [initialDocuments]);
  const [documentsBySourceId, setDocumentsBySourceId] = useState(initialDocuments);
  const [savedDocumentsBySourceId, setSavedDocumentsBySourceId] = useState(initialDocuments);
  const [pages, setPages] = useState(createNavigationState(rootSourceId, initialDocuments).pages);
  const [stackAnimation, setStackAnimation] = useState<StackAnimation | null>(null);
  const [stackAnimationSourcePages, setStackAnimationSourcePages] = useState<NavigationPage[] | null>(null);
  const [closedStackFlowPage, setClosedStackFlowPage] = useState<Pick<NavigationPage, "sourceId" | "path"> | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [validationResult, setValidationResult] = useState<EditorValidationResult | null>(null);
  const [isEditingCurrentPage, setIsEditingCurrentPage] = useState(false);
  const [pageToolbarHost, setPageToolbarHost] = useState<HTMLDivElement | null>(null);
  const [, setSchemaRevision] = useState(0);
  const [schemaPersistenceNotice, setSchemaPersistenceNotice] = useState<string | null>(null);
  /** schema 写回失败：持续显示（不自动消失），回滚内存 override 后由下次成功保存清除。 */
  const [schemaSaveError, setSchemaSaveError] = useState<string | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const pageStackViewportRef = useRef<HTMLElement | null>(null);
  const lastExternalDocumentsSnapshotRef = useRef(initialDocumentsSnapshot);
  const hasReportedChangeRef = useRef(false);
  const schemaOverridesRef = useRef<Record<string, EditorSchema>>({});
  const schemaPersistenceNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stackViewportWidth, setStackViewportWidth] = useState(0);
  const [windowViewportWidth, setWindowViewportWidth] = useState(
    typeof window === "undefined" ? 0 : window.innerWidth,
  );
  const animationKeyRef = useRef(0);
  const rootPage = pages[0] ?? { sourceId: rootSourceId, path: [] };

  useEffect(() => () => {
    if (schemaPersistenceNoticeTimerRef.current) clearTimeout(schemaPersistenceNoticeTimerRef.current);
  }, []);
  const currentPage = pages[pages.length - 1] ?? { sourceId: rootSourceId, path: [] };
  const isCompactStack = resolveCompactStack(compactBreakpoint, stackViewportWidth, windowViewportWidth);
  const isPinnedRootLayout = layoutMode === "pinned-root" && !isCompactStack;
  const prefersDualPageStackFlow = layoutMode === "stack-flow" && !isCompactStack;
  const shouldCollapseStackFlowToCurrentPage =
    prefersDualPageStackFlow &&
    closedStackFlowPage != null &&
    (currentPage.sourceId ?? rootSourceId) === (closedStackFlowPage.sourceId ?? rootSourceId) &&
    samePath(currentPage.path, closedStackFlowPage.path);
  const visiblePages = isPinnedRootLayout
    ? ((currentPage.sourceId ?? rootSourceId) === rootSourceId && currentPage.path.length === 0 ? [rootPage] : [rootPage, currentPage])
    : (prefersDualPageStackFlow ? (shouldCollapseStackFlowToCurrentPage ? [currentPage] : getVisiblePages(pages)) : [currentPage]);
  const stackFlowSourceVisiblePages =
    !isCompactStack && !isPinnedRootLayout && stackAnimationSourcePages
      ? getVisiblePages(stackAnimationSourcePages)
      : null;
  const stackFlowMotionPlan = useMemo(
    () => resolveStackFlowMotionPlan(stackAnimation, stackFlowSourceVisiblePages ?? visiblePages, visiblePages),
    [stackAnimation, stackFlowSourceVisiblePages, visiblePages],
  );
  const isClosingStackFlowRightPage =
    !isPinnedRootLayout &&
    stackAnimation?.direction === "replace" &&
    stackFlowMotionPlan.rightMotion === "fade-out";
  const hasVisibleRightPage = visiblePages.length > 1;
  const useFullscreenLeftPage =
    leftPageFullscreen &&
    (!hasVisibleRightPage || isClosingStackFlowRightPage);
  const showsRootPlaceholder =
    !isCompactStack &&
    !isClosingStackFlowRightPage &&
    visiblePages.length === 1 &&
    currentPage.path.length === 0 &&
    !useFullscreenLeftPage;
  const usesSplitLayout = !isCompactStack && (isPinnedRootLayout || (prefersDualPageStackFlow && (hasVisibleRightPage || showsRootPlaceholder || isClosingStackFlowRightPage)));
  const referenceScopeDepths = useMemo(() => buildReferenceScopeDepths(pages), [pages]);
  const sourceReferenceScopeDepths = useMemo(
    () => (stackAnimationSourcePages ? buildReferenceScopeDepths(stackAnimationSourcePages) : null),
    [stackAnimationSourcePages],
  );
  const renderedStackFlowPages = useMemo(
    () => buildStackFlowRenderPages({
      pages,
      visiblePages,
      sourcePages: stackAnimationSourcePages,
      sourceVisiblePages: stackFlowSourceVisiblePages,
      stackAnimation,
      usesSplitLayout,
      useFullscreenLeftPage,
      showsRootPlaceholder,
      forceSinglePageBackground: isClosingStackFlowRightPage,
      preferFullscreenSinglePage: isClosingStackFlowRightPage && leftPageFullscreen,
    }),
    [
      pages,
      visiblePages,
      stackAnimationSourcePages,
      stackFlowSourceVisiblePages,
      stackAnimation,
      usesSplitLayout,
      useFullscreenLeftPage,
      showsRootPlaceholder,
      isClosingStackFlowRightPage,
      leftPageFullscreen,
    ],
  );
  const pinnedRootMotionPlan = useMemo(
    () => resolvePinnedRootMotionPlan(stackAnimation, visiblePages),
    [stackAnimation, visiblePages],
  );
  const rootLabel = inferRootPageLabel({
    sourceId: rootSourceId,
    value: documentsBySourceId[rootSourceId],
    schema: resolvePageSchema(rootPage),
    fallback: rootPageTitle,
  });
  const isAtRootPage = (currentPage.sourceId ?? rootSourceId) === rootSourceId && currentPage.path.length === 0;
  const isDirty = useMemo(
    () => JSON.stringify(documentsBySourceId) !== JSON.stringify(savedDocumentsBySourceId),
    [documentsBySourceId, savedDocumentsBySourceId],
  );

  usePressSlopGuard(shellRef);

  useEffect(() => {
    if (lastExternalDocumentsSnapshotRef.current === initialDocumentsSnapshot) {
      return;
    }

    lastExternalDocumentsSnapshotRef.current = initialDocumentsSnapshot;
    setDocumentsBySourceId(initialDocuments);
    setSavedDocumentsBySourceId(initialDocuments);
    setPages((currentPages) => currentPages.map((page) => ({ ...page, value: undefined })));
    setStackAnimation(null);
    setStackAnimationSourcePages(null);
    setClosedStackFlowPage(null);
    setSaveState("idle");
    setValidationResult(null);
    setIsEditingCurrentPage(false);
  }, [initialDocuments, initialDocumentsSnapshot]);

  useEffect(() => {
    if (!onChange) return;
    if (!hasReportedChangeRef.current) {
      hasReportedChangeRef.current = true;
      return;
    }
    onChange(documentsBySourceId);
  }, [documentsBySourceId, onChange]);

  async function handleSave() {
    if (readOnly || !onSave) return;
    setSaveState("saving");
    try {
      // 保存不做校验：只负责提交，数据问题由编辑器端承担。
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
      setStackAnimationSourcePages(null);
      setClosedStackFlowPage(null);
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
    const timeoutId = window.setTimeout(() => {
      setStackAnimation(null);
      setStackAnimationSourcePages(null);
    }, getAnimationDuration(stackAnimation));
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
    const rootSchema = resolveRootSchema(sourceId, documentsBySourceId[sourceId]);
    if (page.path.length === 0) {
      return rootSchema;
    }

    const nestedSchema = resolveSchemaAtPath(rootSchema, page.path);
    if (nestedSchema) {
      return nestedSchema;
    }

    return schemaHost.getSchema({
      sourceId,
      path: page.path,
      value: resolvePageValue(page),
      documents: documentsBySourceId,
      activeViewPath: activeSchemaLayer.mode === "view" ? activeSchemaLayer.path : null,
    }) ?? inferSchemaFromValue(resolvePageValue(page));
  }

  function resolveRootSchema(sourceId: string, value: unknown): EditorSchema {
    const override = schemaOverridesRef.current[getSchemaOverrideKey(sourceId, activeSchemaLayer)];
    if (override) return override;
    return schemaHost?.getSchema({
      sourceId,
      path: [],
      value,
      documents: documentsBySourceId,
      activeViewPath: activeSchemaLayer.mode === "view" ? activeSchemaLayer.path : null,
    }) ?? inferSchemaFromValue(value);
  }

  function resolveNamedSchema(name: string): EditorSchema | undefined {
    return schemaHost?.getNamedSchema?.(name, {
      sourceId: currentPage.sourceId ?? rootSourceId,
      documents: documentsBySourceId,
      activeViewPath: activeSchemaLayer.mode === "view" ? activeSchemaLayer.path : null,
      writeTarget: activeSchemaLayer,
    });
  }

  function handleUpdateDocumentSchema(
    sourceId: string,
    path: JsonPath,
    target: "self" | "items",
    updater: (schema: EditorSchema) => EditorSchema,
  ) {
    if (!schemaHost?.setRootSchema) {
      showSchemaPersistenceNotice("当前宿主未接入 schema 保存，列配置不会保留。");
      return;
    }
    const rootValue = documentsBySourceId[sourceId];
    const rootSchema = resolveRootSchema(sourceId, rootValue);
    const nextSchema = updateSchemaAtDocumentPath(rootSchema, path, target, updater);
    schemaOverridesRef.current[getSchemaOverrideKey(sourceId, activeSchemaLayer)] = nextSchema;
    setSchemaRevision((current) => current + 1);
    const result = schemaHost.setRootSchema(nextSchema, {
      sourceId,
      documents: documentsBySourceId,
      activeViewPath: activeSchemaLayer.mode === "view" ? activeSchemaLayer.path : null,
      writeTarget: activeSchemaLayer,
    });
    if (result instanceof Promise) {
      void result
        .then(() => { setSchemaSaveError(null); })
        .catch((reason: unknown) => {
          // 失败显式暴露：回滚内存 override（UI 恢复宿主真相）并持续报错，杜绝“松手已变、刷新还原”的假象。
          const overrideKey = getSchemaOverrideKey(sourceId, activeSchemaLayer);
          if (schemaOverridesRef.current[overrideKey] === nextSchema) delete schemaOverridesRef.current[overrideKey];
          setSchemaRevision((current) => current + 1);
          const detail = reason instanceof Error && reason.message ? reason.message : "";
          setSchemaSaveError(detail ? `schema 保存失败，已回滚本次修改。原因：${detail}` : "schema 保存失败，已回滚本次修改。");
        });
      return;
    }
    setSchemaSaveError(null);
  }

  function handleUpdateNamedSchema(
    name: string,
    updater: (schema: EditorSchema) => EditorSchema,
  ) {
    if (!schemaHost?.setNamedSchema) {
      showSchemaPersistenceNotice("当前宿主未接入命名 schema 保存，配置不会保留。");
      return;
    }
    const currentSchema = schemaHost.getNamedSchema?.(name, {
      sourceId: rootSourceId,
      documents: documentsBySourceId,
      activeViewPath: activeSchemaLayer.mode === "view" ? activeSchemaLayer.path : null,
      writeTarget: activeSchemaLayer,
    });
    if (!currentSchema) return;
    const result = schemaHost.setNamedSchema(name, updater(currentSchema), {
      sourceId: rootSourceId,
      documents: documentsBySourceId,
      activeViewPath: activeSchemaLayer.mode === "view" ? activeSchemaLayer.path : null,
      writeTarget: activeSchemaLayer,
    });
    if (result instanceof Promise) {
      void result
        .then(() => setSchemaRevision((current) => current + 1))
        .catch(() => showSchemaPersistenceNotice("命名 schema 保存失败，配置未保留。"));
      return;
    }
    setSchemaRevision((current) => current + 1);
  }

  function showSchemaPersistenceNotice(message: string) {
    if (schemaPersistenceNoticeTimerRef.current) clearTimeout(schemaPersistenceNoticeTimerRef.current);
    setSchemaPersistenceNotice(message);
    schemaPersistenceNoticeTimerRef.current = setTimeout(() => {
      setSchemaPersistenceNotice(null);
      schemaPersistenceNoticeTimerRef.current = null;
    }, 4500);
  }

  function getPageTitle(page: NavigationPage) {
    const sourceId = page.sourceId ?? rootSourceId;
    const arrayPageTitle = getArrayPageTitle(page.path, sourceId, rootLabel);
    if (arrayPageTitle) {
      return arrayPageTitle;
    }
    if (page.navLabel) {
      return page.navLabel;
    }
    if (page.path.length > 0) {
      return String(page.path.at(-1));
    }
    if (sourceId !== rootSourceId) {
      return inferRootPageLabel({
        sourceId,
        value: resolvePageValue(page),
        schema: resolvePageSchema(page),
        fallback: rootPageTitle,
      });
    }
    return rootLabel;
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
    setClosedStackFlowPage(null);
    setPages((currentPages) => {
      const currentVisiblePages = shouldCollapseStackFlowToCurrentPage
        ? [currentPages[currentPages.length - 1] ?? { sourceId: rootSourceId, path: [] }]
        : isPinnedRootLayout
        ? getPinnedVisiblePagesForPages(currentPages)
        : (isCompactStack ? [currentPages[currentPages.length - 1] ?? { sourceId: rootSourceId, path: [] }] : getVisiblePages(currentPages));
      const actualIndex = isCompactStack
        ? currentPages.length - 1
        : isPinnedRootLayout
        ? (fromIndex === 0 ? 0 : currentPages.length - 1)
        : Math.max(0, currentPages.length - currentVisiblePages.length + fromIndex);
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
        setStackAnimationSourcePages(null);
      } else if (isPinnedRootLayout) {
        const currentAnimationPages = getPinnedVisiblePagesForPages(currentPages);
        const nextAnimationPages = getPinnedVisiblePagesForPages(nextPages);
        const animation =
          currentAnimationPages.length === 2
            ? determinePinnedRootNavigateAnimation(currentAnimationPages, nextAnimationPages, animationKeyRef.current)
            : determineNavigateAnimation(currentAnimationPages, nextAnimationPages, 0, animationKeyRef.current);
        setStackAnimation(animation);
        setStackAnimationSourcePages(null);
      } else {
        const animation = determineNavigateAnimation(currentPages, nextPages, actualIndex, animationKeyRef.current);
        setStackAnimation(animation);
        setStackAnimationSourcePages(
          animation
            ? (shouldCollapseStackFlowToCurrentPage && sourceIsForeground
                ? [currentPages[currentPages.length - 1] ?? { sourceId: rootSourceId, path: [] }]
                : currentPages)
            : null,
        );
      }
      return nextPages;
    });
  }

  function handleJump(targetPath: JsonPath, sourceId = currentPage.sourceId ?? rootSourceId) {
    animationKeyRef.current += 1;
    setClosedStackFlowPage(null);
    setPages((currentPages) => {
      const nextPages = sourceId === rootSourceId && targetPath.length === 0
        ? jumpToPath({ documents: documentsBySourceId, rootSourceId, pages: currentPages }, targetPath).pages
        : jumpToPage({ documents: documentsBySourceId, rootSourceId, pages: currentPages }, { sourceId, path: targetPath }).pages;
      if (isCompactStack) {
        setStackAnimation(null);
        setStackAnimationSourcePages(null);
      } else if (!isPinnedRootLayout) {
        setStackAnimation(determineJumpAnimation(currentPages, nextPages, animationKeyRef.current));
        setStackAnimationSourcePages(null);
      } else {
        setStackAnimation(
          determineJumpAnimation(
            getPinnedVisiblePagesForPages(currentPages),
            getPinnedVisiblePagesForPages(nextPages),
            animationKeyRef.current,
          ),
        );
        setStackAnimationSourcePages(null);
      }
      return nextPages;
    });
  }

  function handleJumpToSource(sourceId: string) {
    handleJump([], sourceId);
  }

  function handleBack() {
    if (shouldCollapseStackFlowToCurrentPage) {
      animationKeyRef.current += 1;
      const restoredVisiblePages = getVisiblePages(pages);
      setClosedStackFlowPage(null);
      if (!isCompactStack && !isPinnedRootLayout && restoredVisiblePages.length === 2) {
        const promotingPage = restoredVisiblePages[1] ?? currentPage;
        setStackAnimation({
          direction: "pop",
          key: animationKeyRef.current,
          exitingPage: promotingPage,
          promotingPage,
        });
        setStackAnimationSourcePages(pages);
      } else {
        setStackAnimation(null);
        setStackAnimationSourcePages(null);
      }
      return;
    }

    animationKeyRef.current += 1;
    setPages((currentPages) => {
      const nextPages = goBack({ documents: documentsBySourceId, rootSourceId, pages: currentPages }).pages;
      setClosedStackFlowPage(null);
      if (isCompactStack) {
        setStackAnimation(null);
        setStackAnimationSourcePages(null);
      } else if (isPinnedRootLayout) {
        setStackAnimation(
          determinePinnedRootBackAnimation(
            getPinnedVisiblePagesForPages(currentPages),
            getPinnedVisiblePagesForPages(nextPages),
            animationKeyRef.current,
          ),
        );
        setStackAnimationSourcePages(null);
      } else {
        const animation = determineBackAnimation(currentPages, nextPages, animationKeyRef.current);
        setStackAnimation(animation);
        setStackAnimationSourcePages(animation ? currentPages : null);
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
        setStackAnimationSourcePages(null);
      } else if (isPinnedRootLayout) {
        setStackAnimation(
          determinePinnedRootBackAnimation(
            getPinnedVisiblePagesForPages(currentPages),
            getPinnedVisiblePagesForPages(nextPages),
            animationKeyRef.current,
          ),
        );
        setStackAnimationSourcePages(null);
      } else {
        const animation = determineBackAnimation(currentPages, nextPages, animationKeyRef.current);
        setStackAnimation(animation);
        setStackAnimationSourcePages(animation ? currentPages : null);
      }
      return nextPages;
    });
  }

  function handleCloseRightPage() {
    if (visiblePages.length < 2) return;
    const targetPage = visiblePages[0];
    if (!targetPage) return;

    animationKeyRef.current += 1;
    setClosedStackFlowPage(
      !isPinnedRootLayout && leftPageFullscreen
        ? { sourceId: targetPage.sourceId ?? rootSourceId, path: [...targetPage.path] }
        : null,
    );
    setPages((currentPages) => {
      const nextPages = jumpToPage(
        { documents: documentsBySourceId, rootSourceId, pages: currentPages },
        { sourceId: targetPage.sourceId, path: targetPage.path },
      ).pages;

      if (isCompactStack) {
        setStackAnimation(null);
        setStackAnimationSourcePages(null);
      } else {
        const currentVisiblePages = isPinnedRootLayout
          ? getPinnedVisiblePagesForPages(currentPages)
          : getVisiblePages(currentPages);
        const exitingPage = currentVisiblePages[1];
        setStackAnimation(exitingPage ? { direction: "replace", key: animationKeyRef.current, exitingPage } : null);
        setStackAnimationSourcePages(!isPinnedRootLayout && exitingPage ? currentPages : null);
      }

      return nextPages;
    });
  }

  return (
    <div className="app-frame" ref={shellRef}>
      {schemaPersistenceNotice ? <div className="schema-persistence-toast" role="status">{schemaPersistenceNotice}</div> : null}
      {schemaSaveError ? <div className="schema-persistence-toast" role="alert">{schemaSaveError}</div> : null}
      <div className="workspace">
        <header className="toolbar">
          <div className="toolbar-navigation">
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
                  {buildCompactPathOptions(pages, rootSourceId, rootLabel, getPageTitle).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="breadcrumbs breadcrumbs--align-left" aria-label="Breadcrumb">
                <button className="breadcrumbs__button" type="button" onClick={() => handleJump([], rootSourceId)}>
                  {rootLabel}
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
          </div>
          <div className="toolbar-actions">
            <div className="toolbar-inline-slot" ref={setPageToolbarHost} />
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
              <button aria-label="Back" className="toolbar-back-button" type="button" onClick={handleBack}>
                <icons.previous aria-hidden="true" size={16} stroke={2.4} />
                <span className="toolbar-back-button__label">Back</span>
              </button>
            ) : null}
          </div>
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
                  renderPageActionButtons={renderPageActionButtons}
                  toolbarPortalHost={pageToolbarHost}
                    referenceError={currentPage.referenceError}
                    isReference={currentPage.isReference}
                    referenceScopeDepth={referenceScopeDepths[compactPageIndex]}
                    referenceSourceLabel={getReferenceSourceLabel(compactPage.sourceId, rootSourceId, referenceScopeDepths[compactPageIndex])}
                    activeChildSegment={undefined}
                    activeReferenceSourceId={undefined}
                    onNavigateUp={!isAtRootPage ? handleBack : undefined}
                    onNavigate={(nextPath) => handleNavigate(0, nextPath)}
                    onJumpToSource={handleJumpToSource}
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
            {renderedStackFlowPages.map((renderPage, index) => {
              const { page, depthClass, fullPageIndex, isCurrent, pageStack, replaceEnter, hideClass } = renderPage;
              const pageSourceId = page.sourceId ?? rootSourceId;
              const pageValue = resolvePageValue(page);
              const kindClass = Array.isArray(pageValue)
                ? "stack-page--array"
                : (pageValue && typeof pageValue === "object" ? "stack-page--object" : "stack-page--primitive");
              const referenceDepths = pageStack === "source" ? sourceReferenceScopeDepths : referenceScopeDepths;
              const classes = [
                "stack-page",
                depthClass,
                kindClass,
                isCurrent ? "is-current" : "",
                page.isReference ? "is-reference" : "",
                replaceEnter ? "stack-page--replace-enter" : "",
                hideClass ?? "",
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
                    renderPageActionButtons={renderPageActionButtons}
                    toolbarPortalHost={index === visiblePages.length - 1 ? pageToolbarHost : null}
                    referenceError={page.referenceError}
                    isReference={page.isReference}
                    referenceScopeDepth={referenceDepths?.[fullPageIndex]}
                    referenceSourceLabel={getReferenceSourceLabel(pageSourceId, rootSourceId, referenceDepths?.[fullPageIndex])}
                    activeChildSegment={deriveActiveChildSegment(page.path, currentPage.path)}
                    activeReferenceSourceId={deriveActiveReferenceSourceId(pageSourceId, currentPage.sourceId ?? rootSourceId, rootSourceId)}
                    onNavigateUp={
                      renderedStackFlowPages.length === 2 && index === 0 && (page.path.length > 0 || page.isReference)
                        ? handleContextBack
                        : renderedStackFlowPages.length === 1 && isCurrent && (page.path.length > 0 || page.isReference)
                          ? handleBack
                          : undefined
                    }
                    onClosePage={
                      leftPageFullscreen && index === renderedStackFlowPages.length - 1 && hasVisibleRightPage && !isClosingStackFlowRightPage
                        ? handleCloseRightPage
                        : undefined
                    }
                    onNavigate={(nextPath) => handleNavigate(index, nextPath)}
                    onJumpToSource={handleJumpToSource}
                    readOnly={readOnly}
                    onEditModeChange={
                      isCurrent
                        ? setIsEditingCurrentPage
                        : (renderedStackFlowPages.length === 2 ? (() => undefined) : undefined)
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
            {stackAnimation?.direction === "push" && stackFlowMotionPlan.leftMotion === "push-in" && stackFlowSourceVisiblePages?.length === 2 && visiblePages.length === 2 ? (
              <section
                className={`stack-page stack-page--foreground stack-page--overlay stack-page--push-promote-shell ${
                  visiblePages[0]?.isReference ? "is-reference" : ""
                } ${
                  resolvePageValue(visiblePages[0]) && typeof resolvePageValue(visiblePages[0]) === "object"
                    ? (Array.isArray(resolvePageValue(visiblePages[0])) ? "stack-page--array" : "stack-page--object")
                    : "stack-page--primitive"
                }`}
                aria-hidden="true"
                key={`push-promote:${stackAnimation.key}:${(visiblePages[0]?.sourceId ?? rootSourceId)}:${visiblePages[0]?.path.join("/") ?? ""}`}
                style={{ left: `${leftSlotWidth}px`, width: `${rightSlotWidth}px` }}
              >
                <div className="stack-page--push-promote-mask">
                  <ValueInspector
                    value={resolvePageValue(visiblePages[0])}
                    savedValue={getValueAtPath(
                      savedDocumentsBySourceId[visiblePages[0]?.sourceId ?? rootSourceId],
                      visiblePages[0]?.path ?? [],
                    )}
                    sourceId={visiblePages[0]?.sourceId ?? rootSourceId}
                    path={visiblePages[0]?.path ?? []}
                    title={getPageTitle(visiblePages[0])}
                    host={host}
                    schema={resolvePageSchema(visiblePages[0])}
                    resolveNamedSchema={resolveNamedSchema}
                    onUpdateDocumentSchema={handleUpdateDocumentSchema}
                    onUpdateNamedSchema={handleUpdateNamedSchema}
                    validationResult={validationResult}
                    enableRawEditor={enableRawEditor}
                    renderPageActionButtons={renderPageActionButtons}
                    referenceError={visiblePages[0]?.referenceError}
                    isReference={visiblePages[0]?.isReference}
                    referenceScopeDepth={getReferenceScopeDepthForPage(pages, visiblePages[0])}
                    referenceSourceLabel={getReferenceSourceLabel(
                      visiblePages[0]?.sourceId,
                      rootSourceId,
                      getReferenceScopeDepthForPage(pages, visiblePages[0]),
                    )}
                    activeChildSegment={deriveActiveChildSegment(visiblePages[0]?.path ?? [], visiblePages[1]?.path ?? [])}
                    activeReferenceSourceId={deriveActiveReferenceSourceId(
                      visiblePages[0]?.sourceId ?? rootSourceId,
                      visiblePages[1]?.sourceId ?? rootSourceId,
                      rootSourceId,
                    )}
                    onNavigateUp={visiblePages[0] && (visiblePages[0].path.length > 0 || visiblePages[0].isReference) ? (() => undefined) : undefined}
                    onClosePage={undefined}
                    onNavigate={() => undefined}
                    onJumpToSource={undefined}
                    onApplyValue={() => undefined}
                    readOnly={readOnly}
                    onEditModeChange={() => undefined}
                  />
                </div>
              </section>
            ) : null}
            {(() => {
              const rightVisiblePage = visiblePages.at(-1);
              if (!(stackAnimation?.direction === "push" && stackFlowMotionPlan.rightMotion === "fade-in" && rightVisiblePage)) {
                return null;
              }
              const rightVisibleSourceId = rightVisiblePage.sourceId ?? rootSourceId;
              const rightVisibleValue = resolvePageValue(rightVisiblePage);
              const rightVisibleScopeDepth = getReferenceScopeDepthForPage(pages, rightVisiblePage);
              return (
                <section
                  className={`stack-page stack-page--foreground stack-page--overlay ${
                    stackFlowSourceVisiblePages?.length === 2 ? "stack-page--push-enter-delayed" : "stack-page--push-enter"
                  } ${
                    rightVisiblePage.isReference ? "is-reference" : ""
                  } ${
                    rightVisibleValue && typeof rightVisibleValue === "object"
                      ? (Array.isArray(rightVisibleValue) ? "stack-page--array" : "stack-page--object")
                      : "stack-page--primitive"
                  }`}
                  aria-hidden="true"
                  key={`push-enter:${stackAnimation.key}:${rightVisibleSourceId}:${rightVisiblePage.path.join("/")}`}
                  style={getStackPageStyle("stack-page--foreground")}
                >
                  <ValueInspector
                    value={rightVisibleValue}
                    savedValue={getValueAtPath(savedDocumentsBySourceId[rightVisibleSourceId], rightVisiblePage.path)}
                    sourceId={rightVisibleSourceId}
                    path={rightVisiblePage.path}
                    title={getPageTitle(rightVisiblePage)}
                    host={host}
                    schema={resolvePageSchema(rightVisiblePage)}
                    resolveNamedSchema={resolveNamedSchema}
                    onUpdateDocumentSchema={handleUpdateDocumentSchema}
                    onUpdateNamedSchema={handleUpdateNamedSchema}
                    validationResult={validationResult}
                    enableRawEditor={enableRawEditor}
                    renderPageActionButtons={renderPageActionButtons}
                    toolbarPortalHost={null}
                    referenceError={rightVisiblePage.referenceError}
                    isReference={rightVisiblePage.isReference}
                    referenceScopeDepth={rightVisibleScopeDepth}
                    referenceSourceLabel={getReferenceSourceLabel(
                      rightVisiblePage.sourceId,
                      rootSourceId,
                      rightVisibleScopeDepth,
                    )}
                    activeReferenceSourceId={undefined}
                    onClosePage={undefined}
                    onNavigate={() => undefined}
                    onJumpToSource={undefined}
                    onApplyValue={() => undefined}
                    readOnly={readOnly}
                    onEditModeChange={() => undefined}
                  />
                </section>
              );
            })()}
            {stackAnimation && stackFlowMotionPlan.rightMotion === "fade-out" && stackAnimation.exitingPage ? (
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
                  renderPageActionButtons={renderPageActionButtons}
                  toolbarPortalHost={null}
                  referenceError={stackAnimation.exitingPage.referenceError}
                  isReference={stackAnimation.exitingPage.isReference}
                  referenceScopeDepth={getReferenceScopeDepthForPage(stackAnimationSourcePages ?? pages, stackAnimation.exitingPage)}
                  referenceSourceLabel={getReferenceSourceLabel(
                    stackAnimation.exitingPage.sourceId,
                    rootSourceId,
                    getReferenceScopeDepthForPage(stackAnimationSourcePages ?? pages, stackAnimation.exitingPage),
                  )}
                  activeReferenceSourceId={undefined}
                  onClosePage={undefined}
                  onNavigate={() => undefined}
                  onJumpToSource={undefined}
                  onApplyValue={() => undefined}
                  readOnly={readOnly}
                  onEditModeChange={() => undefined}
                />
              </section>
            ) : null}
            {stackAnimation?.direction === "pop" && stackFlowMotionPlan.leftMotion === "pop-out" ? (
              <section
                className={`stack-page stack-page--background stack-page--overlay stack-page--pop-promote ${
                  stackAnimation.promotingPage.isReference ? "is-reference" : ""
                } ${
                  resolvePageValue(stackAnimation.promotingPage) && typeof resolvePageValue(stackAnimation.promotingPage) === "object"
                    ? (Array.isArray(resolvePageValue(stackAnimation.promotingPage)) ? "stack-page--array" : "stack-page--object")
                    : "stack-page--primitive"
                }`}
                aria-hidden="true"
                key={`pop-promote:${stackAnimation.key}:${(stackAnimation.promotingPage.sourceId ?? rootSourceId)}:${stackAnimation.promotingPage.path.join("/")}`}
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
                  onUpdateDocumentSchema={handleUpdateDocumentSchema}
                  onUpdateNamedSchema={handleUpdateNamedSchema}
                  validationResult={validationResult}
                  enableRawEditor={enableRawEditor}
                  renderPageActionButtons={renderPageActionButtons}
                  toolbarPortalHost={null}
                  referenceError={stackAnimation.promotingPage.referenceError}
                  isReference={stackAnimation.promotingPage.isReference}
                  referenceScopeDepth={getReferenceScopeDepthForPage(stackAnimationSourcePages ?? pages, stackAnimation.promotingPage)}
                  referenceSourceLabel={getReferenceSourceLabel(
                    stackAnimation.promotingPage.sourceId,
                    rootSourceId,
                    getReferenceScopeDepthForPage(stackAnimationSourcePages ?? pages, stackAnimation.promotingPage),
                  )}
                  activeChildSegment={undefined}
                  activeReferenceSourceId={undefined}
                  onNavigateUp={undefined}
                  onClosePage={undefined}
                  onNavigate={() => undefined}
                  onJumpToSource={undefined}
                  onApplyValue={() => undefined}
                  readOnly={readOnly}
                  onEditModeChange={() => undefined}
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
                        renderPageActionButtons={renderPageActionButtons}
                        toolbarPortalHost={visiblePages.length === 1 ? pageToolbarHost : null}
                        referenceError={rootPage.referenceError}
                        isReference={rootPage.isReference}
                        referenceScopeDepth={referenceScopeDepths[0]}
                        referenceSourceLabel={getReferenceSourceLabel(rootPage.sourceId, rootSourceId, referenceScopeDepths[0])}
                        activeChildSegment={deriveActiveChildSegment(rootPage.path, currentPage.path)}
                        activeReferenceSourceId={deriveActiveReferenceSourceId(pinnedRootSourceId, currentPage.sourceId ?? rootSourceId, rootSourceId)}
                        onNavigateUp={undefined}
                        onClosePage={undefined}
                        onNavigate={(nextPath) => handleNavigate(0, nextPath)}
                        onJumpToSource={handleJumpToSource}
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
                    pinnedRootMotionPlan.rightMotion === "fade-in" && stackAnimation?.direction === "push" ? "stack-page--push-enter" : "",
                    pinnedRootMotionPlan.rightMotion === "fade-in" && stackAnimation?.direction === "replace" ? "stack-page--replace-enter" : "",
                    pinnedRootMotionPlan.rightMotion === "fade-out" ? "stack-page--pop-target-hidden" : "",
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
                        renderPageActionButtons={renderPageActionButtons}
                        toolbarPortalHost={pageToolbarHost}
                        referenceError={pinnedRightPage.referenceError}
                        isReference={pinnedRightPage.isReference}
                        referenceScopeDepth={referenceScopeDepths[Math.max(0, pages.length - 1)]}
                        referenceSourceLabel={getReferenceSourceLabel(pinnedRightPage.sourceId, rootSourceId, referenceScopeDepths[Math.max(0, pages.length - 1)])}
                        activeChildSegment={undefined}
                        activeReferenceSourceId={deriveActiveReferenceSourceId(pinnedRightSourceId, currentPage.sourceId ?? rootSourceId, rootSourceId)}
                        onNavigateUp={undefined}
                        onClosePage={handleCloseRightPage}
                        onNavigate={(nextPath) => handleNavigate(1, nextPath)}
                        onJumpToSource={handleJumpToSource}
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
                {stackAnimation && pinnedRootMotionPlan.rightMotion === "fade-out" && stackAnimation.exitingPage ? (
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
                      renderPageActionButtons={renderPageActionButtons}
                      toolbarPortalHost={null}
                      referenceError={stackAnimation.exitingPage.referenceError}
                      isReference={stackAnimation.exitingPage.isReference}
                      referenceScopeDepth={getReferenceScopeDepthForPage(pages, stackAnimation.exitingPage)}
                      referenceSourceLabel={getReferenceSourceLabel(stackAnimation.exitingPage.sourceId, rootSourceId, getReferenceScopeDepthForPage(pages, stackAnimation.exitingPage))}
                      activeReferenceSourceId={undefined}
                      onClosePage={undefined}
                      onNavigate={() => undefined}
                      onJumpToSource={undefined}
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

function buildCompactPathOptions(
  pages: NavigationPage[],
  rootSourceId: string,
  rootPageTitle: string,
  getPageTitle: (page: NavigationPage) => string,
) {
  return [
    { label: rootPageTitle, value: "0" },
    ...pages.slice(1).map((page, index) => ({
      label: getCompactOptionLabel(page, rootSourceId, rootPageTitle, getPageTitle),
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

function getCompactOptionLabel(
  page: NavigationPage,
  rootSourceId: string,
  rootPageTitle: string,
  getPageTitle: (page: NavigationPage) => string,
) {
  if ((page.sourceId ?? rootSourceId) === rootSourceId && page.path.length === 0) {
    return rootPageTitle;
  }
  return getPageTitle(page);
}

function inferRootPageLabel({
  sourceId,
  value,
  schema,
  fallback,
}: {
  sourceId: string;
  value: unknown;
  schema?: EditorSchema;
  fallback: string;
}) {
  if (
    schema?.properties?.name &&
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const candidate = (value as Record<string, unknown>).name;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
    if (typeof candidate === "number") {
      return String(candidate);
    }
  }

  return inferSourceLabel(sourceId, fallback);
}

function inferSourceLabel(sourceId: string, fallback: string) {
  const lastSegment = sourceId.split("/").at(-1)?.trim() ?? "";
  if (!lastSegment) return fallback;
  return lastSegment.replace(/\.json$/i, "") || fallback;
}

function getArrayPageTitle(path: JsonPath, sourceId: string, rootLabel: string) {
  if (!path.some((segment) => typeof segment === "number")) {
    return null;
  }

  const trailingIndexes: number[] = [];
  let cursor = path.length - 1;
  while (cursor >= 0 && typeof path[cursor] === "number") {
    trailingIndexes.unshift(path[cursor] as number);
    cursor -= 1;
  }

  if (trailingIndexes.length === 0) {
    return null;
  }

  const parentSegment = cursor >= 0 ? path[cursor] : undefined;
  const baseLabel =
    typeof parentSegment === "string"
      ? parentSegment
      : inferSourceLabel(sourceId, rootLabel);
  return `${baseLabel}${trailingIndexes.map((index) => `[${index}]`).join("")}`;
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
