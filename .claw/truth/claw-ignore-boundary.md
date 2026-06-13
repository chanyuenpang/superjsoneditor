# `.claw` 版本控制边界与清理核对

## 结论

这个仓库对 `.claw` 的版本控制边界已经收敛为两类内容：

- `.claw/project.json`，用于保留 claw 项目配置
- `.claw/truth/**`，用于保留可长期复用的 durable truth

其余 `.claw` 下的任务态、归档态和运行态内容都应视为本地工作状态，不进入版本控制。

## 边界规则

- `.claw/archive/**` 属于已归档任务内容，只对本地追踪有价值，不应提交到仓库。
- `.claw/tasks/**` 属于任务执行态数据，不是稳定知识源。
- `.claw/logs/**` 属于运行日志，更新频率高且噪声大，不应污染提交历史。
- `.claw/memory.sqlite` 属于本地记忆存储文件，不应被纳入版本控制。

## 相关代码

- 根 `.gitignore` 使用 `.claw/*` 作为总入口，再用 `!.claw/project.json`、`!.claw/truth/`、`!.claw/truth/**` 重新放行项目配置和 truth。
- `.claw/project.json` 仍然保留为 claw 项目的配置入口。
- `.claw/truth/SUMMARY.md` 作为 truth 索引，需要同步反映边界说明和清理核对方式。

## 清理索引与核对

当 `.claw/archive/**` 之前已经被提交进仓库时，仅靠 `.gitignore` 不足以让它们离开版本控制索引，仍然需要执行：

```bash
git rm -r --cached -- .claw/archive
```

清理完成后的核对方式可以直接用：

```bash
git ls-files .claw
```

预期结果应只剩：

- `.claw/project.json`
- `.claw/truth/**`

进一步检查忽略状态时，可以使用：

```bash
git status --short --ignored .claw
```

预期 `.claw/archive/`、`.claw/logs/`、`.claw/memory.sqlite`、`.claw/tasks/` 都应显示为 ignored，而不是新的待提交文件。

## 目的

这条规则的目标很明确：仓库只保留 claw 项目配置与 durable truth，避免任务归档、运行日志和本地状态文件持续进入提交历史，影响仓库可读性和后续协作。

## 本轮完成态

本轮任务已经完成清理、索引核对和远端同步，最终提交 SHA 为 `9fd80a22745e853abf1cb58dbb62fac40e842835`。

完成后本地 `git status --short --branch` 保持干净，只剩分支头信息，没有额外的 `.claw` 噪音。
