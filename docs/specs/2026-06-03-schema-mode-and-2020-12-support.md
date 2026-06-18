# Super JSON Editor Schema 模式与 2020-12 支持设计

## 1. 背景

`Super JSON Editor` 当前已经具备通用 JSON 编辑能力，包括：

- 对象 / 数组 / 基础值的栈式导航
- `stack-flow / pinned-root` 两种正式布局模式
- 多文档编辑
- 基于字符串引用的跨文档跳转
- host 驱动的保存 / 重载
- 基础 schema 标题、描述、枚举与错误展示

但现阶段的 schema 能力仍然偏轻量，尚不足以支撑“专业编辑器”模式：

- schema 约束主要停留在局部 UI 展示层
- host 侧的 schema 校验与编辑器前端约束没有形成统一闭环
- 数组新增项、对象新增字段、nullable、联合分支等关键交互尚未由 schema 完整驱动

与此同时，真实宿主场景已经成为很好的压力样本：它们需要更强的 schema 约束编辑体验，但这些能力本质上并不是某个单一项目的专属需求，而是通用 JSON 编辑器走向专业化时必须具备的能力。

因此，本设计的目标不是做一个项目专用编辑器，而是：

**以通用 JSON 编辑器为内核，以 JSON Schema 2020-12 为专业增强层，并以真实宿主场景作为验收样本。**

## 2. 设计目标

### 2.1 保持通用 JSON 编辑器定位

`Super JSON Editor` 必须继续保持通用 JSON 编辑能力，不与某个业务项目强绑定。

这意味着：

- 没有 schema 的文档，仍然可以自由编辑
- 不同宿主可以选择 `stack-flow` 或 `pinned-root`
- schema 只是增强层，而不是把编辑器改造成业务专用表单系统
- 真实宿主场景只用于驱动能力打磨和回归验证，不允许在内核里写死项目专用规则

### 2.2 引入“强约束 schema 模式”

当 host 为某个 JSON 文档提供 schema 时，编辑器应从“自由 JSON 模式”切换到“专业 schema 模式”。

在该模式下：

- 编辑行为受 schema 强约束
- 新增字段、新增数组项、字段类型、可选分支都由 schema 决定
- UI 不应鼓励用户输入 schema 未允许的结构
- 保存时必须通过 schema 校验

### 2.3 Raw 模式不再是绕过约束的后门

Raw JSON 模式仍然保留，但它是一个 **host 可选开关能力**，而不是默认必须暴露的入口。

规则如下：

- 是否显示 Raw 开关由 host 决定
- 无 schema 文档下，Raw 模式只是另一种编辑方式
- 有 schema 文档下，Raw 模式仍然必须经过同一套 schema 校验
- Raw 模式不能绕过 schema 直接保存非法内容

## 3. 标准选择

### 3.1 主标准：JSON Schema 2020-12

后续 schema 专业能力以 **JSON Schema 2020-12** 为主标准。

采用该标准的原因：

- 它是当前更现代、正式的 JSON Schema 标准
- 更适合作为长期能力模型的基础
- 能为后续联合类型、数组约束、对象约束等能力提供更清晰的语义基础

### 3.2 兼容策略

首阶段不以 `draft-07` 为主设计目标，但允许有限兼容：

- 编辑器内核按 `2020-12` 思维设计
- 如 host 继续提供与 `draft-07` 常用子集兼容的 schema，可在能力允许范围内工作
- 不承诺对所有历史 draft 的全量语义逐一对齐

## 4. 模式模型

编辑器需要显式区分两种工作模式。

### 4.1 自由 JSON 模式

触发条件：

- host 没有提供 schema

行为特征：

- 用户可以自由增删改 JSON 结构
- 新增对象键与数组项不受 schema 限制
- Raw 模式可选
- 保存时仅依赖 host 自己的外部校验策略

### 4.2 Schema 专业模式

触发条件：

- host 为当前文档提供 schema

行为特征：

