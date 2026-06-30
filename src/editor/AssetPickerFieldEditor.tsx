import * as Popover from "@radix-ui/react-popover";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { EditorSchema } from "./schema";
import type { SchemaOptionItem, SchemaOptionValue } from "./SchemaOptionFieldEditor";
import { icons } from "./icons";

type AssetPickerFieldEditorProps = {
  ariaLabel: string;
  mode: "single" | "multi";
  value: SchemaOptionValue[];
  options: SchemaOptionItem[];
  readOnly: boolean;
  schema?: EditorSchema;
  placeholder?: string;
  onEdit: (value: SchemaOptionValue[]) => void;
  resolvePreviewUrl?: (value: string) => string | undefined;
  previewVisibility?: "all" | "options-only";
};

export function AssetPickerFieldEditor({
  ariaLabel,
  mode,
  value,
  options,
  readOnly,
  schema,
  placeholder = "",
  onEdit,
  resolvePreviewUrl,
  previewVisibility = "all",
}: AssetPickerFieldEditorProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  const optionMap = useMemo(() => {
    const map = new Map<string, SchemaOptionItem>();
    for (const option of options) {
      map.set(String(option.value), option);
    }
    for (const selected of value) {
      const key = String(selected);
      if (!map.has(key)) {
        map.set(key, {
          value: selected,
          label: key,
          color: null,
          description: key,
        });
      }
    }
    return map;
  }, [options, value]);

  const normalizedOptions = useMemo(() => [...optionMap.values()], [optionMap]);
  const selectedValues = useMemo(() => new Set(value.map((item) => String(item))), [value]);
  const filteredOptions = useMemo(() => {
    const needle = draft.trim().toLowerCase();
    if (!needle) {
      return normalizedOptions;
    }
    return normalizedOptions.filter((option) => {
      const label = option.label.toLowerCase();
      const rawValue = String(option.value).toLowerCase();
      const description = option.description?.toLowerCase() ?? "";
      return label.includes(needle) || rawValue.includes(needle) || description.includes(needle);
    });
  }, [draft, normalizedOptions]);

  const displayPreset = schema?.["x-editor"]?.display?.preset ?? "image";
  const allowPreview = schema?.["x-editor"]?.display?.kind === "image" || normalizedOptions.some((option) => Boolean(option.preview));
  const showSelectionPreview = allowPreview && previewVisibility === "all";
  const showOptionPreview = allowPreview;
  const selectedItems = value.map((item) => optionMap.get(String(item)) ?? {
    value: item,
    label: String(item),
    color: null,
    description: String(item),
  });

  function commit(nextValues: SchemaOptionValue[]) {
    onEdit(nextValues);
  }

  function selectSingle(optionValue: SchemaOptionValue) {
    commit([optionValue]);
    setOpen(false);
  }

  function addMulti(optionValue: SchemaOptionValue) {
    if (selectedValues.has(String(optionValue))) {
      return;
    }
    commit([...value, optionValue]);
    setDraft("");
  }

  function removeMulti(optionValue: SchemaOptionValue) {
    commit(value.filter((entry) => String(entry) !== String(optionValue)));
  }

  return (
    <div className={["asset-picker", `asset-picker--${mode}`].join(" ")}>
      {mode === "single" ? (
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button
              aria-label={ariaLabel}
              className={["asset-picker-trigger", value.length === 0 ? "is-empty" : ""].filter(Boolean).join(" ")}
              disabled={readOnly}
              onClick={(event) => event.stopPropagation()}
              type="button"
            >
              {selectedItems[0]
                ? (
                  <AssetPickerSelectionCard
                    item={selectedItems[0]}
                    mode="single"
                    preset={displayPreset}
                    resolvePreviewUrl={resolvePreviewUrl}
                    showPreview={showSelectionPreview}
                  />
                )
                : <span className="asset-picker-placeholder">{placeholder || "选择资源"}</span>}
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              className="asset-picker-popover"
              collisionPadding={12}
              onOpenAutoFocus={(event) => event.preventDefault()}
              sideOffset={6}
            >
              <AssetPickerOptions
                activeValue={value[0]}
                ariaLabel={ariaLabel}
                draft={draft}
                filteredOptions={filteredOptions}
                inputRef={inputRef}
                mode="single"
                onDraftChange={setDraft}
                onSelectOption={selectSingle}
                preset={displayPreset}
                readOnly={readOnly}
                resolvePreviewUrl={resolvePreviewUrl}
                showPreview={showOptionPreview}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ) : (
        <div className="asset-picker-array">
          <div className="asset-picker-array__rows">
            {selectedItems.length === 0 ? <div className="asset-picker-array__empty">{placeholder || "暂无已选资源"}</div> : null}
            {selectedItems.map((item, index) => (
              <div className="asset-picker-array__row" key={`${String(item.value)}-${index}`}>
                <div className="asset-picker-array__row-index">{index + 1}</div>
                <AssetPickerSelectionCard
                  item={item}
                  mode="multi"
                  preset={displayPreset}
                  resolvePreviewUrl={resolvePreviewUrl}
                  showPreview={showSelectionPreview}
                />
                {!readOnly ? (
                  <button
                    aria-label={`移除 ${item.label}`}
                    className="ghost-button compact-button asset-picker-array__remove"
                    type="button"
                    onClick={() => removeMulti(item.value)}
                  >
                    <icons.delete size={14} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {!readOnly ? (
            <Popover.Root open={open} onOpenChange={setOpen}>
              <Popover.Trigger asChild>
                <button
                  aria-label={`添加 ${ariaLabel}`}
                  className="ghost-button compact-button asset-picker-array__add"
                  type="button"
                >
                  <icons.addField size={14} />
                  <span>添加资源</span>
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  align="start"
                  className="asset-picker-popover"
                  collisionPadding={12}
                  onOpenAutoFocus={(event) => event.preventDefault()}
                  sideOffset={6}
                >
                  <AssetPickerOptions
                    ariaLabel={ariaLabel}
                    draft={draft}
                    filteredOptions={filteredOptions}
                    inputRef={inputRef}
                    mode="multi"
                    onDraftChange={setDraft}
                    onSelectOption={addMulti}
                    preset={displayPreset}
                    readOnly={readOnly}
                    resolvePreviewUrl={resolvePreviewUrl}
                    selectedValues={selectedValues}
                    showPreview={showOptionPreview}
                  />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          ) : null}
        </div>
      )}
    </div>
  );
}

function AssetPickerOptions(props: {
  ariaLabel: string;
  activeValue?: SchemaOptionValue;
  draft: string;
  filteredOptions: SchemaOptionItem[];
  inputRef: RefObject<HTMLInputElement>;
  mode: "single" | "multi";
  onDraftChange: (value: string) => void;
  onSelectOption: (optionValue: SchemaOptionValue) => void;
  preset: string;
  readOnly: boolean;
  resolvePreviewUrl?: (value: string) => string | undefined;
  selectedValues?: Set<string>;
  showPreview: boolean;
}) {
  return (
    <div className="asset-picker-popover__body">
      <input
        aria-label={`${props.ariaLabel} 搜索`}
        className="asset-picker-search"
        placeholder="按名称或路径筛选"
        ref={props.inputRef}
        value={props.draft}
        onChange={(event) => props.onDraftChange(event.target.value)}
      />
      <div className="asset-picker-options">
        {props.filteredOptions.length === 0 ? <div className="asset-picker-options__empty">没有匹配的资源</div> : null}
        {props.filteredOptions.map((option) => {
          const selected = props.mode === "single"
            ? String(props.activeValue ?? "") === String(option.value)
            : props.selectedValues?.has(String(option.value)) ?? false;
          return (
            <button
              className={["asset-picker-option", selected ? "is-selected" : ""].filter(Boolean).join(" ")}
              key={String(option.value)}
              onPointerDown={(event) => {
                event.preventDefault();
                if (!props.readOnly) {
                  props.onSelectOption(option.value);
                }
              }}
              type="button"
            >
              <AssetPickerSelectionCard
                item={option}
                mode="option"
                preset={props.preset}
                resolvePreviewUrl={props.resolvePreviewUrl}
                showPreview={props.showPreview}
              />
              {selected ? <icons.check size={16} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AssetPickerSelectionCard(props: {
  item: SchemaOptionItem;
  mode: "single" | "multi" | "option";
  preset: string;
  resolvePreviewUrl?: (value: string) => string | undefined;
  showPreview: boolean;
}) {
  const previewValue = props.item.preview ?? (typeof props.item.value === "string" ? props.item.value : null);
  const previewUrl = previewValue ? props.resolvePreviewUrl?.(previewValue) ?? previewValue : null;
  const showPreview = props.showPreview && Boolean(previewUrl);
  return (
    <div className={["asset-picker-card", `asset-picker-card--${props.mode}`].join(" ")}>
      {showPreview ? (
        <div className={["asset-picker-card__preview", `asset-picker-card__preview--${props.preset}`].join(" ")}>
          <img alt={props.item.label} className="asset-picker-card__image" src={previewUrl ?? undefined} />
        </div>
      ) : null}
      <div className="asset-picker-card__content">
        <div className="asset-picker-card__label">{props.item.label}</div>
        <div className="asset-picker-card__path">{props.item.description ?? String(props.item.value)}</div>
      </div>
    </div>
  );
}
