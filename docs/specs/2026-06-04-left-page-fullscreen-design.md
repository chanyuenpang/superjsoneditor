# Left Page Fullscreen 设计说明

## 1. 目标

为 `Super JSON Editor` 增加一个通用开关：

- `leftPageFullscreen?: boolean`

这个开关的职责不是新增一种布局模式，而是给现有布局增加一个统一行为：

- 当当前只显示左页、没有右页时，让左页自动铺满整个编辑器内容区
- 当出现右页时，恢复当前布局原本的双页语义

这个能力同时适用于：

- `stack-flow`
- `pinned-root`

## 2. 非目标

本次不做以下事情：

- 不新增新的 `layoutMode`
- 不改现有 `stack-flow / pinned-root` 的主导航模型
- 不修改现有 `push / pop / replace` 的整体语义
- 不为这个能力单独发明新的动画体系

## 3. 开关定义

`EditorShellProps` 新增：

```ts
leftPageFullscreen?: boolean
```

默认值：

- `false`

当为 `false` 时：

- 编辑器完全保持当前行为

当为 `true` 时：

- 如果当前可见页只有一页，则左页铺满整个编辑器宽度
- 如果当前存在第二页，则恢复双页布局

## 4. 行为规则

### 4.1 `stack-flow`

当 `leftPageFullscreen = true` 时：

- 只有一页时，当前页不再保持默认左槽宽，而是铺满整个可用区域
- 一旦进入第二页，恢复当前 `stack-flow` 的正常整页栈展示

关闭右页后：

- 回到单页态
- 左页再次自动铺满

### 4.2 `pinned-root`

当 `leftPageFullscreen = true` 时：

- 只有 root 左页时，root 铺满整个可用区域
- 一旦右页出现，恢复当前 `pinned-root` 的左右双栏布局

关闭右页后：

- 回到 root-only 单页态
- root 再次铺满整个可用区域

## 5. 右页关闭按钮

当满足以下条件时，右页右上角显示一个关闭按钮：

- `leftPageFullscreen = true`
- 当前存在右页

显示范围：

- `stack-flow`
- `pinned-root`

位置：

- 右页 `PageHeader` 的 actions 区域

行为：

- `stack-flow`：关闭当前右页，回到上一页单页态
- `pinned-root`：关闭当前右页，回到 root-only 单页态

这个按钮是一个显式的“关闭右页”入口，不引入新的导航状态结构。

## 6. 布局实现原则

### 6.1 单页全屏优先级

`leftPageFullscreen` 是一个比默认页宽策略更高优先级的显示规则。

也就是说：

- 开关关闭：走现有布局宽度规则
- 开关开启且只有一页：强制单页铺满
- 开关开启且存在右页：回到布局原本规则

### 6.2 不复制布局模式

该能力必须复用现有：

- `stack-flow`
- `pinned-root`

不能把它们派生成：

- `stack-flow-fullscreen`
- `pinned-root-fullscreen`

否则会把一个简单行为开关扩张成新的布局模式族。

## 7. 动画原则

本次不增加新的动画语义。

约束如下：

- 单页进入双页：沿用当前进入动画
- 双页关闭回单页：沿用当前返回/关闭动画
- `leftPageFullscreen` 只改变可见页宽度分配，不重写动效模型

## 8. 接口变更

`EditorShellProps` 增加：

```ts
leftPageFullscreen?: boolean
```

`ValueInspector / PageHeader` 增加一个可选动作入口：

```ts
onClosePage?: () => void
```

注意：

- 这个动作只在右页存在且开关打开时显示
- 左页不显示这个按钮

## 9. 测试要点

需要补的测试场景：

1. `stack-flow + leftPageFullscreen=false`
   - 行为保持不变

2. `stack-flow + leftPageFullscreen=true`
   - 单页时铺满
   - 进入第二页后恢复双页
   - 右页显示关闭按钮
   - 关闭后回到单页全屏

3. `pinned-root + leftPageFullscreen=false`
   - 行为保持不变

4. `pinned-root + leftPageFullscreen=true`
   - 只有 root 时铺满
   - 打开右页后恢复双页
   - 右页显示关闭按钮
   - 关闭后回到 root-only 全屏

5. 不影响现有导航
   - `push / pop / replace`
   - 引用展开
   - Raw 模式

## 10. 推荐实现顺序

1. 先在 `EditorShell` 中新增 `leftPageFullscreen` 判断
2. 再接右页关闭按钮
3. 最后补样式与测试
