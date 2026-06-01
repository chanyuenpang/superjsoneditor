import { getValueAtPath } from "./document";
import type { JsonPath } from "./path";

export type ReferenceResolver = {
  isReferenceNode?: (value: unknown) => boolean;
  resolveReference?: (value: unknown) => unknown;
};

export type NavigationPage = {
  path: JsonPath;
  value?: unknown;
  sourceValue?: unknown;
  isReference?: boolean;
};

export type NavigationState = {
  documentValue: unknown;
  pages: NavigationPage[];
};

export function createNavigationState(documentValue: unknown): NavigationState {
  return {
    documentValue,
    pages: [{ path: [] }],
  };
}

export function openPath(
  state: NavigationState,
  path: JsonPath,
  resolver?: ReferenceResolver,
): NavigationState {
  const targetValue = getValueAtPath(state.documentValue, path);
  const nextPage: NavigationPage = resolver?.isReferenceNode?.(targetValue)
    ? {
        path,
        value: resolver.resolveReference?.(targetValue) ?? targetValue,
        sourceValue: targetValue,
        isReference: true,
      }
    : { path };

  return {
    ...state,
    pages: [...state.pages, nextPage],
  };
}

export function goBack(state: NavigationState): NavigationState {
  if (state.pages.length <= 1) return state;
  return {
    ...state,
    pages: state.pages.slice(0, -1),
  };
}

export function jumpToPath(state: NavigationState, targetPath: JsonPath): NavigationState {
  return {
    ...state,
    pages: buildPagesForPath(targetPath),
  };
}

function buildPagesForPath(targetPath: JsonPath): NavigationPage[] {
  const pages: NavigationPage[] = [{ path: [] }];
  for (let index = 0; index < targetPath.length; index += 1) {
    pages.push({ path: targetPath.slice(0, index + 1) });
  }
  return pages;
}
