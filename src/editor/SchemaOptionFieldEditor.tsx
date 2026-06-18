import * as Popover from "@radix-ui/react-popover";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorViewOptionColor } from "./schema";
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
  onSetOptionColor?: (optionValue: SchemaOptionValue, color: EditorViewOptionColor | null) => void;
};

type EditingState = {
  value: string;
  label: string;
};

const colorChoices: Array<{ value: EditorViewOptionColor | "default"; label: string }> = [
  { value: "default", label: "Default" },
  { value: "gray", label: "Gray" },
  { value: "orange", label: "Orange" },
  { value: "yellow", label: "Yellow" },
  { value: "green", label: "Green" },
  { value: "blue", label: "Blue" },
  { value: "gold", label: "Gold" },
  { value: "red", label: "Red" },
];

const namedChipPalette: Record<EditorViewOptionColor | "default", { background: string; color: string }> = {
  default: { background: "#eef2f7", color: "#40516b" },
  gray: { background: "#eceff3", color: "#556270" },
  orange: { background: "#fff0de", color: "#9f580a" },
  yellow: { background: "#fff5cb", color: "#876300" },
  green: { background: "#e5f6ea", color: "#1f6b3a" },
  blue: { background: "#e4f0ff", color: "#1e5eb8" },
  gold: { background: "#fff2c6", color: "#7a5b00" },
  red: { background: "#ffe4e1", color: "#8f3123" },
};

export function SchemaOptionFieldEditor({
  ariaLabel,
  mode,
  value,
  options,
  readOnly,
  placeholder = "",
  allowAuthoring,
  onEdit,
  onCreateOption,
  onRenameOption,
  onDeleteOption,
  onMoveOption,
  onSetOptionColor,
}: SchemaOptionFieldEditorProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<EditingState | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

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
  const canCreate = allowAuthoring && draft.trim().length > 0 && !normalizedOptions.some((option) => String(option.value).toLowerCase() === draft.trim().toLowerCase());
  const canManageOption = Boolean(onRenameOption || onDeleteOption || onMoveOption || onSetOptionColor);

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

  function applyColor(optionValue: SchemaOptionValue, color: EditorViewOptionColor | "default") {
    onSetOptionColor?.(optionValue, color === "default" ? null : color);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          aria-label={ariaLabel}
          className="multi-select-trigger"
          disabled={readOnly}
          onClick={(event) => event.stopPropagation()}
          type="button"
        >
          <div aria-label={`${ariaLabel} selected values`} className={mode === "single" ? "select-chips-cell" : "chips-cell"}>
            {value.length === 0 && placeholder ? <span className="select-placeholder">{placeholder}</span> : null}
            {value.map((item, index) => {
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
        <Popover.Content className="multi-select-popover" align="start" collisionPadding={12} sideOffset={6} onOpenAutoFocus={(event) => event.preventDefault()}>
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
            {filteredOptions.map((option) => {
              const selected = selectedValues.has(String(option.value));
              return (
                <div className={`multi-select-option-row ${selected ? "selected" : ""}`} key={String(option.value)}>
                  <button
                    className={`multi-select-option ${selected ? "selected" : ""}`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      if (!readOnly) toggleOption(option.value);
                    }}
                    type="button"
                  >
                    <icons.dragHandle size={14} />
                    <span className="chip" style={chipStyleForValue(option.color)}>{option.label}</span>
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
                          title="Edit option"
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
                              <span>Delete</span>
                            </button>
                          ) : null}
                          {onMoveOption ? (
                            <>
                              <button
                                className="multi-select-option-action"
                                onPointerDown={(event) => {
                                  event.preventDefault();
                                  onMoveOption(option.value, "up");
                                }}
                                type="button"
                              >
                                <icons.previous size={16} />
                                <span>Move up</span>
                              </button>
                              <button
                                className="multi-select-option-action"
                                onPointerDown={(event) => {
                                  event.preventDefault();
                                  onMoveOption(option.value, "down");
                                }}
                                type="button"
                              >
                                <icons.next size={16} />
                                <span>Move down</span>
                              </button>
                            </>
                          ) : null}
                          {onSetOptionColor ? (
                            <>
                              <div className="multi-select-option-divider" />
                              <div className="multi-select-option-section-title">Color</div>
                              <div className="multi-select-color-list">
                                {colorChoices.map((choice) => {
                                  const active = (option.color ?? "default") === choice.value;
                                  const palette = namedChipPalette[choice.value];
                                  return (
                                    <button
                                      className={`multi-select-color-item ${active ? "active" : ""}`}
                                      key={choice.value}
                                      onPointerDown={(event) => {
                                        event.preventDefault();
                                        applyColor(option.value, choice.value);
                                      }}
                                      type="button"
                                    >
                                      <span className="multi-select-color-swatch" style={{ background: palette.background, borderColor: palette.color }} />
                                      <span>{choice.label}</span>
                                      {active ? <icons.check size={16} /> : <span className="multi-select-color-check-placeholder" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          ) : null}
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  ) : null}
                </div>
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
