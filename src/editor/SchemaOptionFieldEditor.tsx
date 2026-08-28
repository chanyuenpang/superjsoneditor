import * as Popover from "@radix-ui/react-popover";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { colorChoiceGroups, namedChipPalette, type EditorViewOptionColor } from "./schema";
import { useVerticalListDragReorder } from "./useVerticalListDragReorder";
import { icons } from "./icons";

export type SchemaOptionValue = string | number;

export type SchemaOptionItem = {
  value: SchemaOptionValue;
  label: string;
  color: EditorViewOptionColor | null;
  description?: string;
  preview?: string;
};

type SchemaOptionFieldEditorProps = {
  ariaLabel: string;
  mode: "single" | "multi";
  value: SchemaOptionValue[];
  options: SchemaOptionItem[];
  readOnly: boolean;
  placeholder?: string;
  allowAuthoring: boolean;
  onEdit: (value: SchemaOptionValue[]) => void;
  onCreateOption?: (nextValue: string) => void;
  onRenameOption?: (previousValue: SchemaOptionValue, nextValue: string) => void;
  onDeleteOption?: (optionValue: SchemaOptionValue) => void;
  onMoveOption?: (optionValue: SchemaOptionValue, direction: "up" | "down") => void;
  onReorderOptions?: (orderedValues: Array<string | number>) => void;
  onSetOptionColor?: (optionValue: SchemaOptionValue, color: EditorViewOptionColor | null) => void;
};

type EditingState = {
  value: string;
  label: string;
};

const defaultColorChoiceLabel = "默认";

