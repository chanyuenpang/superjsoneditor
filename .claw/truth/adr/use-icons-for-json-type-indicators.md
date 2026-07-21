# ADR: 使用图标呈现 JSON 字段类型并保留文字语义

## Context

字段标题、primitive 值页和数组列头都需要提示 JSON 值类型。持续显示 `string`、`number` 等文字会占用高密度编辑区的横向空间，但只显示没有名称的图形又会削弱悬停识别和辅助技术语义。

当前实现事实与代码锚点由 [`../field-type-icons-and-accessible-labels.md`](../field-type-icons-and-accessible-labels.md) 维护；本 ADR 只拥有类型标记的表现形式与可访问性取舍。

## Decision

- 字段类型以紧凑图标呈现，不在编辑区持续显示类型文字。
- 在字段标题和数组列头中，类型图标作为字段名或列名的前缀；字段状态与操作继续位于右侧操作区，避免将类型信息与状态/操作混置。
- `string`、`number`、`boolean`、`null`、`object`、`array` 和 `reference` 使用一套共享映射，并复用项目已有的 Tabler 图标体系。
- 类型名称仍是交互语义的一部分：图标容器必须提供悬停提示和辅助技术可读名称，内部装饰性 SVG 不重复暴露名称。
- 所有类型显示入口共享同一渲染函数和映射，避免对象字段、primitive 页面、引用错误与数组列头产生不同图标语义。

## Alternatives

### 保留常驻文字标签

不采用。文字最直接，但在字段标题和表格列头中持续占用横向空间，不符合紧凑编辑区的密度目标。

### 使用无文字语义的纯图标

不采用。它虽然最紧凑，却把类型识别完全交给视觉记忆，并使辅助技术无法获得等价信息。

### 各入口自行选择图标

不采用。局部选择会让同一 JSON 类型在不同页面出现不同视觉语义，也容易遗漏 tooltip 或 ARIA 属性。

## Consequences

- 高频编辑界面获得更紧凑、稳定的标题与列头布局。
- 用户需要逐步熟悉图标含义，因此悬停类型名不能移除。
- 新增类型或替换图标时必须集中更新共享映射，并同步检查所有入口的可访问名称与视觉一致性。
- 图标颜色可以继续沿用既有类型 tone，但颜色和图形都不能替代文字语义。

## Ownership

- 决策所有者：本 ADR
- 当前行为与验证规则：`.claw/truth/field-type-icons-and-accessible-labels.md`
- 实现入口：`src/editor/icons.ts`、`src/editor/ValueInspector.tsx`、`src/styles.css`
