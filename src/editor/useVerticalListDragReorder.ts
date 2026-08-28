import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import {
  createOneDimensionalDragSession,
  createVerticalProjection,
  mergeProjectedSubsetOrder,
  projectVerticalDrag,
} from "./drag/oneDimensionalDnd";

export type VerticalListDragPreview = {
  activeId: string;
  dropIndex: number;
  ghostHeight: number;
  ghostLeft: number;
  ghostTop: number;
  ghostWidth: number;
};

type UseVerticalListDragReorderArgs<TElement extends HTMLElement> = {
  fullOrder: string[];
  visibleOrder: string[];
  itemRefs: MutableRefObject<Record<string, TElement | null>>;
  onCommitOrder: (nextOrder: string[]) => void;
};

type DragState = {
  activeId: string;
  baseOrder: string[];
  ghostHeight: number;
  ghostLeft: number;
  ghostWidth: number;
  pointerOffsetY: number;
  visibleOrder: string[];
  /** 拖拽开始时的行几何快照：popover 重定位/重排导致的坐标漂移不影响投影判定。 */
  snapshot: Array<{ id: string; start: number; size: number }>;
};

/**
 * 垂直列表拖拽重排（对齐 data-editor 参考实现）：
 * ghost 跟随指针（rAF 合帧），投影计算实时重排预览，release 一次性提交全量顺序。
 */
