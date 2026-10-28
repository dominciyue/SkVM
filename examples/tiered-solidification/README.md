# 子流程执行、检查与状态接续

从 SkVM 仓库运行：

```powershell
bun examples/tiered-solidification/run.ts --mode=failure
bun examples/tiered-solidification/run.ts --mode=success
```

示例使用普通 `executeRun → BareAgentAdapter → agent-loop`。本地程序真的写文件，随后调用一个**脚本化模型替身**完成余下工作；不消耗模型额度，也不是质量或节省效果实验。`--out=<新目录>` 可指定保存位置，省略时创建临时目录。

第一步产生三行数据；第二步在 failure 模式故意写出缺少 `sum` 的 JSON，进程仍退出 0。检查器拒绝产物并撤回该文件，模型替身收到有效前缀、诊断与剩余任务，修复摘要并写报告。`count.txt` 应为 `1`，表明第一步没有重做。success 模式则直接保留两步结果，继续写报告。

输出包括 `candidate.json`、`runtime.jsonl`、`result.json` 和 `work/`。结果标明实际模型调用为 0；`result.json` 的 steps 保存完整本地工具结果与交还状态，轨迹单列 checkpoint 事件。

真实模型使用现有普通命令的可选参数（需要一个已配置、获准使用的 provider；本轮没有运行该命令）：

```powershell
bun src/index.ts run --adapter=bare-agent --model=<provider/model> --prompt="Prepare rows and finish the summary and report" --workdir=<新工作目录> --subworkflow=<candidate.json>
```

工作目录需包含本次示例生成的 `input.json`、`prepare.cjs`、`summarize.cjs`，并使用相应 candidate。候选中绑定的脚本变化会触发 stale 状态，交回模型。输入数据在每次运行时重新读取；该示例的候选是开发者编写的，尚未实现自动分类与编写。官方账号 adapter 当前仍是授权研究入口，这个子流程开关首版支持 bare-agent。

检查范围是声明文件的存在性、最小字节数、JSON 解析与必要字段，业务语义还需要专门的检查器。命令必须声明全部可变文件输出；第一版仅支持本地可恢复文件，不处理数据库、远端效果或跨会话恢复。失败后的模型答复仍需独立评价。
