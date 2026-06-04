const dragThreshold = 4;
const autoScrollEdgeThreshold = 56;
const autoScrollStep = 18;
const columnSwapHysteresis = 8;

type ColumnSlot = {
  fieldName: string;
  index: number;
  left: number;
  right: number;
  center: number;
  width: number;
};

export function shouldStartColumnDrag(deltaX: number, deltaY: number) {
  return Math.abs(deltaX) > dragThreshold || Math.abs(deltaY) > dragThreshold;
}

export function getPointerXInScrollSpace(scrollContainer: HTMLElement | null, clientX: number) {
  if (!scrollContainer) return clientX;
  const rect = scrollContainer.getBoundingClientRect();
  return scrollContainer.scrollLeft + (clientX - rect.left);
}

export function resolveAutoScrollDirection(scrollContainer: HTMLElement | null, clientX: number, threshold = autoScrollEdgeThreshold) {
  if (!scrollContainer) return 0;
  if (scrollContainer.scrollWidth <= scrollContainer.clientWidth) return 0;
  const rect = scrollContainer.getBoundingClientRect();
  if (clientX < rect.left + threshold) return scrollContainer.scrollLeft > 0 ? -1 : 0;
  if (clientX > rect.right - threshold) {
    return scrollContainer.scrollLeft < scrollContainer.scrollWidth - scrollContainer.clientWidth ? 1 : 0;
  }
  return 0;
}

export function collectColumnSlots(scrollContainer: HTMLElement | null, draggingField: string) {
  if (!scrollContainer) return [];
  const containerRect = scrollContainer.getBoundingClientRect();
  const scrollLeft = scrollContainer.scrollLeft;
  return [...scrollContainer.querySelectorAll<HTMLElement>("th[data-column-field]")]
    .map((cell, index) => ({
      fieldName: cell.dataset.columnField || "",
      index,
      left: cell.getBoundingClientRect().left - containerRect.left + scrollLeft,
      right: cell.getBoundingClientRect().right - containerRect.left + scrollLeft,
      center: (cell.getBoundingClientRect().left + cell.getBoundingClientRect().right) / 2 - containerRect.left + scrollLeft,
      width: cell.getBoundingClientRect().width,
    }))
    .filter((slot) => slot.fieldName && slot.fieldName !== draggingField);
}

function getSwapOffset(draggingWidth: number, neighborWidth: number) {
  return Math.max(0, neighborWidth - draggingWidth) + columnSwapHysteresis;
}

function resolveAdjacentSwap(
  order: string[],
  draggingField: string,
  draggingWidth: number,
  slotMap: Map<string, ColumnSlot>,
  pointerXInScrollSpace: number,
) {
  const draggingIndex = order.indexOf(draggingField);
  if (draggingIndex < 0) return null;

  const leftNeighbor = draggingIndex > 0 ? slotMap.get(order[draggingIndex - 1]) : null;
  const rightNeighbor = draggingIndex < order.length - 1 ? slotMap.get(order[draggingIndex + 1]) : null;

  if (rightNeighbor) {
    const swapThreshold = rightNeighbor.left + getSwapOffset(draggingWidth, rightNeighbor.width);
    if (pointerXInScrollSpace >= swapThreshold) {
      return { targetField: rightNeighbor.fieldName, placement: "after" as const };
    }
  }

  if (leftNeighbor) {
    const swapThreshold = leftNeighbor.right - getSwapOffset(draggingWidth, leftNeighbor.width);
    if (pointerXInScrollSpace <= swapThreshold) {
      return { targetField: leftNeighbor.fieldName, placement: "before" as const };
    }
  }

  return null;
}

export function resolveDropTarget(
  order: string[],
  draggingField: string,
  draggingWidth: number,
  slots: ColumnSlot[],
  pointerXInScrollSpace: number,
) {
  const orderedSlots = [...slots].sort((left, right) => left.left - right.left || left.index - right.index);
  const slotMap = new Map(orderedSlots.map((slot) => [slot.fieldName, slot]));
  return resolveAdjacentSwap(order, draggingField, draggingWidth, slotMap, pointerXInScrollSpace);
}

export function buildPreviewOrderFromTarget(
  order: string[],
  draggingField: string,
  targetField: string,
  placement: "before" | "after" = "before",
) {
  const otherFields = order.filter((field) => field !== draggingField);
  if (!targetField) return order;
  const targetIndex = otherFields.indexOf(targetField);
  if (targetIndex < 0) return [...otherFields, draggingField];
  const next = [...otherFields];
  next.splice(placement === "after" ? targetIndex + 1 : targetIndex, 0, draggingField);
  return next;
}

export function buildPreviewOrderFromSlots(
  order: string[],
  draggingField: string,
  draggingWidth: number,
  slots: ColumnSlot[],
  pointerXInScrollSpace: number,
) {
  const target = resolveDropTarget(order, draggingField, draggingWidth, slots, pointerXInScrollSpace);
  if (!target) return order;
  return buildPreviewOrderFromTarget(order, draggingField, target.targetField, target.placement);
}

export function scrollColumnContainer(scrollContainer: HTMLElement | null, direction: number) {
  if (!scrollContainer || direction === 0) return false;
  const maxScrollLeft = Math.max(0, scrollContainer.scrollWidth - scrollContainer.clientWidth);
  const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, scrollContainer.scrollLeft + direction * autoScrollStep));
  if (nextScrollLeft === scrollContainer.scrollLeft) return false;
  scrollContainer.scrollLeft = nextScrollLeft;
  return true;
}
