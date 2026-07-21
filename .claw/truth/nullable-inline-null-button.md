# nullable primitive editor 的行内 `null` 按钮

<!-- state: current -->
## 当前行为

- `src/editor/ValueInspector.tsx` 里，支持设为 `null` 的 primitive/schema 现在使用标题栏内的细小扁平 `null` 按钮，而不是放在编辑器下方的大按钮。
- 对 object 字段行，`null` 动作渲染在 `.property-heading__actions` 中，并且排在 `.field-type` 类型图标左侧；类型图标的完整语义由 [`field-type-icons-and-accessible-labels.md`](field-type-icons-and-accessible-labels.md) 维护。
- 对单个 primitive 值页，`null` 动作也进入页面标题区域，保持和字段行一致的标题级布局。
- `withNullableControls(...)` 不再在编辑器控制器下方追加底部 `Set null` 按钮。

## 维护约束

- 当前值为 `null` 时，恢复 UI 仍然保留：界面会显示 `Set <type> value`，并提示该字段当前存的是 `null`。
- 行内按钮样式由 `src/styles.css` 中的 `.field-type-button` 提供，目标是让 `null` 动作看起来像轻量的标题操作，而不是主编辑控件。
- 这套布局是共享的标题级 helper `renderNullableTypeButton(...)` 驱动的，避免 object 行和单值页出现两套不同的 nullable 入口。

## 相关锚点

- `src/editor/ValueInspector.tsx`
- `src/styles.css`
- `tests/react/editor-shell.test.tsx`

## 验证规则

- 编辑器回归测试应覆盖 object 字段行和单个 primitive 值页的标题级 `null` 动作，以及当前值为 `null` 时的恢复入口。
- 布局断言应保持 `null` 动作位于类型图标左侧，并避免重新引入编辑器下方的 `Set null` 按钮。
