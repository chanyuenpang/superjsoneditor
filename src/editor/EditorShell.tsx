import { useEffect, useMemo, useRef, useState } from "react";
import { getValueAtPath, setValueAtPath } from "../core/document";
import { createNavigationState, goBack, jumpToPath, openPath, type NavigationPage } from "../core/navigation";
import type { JsonPath } from "../core/path";
import { formatPath } from "../core/path";
import type { EditorHost } from "./host";
import { determineBackAnimation, determineJumpAnimation, determineNavigateAnimation, type StackAnimation } from "./stack-motion";
import { ValueInspector } from "./ValueInspector";

type EditorShellProps = {
  value: unknown;
  host?: EditorHost;
};

const animationDurationMs = 500;
const stackedPushEnterDurationMs = 1000;

export function EditorShell({ value, host }: EditorShellProps) {
  const [documentValue, setDocumentValue] = useState(value);
  const [pages, setPages] = useState(createNavigationState(value).pages);
  const [stackAnimation, setStackAnimation] = useState<StackAnimation | null>(null);
  const pageStackViewportRef = useRef<HTMLElement | null>(null);
  const animationKeyRef = useRef(0);
  const currentPage = pages[pages.length - 1] ?? { path: [] };
  const visiblePages = pages.slice(Math.max(0, pages.length - 2));
  const topLevelEntries = useMemo(() => describeTopLevelEntries(documentValue), [documentValue]);
  const topLevelNavigableEntries = useMemo(() => topLevelEntries.filter((entry) => entry.isNavigable), [topLevelEntries]);
  const topLevelPrimitiveEntries = useMemo(() => topLevelEntries.filter((entry) => !entry.isNavigable), [topLevelEntries]);
  const rootLabel = inferDocumentLabel(documentValue);

  useEffect(() => {
    const node = pageStackViewportRef.current;
    if (!node || typeof node.scrollTo !== "function") return;
    node.scrollTo({ left: node.scrollWidth, behavior: "smooth" });
  }, [pages]);

  useEffect(() => {
    if (!stackAnimation) return;
    const timeoutId = window.setTimeout(() => setStackAnimation(null), getAnimationDuration(stackAnimation));
    return () => window.clearTimeout(timeoutId);
  }, [stackAnimation]);

  function resolvePageValue(page: NavigationPage) {
    return page.value ?? getValueAtPath(documentValue, page.path);
  }

  function handleNavigate(fromIndex: number, nextPath: JsonPath) {
    animationKeyRef.current += 1;
    setPages((currentPages) => {
      const actualIndex = Math.max(0, currentPages.length - 2) + fromIndex;
      const truncated = currentPages.slice(0, actualIndex + 1);
      const nextPages = openPath({ documentValue, pages: truncated }, nextPath, host).pages;
      setStackAnimation(determineNavigateAnimation(currentPages, nextPages, actualIndex, animationKeyRef.current));
      return nextPages;
    });
  }

  function handleJump(targetPath: JsonPath) {
    animationKeyRef.current += 1;
    setPages((currentPages) => {
      const nextPages = jumpToPath({ documentValue, pages: currentPages }, targetPath).pages;
      setStackAnimation(determineJumpAnimation(currentPages, nextPages, animationKeyRef.current));
      return nextPages;
    });
  }

  function handleBack() {
    animationKeyRef.current += 1;
    setPages((currentPages) => {
      const nextPages = goBack({ documentValue, pages: currentPages }).pages;
      setStackAnimation(determineBackAnimation(currentPages, nextPages, animationKeyRef.current));
      return nextPages;
    });
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="sidebar-title">Super JSON Editor</div>
        <div className="sidebar-section">
          <div className="sidebar-label">Document</div>
          <div className="sidebar-list">
            <button
              className={`sidebar-item ${currentPage.path.length === 0 ? "selected" : ""}`}
              type="button"
              onClick={() => handleJump([])}
            >
              <span>#</span>
              <span>{rootLabel}</span>
              <small>{describeType(documentValue, host)}</small>
            </button>
          </div>
        </div>
        <div className="sidebar-section">
          <div className="sidebar-label">Top level</div>
          {topLevelNavigableEntries.length > 0 ? (
            <div className="sidebar-group">
              <div className="sidebar-sublabel">Explore</div>
              <div className="sidebar-list">
                {topLevelNavigableEntries.map((entry) => (
                  <button
                    className={`sidebar-item ${currentPage.path[0] === entry.segment ? "selected" : ""}`}
                    key={String(entry.segment)}
                    type="button"
                    onClick={() => handleJump([entry.segment])}
                  >
                    <span>{entry.icon}</span>
                    <span>{entry.key}</span>
                    <small>{entry.preview}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {topLevelPrimitiveEntries.length > 0 ? (
            <div className="sidebar-group">
              <div className="sidebar-sublabel">Fields</div>
              <div className="sidebar-list">
                {topLevelPrimitiveEntries.map((entry) => (
                  <button
                    className={`sidebar-item ${currentPage.path[0] === entry.segment ? "selected" : ""}`}
                    key={String(entry.segment)}
                    type="button"
                    onClick={() => handleJump([entry.segment])}
                  >
                    <span>{entry.icon}</span>
                    <span>{entry.key}</span>
                    <small>{entry.preview}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="workspace">
        <header className="toolbar">
          <div className="toolbar-title">
            <strong>{rootLabel}</strong>
            <span>{pages.length > 1 ? formatPath(currentPage.path) : "Root"}</span>
          </div>
          <div className="breadcrumbs" aria-label="Breadcrumb">
            <button className="breadcrumbs__button" type="button" onClick={() => handleJump([])}>
              Root
            </button>
            {currentPage.path.map((segment, index) => (
              <span key={`${String(segment)}:${index}`}>
                <span className="breadcrumbs__separator">/</span>
                <button className="breadcrumbs__button" type="button" onClick={() => handleJump(currentPage.path.slice(0, index + 1))}>
                  {String(segment)}
                </button>
              </span>
            ))}
          </div>
          <div className="toolbar-spacer" />
          {pages.length > 1 ? (
            <button className="ghost-button" type="button" onClick={handleBack}>
              Back
            </button>
          ) : null}
        </header>

        <main className="main-content" ref={pageStackViewportRef}>
          <div className="page-stack">
            {visiblePages.map((page, index) => {
              const pageValue = resolvePageValue(page);
              const isForeground = visiblePages.length > 1 ? index === visiblePages.length - 1 : true;
              const depthClass = visiblePages.length > 1
                ? (isForeground ? "stack-page--foreground" : "stack-page--background")
                : "stack-page--single";
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
                stackAnimation?.direction === "pop" && index === visiblePages.length - 1 ? "stack-page--pop-enter" : "",
                stackAnimation?.direction === "push" && index === visiblePages.length - 2 && !stackAnimation.exitingPage
                  ? "stack-page--push-background"
                  : "",
                stackAnimation?.direction === "push" && index === visiblePages.length - 2 && stackAnimation.exitingPage
                  ? "stack-page--push-promote"
                  : "",
                stackAnimation?.direction === "pop" && index === visiblePages.length - 1 ? "stack-page--pop-background-return" : "",
              ].filter(Boolean).join(" ");
              return (
                <section
                  className={classes}
                  key={`${page.path.join("/")}:${index}`}
                >
                  <ValueInspector
                    value={pageValue}
                    path={page.path}
                    host={host}
                    isReference={page.isReference}
                    activeChildSegment={deriveActiveChildSegment(page.path, currentPage.path)}
                    onNavigate={(nextPath) => handleNavigate(index, nextPath)}
                    onApplyValue={(nextValue) => {
                      if (page.isReference) {
                        setPages((current) => current.map((item, itemIndex) => (
                          itemIndex === Math.max(0, current.length - 2) + index ? { ...item, value: nextValue } : item
                        )));
                        return;
                      }
                      setDocumentValue((current: unknown) => setValueAtPath(current, page.path, nextValue));
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
                key={`push-exit:${stackAnimation.key}:${stackAnimation.exitingPage.path.join("/")}`}
              >
                <ValueInspector
                  value={resolvePageValue(stackAnimation.exitingPage)}
                  path={stackAnimation.exitingPage.path}
                  host={host}
                  isReference={stackAnimation.exitingPage.isReference}
                  onNavigate={() => undefined}
                  onApplyValue={() => undefined}
                />
              </section>
            ) : null}
            {stackAnimation?.direction === "replace" ? (
              <section
                className={`stack-page stack-page--foreground stack-page--overlay stack-page--replace-exit ${
                  resolvePageValue(stackAnimation.exitingPage) && typeof resolvePageValue(stackAnimation.exitingPage) === "object"
                    ? (Array.isArray(resolvePageValue(stackAnimation.exitingPage)) ? "stack-page--array" : "stack-page--object")
                    : "stack-page--primitive"
                } ${stackAnimation.exitingPage.isReference ? "is-reference" : ""}`}
                key={`replace-exit:${stackAnimation.key}:${stackAnimation.exitingPage.path.join("/")}`}
              >
                <ValueInspector
                  value={resolvePageValue(stackAnimation.exitingPage)}
                  path={stackAnimation.exitingPage.path}
                  host={host}
                  isReference={stackAnimation.exitingPage.isReference}
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
                key={`pop-exit:${stackAnimation.key}:${stackAnimation.exitingPage.path.join("/")}`}
              >
                <ValueInspector
                  value={resolvePageValue(stackAnimation.exitingPage)}
                  path={stackAnimation.exitingPage.path}
                  host={host}
                  isReference={stackAnimation.exitingPage.isReference}
                  onNavigate={() => undefined}
                  onApplyValue={() => undefined}
                />
              </section>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

type TopLevelEntry = {
  icon: string;
  isNavigable: boolean;
  key: string;
  preview: string;
  segment: string | number;
};

function describeTopLevelEntries(value: unknown): TopLevelEntry[] {
  if (Array.isArray(value)) {
    return value.map((item, index) => ({
      icon: "[]",
      isNavigable: true,
      key: String(index),
      preview: previewValue(item),
      segment: index,
    }));
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => ({
        icon: Array.isArray(item) ? "[]" : item && typeof item === "object" ? "{}" : ".",
        isNavigable: isTopLevelNavigable(item),
        key,
        preview: previewValue(item),
        segment: key,
      }))
      .sort((left, right) => {
        return describeSidebarPriority(right.icon) - describeSidebarPriority(left.icon);
      });
  }

  return [];
}

function describeSidebarPriority(icon: string) {
  if (icon === "{}" || icon === "[]") return 1;
  return 0;
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
