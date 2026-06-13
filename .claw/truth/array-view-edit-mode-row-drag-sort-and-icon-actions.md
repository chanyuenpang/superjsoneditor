# array 视图编辑模式、列可见性菜单与图标操作

## 结论

- `src/editor/ValueInspector.tsx` 是 `array` 视图的核心入口：它同时负责行拖拽排序、列可见性菜单，以及 `copy` / `delete` 等行级操作的渲染与回写。
- `src/styles.css` 为这些交互提供了对应样式，包括拖拽态、分组标题、拖拽把手、隐藏/显示切换按钮和 drop indicator。
- `tests/react/editor-shell.test.tsx` 已覆盖这组稳定行为，说明它们不是临时 UI 效果，而是可回归验证的长期约束。

## 稳定行为

### `array` 视图 Edit 模式的行拖拽排序

- 在 `Edit` 模式下，`array` 行可以通过拖拽把手重新排序。
- 拖拽结束后，新的行顺序会回写到文档值，保持表格顺序与数据顺序一致。
- 这条行为的实现锚点在 `src/editor/ValueInspector.tsx`，样式支撑在 `src/styles.css`，对应的回归测试在 `tests/react/editor-shell.test.tsx`。

### 列可见性菜单的可见/隐藏分组

- `array` 视图的第一列 visibility 菜单把 `visible` 项放在顶部，把 `hidden` 项放在底部。
- `visible` 分组按当前 `table.columns` 的实际顺序展示，`hidden` 分组按 object / schema 原始声明顺序展示。
- 这一顺序由 `visibleColumns` 与 `availableSchemaColumns` 的组合逻辑决定，入口在 `src/editor/ValueInspector.tsx`。
- `src/styles.css` 里的 `.hidden-fields-group-label`、`.hidden-field-item`、`.hidden-field-reorder-handle`、`.hidden-field-drop-indicator` 等样式负责把这个分组和拖拽交互表现出来。

### 可见列的拖拽重排与回写

- 当某个 `hidden` 列被切换为 `visible` 后，它会进入 `visible` 分组，并参与拖拽排序。
- `visible` 分组内的拖拽会通过 `reorderVisibleColumns` 回写到 `schema.x-editor.table.columns`，所以菜单顺序会和当前 table columns 顺序同步。
- 这意味着菜单里的可见列顺序不是纯展示态，而是 schema 的真实写入结果。

### 显式空 `table.columns` 的恢复入口

- 当 schema 显式声明了空的 `table.columns` 时，`array` 视图仍然保留 visibility 入口。
- `hasSchemaTableColumns` 会把显式空数组视为已配置状态，因此不会把这个入口误判成“没有表列定义”。
- 结果是：即使当前没有任何 `visible` 列，用户仍然可以从隐藏状态重新恢复列。

## 相关锚点

- `src/editor/ValueInspector.tsx`
- `src/styles.css`
- `tests/react/editor-shell.test.tsx`

## 验证

- `npm test -- tests/react/editor-shell.test.tsx`
- 结果：`111 tests passed`