- 编辑器按 schema 渲染和约束结构
- 保存前必须通过 schema 校验
- UI 优先提供“合法编辑路径”，而不是让用户先乱改再报错
- Raw 模式若开启，也必须参与同一套校验闭环

## 5. 第一版支持范围

第一版不追求完整覆盖 JSON Schema 2020-12，而是先做一个 **可用最小集**。

### 5.1 对象约束

首版支持：

- `type: "object"`
- `properties`
- `required`
- `additionalProperties`
- `default`

首版预期行为：

- 对象字段顺序优先按 schema `properties` 排列
- 必填字段有明确标记
- 若 `additionalProperties` 为 `false`，用户不能随意新增 schema 外字段
- 若允许新增字段，也应清楚区分“schema 已声明字段”与“额外字段”
- 新建对象时，优先按 schema 推导默认结构

### 5.2 数组约束

首版支持：

- `type: "array"`
- `items`
- 基于 `items` 的默认新增项生成

首版预期行为：

- 数组项如果是对象，新增行不再依赖现有样本推断，而优先由 `items` schema 决定
- 数组项如果是基础类型，也应根据 `type` / `default` 生成初始值
- 深层嵌套数组与对象仍然复用现有栈式导航模型

### 5.3 基础类型系统

首版支持：

- `string`
- `number`
- `integer`
- `boolean`
- `null`
- `enum`
- `const`
- 基础 nullable 场景：例如 `type: ["string", "null"]`

首版预期行为：

- `enum` 使用受约束的选择控件
- `const` 视为只读常量值
- `integer` 与 `number` 应在输入体验上有最小区分
- nullable 需要有明确的 UI 表达，而不是仅靠用户手输 `"null"`

### 5.4 基础组合语义

首版支持：

- `oneOf`
- `anyOf`

首版目标不是完整自动推断所有复杂组合情形，而是先建立一个稳定的基础分支模型：

- 用户能看到当前值命中的分支
- 用户可以在可选分支之间显式切换
- 切换后由分支 schema 重新推导结构或默认值

## 6. 第一版不承诺支持的能力

为了控制范围，以下能力不纳入首版强承诺：

- `allOf`
- `if / then / else`
- `patternProperties`
- `dependentSchemas`
- 复杂格式校验专用 UI（如日期、邮箱、正则等）
- 业务专用引用编辑器
- 针对某个项目的字段专用组件

这些能力后续可逐步扩展，但不能阻塞第一版专业 schema 模式落地。

## 7. 交互原则

### 7.1 先提供合法路径，再显示错误

专业 schema 模式下，编辑器应优先通过交互设计减少非法输入，而不是完全依赖保存时报错。

例如：

- 不允许新增 schema 外字段时，UI 应直接禁止该行为
- 已知是 `enum` 的字段，应优先用选择器，而不是自由文本框
- 已知数组项结构时，应生成合法默认项，而不是空对象或从样本瞎猜

### 7.2 错误仍然需要可见

即使提供了强约束交互，也不能取消校验层。

原因：

- Raw 模式仍可能引入非法值
- host 可能载入了旧数据或外部生成数据
- 用户可能在复杂分支切换后留下半完成状态

因此，编辑器仍需保留清晰的字段级与文档级错误展示。

### 7.2.1 视图 schema 默认复用规则

在同一 field 同时出现在 `object` 视图与 `array` 视图时，编辑器默认遵循“先复用、后覆盖”的 schema 规则：

- 如果 `array` 视图没有为该 field 单独提供列级 schema，则默认复用 `object` schema
- 复用范围包括：
  - `x-editor.object.preset`
  - `x-editor.display`
  - field 级对象投影 schema
- 如果 `array` 视图显式声明了更具体的 schema，则以 `array` 侧为准

这样可以避免宿主为了同一个 field，在 object / array 两个视图里重复维护两份等价 schema。

### 7.3 Raw 模式属于高级能力

Raw 模式不应默认等同于主编辑路径。

更合理的定位是：

