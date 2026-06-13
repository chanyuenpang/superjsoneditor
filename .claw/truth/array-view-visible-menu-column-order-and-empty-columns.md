# array 视图 visibility 菜单列顺序与空 columns 入口

## 状态

已接受

## 背景

第一列的 `visibility` 菜单同时承担列显隐切换和列顺序编辑入口的职责。这个入口需要在 visible / hidden 两个分组之间保持稳定的排序语义，否则用户会在“当前可见列顺序”和“隐藏列恢复顺序”之间产生认知断裂。

## 决策

- `visible` 分组始终置顶，并与当前 `x-editor.table.columns` 的顺序同步。
- `hidden` 分组显示在 `visible` 后面，但默认顺序来自 object/schema 的原始字段顺序，而不是临时 UI 排序。
- 当用户把某个 `hidden` 列切换为 `visible` 后，这一列立即进入 `visible` 分组，并可以继续通过拖拽上下调整。
- 当 schema 显式声明为空 `table columns` 时，array 视图仍保留第一列的 `visibility` 入口，避免用户失去恢复可见列的路径。
- 菜单内拖拽产生的结果必须写回 schema 的 `table columns`，保证 UI 状态与数据模型一致。

## 影响

- `visible` 区域成为唯一需要用户持续维护的顺序基线，降低学习成本。
- `hidden` 区域只承担恢复入口和候选列表职责，不再引入额外的临时排序。
- 空 `columns` 场景不再形成“无法重新开启可见列”的死角。

## 相关代码

- `src/editor/ValueInspector.tsx`
- `src/styles.css`
- `tests/react/editor-shell.test.tsx`

