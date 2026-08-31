import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal, flushSync } from "react-dom";
import { icons } from "./icons";

type SchemaColumnHeaderProps = {
  fieldName: string;
  label: string;
  typeLabel?: string;
  sortable: boolean;
  sortDirection: "asc" | "desc" | null;
  wrapped?: boolean;
  width: number;
  pressed: boolean;
  isDragging: boolean;
  canHide?: boolean;
  onSort: (direction: "asc" | "desc" | null) => void;
  onHide: () => void;
  onResize: (width: number) => void;
  onMove: (direction: "left" | "right") => void;
  onDragStart: (fieldName: string, rect: DOMRect, pointerOffsetX: number, pointerOffsetY: number) => void;
  onDragMove: (fieldName: string, clientX: number, clientY: number) => void;
  onDragEnd: (fieldName: string) => void;
  onPressChange: (fieldName: string, pressed: boolean) => void;
  onToggleSortable: () => void;
  onToggleWrap: () => void;
  onRenameLabel: (label: string) => void;
  onResetWidth: () => void;
};

const minColumnWidth = 56;
const dragThreshold = 4;
const clickMenuOpenThresholdMs = 300;

export function SchemaColumnHeader(props: SchemaColumnHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [renameDraft, setRenameDraft] = useState(props.label);
  const [isRenameComposing, setIsRenameComposing] = useState(false);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const widthRef = useRef(props.width);
  const pressStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTime: number;
    moved: boolean;
    dragging: boolean;
    startRect: DOMRect;
    pointerOffsetX: number;
    pointerOffsetY: number;
  } | null>(null);
  const suppressNextClickRef = useRef(false);
  const dragState = useRef<{
    startX: number;
    startRight: number;
    startWidth: number;
    lastWidth: number;
  } | null>(null);

  useEffect(() => {
    widthRef.current = props.width;
  }, [props.width]);

  useEffect(() => {
    if (!menuOpen || isRenameComposing) return;
    setRenameDraft(props.label);
  }, [isRenameComposing, menuOpen, props.label]);

  useEffect(() => {
    if (!menuOpen) return;
    const syncMenuPosition = () => {
      const rect = headerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPosition({
        left: rect.left,
        top: rect.bottom + 6,
      });
    };
    syncMenuPosition();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (headerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("resize", syncMenuPosition);
    window.addEventListener("scroll", syncMenuPosition, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", syncMenuPosition);
      window.removeEventListener("scroll", syncMenuPosition, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function beginResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    const headerElement = event.currentTarget.closest("th") ?? headerRef.current;
    const startWidth = widthRef.current;
    const startRight = headerElement?.getBoundingClientRect().right ?? event.clientX;
    dragState.current = {
      startX: event.clientX,
      startRight,
      startWidth,
      lastWidth: startWidth,
    };

    document.body.classList.add("is-resizing-column");
    updateResizeGuide(startRight);

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!dragState.current) return;
      const state = dragState.current;
      const nextWidth = clampColumnWidth(state.startWidth + moveEvent.clientX - state.startX);
      if (Math.abs(nextWidth - dragState.current.lastWidth) < 4) return;
      dragState.current.lastWidth = nextWidth;
      updateResizeGuide(state.startRight + (nextWidth - state.startWidth));
      updateTableColumnWidth(headerRef.current, props.fieldName, nextWidth);
    };

    const onPointerUp = () => {
      const state = dragState.current;
      if (state) {
        commitColumnWidth(state.lastWidth);
      }
      dragState.current = null;
      document.body.classList.remove("is-resizing-column");
      document.body.style.removeProperty("--column-resize-guide-x");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function commitColumnWidth(width: number) {
    widthRef.current = width;
    updateTableColumnWidth(headerRef.current, props.fieldName, width);
    props.onResize(width);
  }

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    if (pressStateRef.current) return;
    event.stopPropagation();
    event.preventDefault();
    setMenuOpen(false);
    const startRect = headerRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    pressStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: Date.now(),
      moved: false,
      dragging: false,
      startRect,
      pointerOffsetX: event.clientX - startRect.left,
      pointerOffsetY: event.clientY - startRect.top,
    };

    const onPointerMove = (moveEvent: { clientX: number; clientY: number; pointerId?: number }) => {
      const state = pressStateRef.current;
      if (!state) return;
      if (moveEvent.pointerId != null && moveEvent.pointerId !== state.pointerId) return;
      if (Math.abs(moveEvent.clientX - state.startX) > dragThreshold || Math.abs(moveEvent.clientY - state.startY) > dragThreshold) {
        state.moved = true;
      }
      if (state.moved && !state.dragging) {
        state.dragging = true;
        props.onPressChange(props.fieldName, true);
        document.body.classList.add("is-dragging-column");
        props.onDragStart(props.fieldName, state.startRect, state.pointerOffsetX, state.pointerOffsetY);
      }
      if (state.dragging) props.onDragMove(props.fieldName, moveEvent.clientX, moveEvent.clientY);
    };

    const finish = (openMenu: boolean) => {
      const state = pressStateRef.current;
      if (!state) return;
      if (state.dragging) props.onDragEnd(props.fieldName);
      else if (!state.moved && openMenu && Date.now() - state.startTime < clickMenuOpenThresholdMs) setMenuOpen(true);
      suppressNextClickRef.current = true;
      props.onPressChange(props.fieldName, false);
      document.body.classList.remove("is-dragging-column");
      pressStateRef.current = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    const onPointerUp = (upEvent: { pointerId?: number }) => {
      const state = pressStateRef.current;
      if (!state) return;
      if (upEvent.pointerId != null && upEvent.pointerId !== state.pointerId) return;
      finish(true);
    };

    const onPointerCancel = (cancelEvent: { pointerId?: number }) => {
      const state = pressStateRef.current;
      if (!state) return;
      if (cancelEvent.pointerId != null && cancelEvent.pointerId !== state.pointerId) return;
      finish(false);
    };

    const onMouseMove = (moveEvent: MouseEvent) => onPointerMove(moveEvent);
    const onMouseUp = () => onPointerUp({});

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function runAfterMenuClose(action: () => void) {
    action();
    setMenuOpen(false);
  }

  function runDialogAction(action: () => void) {
    flushSync(() => {
      action();
    });
  }

  function commitRenameLabel(nextLabel: string) {
    const normalizedLabel = nextLabel.trim().length ? nextLabel : "";
    if (normalizedLabel === props.label) {
      return;
    }
    runDialogAction(() => props.onRenameLabel(normalizedLabel));
  }

  return (
    <div
      className={`column-header ${props.pressed ? "is-column-pressed" : ""} ${props.isDragging ? "is-column-dragging" : ""}`}
      ref={headerRef}
    >
      <button
        aria-label={props.label}
        aria-haspopup="menu"
        className="column-trigger"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (event.detail > 0) return;
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            return;
          }
          setMenuOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setMenuOpen(true);
          }
        }}
        onMouseDown={(event) => beginDrag(event as unknown as ReactPointerEvent<HTMLButtonElement>)}
        onPointerDown={beginDrag}
        type="button"
      >
        <span>{props.label}</span>
      </button>
      {menuOpen && menuPosition && typeof document !== "undefined" ? createPortal(
        <div
          className="menu-content column-menu-popup schema-column-menu-popup"
          ref={menuRef}
          role="menu"
          style={{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }}
        >
          <label className="menu-item schema-column-menu__input-row">
            <icons.edit size={15} />
            <input
              aria-label={`Column label for ${props.label}`}
              className="schema-column-menu__input"
              placeholder="Column label"
              type="text"
              value={renameDraft}
              onChange={(event) => {
                const nextLabel = event.target.value;
                setRenameDraft(nextLabel);
                if (!isRenameComposing) {
                  commitRenameLabel(nextLabel);
                }
              }}
              onBlur={(event) => {
                setRenameDraft(event.target.value);
                if (!isRenameComposing) {
                  commitRenameLabel(event.target.value);
                }
              }}
              onCompositionStart={() => setIsRenameComposing(true)}
              onCompositionEnd={(event) => {
                const nextLabel = event.currentTarget.value;
                setIsRenameComposing(false);
                setRenameDraft(nextLabel);
                commitRenameLabel(nextLabel);
              }}
            />
          </label>
          {props.typeLabel ? (
            <div className="menu-item schema-column-menu__meta" role="presentation">
              <span className="schema-column-menu__meta-label">Type</span>
              <strong className="schema-column-menu__meta-value">{props.typeLabel}</strong>
            </div>
          ) : null}
          <div className="menu-separator" />
          {props.sortable ? (
            <>
              <button className="menu-item" onClick={() => runAfterMenuClose(() => props.onSort("asc"))} type="button">
                <icons.sortAscending size={15} /> Sort ascending
              </button>
              <button className="menu-item" onClick={() => runAfterMenuClose(() => props.onSort("desc"))} type="button">
                <icons.sortDescending size={15} /> Sort descending
              </button>
              <button className="menu-item" onClick={() => runAfterMenuClose(() => props.onSort(null))} type="button">
                <icons.filter size={15} /> Clear sort
              </button>
              <div className="menu-separator" />
            </>
          ) : null}
          <button className="menu-item" onClick={() => runAfterMenuClose(props.onToggleSortable)} type="button">
            <icons.sortAscending size={15} /> {props.sortable ? "Disable sorting" : "Enable sorting"}
          </button>
          <button className="menu-item" onClick={() => runAfterMenuClose(props.onToggleWrap)} type="button">
            <icons.wrapText size={15} /> {props.wrapped ? "Turn off wrapping" : "Wrap text"}
          </button>
          <div className="menu-separator" />
          <button className="menu-item" data-column-action="move-left" onClick={() => runAfterMenuClose(() => props.onMove("left"))} type="button">
            <icons.previous size={15} /> Move left
          </button>
          <button className="menu-item" data-column-action="move-right" onClick={() => runAfterMenuClose(() => props.onMove("right"))} type="button">
            <icons.next size={15} /> Move right
          </button>
          <button className="menu-item" onClick={() => runAfterMenuClose(props.onResetWidth)} type="button">
            <icons.reset size={15} /> Reset width
          </button>
          {props.canHide === false ? null : (
            <button className="menu-item danger" onClick={() => runAfterMenuClose(props.onHide)} type="button">
              <icons.hidden size={15} /> Hide
            </button>
          )}
        </div>,
        document.body,
      ) : null}
      <div
        aria-label={`Resize ${props.label} column`}
        aria-valuemin={minColumnWidth}
        aria-valuenow={widthRef.current}
        className="column-resize-handle"
        onDoubleClick={() => props.onResetWidth()}
        onPointerDown={beginResize}
        role="separator"
        title="Drag to resize column"
      />
    </div>
  );
}

function clampColumnWidth(width: number) {
  return Math.max(minColumnWidth, Math.round(width));
}

function updateResizeGuide(guideRight: number) {
  document.body.style.setProperty("--column-resize-guide-x", `${Math.round(guideRight)}px`);
}

function updateTableColumnWidth(headerElement: HTMLElement | null, fieldName: string, width: number) {
  const table = headerElement?.closest("table");
  if (!table) return;
  const column = [...table.querySelectorAll<HTMLTableColElement>("col[data-column-field]")]
    .find((item) => item.dataset.columnField === fieldName);
  if (!column) return;
  const next = `${width}px`;
  column.style.width = next;
  column.style.minWidth = next;
  updateTableWidth(table);
}

function updateTableWidth(table: HTMLTableElement) {
  const total = [...table.querySelectorAll<HTMLTableColElement>("col")]
    .reduce((sum, column) => {
      const width = Number.parseFloat(column.style.width || getComputedStyle(column).width);
      return sum + (Number.isFinite(width) ? width : 0);
    }, 0);
  if (!total) return;
  const next = `${Math.round(total)}px`;
  table.style.width = next;
  table.style.minWidth = next;
}
