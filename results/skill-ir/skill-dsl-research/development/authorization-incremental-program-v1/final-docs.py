import json
import re
from pathlib import Path

base = Path(__file__).resolve().parent
repo = base.parents[4]
summary = json.loads((base / "summary.json").read_text(encoding="utf-8"))
accounting = json.loads((base / "accounting.json").read_text(encoding="utf-8"))
review = json.loads((base / "review.json").read_text(encoding="utf-8"))
confirmation = next(r for r in accounting["runs"] if r["attempt"] == "shared-fix-compact-rules")
result_link = "../../results/skill-ir/skill-dsl-research/development/authorization-incremental-program-v1/summary.json"
outcome = f"BH有限队列以`completed-with-unmet-criteria`收束，{summary['modelRuns']}次真实调用全部交付，无活动/未知请求。渐进编译、持久草稿、patch、compact/full和按需详情已接通；自动稿三次保留4步但未补齐版本/文件主链。Download与ShareLink共14离线场景通过。首个同epoch P对照为tradeoff：compact成本降低但答案退化；一次规则投影修复确认另列。"

def edit(relative, transform):
    p = repo / relative
    raw = p.read_bytes().decode("utf-8")
    crlf = "\r\n" in raw
    text = transform(raw.replace("\r\n", "\n"))
    p.write_bytes((text.replace("\n", "\r\n") if crlf else text).encode("utf-8"))

edit("docs/skill-ir/current-status.md", lambda t: re.sub(r"^\*\*\[BH0.*$", f"**{outcome}** [可运行Download](../../examples/authorization-assessment/download-workflow/README.md)、[ShareLink离线例](../../examples/authorization-assessment/share-create-workflow/README.md)、[结果与分轴结论]({result_link})。当前最小剩余责任是隔离作者补齐source-supported版本/返回关系，并保持备选分支可见；未建立稳定净收益。", t, count=1, flags=re.M).replace("已授权待开发，聚焦资源步骤局部修复、持久草稿与实际消费减负", "有限队列完成、自动主链与稳定收益未达；实际程序、首失败、修复和分轴结论已归档"))
edit("docs/skill-ir/skill-ir-aot-optimization-plan.md", lambda t: re.sub(r"^- 当前任务书：.*$", "- 当前任务书：[BH0–BH17](../superpowers/plans/2026-10-12-authorization-incremental-authoring-and-efficient-consumption.md)，`completed-with-unmet-criteria`。实际接管2c64f50f；工程及有限队列完成，自动主链与稳定收益未达，见[summary](" + result_link + ")。", t, count=1, flags=re.M))
taskbook = "docs/superpowers/plans/2026-10-12-authorization-incremental-authoring-and-efficient-consumption.md"
edit(taskbook, lambda t: re.sub(r"^状态：.*$", "状态：`completed-with-unmet-criteria`。" + outcome + " 联合1943pass/1skip，末次投影修复后39定向pass；双类型、15文档测试及当前链接检查通过。以下勾选表示执行责任已处理（条件项含不适用），不表示每个研究验收目标达标；实际值见本轮summary/acceptance-matrix/review/accounting。", t, count=1, flags=re.M).replace("- [ ]", "- [x]"))
edit("docs/skill-ir/skill-ir-aot-optimization-spec.md", lambda t: t.replace("本节合同正在实施；BG原件保持。资源逐项编译和控制屏障已有红绿证据，实际编写/消费效果仍待运行。", "本节工程与有限队列已收束；BG原件保持。自动4步原稿仍未补齐主链；P首对tradeoff及一次具名规则投影确认分别保留，稳定净收益未建立。"))
confirm_text = f"**BH最终收束。** 六次逻辑尝试全部completed；input合计{accounting['totals']['input']:,}（含cache{accounting['totals']['cacheRead']:,}）/output{accounting['totals']['output']:,}，{accounting['totals']['tools']}工具。具名compact规则确认使用{confirmation['usage']['input']:,} input/{confirmation['usage']['output']:,} output/{confirmation['totalTools']}工具/{confirmation['durationMs']:,}ms，逐题结论为{review['answers']['P-compact-shared-fix-compact-rules']['quality']}，整题{review['answers']['P-compact-shared-fix-compact-rules']['wholeTask']}。该件是presentation修订后的单独确认，不能覆盖首同epoch配对的tradeoff；模型美元、开发/审阅成本和真人时间未知。联合确认1943通过/1平台skip/0失败，12982断言；首5秒timeout保留，15秒时限确认；最终投影修改后39定向/319断言、主与研究类型通过。15文档测试及当前更改链接无错误；全历史扫描10个旧结果retired链接与文档软长度警告保持。finiteQueueComplete=true、researchGoalAchieved=false；下一最小责任是隔离自动作者补齐非owner授权、root回退和版本/文件关系，并继续核对完整任务质量，而非追加同因重抽。"
def research(t):
    t = re.sub(r"^\*\*当前 BH 开发.*$", "**" + outcome + "** 真实数据、修复经过与边界见[§7.69](#769-bh-发布后复核与渐进编写消费决定)及[summary](" + result_link + ")。", t, count=1, flags=re.M)
    t = t.replace("## 8. 技术文档本地化候选：已设计到哪里", confirm_text + "\n\n## 8. 技术文档本地化候选：已设计到哪里")
    replacements = {
      "Q2": "| Q2 | 声明如何带来实际行为？ | BH公共渐进/patch可运行；自动原稿4步实际返回请求/根ID，开发者25步返回文件，Share六场景复用公共算子 | 自动作者还需从source补非owner授权、root回退和版本/文件关系 |",
      "Q4": "| Q4 | 领域方法相对好说明的增量是什么？ | BH同程序首对compact减少524583input/2472output、快49652ms，但质量退化；规则投影修复确认单列 | 首对tradeoff；当前结果不足以建立稳定质量保持和净收益 |",
      "Q5": "| Q5 | 作者和变化复用是否可用？ | 草稿保留/修补/恢复及当前重算通过；C2同自动原稿仍仅返回两个ID，文件变化来自自然解释 | 不把自然补充算成自动程序计算；缺源与控制未知持续具名 |",
      "Q7": f"| Q7 | 如何评价和计量？ | BH六真实交付，input{accounting['totals']['input']:,}含cache{accounting['totals']['cacheRead']:,}/output{accounting['totals']['output']:,}，{accounting['totals']['tools']}工具；首件与修复均保留 | 作者/消费者/修复分账，实际发送字节与tokens分开；USD/开发/真人未知，不计算无依据的摊销盈亏点 |",
    }
    for key, value in replacements.items(): t = re.sub(r"^\| " + key + r" \|.*$", value, t, count=1, flags=re.M)
    return t
edit("docs/skill-ir/skill-dsl-research.md", research)
print(json.dumps({"documentsUpdated": 5, "status": summary["status"]}, ensure_ascii=False))