export function SchemaOptionFieldEditor({
  ariaLabel,
  mode,
  value,
  options,
  readOnly,
  allowAuthoring,
  onEdit,
  onCreateOption,
  onRenameOption,
  onDeleteOption,
  onMoveOption,
  onReorderOptions,
  onSetOptionColor,
}: SchemaOptionFieldEditorProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<EditingState | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const optionRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const popoverContentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && !editing) inputRef.current?.focus();
  }, [open, editing]);

  useEffect(() => {
    if (editing) renameInputRef.current?.focus();
  }, [editing]);

  const optionMap = useMemo(() => {
    const map = new Map<string, SchemaOptionItem>();
    for (const option of options) {
      map.set(String(option.value), option);
    }
    for (const selected of value) {
      const key = String(selected);
      if (!map.has(key)) {
        map.set(key, { value: selected, label: key, color: null });
      }
    }
    return map;
  }, [options, value]);

  const normalizedOptions = useMemo(() => [...optionMap.values()], [optionMap]);
  const selectedValues = useMemo(() => new Set(value.map((item) => String(item))), [value]);
  const filteredOptions = useMemo(() => {
    const needle = draft.trim().toLowerCase();
    return normalizedOptions.filter((option) => option.label.toLowerCase().includes(needle) || String(option.value).toLowerCase().includes(needle));
  }, [draft, normalizedOptions]);
  const canCreate = allowAuthoring && Boolean(onCreateOption) && draft.trim().length > 0 && !normalizedOptions.some((option) => String(option.value).toLowerCase() === draft.trim().toLowerCase());
  const canManageOption = Boolean(onRenameOption || onDeleteOption || onMoveOption || onSetOptionColor);

  const { beginDrag, dragPreview, draggingId, handleSuppressedClickCapture } = useVerticalListDragReorder<HTMLDivElement>({
    fullOrder: normalizedOptions.map((option) => String(option.value)),
    visibleOrder: filteredOptions.map((option) => String(option.value)),
    itemRefs: optionRowRefs,
    onCommitOrder: (nextOrder) => onReorderOptions?.(nextOrder.map((entry) => {
      const numeric = Number(entry);
      return Number.isFinite(numeric) && String(numeric) === entry ? numeric : entry;
    })),
  });
  const canDragOption = Boolean(onReorderOptions) && !readOnly && draft.trim().length === 0;


  function commit(nextValues: SchemaOptionValue[]) {
    onEdit(nextValues);
  }

  function toggleOption(optionValue: SchemaOptionValue) {
    const exists = selectedValues.has(String(optionValue));
    if (mode === "single") {
      commit(exists ? [] : [optionValue]);
      setOpen(false);
      return;
    }
    commit(exists ? value.filter((selected) => String(selected) !== String(optionValue)) : [...value, optionValue]);
  }

  function createOption() {
    const nextValue = draft.trim();
    if (!nextValue || !onCreateOption) return;
    onCreateOption(nextValue);
    commit(mode === "single" ? [nextValue] : [...value, nextValue]);
    setDraft("");
    if (mode === "single") setOpen(false);
  }

  function applyRename() {
    if (!editing || !onRenameOption) return;
    const nextValue = editing.label.trim();
    if (!nextValue || nextValue === editing.value) {
      setEditing(null);
      return;
    }
    onRenameOption(editing.value, nextValue);
    setEditing(null);
  }

  function removeOption(optionValue: SchemaOptionValue) {
    onDeleteOption?.(optionValue);
    const nextSelected = value.filter((item) => String(item) !== String(optionValue));
    if (nextSelected.length !== value.length) {
      commit(nextSelected);
    }
    setEditing(null);
  }

  function applyColor(optionValue: SchemaOptionValue, color: EditorViewOptionColor | null) {
    onSetOptionColor?.(optionValue, color);
  }

  return (
    <Popover.Root
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setEditing(null);
      }}
      open={open}
    >
      <Popover.Trigger asChild>
        <button
          aria-label={ariaLabel}
          className="multi-select-trigger"
          disabled={readOnly}
          onClick={(event) => event.stopPropagation()}
          type="button"
        >
          <div aria-label={`${ariaLabel} selected values`} className={mode === "single" ? "select-chips-cell" : "chips-cell"}>
            {mode === "single"
              ? (value.length > 0
                ? (() => {
                  const option = optionMap.get(String(value[0]));
                  return <span className="select-value-text" style={option?.color ? chipStyleForValue(option.color) : undefined}>{option?.label ?? String(value[0])}</span>;
                })()
                : <span className="select-placeholder">未选择</span>)
              : value.map((item, index) => {
                const option = optionMap.get(String(item));
                return (
                  <span className="chip" key={`${item}-${index}`} style={chipStyleForValue(option?.color ?? null)}>
                    {option?.label ?? String(item)}
                  </span>
                );
              })}
          </div>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="multi-select-popover" align="start" collisionPadding={12} onClickCapture={handleSuppressedClickCapture} onOpenAutoFocus={(event) => event.preventDefault()} ref={popoverContentRef}>
          <div className="multi-select-selected">
            {value.map((item, index) => {
              const option = optionMap.get(String(item));
              return (
                <button
                  className="selected-chip"
                  key={`${item}-${index}`}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    if (!readOnly) toggleOption(item);
                  }}
                  style={chipStyleForValue(option?.color ?? null)}
                  type="button"
                >
                  <span>{option?.label ?? String(item)}</span>
                  <span className="selected-chip-remove">x</span>
                </button>
              );
            })}
            {!readOnly ? (
              <input
                className="multi-select-input"
                placeholder="Search or create an option"
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (canCreate) createOption();
                  }
                }}
              />
            ) : null}
          </div>
          <div className="multi-select-options">
            {filteredOptions.map((option, index) => {
              const selected = selectedValues.has(String(option.value));
              const isActiveTarget = dragPreview != null && dragPreview.activeId === String(option.value);
              if (isActiveTarget) {
                return (
                  <Fragment key={String(option.value)}>
                    {dragPreview!.dropIndex < index ? (
                      <div className="option-field-drag-placeholder" style={{ minHeight: dragPreview!.ghostHeight }} />
                    ) : null}
                  </Fragment>
                );
              }
              return (
                <Fragment key={String(option.value)}>
                  <div
                    className={`multi-select-option-row ${selected ? "selected" : ""}`}
                    ref={(element) => { optionRowRefs.current[String(option.value)] = element; }}
                  >
                    <button
                      className={canDragOption ? "option-drag-handle" : "option-drag-handle is-disabled"}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        if (canDragOption) beginDrag(String(option.value), event);
                      }}
                      type="button"
                    >
                      <icons.dragHandle size={14} />
                    </button>
                    <button
                      className={`multi-select-option ${selected ? "selected" : ""}`}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        if (!readOnly) toggleOption(option.value);
                      }}
                      type="button"
                    >
                      <span className="chip" style={chipStyleForValue(option.color)}>{option.label}</span>
                      {selected ? (
                        <span className="picker-option-selected-check">
                          <icons.check size={14} />
                        </span>
                      ) : null}
                    </button>
                  {canManageOption && !readOnly ? (
                    <Popover.Root open={editing?.value === String(option.value)} onOpenChange={(nextOpen) => setEditing(nextOpen ? { value: String(option.value), label: option.label } : null)}>
                      <Popover.Trigger asChild>
                        <button
                          className="option-menu-trigger"
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditing({ value: String(option.value), label: option.label });
                          }}
                          title="编辑选项"
                          type="button"
                        >
                          <icons.more size={16} />
                        </button>
                      </Popover.Trigger>
                      <Popover.Portal>
                        <Popover.Content className="multi-select-option-editor" align="start" collisionPadding={12} side="right" sideOffset={10}>
                          <div className="multi-select-option-editor-header">
                            {onRenameOption ? (
                              <input
                                className="multi-select-option-name-input"
                                ref={renameInputRef}
                                value={editing?.value === String(option.value) ? editing.label : option.label}
                                onChange={(event) => setEditing({ value: String(option.value), label: event.target.value })}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    applyRename();
                                  }
                                }}
                              />
                            ) : (
                              <span className="multi-select-option-name-input">{option.label}</span>
                            )}
                            <icons.info size={16} />
                          </div>
                          {onDeleteOption ? (
                            <button
                              className="multi-select-option-action danger"
                              onPointerDown={(event) => {
                                event.preventDefault();
                                removeOption(option.value);
                              }}
                              type="button"
                            >
                              <icons.delete size={16} />
                              <span>删除</span>
                            </button>
                          ) : null}
                          {onSetOptionColor ? (
                            <>
                              <div className="multi-select-option-divider" />
                              <div className="multi-select-option-section-title">颜色</div>
                              <div className="multi-select-color-list">
                                {(() => {
                                  const active = option.color == null;
                                  const palette = namedChipPalette.default;
                                  return (
                                    <button
                                      className={`multi-select-color-item ${active ? "active" : ""}`}
                                      key="default"
                                      onPointerDown={(event) => {
                                        event.preventDefault();
                                        applyColor(option.value, null);
                                      }}
                                      type="button"
                                    >
                                      <span className="multi-select-color-swatch" style={{ background: palette.background, borderColor: palette.swatchBorder }} />
                                      <span>{defaultColorChoiceLabel}</span>
                                      {active ? <icons.check size={16} /> : <span className="multi-select-color-check-placeholder" />}
                                    </button>
                                  );
                                })()}
                              </div>
                              <div className="multi-select-color-columns">
                                {colorChoiceGroups.map((group) => (
                                  <div className="multi-select-color-group" data-color-group={group.key} key={group.key}>
                                    <div className="multi-select-color-group-title">{group.label}</div>
                                    <div className="multi-select-color-list">
                                      {group.choices.map((choice) => {
                                        const active = option.color === choice.value;
                                        const palette = namedChipPalette[choice.value];
                                        return (
                                          <button
                                            className={`multi-select-color-item ${active ? "active" : ""}`}
                                            data-color-choice={choice.value}
                                            key={choice.value}
                                            onPointerDown={(event) => {
                                              event.preventDefault();
                                              applyColor(option.value, choice.value);
                                            }}
                                            type="button"
                                          >
                                            <span className="multi-select-color-swatch" style={{ background: palette.background, borderColor: palette.swatchBorder }} />
                                            <span>{choice.label}</span>
                                            {active ? <icons.check size={16} /> : <span className="multi-select-color-check-placeholder" />}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : null}
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  ) : null}
                  </div>
                  {dragPreview != null && dragPreview.dropIndex === index ? (
                    <div className="option-field-drag-placeholder" style={{ minHeight: dragPreview.ghostHeight }} />
                  ) : null}
                </Fragment>
              );
            })}
            {canCreate ? (
              <button
                className="multi-select-option create"
                onPointerDown={(event) => {
                  event.preventDefault();
                  createOption();
                }}
                type="button"
              >
                <icons.addField size={14} />
                <span>{`Create "${draft.trim()}"`}</span>
              </button>
            ) : null}
          </div>
          {dragPreview ? (() => {
            const popoverRect = popoverContentRef.current?.getBoundingClientRect();
            const activeOption = optionMap.get(dragPreview.activeId);
            return (
              <div
                className="option-field-drag-ghost"
                style={{
                  height: dragPreview.ghostHeight,
                  left: popoverRect ? dragPreview.ghostLeft - popoverRect.left : dragPreview.ghostLeft,
                  top: popoverRect ? dragPreview.ghostTop - popoverRect.top : dragPreview.ghostTop,
                  width: dragPreview.ghostWidth,
                }}
              >
                {activeOption ? <span className="chip" style={chipStyleForValue(activeOption.color)}>{activeOption.label}</span> : null}
              </div>
            );
          })() : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function chipStyleForValue(color: EditorViewOptionColor | null) {
  const palette = namedChipPalette[color ?? "default"];
  return {
    background: palette.background,
    color: palette.color,
  };
}
