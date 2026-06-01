import { getValueAtPath } from "./document";
import type { JsonPath } from "./path";

export type ReferenceTarget = {
  sourceId: string;
  path: JsonPath;
  value: unknown;
};

export type ReferenceResolver = {
  isReferenceNode?: (value: unknown) => boolean;
  resolveReferenceTarget?: (value: unknown, documents: Record<string, unknown>) => ReferenceTarget | undefined;
  resolveReference?: (value: unknown) => unknown;
};

export type NavigationPage = {
  sourceId?: string;
  path: JsonPath;
  navLabel?: string;
  value?: unknown;
  sourceValue?: unknown;
  isReference?: boolean;
};

export type NavigationState = {
  documentValue?: unknown;
  documents?: Record<string, unknown>;
  rootSourceId?: string;
  pages: NavigationPage[];
};

export function createNavigationState(documentValue: unknown): NavigationState;
export function createNavigationState(rootSourceId: string, documents: Record<string, unknown>): NavigationState;
export function createNavigationState(rootSourceIdOrDocumentValue: string | unknown, documents?: Record<string, unknown>): NavigationState {
  if (typeof rootSourceIdOrDocumentValue === "string" && documents) {
    return {
      documentValue: documents[rootSourceIdOrDocumentValue],
      documents,
      rootSourceId: rootSourceIdOrDocumentValue,
      pages: [{ sourceId: rootSourceIdOrDocumentValue, path: [] }],
    };
  }

  const documentValue = rootSourceIdOrDocumentValue;
  return {
    documentValue,
    documents: { main: documentValue },
    rootSourceId: "main",
    pages: [{ sourceId: "main", path: [] }],
  };
}

export function openPath(
  state: NavigationState,
  path: JsonPath,
  resolver?: ReferenceResolver,
): NavigationState {
  const rootSourceId = getRootSourceId(state);
  const documents = getDocuments(state);
  const currentPage = ensurePageSourceId(state.pages[state.pages.length - 1] ?? { sourceId: rootSourceId, path: [] }, rootSourceId);
  const currentDocument = documents[currentPage.sourceId];
  const targetValue = getValueAtPath(currentDocument, path);
  const target = resolver?.isReferenceNode?.(targetValue) ? resolver.resolveReferenceTarget?.(targetValue, documents) : undefined;
  const fallbackResolved = resolver?.isReferenceNode?.(targetValue) ? resolver.resolveReference?.(targetValue) : undefined;
  const navLabel = getNavigationLabel(path);
  const nextPage: NavigationPage = target
    ? {
        sourceId: target.sourceId,
        path: target.path,
        navLabel,
        sourceValue: targetValue,
        isReference: true,
      }
    : fallbackResolved !== undefined
      ? {
          sourceId: currentPage.sourceId,
          path,
          navLabel,
          value: fallbackResolved,
          sourceValue: targetValue,
          isReference: true,
        }
    : { sourceId: currentPage.sourceId, path, navLabel };

  return {
    ...state,
    documentValue: documents[rootSourceId],
    documents,
    rootSourceId,
    pages: [...state.pages, nextPage],
  };
}

export function goBack(state: NavigationState): NavigationState {
  if (state.pages.length <= 1) return state;
  return {
    ...state,
    documentValue: getDocuments(state)[getRootSourceId(state)],
    pages: state.pages.slice(0, -1),
  };
}

export function jumpToPath(state: NavigationState, targetPath: JsonPath): NavigationState {
  return jumpToPage(state, { sourceId: getRootSourceId(state), path: targetPath });
}

export function jumpToPage(state: NavigationState, targetPage: Pick<NavigationPage, "sourceId" | "path">): NavigationState {
  const rootSourceId = getRootSourceId(state);
  const documents = getDocuments(state);
  const normalizedTargetPage = ensurePageSourceId(targetPage, rootSourceId);
  const existingPageIndex = state.pages.findIndex((page) => {
    const normalizedPage = ensurePageSourceId(page, rootSourceId);
    return normalizedPage.sourceId === normalizedTargetPage.sourceId && samePath(normalizedPage.path, normalizedTargetPage.path);
  });
  if (existingPageIndex >= 0) {
    return {
      ...state,
      documentValue: documents[rootSourceId],
      documents,
      rootSourceId,
      pages: state.pages.slice(0, existingPageIndex + 1),
    };
  }

  return {
    ...state,
    documentValue: documents[rootSourceId],
    documents,
    rootSourceId,
    pages: buildPagesForPath(rootSourceId, normalizedTargetPage),
  };
}

function buildPagesForPath(rootSourceId: string, targetPage: Pick<NavigationPage, "sourceId" | "path">): NavigationPage[] {
  const pages: NavigationPage[] = [{ sourceId: rootSourceId, path: [] }];
  if (targetPage.sourceId !== rootSourceId || targetPage.path.length === 0) {
    if (targetPage.sourceId !== rootSourceId || targetPage.path.length > 0) {
      pages.push({ sourceId: targetPage.sourceId, path: [...targetPage.path], navLabel: getNavigationLabel(targetPage.path) });
    }
    return pages;
  }

  for (let index = 0; index < targetPage.path.length; index += 1) {
    const nextPath = targetPage.path.slice(0, index + 1);
    pages.push({ sourceId: rootSourceId, path: nextPath, navLabel: getNavigationLabel(nextPath) });
  }
  return pages;
}

export function samePath(left: JsonPath, right: JsonPath) {
  if (left.length !== right.length) return false;
  return left.every((segment, index) => segment === right[index]);
}

function getRootSourceId(state: NavigationState) {
  return state.rootSourceId ?? "main";
}

function getDocuments(state: NavigationState) {
  if (state.documents) return state.documents;
  return { [getRootSourceId(state)]: state.documentValue };
}

function ensurePageSourceId<T extends Pick<NavigationPage, "path"> & Partial<Pick<NavigationPage, "sourceId">>>(page: T, rootSourceId: string) {
  return {
    ...page,
    sourceId: page.sourceId ?? rootSourceId,
  };
}

function getNavigationLabel(path: JsonPath) {
  if (path.length === 0) return undefined;
  const lastSegment = path[path.length - 1];
  return typeof lastSegment === "number" ? `[${lastSegment}]` : String(lastSegment);
}
