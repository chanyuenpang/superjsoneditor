import { useEffect } from "react";
import type { RefObject } from "react";

const defaultPressSlopDistance = 8;
const defaultPressSlopDurationMs = 300;
const actionableSelector = "button, [role='button'], tr.is-clickable, .demo-scenario-card";

type PressSlopOptions = {
  distance?: number;
  durationMs?: number;
};

type ActivePress = {
  element: Element;
  pointerKey: number;
  startX: number;
  startY: number;
  startTime: number;
  moved: boolean;
};

function findActionableTarget(root: HTMLElement, target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const actionable = target.closest(actionableSelector);
  if (!(actionable instanceof HTMLElement)) return null;
  return root.contains(actionable) ? actionable : null;
}

function createPointerKey(pointerId?: number | null) {
  return typeof pointerId === "number" ? pointerId : -1;
}

export function usePressSlopGuard(rootRef: RefObject<HTMLElement>, options: PressSlopOptions = {}) {
  const distance = options.distance ?? defaultPressSlopDistance;
  const durationMs = options.durationMs ?? defaultPressSlopDurationMs;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let activePress: ActivePress | null = null;
    let suppressedTarget: Element | null = null;

    const beginPress = (target: EventTarget | null, clientX: number, clientY: number, pointerId?: number | null) => {
      const actionable = findActionableTarget(root, target);
      if (!actionable) return;
      activePress = {
        element: actionable,
        pointerKey: createPointerKey(pointerId),
        startX: clientX,
        startY: clientY,
        startTime: Date.now(),
        moved: false,
      };
    };

    const updatePress = (clientX: number, clientY: number, pointerId?: number | null) => {
      if (!activePress || activePress.pointerKey !== createPointerKey(pointerId)) return;
      if (Math.abs(clientX - activePress.startX) > distance || Math.abs(clientY - activePress.startY) > distance) {
        activePress.moved = true;
      }
    };

    const finishPress = (event: Event, target: EventTarget | null, pointerId?: number | null) => {
      if (!activePress || activePress.pointerKey !== createPointerKey(pointerId)) return;
      const actionable = findActionableTarget(root, target);
      const sameActionable = actionable === activePress.element;
      const elapsed = Date.now() - activePress.startTime;
      const shouldSuppressClick = sameActionable && (activePress.moved || elapsed > durationMs);
      if (shouldSuppressClick) {
        suppressedTarget = activePress.element;
      }
      activePress = null;
    };

    const cancelPress = (pointerId?: number | null) => {
      if (!activePress || activePress.pointerKey !== createPointerKey(pointerId)) return;
      activePress = null;
    };

    const onPointerDownCapture = (event: PointerEvent) => {
      if (event.button !== 0) return;
      beginPress(event.target, event.clientX, event.clientY, event.pointerId);
    };
    const onPointerMoveCapture = (event: PointerEvent) => updatePress(event.clientX, event.clientY, event.pointerId);
    const onPointerUpCapture = (event: PointerEvent) => finishPress(event, event.target, event.pointerId);
    const onPointerCancelCapture = (event: PointerEvent) => cancelPress(event.pointerId);

    const onMouseDownCapture = (event: MouseEvent) => {
      if (event.button !== 0) return;
      beginPress(event.target, event.clientX, event.clientY);
    };
    const onMouseMoveCapture = (event: MouseEvent) => updatePress(event.clientX, event.clientY);
    const onMouseUpCapture = (event: MouseEvent) => finishPress(event, event.target);

    const onClickCapture = (event: MouseEvent) => {
      if (!suppressedTarget) return;
      const actionable = findActionableTarget(root, event.target);
      if (actionable !== suppressedTarget) return;
      suppressedTarget = null;
      event.preventDefault();
      event.stopPropagation();
    };

    root.addEventListener("pointerdown", onPointerDownCapture, true);
    root.addEventListener("pointermove", onPointerMoveCapture, true);
    root.addEventListener("pointerup", onPointerUpCapture, true);
    root.addEventListener("pointercancel", onPointerCancelCapture, true);
    root.addEventListener("mousedown", onMouseDownCapture, true);
    root.addEventListener("mousemove", onMouseMoveCapture, true);
    root.addEventListener("mouseup", onMouseUpCapture, true);
    root.addEventListener("click", onClickCapture, true);
    return () => {
      root.removeEventListener("pointerdown", onPointerDownCapture, true);
      root.removeEventListener("pointermove", onPointerMoveCapture, true);
      root.removeEventListener("pointerup", onPointerUpCapture, true);
      root.removeEventListener("pointercancel", onPointerCancelCapture, true);
      root.removeEventListener("mousedown", onMouseDownCapture, true);
      root.removeEventListener("mousemove", onMouseMoveCapture, true);
      root.removeEventListener("mouseup", onMouseUpCapture, true);
      root.removeEventListener("click", onClickCapture, true);
    };
  }, [distance, durationMs, rootRef]);
}