- 对无 schema 文档：一种方便的自由编辑方式
- 对有 schema 文档：高级用户排障和批量编辑工具
- 是否开放，由 host 自己控制

## 8. 与 Host 的边界

`Super JSON Editor` 继续保持“内核 + host 扩展”的结构。

编辑器内核负责：

- schema 驱动的 UI 渲染
- schema 驱动的编辑约束
- 文档级与字段级错误显示
- 模式切换（自由模式 / schema 模式 / raw 模式）

host 负责：

- 提供文档内容
- 提供 schema
- 决定布局模式
- 决定是否开放 Raw 模式
- 决定保存动作如何落地
- 决定是否叠加额外业务校验

如果宿主需要：

- 资源类型切换
- 资源级 CRUD
- 固定 root 工作台上的外层 chrome
- 编译 / 发布 / 索引等工作流

这些都继续属于 host，不下沉到 editor core。

## 8.1 固定 root 模式与 schema 模式的关系

`pinned-root` 与 schema 模式是两条正交维度：

- `stack-flow + free`
- `stack-flow + schema`
- `pinned-root + free`
- `pinned-root + schema`

这意味着：

- `pinned-root` 不是资源管理器专用模式
- 它只是“固定 root 展示方式”的正式 API
- schema 是否生效，仍只取决于 host 是否提供 schema

## 9. 与宿主项目的关系

具体宿主项目可以作为重点验收样本，但不是架构来源。

它的价值在于帮助验证以下通用能力是否足够：

- 严格对象结构
- 深层嵌套对象与数组
- 数组项 schema 驱动新增
- nullable 字段
- `oneOf` / `anyOf` 的结构分支
- 字符串型资源引用字段的通用展示与后续扩展空间

如果某项能力只能用写死宿主项目规则才能实现，那么这项能力就不符合本设计目标。

## 10. 推荐推进顺序

### 第一阶段：校验闭环

- 明确 schema 模式与自由模式
- 统一保存前 schema 校验
- Raw 模式也接入同一套校验结果

### 第二阶段：对象 / 数组约束编辑

- `properties`
- `required`
- `additionalProperties`
- `items`
- `default`

### 第三阶段：类型与分支

- `enum`
- `const`
- nullable
- `oneOf` / `anyOf`

### 第四阶段：host 集成收口

- 将 `json-editor-host` 正式切换到 schema 模式
- 用真实宿主 schema 做回归验证

## 11. 本文档结论

`Super JSON Editor` 后续 schema 路线正式定义为：

- **产品定位**：通用 JSON 编辑器
- **布局模式**：`stack-flow` 与 `pinned-root`
- **增强方向**：提供以 `JSON Schema 2020-12` 为核心的专业 schema 模式
- **工作模式**：无 schema 时自由编辑；有 schema 时强约束编辑
- **Raw 模式**：host 可选；启用后仍受 schema 校验约束
- **第一版范围**：对象约束 + 数组约束 + 基础类型系统 + 基础组合语义
- **验证样本**：使用真实宿主场景进行打磨，但不把能力做成项目专用逻辑

## 12. Schema-Based CRUD 边界

随着 `pinned-root` 与 schema 专业模式落地，后续 CRUD 能力需要明确分层：

- **节点级 CRUD 属于 editor**
  - 对象字段新增 / 删除
  - 数组项新增 / 删除 / 复制
  - primitive 值修改
  - `nullable / oneOf / anyOf` 分支切换
- **资源级 CRUD 属于 host**
  - 新建资源文件
  - 复制资源文件
  - 重命名资源文件
  - 删除资源文件
  - 保存后编译、索引、发布等工作流

这条边界是 schema 专业模式的重要约束：

- `super-json-editor` 负责提供 **schema 驱动的合法节点编辑路径**
- `host` 负责把这些能力接到真实资源工作流
- 不允许为了某个宿主的资源操作，把资源级 API 下沉进 editor core

对应执行计划见：

- [Schema-Based CRUD 实施计划](../plans/2026-06-03-schema-based-crud-plan.md)
