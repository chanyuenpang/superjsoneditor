import type { NavigationPage } from "../core/navigation";
import type { JsonPath } from "../core/path";

export type StackAnimation =
  | { direction: "push"; key: number; exitingPage?: NavigationPage }
  | { direction: "replace"; key: number; exitingPage: NavigationPage }
  | { direction: "pop"; key: number; exitingPage: NavigationPage; promotingPage: NavigationPage };

export function determineNavigateAnimation(
  currentPages: NavigationPage[],
  nextPages: NavigationPage[],
  sourceIndex: number,
  key: number,
): StackAnimation | null {
  const currentVisible = getVisiblePages(currentPages);
  const nextVisible = getVisiblePages(nextPages);
  const sourceIsForeground = sourceIndex === currentPages.length - 1;

  if (sourceIsForeground) {
    if (currentVisible.length === 1 && nextVisible.length === 2 && samePath(currentVisible[0]?.path, nextVisible[0]?.path)) {
      return { direction: "push", key };
    }
    if (
      currentVisible.length === 2 &&
      nextVisible.length === 2 &&
      samePath(currentVisible[1]?.path, nextVisible[0]?.path)
    ) {
      return { direction: "push", key, exitingPage: currentVisible[0] };
    }
    return null;
  }

  if (
    currentVisible.length === 2 &&
    nextVisible.length === 2 &&
    (samePath(currentVisible[0]?.path, nextVisible[0]?.path) ||
      samePath(currentVisible[1]?.path, nextVisible[0]?.path)) &&
    !samePath(currentVisible[1]?.path, nextVisible[1]?.path)
  ) {
    return { direction: "replace", key, exitingPage: currentVisible[1] };
  }

  return null;
}

export function determineJumpAnimation(
  currentPages: NavigationPage[],
  nextPages: NavigationPage[],
  key: number,
): StackAnimation | null {
  if (currentPages.length === nextPages.length) {
    const currentVisible = getVisiblePages(currentPages);
    const nextVisible = getVisiblePages(nextPages);
    if (
      currentVisible.length === 2 &&
      nextVisible.length === 2 &&
      samePath(currentVisible[0]?.path, nextVisible[0]?.path) &&
      !samePath(currentVisible[1]?.path, nextVisible[1]?.path)
    ) {
      return { direction: "replace", key, exitingPage: currentVisible[1] };
    }
  }

  return null;
}

export function determineBackAnimation(
  currentPages: NavigationPage[],
  nextPages: NavigationPage[],
  key: number,
): StackAnimation | null {
  const currentVisible = getVisiblePages(currentPages);
  const nextVisible = getVisiblePages(nextPages);
  const currentPage = currentPages[currentPages.length - 1];

  if (!currentPage) return null;

  if (
    currentVisible.length === 2 &&
    nextVisible.length === 1 &&
    samePath(currentVisible[0]?.path, nextVisible[0]?.path)
  ) {
    return { direction: "pop", key, exitingPage: currentPage, promotingPage: currentVisible[0] };
  }

  if (
    currentVisible.length === 2 &&
    nextVisible.length === 2 &&
    samePath(currentVisible[0]?.path, nextVisible[1]?.path)
  ) {
    return { direction: "pop", key, exitingPage: currentPage, promotingPage: currentVisible[0] };
  }

  return null;
}

export function determinePinnedRootNavigateAnimation(
  currentPages: NavigationPage[],
  nextPages: NavigationPage[],
  key: number,
): StackAnimation | null {
  const currentRightPage = getPinnedRootRightPage(currentPages);
  const nextRightPage = getPinnedRootRightPage(nextPages);

  if (!currentRightPage && nextRightPage) {
    return { direction: "push", key };
  }

  if (currentRightPage && nextRightPage && !samePage(currentRightPage, nextRightPage)) {
    return { direction: "replace", key, exitingPage: currentRightPage };
  }

  return null;
}

export function determinePinnedRootBackAnimation(
  currentPages: NavigationPage[],
  nextPages: NavigationPage[],
  key: number,
): StackAnimation | null {
  const currentRightPage = getPinnedRootRightPage(currentPages);
  const nextRightPage = getPinnedRootRightPage(nextPages);

  if (currentRightPage && !nextRightPage) {
    return { direction: "pop", key, exitingPage: currentRightPage, promotingPage: currentPages[0] ?? currentRightPage };
  }

  if (currentRightPage && nextRightPage && !samePage(currentRightPage, nextRightPage)) {
    return { direction: "replace", key, exitingPage: currentRightPage };
  }

  return null;
}

export function getVisiblePages(pages: NavigationPage[]) {
  return pages.slice(Math.max(0, pages.length - 2));
}

function getPinnedRootRightPage(pages: NavigationPage[]) {
  const currentPage = pages[pages.length - 1];
  if (!currentPage) return undefined;
  if (!currentPage.path.length && !currentPage.sourceId) {
    return undefined;
  }
  return currentPage.path.length === 0 && pages.length === 1 ? undefined : currentPage;
}

function samePage(left?: NavigationPage, right?: NavigationPage) {
  if (!left || !right) return false;
  return (left.sourceId ?? "") === (right.sourceId ?? "") && samePath(left.path, right.path);
}

export function samePath(left?: JsonPath, right?: JsonPath) {
  if (!left || !right) return false;
  return left.length === right.length && left.every((segment, index) => right[index] === segment);
}
