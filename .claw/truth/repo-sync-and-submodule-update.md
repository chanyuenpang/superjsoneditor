# 主仓库与 `vendor/data-editor` 的安全同步

## 结论

这个仓库的引用项目是 `vendor/data-editor` 子模块，定义在 `.gitmodules`，指向 `https://github.com/VeewoGames/data-editor.git`。

同步主仓库和子模块时，可靠顺序是先 `fetch`，再比较 `HEAD` 与 `origin/master`，最后才决定是否移动检出点。

如果主仓库处于 detached HEAD 且带有本地 `.claw` 修改，刷新远端是安全的，但不要默认执行 `pull` 或分支切换，除非更新路径已经明确。

如果 `vendor/data-editor` 也是 detached 且工作区干净，可以用 `git -C vendor/data-editor checkout --detach origin/master` 推进到最新远端提交；这样会有意更新 superproject 里的 gitlink。

## 关联代码

- `.gitmodules`
- `vendor/data-editor`

## 验证标准

- 主仓库和子模块都先执行 `fetch`。
- 只有在确认 `HEAD` 与 `origin/master` 不一致、并且确实需要移动时，才执行检出或分支切换。
- 子模块推进后，superproject 的 gitlink 应同步反映新提交。
