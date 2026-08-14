import type { EditorHost, ReferenceErrorInfo } from "../editor/host";
import { getReferenceUri, resolveReferenceDocument } from "../editor/host";
import { getValueAtPath } from "./document";
import type { JsonPath } from "./path";

export type NavigationPage = {
  sourceId?: string;
  path: JsonPath;
  navLabel?: string;
  value?: unknown;
  sourceValue?: unknown;
  isReference?: boolean;
  referenceError?: ReferenceErrorInfo;
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
  host?: EditorHost,
): NavigationState {
  const rootSourceId = getRootSourceId(state);
  const documents = getDocuments(state);
  const currentPage = ensurePageSourceId(state.pages[state.pages.length - 1] ?? { sourceId: rootSourceId, path: [] }, rootSourceId);
  const currentDocument = documents[currentPage.sourceId];
  const targetValue = getValueAtPath(currentDocument, path);
  const navLabel = getNavigationLabel(path);
  const referenceUri = getReferenceUri(targetValue, host, { path });
  const referenceSourceId = referenceUri ? (host?.resolveReferenceSourceId?.(referenceUri) ?? referenceUri) : null;

  if (referenceUri) {
    const resolved = resolveReferenceDocument(referenceUri, host);
    if (resolved.ok) {
      const nextDocuments = {
        ...documents,
        [referenceSourceId ?? referenceUri]: resolved.value,
      };

      return {
        ...state,
        documentValue: nextDocuments[rootSourceId],
        documents: nextDocuments,
        rootSourceId,
        pages: [
          ...state.pages,
          {
            sourceId: referenceSourceId ?? referenceUri,
            path: [],
            navLabel,
            value: resolved.value,
            sourceValue: targetValue,
            isReference: true,
          },
        ],
      };
    }

    return {
      ...state,
      documentValue: documents[rootSourceId],
      documents,
      rootSourceId,
      pages: [
        ...state.pages,
        {
          sourceId: referenceSourceId ?? referenceUri,
          path: [],
          navLabel,
          sourceValue: targetValue,
          isReference: true,
          referenceError: resolved.error,
        },
      ],
    };
  }

  return {
    ...state,
    documentValue: documents[rootSourceId],
    documents,
    rootSourceId,
    pages: [...state.pages, { sourceId: currentPage.sourceId, path, navLabel }],
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
