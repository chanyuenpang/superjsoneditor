# JSON 字段类型图标与可访问语义

<!-- state: current -->
## 当前行为

- `src/editor/icons.ts` 的 `jsonTypeIcons` 使用现有 Tabler React 图标为 `string`、`number`、`boolean`、`null`、`object`、`array` 和 `reference` 提供统一映射，不引入新的图标依赖。
- `src/editor/ValueInspector.tsx` 的 `renderTypeIcon(...)` 是类型标记的共享渲染入口。对象字段标题、primitive 值页、reference error 标题和只读数组列头均通过该入口显示紧凑图标，不再占用横向空间显示类型文字。
- 对象字段标题、primitive 值页和只读数组列头将类型图标作为名称前缀，保持“图标在左、字段名或列名在右”的扫描顺序；字段状态与操作仍保留在标题右侧的操作区，不与类型信息混置。
- 图标容器保留类型名作为 `title` 和 `aria-label`，内部 SVG 使用 `aria-hidden="true"`，因此悬停提示与辅助技术都仍能识别类型。
- `src/styles.css` 的 `.field-type--icon` 将类型标记收敛为 `16px × 16px` 的居中 inline-flex 容器；既有类型 tone class 继续提供颜色语义。

## 维护约束

- 新增或调整 JSON 类型时，应在 `jsonTypeIcons` 中维护映射，并继续通过 `renderTypeIcon(...)` 接入各显示入口，避免各页面自行选择图标或复制可访问属性。
- 字段和数组列头的类型图标应继续放在名称前，状态与操作继续使用右侧操作区，避免把类型信息重新放回状态/操作区。
- 图标不能成为类型语义的唯一载体：容器必须保留可访问名称和悬停提示，装饰性 SVG 本身保持对辅助技术隐藏。
- 数组列头的类型图标只替代类型文字；列名和列头自身的 `aria-label` 仍由原有列语义负责。

## 相关锚点

- `src/editor/icons.ts`
- `src/editor/ValueInspector.tsx`
- `src/styles.css`
- `tests/react/editor-shell.test.tsx`

## 验证规则

- 编辑器回归测试应覆盖七种类型映射、对象字段与 primitive 页类型标记、reference error，以及只读数组列头。
- 可访问性断言应同时确认类型名仍可读取或悬停查看，并确认内部 SVG 不产生重复名称。