export function useVerticalListDragReorder<TElement extends HTMLElement>({
  fullOrder,
  visibleOrder,
  itemRefs,
  onCommitOrder,
}: UseVerticalListDragReorderArgs<TElement>) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<VerticalListDragPreview | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const dragSessionRef = useRef<ReturnType<typeof createOneDimensionalDragSession> | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const queuedPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const lastPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const fullOrderRef = useRef(fullOrder);
  const visibleOrderRef = useRef(visibleOrder);
  const suppressNextClickRef = useRef(false);

  fullOrderRef.current = fullOrder;
  visibleOrderRef.current = visibleOrder;

  useEffect(() => () => {
    dragCleanupRef.current?.();
  }, []);

  function previewReorderByPointer(clientY: number) {
    const dragState = dragStateRef.current;
    if (!dragState) return null;
    const ghostTop = clientY - dragState.pointerOffsetY;
    const projectionItems = dragState.snapshot.map((item) => (
      item.id === dragState.activeId
        ? { id: item.id, size: dragState.ghostHeight, start: ghostTop }
        : item
    ));
    if (!dragState.visibleOrder.includes(dragState.activeId) || projectionItems.length !== dragState.visibleOrder.length) return null;

    const projectionResult = projectVerticalDrag({
      projection: createVerticalProjection({
        axis: "vertical",
        items: projectionItems,
      }),
      order: dragState.visibleOrder,
      activeId: dragState.activeId,
      pointer: clientY,
    });
    const nextPreviewOrder = mergeProjectedSubsetOrder({
      fullOrder: dragState.baseOrder,
      subsetOrder: dragState.visibleOrder,
      projectedSubsetOrder: projectionResult.projectedOrder,
    });
    setDragPreview({
      activeId: dragState.activeId,
      dropIndex: projectionResult.dropIndex,
      ghostHeight: dragState.ghostHeight,
      ghostLeft: dragState.ghostLeft,
      ghostTop,
      ghostWidth: dragState.ghostWidth,
    });
    return nextPreviewOrder;
  }

  function resetDragState(shouldSuppressClick: boolean) {
    dragStateRef.current = null;
    dragSessionRef.current = null;
    queuedPointerRef.current = null;
    if (pointerFrameRef.current != null) {
      window.cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = null;
    }
    setDraggingId(null);
    setDragPreview(null);
    if (shouldSuppressClick) {
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 0);
    } else {
      suppressNextClickRef.current = false;
    }
  }

  function beginDrag(id: string, event: ReactPointerEvent<HTMLElement>) {
    if (!visibleOrderRef.current.includes(id)) return;
    const sourceRow = itemRefs.current[id];
    if (!sourceRow) return;
    event.preventDefault();
    event.stopPropagation();
    const sourceRect = sourceRow.getBoundingClientRect();
    dragStateRef.current = {
      activeId: id,
      baseOrder: [...fullOrderRef.current],
      ghostHeight: sourceRect.height,
      ghostLeft: sourceRect.left,
      ghostWidth: sourceRect.width,
      pointerOffsetY: (event.clientY ?? sourceRect.top + sourceRect.height / 2) - sourceRect.top,
      visibleOrder: [...visibleOrderRef.current],
      snapshot: visibleOrderRef.current.map((rowId) => {
        const row = itemRefs.current[rowId];
        if (!row) return { id: rowId, start: sourceRect.top, size: sourceRect.height };
        const rect = row.getBoundingClientRect();
        return { id: rowId, start: rect.top, size: rect.height };
      }),
    };
    dragSessionRef.current = createOneDimensionalDragSession({
      pointerId: event.pointerId,
      // 合成/触摸事件可能不携带坐标，回退为源行几何，保证阈值判定可用。
      startX: event.clientX ?? sourceRect.left,
      startY: event.clientY ?? sourceRect.top,
      onStart: () => {
        suppressNextClickRef.current = true;
        setDraggingId(id);
        setDragPreview({
          activeId: id,
          dropIndex: Math.max(0, dragStateRef.current?.visibleOrder.indexOf(id) ?? 0),
          ghostHeight: sourceRect.height,
          ghostLeft: sourceRect.left,
          ghostTop: sourceRect.top,
          ghostWidth: sourceRect.width,
        });
      },
      onPreview: ({ clientY }) => previewReorderByPointer(clientY),
      onCommit: (finalizedOrder) => {
        const baseOrder = dragStateRef.current?.baseOrder ?? fullOrderRef.current;
        if (sameOrder(baseOrder, finalizedOrder)) return;
        onCommitOrder(finalizedOrder);
      },
      onCancel: () => {
        setDraggingId(null);
        setDragPreview(null);
      },
    });
    dragCleanupRef.current?.();
    const onPointerMove = (nextEvent: PointerEvent) => {
      const dragSession = dragSessionRef.current;
      if (!dragSession) return;
      queuedPointerRef.current = { clientX: nextEvent.clientX, clientY: nextEvent.clientY };
      lastPointerRef.current = { clientX: nextEvent.clientX, clientY: nextEvent.clientY };
      if (pointerFrameRef.current != null) return;
      pointerFrameRef.current = window.requestAnimationFrame(() => {
        pointerFrameRef.current = null;
        const nextPointer = queuedPointerRef.current;
        if (!nextPointer) return;
        dragSession.move(nextPointer);
      });
    };
    const finishDrag = (mode: "release" | "cancel") => {
      const dragSession = dragSessionRef.current;
      const started = dragSession?.started ?? false;
      if (mode === "release" && started && dragSession) {
        // 快速拖拽时最后一个 pointermove 可能被 rAF 节流合并：release 前用最后指针强制投影，
        // 保证落点与提交顺序使用最终位置，而非原位。
        const lastPointer = lastPointerRef.current;
        if (lastPointer) dragSession.move(lastPointer);
        dragSession.release();
      } else if (mode === "cancel") {
        dragSession?.cancel();
      }
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
      resetDragState(started);
    };
    const onPointerUp = () => finishDrag("release");
    const onPointerCancel = () => finishDrag("cancel");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerCancel, { once: true });
    dragCleanupRef.current = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }

  function handleSuppressedClickCapture(event: ReactMouseEvent<HTMLElement>) {
    if (!suppressNextClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  }

  return {
    beginDrag,
    dragPreview,
    draggingId,
    handleSuppressedClickCapture,
  };
}

function sameOrder(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
