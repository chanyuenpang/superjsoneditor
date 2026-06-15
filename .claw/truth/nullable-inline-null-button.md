# nullable primitive editor 的行内 `null` 按钮

## 结论

- `src/editor/ValueInspector.tsx` 里，支持设为 `null` 的 primitive/schema 现在使用标题栏内的细小扁平 `null` 按钮，而不是放在编辑器下方的大按钮。
- 对 object 字段行，`null` 动作渲染在 `.property-heading__actions` 中，并且排在 `.field-type` 标签左侧。
- 对单个 primitive 值页，`null` 动作也进入页面标题区域，保持和字段行一致的标题级布局。
- `withNullableControls(...)` 不再在编辑器控制器下方追加底部 `Set null` 按钮。

## 稳定行为

- 当前值为 `null` 时，恢复 UI 仍然保留：界面会显示 `Set <type> value`，并提示该字段当前存的是 `null`。
- 行内按钮样式由 `src/styles.css` 中的 `.field-type-button` 提供，目标是让 `null` 动作看起来像轻量的标题操作，而不是主编辑控件。
- 这套布局是共享的标题级 helper `renderNullableTypeButton(...)` 驱动的，避免 object 行和单值页出现两套不同的 nullable 入口。

## 相关锚点

- `src/editor/ValueInspector.tsx`
- `src/styles.css`
- `tests/react/editor-shell.test.tsx`

## 验证

- `npm test -- tests/react/editor-shell.test.tsx`
- `npm test`
