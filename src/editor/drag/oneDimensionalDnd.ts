/**
 * 一维拖拽几何与会话（对齐 data-editor 参考实现）。
 * 纯几何/会话逻辑：阈值判定、投影计算、子集顺序合并；不含任何业务与 DOM 依赖。
 */

export const ONE_DIMENSIONAL_DRAG_THRESHOLD = 4;
export const ONE_DIMENSIONAL_FORWARD_TRIGGER_RATIO = 0.25;
export const ONE_DIMENSIONAL_BACKWARD_TRIGGER_RATIO = 0.75;

export function shouldStartOneDimensionalDrag(input: {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  threshold?: number;
}) {
  const threshold = input.threshold ?? ONE_DIMENSIONAL_DRAG_THRESHOLD;
  return Math.abs(input.currentX - input.startX) > threshold || Math.abs(input.currentY - input.startY) > threshold;
}

export type OneDimensionalDragSession = {
  pointerId: number;
  readonly started: boolean;
  move: (input: { clientX: number; clientY: number }) => { started: boolean; previewOrder: string[] | null };
  release: () => string[] | null;
  cancel: () => void;
};

/**
 * 单指针一维拖拽会话：越过阈值后启动，onPreview 返回的顺序成为提交候选，
 * release 时整体提交；cancel 与未启动的 release 都不提交。
 */
export function createOneDimensionalDragSession(input: {
  pointerId: number;
  startX: number;
  startY: number;
  threshold?: number;
  onStart?: () => void;
  onPreview?: (input: { clientX: number; clientY: number; previewOrder: string[] | null }) => string[] | null | void;
  onCommit?: (previewOrder: string[]) => void;
  onCancel?: () => void;
}): OneDimensionalDragSession {
  let started = false;
  let previewOrder: string[] | null = null;
  const threshold = input.threshold ?? ONE_DIMENSIONAL_DRAG_THRESHOLD;

  return {
    pointerId: input.pointerId,
    get started() {
      return started;
    },
    move({ clientX, clientY }) {
      if (!started) {
        if (!shouldStartOneDimensionalDrag({ startX: input.startX, startY: input.startY, currentX: clientX, currentY: clientY, threshold })) {
          return { started: false, previewOrder };
        }
        started = true;
        input.onStart?.();
      }
      const nextPreviewOrder = input.onPreview?.({ clientX, clientY, previewOrder });
      if (Array.isArray(nextPreviewOrder)) previewOrder = nextPreviewOrder;
      return { started: true, previewOrder };
    },
    release() {
      if (started && previewOrder) input.onCommit?.(previewOrder);
      const committedOrder = previewOrder;
      previewOrder = null;
      started = false;
      return committedOrder;
    },
    cancel() {
      previewOrder = null;
      started = false;
      input.onCancel?.();
    },
  };
}

export function arrayMove(order: string[], activeId: string, targetIndex: number) {
  const currentIndex = order.indexOf(activeId);
  if (currentIndex < 0) return [...order];
  const next = order.filter((id) => id !== activeId);
  const clampedIndex = Math.max(0, Math.min(next.length, targetIndex));
  next.splice(clampedIndex, 0, activeId);
  return next;
}

export type VerticalProjectionItem = {
  id: string;
  index: number;
  start: number;
  size: number;
  center: number;
};

export type VerticalProjection = {
  axis: "vertical";
  forwardTriggerRatio: number;
  backwardTriggerRatio: number;
  items: VerticalProjectionItem[];
};

export function createVerticalProjection(input: {
  axis: "vertical";
  itemSize?: number;
  forwardTriggerRatio?: number;
  backwardTriggerRatio?: number;
  items: Array<{ id: string; start: number; size?: number }>;
}): VerticalProjection {
  if (input.axis !== "vertical") throw new Error(`Unsupported axis: ${input.axis}`);
  const itemSize = input.itemSize ?? 0;
  const normalizedItems = input.items.map((item, index) => ({
    id: item.id,
    index,
    start: item.start,
    size: item.size ?? itemSize,
    center: item.start + (item.size ?? itemSize) / 2,
  }));
  return {
    axis: input.axis,
    forwardTriggerRatio: input.forwardTriggerRatio ?? ONE_DIMENSIONAL_FORWARD_TRIGGER_RATIO,
    backwardTriggerRatio: input.backwardTriggerRatio ?? ONE_DIMENSIONAL_BACKWARD_TRIGGER_RATIO,
    items: normalizedItems,
  };
}

/**
 * 垂直投影：按指针位置与兄弟行触发线（前向 0.25 / 后向 0.75）计算落点索引与投影顺序。
 */
export function projectVerticalDrag(input: {
  projection: VerticalProjection;
  order: string[];
  activeId: string;
  pointer: number | null;
}) {
  const activeItem = input.projection.items.find((item) => item.id === input.activeId);
  if (!activeItem) {
    return {
      dropIndex: input.order.indexOf(input.activeId),
      projectedOrder: [...input.order],
      direction: null as "forward" | "backward" | null,
    };
  }
  const pointerPosition = input.pointer ?? activeItem.center;
  const siblings = input.projection.items.filter((item) => item.id !== input.activeId);
  let dropIndex = siblings.length;
  for (let index = 0; index < siblings.length; index += 1) {
    const sibling = siblings[index]!;
    const triggerRatio = sibling.index < activeItem.index
      ? input.projection.backwardTriggerRatio
      : input.projection.forwardTriggerRatio;
    const triggerLine = sibling.start + sibling.size * triggerRatio;
    if (pointerPosition < triggerLine) {
      dropIndex = index;
      break;
    }
  }
  const projectedOrder = arrayMove(input.order, input.activeId, dropIndex);
  const startIndex = input.order.indexOf(input.activeId);
  return {
    dropIndex,
    projectedOrder,
    direction: dropIndex < startIndex ? "backward" : dropIndex > startIndex ? "forward" : null,
  } as const;
}

/**
 * 把投影后的可见子集顺序合并回全量顺序：过滤态拖拽时不可见行保持原位。
 */
export function mergeProjectedSubsetOrder(input: {
  fullOrder: string[];
  subsetOrder: string[];
  projectedSubsetOrder: string[];
}) {
  if (input.subsetOrder.length === 0) return [...input.fullOrder];
  const subsetSet = new Set(input.subsetOrder);
  const strippedOrder = input.fullOrder.filter((id) => !subsetSet.has(id));
  const firstSubsetIndex = input.fullOrder.findIndex((id) => subsetSet.has(id));
  if (firstSubsetIndex < 0) return [...input.fullOrder];
  strippedOrder.splice(firstSubsetIndex, 0, ...input.projectedSubsetOrder);
  return strippedOrder;
}
