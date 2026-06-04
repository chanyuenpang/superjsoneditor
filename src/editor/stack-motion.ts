import type { NavigationPage } from "../core/navigation";
import type { JsonPath } from "../core/path";

export type StackAnimation =
  | { direction: "push"; key: number; exitingPage?: NavigationPage }
  | { direction: "replace"; key: number; exitingPage: NavigationPage }
  | { direction: "pop"; key: number; exitingPage: NavigationPage; promotingPage: NavigationPage };

export type AtomicMotion = "push-in" | "pop-out" | "fade-in" | "fade-out";

export type MotionPlan = {
  leftMotion: Extract<AtomicMotion, "push-in" | "pop-out"> | null;
  rightMotion: Extract<AtomicMotion, "fade-in" | "fade-out"> | null;
  rightSlotState: "occupied" | "empty";
};

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
    if (currentVisible.length === 1 && nextVisible.length === 2 && samePage(currentVisible[0], nextVisible[0])) {
      return { direction: "push", key };
    }
    if (
      currentVisible.length === 2 &&
      nextVisible.length === 2 &&
      samePage(currentVisible[1], nextVisible[0])
    ) {
      return { direction: "push", key, exitingPage: currentVisible[0] };
    }
    return null;
  }

  if (
    currentVisible.length === 2 &&
    nextVisible.length === 2 &&
    (samePage(currentVisible[0], nextVisible[0]) ||
      samePage(currentVisible[1], nextVisible[0])) &&
    !samePage(currentVisible[1], nextVisible[1])
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
    samePage(currentVisible[0], nextVisible[0]) &&
    !samePage(currentVisible[1], nextVisible[1])
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
    samePage(currentVisible[0], nextVisible[0])
  ) {
    return { direction: "pop", key, exitingPage: currentPage, promotingPage: currentVisible[0] };
  }

  if (
    currentVisible.length === 2 &&
    nextVisible.length === 2 &&
    samePage(currentVisible[0], nextVisible[1])
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

export function resolveStackFlowMotionPlan(
  animation: StackAnimation | null,
  currentVisiblePages: NavigationPage[],
  nextVisiblePages: NavigationPage[],
): MotionPlan {
  if (!animation) {
    return {
      leftMotion: null,
      rightMotion: null,
      rightSlotState: nextVisiblePages.length > 1 ? "occupied" : "empty",
    };
  }

  if (animation.direction === "replace") {
    return {
      leftMotion: null,
      rightMotion: nextVisiblePages.length > 1 ? "fade-in" : "fade-out",
      rightSlotState: nextVisiblePages.length > 1 ? "occupied" : "empty",
    };
  }

  if (animation.direction === "push") {
    const dualPagePush = currentVisiblePages.length === 2 && nextVisiblePages.length === 2 && Boolean(animation.exitingPage);
    return {
      leftMotion: dualPagePush ? "push-in" : null,
      rightMotion: "fade-in",
      rightSlotState: "occupied",
    };
  }

  const rootLikePop = nextVisiblePages.length === 1;
  return {
    leftMotion: rootLikePop ? null : "pop-out",
    rightMotion: rootLikePop ? "fade-out" : "fade-in",
    rightSlotState: rootLikePop ? "empty" : "occupied",
  };
}

export function resolvePinnedRootMotionPlan(
  animation: StackAnimation | null,
  nextVisiblePages: NavigationPage[],
): MotionPlan {
  if (!animation) {
    return {
      leftMotion: null,
      rightMotion: null,
      rightSlotState: nextVisiblePages.length > 1 ? "occupied" : "empty",
    };
  }

  if (nextVisiblePages.length > 1) {
    return {
      leftMotion: null,
      rightMotion: "fade-in",
      rightSlotState: "occupied",
    };
  }

  return {
    leftMotion: null,
    rightMotion: "fade-out",
    rightSlotState: "empty",
  };
}

function getPinnedRootRightPage(pages: NavigationPage[]) {
  const currentPage = pages[pages.length - 1];
  if (!currentPage) return undefined;
  if (!currentPage.path.length && !currentPage.sourceId) {
    return undefined;
  }
  return currentPage.path.length === 0 && pages.length === 1 ? undefined : currentPage;
}

export function samePage(left?: NavigationPage, right?: NavigationPage) {
  if (!left || !right) return false;
  return (left.sourceId ?? "") === (right.sourceId ?? "") && samePath(left.path, right.path);
}

export function samePath(left?: JsonPath, right?: JsonPath) {
  if (!left || !right) return false;
  return left.length === right.length && left.every((segment, index) => right[index] === segment);
}
