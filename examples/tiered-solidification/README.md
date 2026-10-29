# 子流程执行、检查与状态接续

从 SkVM 仓库运行：

```powershell
bun examples/tiered-solidification/run.ts --mode=failure
bun examples/tiered-solidification/run.ts --mode=success
```

示例使用普通 `executeRun → BareAgentAdapter → agent-loop`。本地程序真的写文件，随后调用一个**脚本化模型替身**完成余下工作；不消耗模型额度，也不是质量或节省效果实验。`--out=<新目录>` 可指定保存位置，省略时创建临时目录。

第一步产生三行数据；第二步在 failure 模式故意写出结构合法但 `sum=99` 的 JSON，进程仍退出 0。检查器拒绝产物并撤回该文件，模型替身收到有效前缀、诊断与剩余任务，修复摘要并写报告。`count.txt` 应为 `1`，表明第一步没有重做。success 模式则直接保留两步结果，继续写报告。

输出包括 `candidate.json`、`runtime.jsonl`、`result.json` 和 `work/`。结果标明实际模型调用为 0；`result.json` 的 steps 保存完整本地工具结果与交还状态，轨迹单列 checkpoint 事件。

真实模型使用现有普通命令的可选参数（需要一个已配置、获准使用的 provider；本轮没有运行该命令）：

```powershell
bun src/index.ts run --adapter=bare-agent --model=<provider/model> --prompt="Prepare rows and finish the summary and report" --workdir=<新工作目录> --subworkflow=<candidate.json>
```

工作目录需包含本次示例生成的 `input.json`、`prepare.cjs`、`summarize.cjs`，并使用相应 candidate。候选中绑定的脚本变化会触发 stale 状态，交回模型。输入数据在每次运行时重新读取；该示例的候选是开发者编写的，尚未实现自动分类与编写。官方账号现在支持同一子流程及普通 skill/自然任务。

检查包括结构、JSON 数值关系、执行前来源快照的内容保存，以及带 scope/status/details/usage 的外部评价接口；unknown/unavailable 不算通过。外部接口接通不等于翻译质量已经得到普遍验证。命令必须声明全部可变文件输出；第一版仅支持本地可恢复文件，不处理数据库、远端效果或跨会话恢复。失败后的模型答复仍需独立评价。

真实账号接线（使用已登录账号 gpt-5.6-sol/high）：

```powershell
bun examples/tiered-solidification/run.ts --mode=failure --channel=account --boundary=<reviewed-boundary.json> --out=<new-directory>
bun src/index.ts run --adapter=codex-account --model=gpt-5.6-sol --prompt="Prepare rows and finish the summary and report" --workdir=<workspace> --subworkflow=<candidate.json> --account-boundary=<reviewed-boundary.json> --account-trace=<new-directory>
```

2026-10-29 的 failure-confirmation 已观察真实 completed/delivered、前缀一次、summary.sum=6 和报告行数 3。首轮 failure-first 的预算关闭失败原件单独保留，随后只读查询 interrupted。账号原件含真实工具及回合、usage、检查点；内部请求数与 USD 未知。脚本示例实际模型调用仍为 0。候选由开发者编写，这些结果只支持接线与特定检查范围。

2026-10-29 CLI 具名确认 cli-confirmation 已核对 completed/delivered、report.txt 行数 3/合计 6、summary.sum=6、前缀一次。此前 cli-success 虽交付但未写报告，作为失败保留。四次真实运行及未知费用见 `results/skill-ir/tiered-solidification-20261029/summary.json`；155 项定向测试、712 断言及最终类型检查通过。
