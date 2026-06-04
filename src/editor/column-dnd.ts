const dragThreshold = 4;
const autoScrollEdgeThreshold = 56;
const autoScrollStep = 18;

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
    }))
    .filter((slot) => slot.fieldName && slot.fieldName !== draggingField);
}

export function resolveDropTarget(
  slots: Array<{ fieldName: string; index: number; left: number; right: number; center: number }>,
  pointerXInScrollSpace: number,
) {
  const orderedSlots = [...slots].sort((left, right) => left.left - right.left || left.index - right.index);
  for (const slot of orderedSlots) {
    if (pointerXInScrollSpace <= slot.center) {
      return { targetField: slot.fieldName, placement: "before" as const };
    }
  }
  const lastSlot = orderedSlots.at(-1);
  if (!lastSlot) return null;
  return { targetField: lastSlot.fieldName, placement: "after" as const };
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
  slots: Array<{ fieldName: string; index: number; left: number; right: number; center: number }>,
  pointerXInScrollSpace: number,
) {
  const target = resolveDropTarget(slots, pointerXInScrollSpace);
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
