# view file schema override 与 schema-authoring demo toggle

## Status

accepted

## Context

schema-authoring 需要同时支持 default schema 和个人 view file schema。这里的 view file 不是另一条冲突分支，而是默认 schema 上的一层个人 override：用户在 view 模式下看到的是 resolved schema，写入时也必须明确落到当前激活层。

## Decision

- `resolveViewSchema(defaultSchema, viewSchema)` 负责合成最终 schema。
- 合成规则固定为：object 以 view/override keys 先、default-only keys 后的顺序深合并，array 以及同字段的 view 值以 view 覆盖 default。
- view schema 的初始值为空对象，这样首次切换到 View 时不会因为缺省 view file 改变可见结构。
- schema 写入由 `activeSchemaLayer` / `writeTarget` 决定：default 层写 default schema，view 层写 active view file。
- object/detail page 读取的也是同一套 active view resolved schema，overlay 规则不因页面类型而分叉。
- object/detail page 的 schema authoring 入口需要和 array/table page 对齐：Edit 模式允许直接改字段 `title`，并通过 `onUpdateDocumentSchema` 写入当前 active layer。
- object/detail page 的字段顺序也属于 schema authoring 范围，`commitObjectFieldOrder` 之类的重排操作同样会通过 `updateObjectSchema -> onUpdateDocumentSchema(..., "self", ...)` 落到 active layer。
- 为了避免 View / Default 切换后 UI 暂留上一层顺序，ObjectPage 需要在切层绘制前同步本地 `fieldOrder`，并以 schema property order signature 与 value key signature 作为同步依据。
- 当字段 `title` 为空时，写入逻辑删除 `title` 字段，让展示回退到字段 key。
- `schema-authoring` demo 的 View 控制采用稳定的 on/off toggle，而不是层状态说明器。
- 该控制的文案固定为 `View` / `视图`，状态通过 `aria-pressed` 和 `is-active` 表达，不在按钮文本里切换 `Default`。

## Consequences

- 默认 schema 后续新增的字段，只要没有被 view 覆盖，就会自动继承到 resolved schema。
- view 模式下的编辑不会污染 default schema，个人定制可以独立保存。
- demo 的初始视图与 default 完全一致，降低首次进入 View 时的认知偏差。
- toggle 语义保持稳定，便于测试、可访问性和视觉状态一致表达。
- object/detail 页面的 title 编辑现在和 array/table 页面的 schema authoring 同源，因此 view/default 隔离可以直接在 object 页观察和回归。
- object/detail 页面的字段顺序重排现在也受同一条 active layer 规则约束，因此 view 里调整顺序只会改写 view file，不会污染 default schema。
- plain object merge 改成 view keys 优先后，view 现在不仅能覆盖字段值，还能接管 object property 顺序，而 default-only 字段仍会补入最终 resolved schema。
- ObjectPage 的本地 fieldOrder 不再被视为独立真相，而是 active layer 的投影，必须跟随 schema signature 变化及时刷新。
- `title` 为空时删除字段能避免空字符串标题成为持久覆盖态，减少对字段名回退的歧义。

## Related Code

- `src/editor/view-schema.ts`
- `src/editor/schema.ts`
- `src/editor/EditorShell.tsx`
- `src/editor/ValueInspector.tsx`
- `src/App.tsx`
- `tests/react/editor-shell.test.tsx`
