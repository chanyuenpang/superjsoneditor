# `data-editor` 数据编辑交互模式参考

<!-- state: current -->
## 当前基线

- `super-json-editor` 已有字段级脏标记、面包屑、双页/层叠导航和基础保存结果反馈。实现锚点分别位于 `src/editor/ValueInspector.tsx` 的 `isFieldDirty(...)` 与 `object-field-row--dirty`、`src/editor/EditorShell.tsx` 的 `isDirty`、`visiblePages`、breadcrumbs 和 `saveState`。
- 下述外部参考事实绑定到当前检出的 `vendor/data-editor` 提交 `fe2e3a8ea6422825d6e8fa062e005b53a9d25da5`。它们是迁移设计的依据，不代表 `super-json-editor` 已经实现对应能力。

## 可复用交互模式

### 统一草稿、提交与保存协调

- `vendor/data-editor/src/editing/useStableDraftInput.ts` 以稳定 draft 隔离输入过程和模型提交，并在失焦、卸载或显式调用时执行 `flushDraft()`；组合输入期间不会把中间态误当成最终提交。
- `vendor/data-editor/src/save-coordinator.ts` 按 `document`、`project-config`、`profile` 脏域协调 `pending`、`saving`、`error`、`blocked-confirmation` 状态。保存期间出现新修改时通过 `retryRequested` 和后续 dirty snapshot 再次调度，强制 flush 会持续到脏域清空或遇到阻断、延迟、错误结果。
- 可迁移的核心不是单个自动保存按钮，而是统一协议：活跃编辑器必须能 flush，保存器必须按域追踪脏状态，并能区分待保存、保存中、失败与需确认。

### 键盘效率与输入边界

- `vendor/data-editor/src/editing/TableTextCellEditor.tsx` 用 `Enter` 提交当前单元格、`Escape` 恢复聚焦时的初值；`vendor/data-editor/src/App.tsx` 提供 `Ctrl/Cmd+S` 保存和 `/` 聚焦搜索。
- 全局快捷键必须排除输入框等正在接收文本的目标；撤销当前单元格编辑与撤销整个文档是不同作用域，不能混为同一动作。

### 常驻且可行动的保存状态

- `vendor/data-editor/src/components/Toolbar.tsx` 常驻呈现“待保存 / 保存中 / 保存失败 / 待确认”，同时展示 Visible / Total 条目数。
- 团队共享视图使用独立显式保存入口，避免把个人浏览配置、共享配置和文档内容伪装成同一次保存。

### 上下文切换前先收束编辑

- `vendor/data-editor/src/App.tsx` 在切项目、重载、页面隐藏、运行入口动作、手动保存和服务生命周期操作前先调用 `flushActiveTextEditorDraft()`，再调用 `saveCoordinator.flush("flush")`。
- 对可能丢失未保存修改的项目切换、刷新或关闭操作，界面先确认；只提示而不 flush，或只 flush draft 而不等待保存协调器，都不能形成完整保护。

### 表格选择与控件操作分离

- `vendor/data-editor/src/table/DataTable.tsx` 只让普通数据单元格进入范围选择；`input`、`textarea`、`contenteditable`、编辑器、详情入口和弹出层等交互目标会退出选择路径。
- 全局 `Delete` 仅在焦点不位于文本输入控件时清空已选单元格。该边界适合 JSON 数组表格，能避免编辑字段、打开详情或操作弹窗时误改范围选择。

### 渐进式筛选

- `vendor/data-editor/src/components/ViewFilterBar.tsx` 先提供按字段添加的轻量筛选；已有规则以 chip 形式留在主界面。
- `vendor/data-editor/src/components/filters/AdvancedFilterPanel.tsx` 和 `AdvancedFilterGroupEditor.tsx` 再承载规则数量摘要、嵌套分组、逐项 AND/OR、复制、删除与新增子组；规则编辑器补充列表键盘导航和 `Enter` 确认。
- 复杂查询能力应按需展开，不能要求所有用户一开始就理解嵌套表达式树。

### 稳定的高密度布局骨架

- `vendor/data-editor/src/styles.css` 的 `.app-frame` 使用“可调宽左侧导航 / 中央工作区”网格；`DetailPanel.tsx` 与 `.detail-panel.primary` 通过宽度变量和拖拽把手提供可调宽右侧详情轨道。详情面板以覆盖方式从右侧展开，不触发表格主体重排，因此查看行详情时仍保留原表格上下文。
- `vendor/data-editor/src/components/Toolbar.tsx` 把当前路径与集合、搜索、弹性留白、Visible / Total 计数、保存状态、视图配置和操作按从左到右的稳定区域排列。工具栏是工作区的固定结构横栏，不依赖漂浮卡片承载主操作。
- `vendor/data-editor/src/styles.css` 将筛选区保持为独立横轨，筛选 chip 可横向滚动，尾部操作不占用表格列宽；数组型数据可以在不压缩主表格的情况下保留持续可见的筛选上下文。
- 同一文件以紧凑表头和行高、细分隔线、弱化表头字重，以及“浅色选区底色 + 锚点边界 + 行首强调线”组织表格扫描层级，避免依赖大面积高饱和色标记选择状态。
- 根级语义 token 统一表面、文字、边框、阴影、反馈色、字号、行高和 picker 状态，并通过 `[data-theme="dark"]` 覆盖暗色主题；密度和主题变化因此不需要在各组件中散落硬编码。

### 问题反馈贴近上下文

- `vendor/data-editor/src/detail/DetailPanel.tsx` 的 `PropertyHeading` 在字段标题处显示校验严重级别和消息。
- `vendor/data-editor/src/components/PrimaryKeyCandidateBanner.tsx` 对可处理的主键配置问题提供文件、集合上下文以及“暂不处理 / 设为主键或选择主键”动作。
- 字段问题应归属字段；跨字段或配置级问题才升级为带上下文和明确动作的 banner。

## 迁移约束与检查规则

- 先定义 editor flush 协议和保存脏域，再添加依赖它们的离开保护、快捷键或状态文案，避免每个编辑器各自实现提交时机。
- 保存中再次修改必须保留后续重试；不能用一次成功响应直接清除其后产生的 dirty 状态。
- 全局键盘、范围选择和删除逻辑都必须检查事件目标与焦点语义。
- 简单筛选和高级筛选应共享同一筛选模型，但保持分层入口。
- 迁移布局模式时应区分编辑器工作区与展示外壳：编辑区的工具栏、筛选轨、表格和详情轨道共享紧凑 token，展示页的渐变、大圆角和重阴影不应成为高密度编辑区的默认层级。
- 新鲜度检查应同时读取上述 `vendor/data-editor` 锚点及主项目对应实现；如果子模块提交变化，应重新确认版本绑定事实，而不是把本文件当作新提交的自动证明。
