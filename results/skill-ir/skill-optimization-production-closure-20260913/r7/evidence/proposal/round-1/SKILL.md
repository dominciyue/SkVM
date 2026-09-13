---
name: law-to-markdown
description: 将法条/规范文件（.txt/.docx/.pdf）转为 Markdown。适用于用户要求“法条转 markdown”“pdf/docx 转 markdown”。处理 .pdf/.docx 时先检查是否已安装 mineru-ocr skill；未安装先引导安装，安装后优先用 mineru-ocr；仅在用户明确同意时再用本地回退方案。
---

# Law To Markdown

## 处理规则

1. 输入为 `.txt`：直接运行 bundled script；不要手工仿写转换或审核报告。脚本处理 TXT 不需要 `python-docx` / `pdfplumber`，即使未安装可选回退依赖也可运行。
2. 输入为 `.pdf` / `.docx`：
   - 先检查是否已安装 `mineru-ocr` skill。
   - 未安装：提示先安装 `mineru-ocr`，安装地址：
     `https://github.com/cat-xierluo/legal-skills/tree/main/skills/mineru-ocr`
   - 已安装：优先调用 `mineru-ocr` 处理。
   - 调用失败：先提示检查 `mineru-ocr` 配置/Token。
   - 仅当用户明确同意时，才使用本地回退（`python-docx` / `pdfplumber`）。
3. 第一阶段完成后默认执行第二阶段格式调整（仅格式，不改原文字符）：
   - 由调用该 skill 的大模型先判断“法律/非法律”，并把结果通过 `--law-decision law|non-law` 传给脚本；不得只在回复或手工报告中声明判断结果。
   - 若调用方未传结果，则脚本使用硬规则自动识别（`--law-decision auto`）。
   - 法律名称 `#`
   - 编/分编 `##`
   - 章 `###`
   - 节 `####`
   - 条 `#####`（仅“第X条”为标题；`第X条【条标】`整行为标题不拆）
   - 款/项/目无标题
   - 项、目按标记换行
   - 清理多余空格：去行尾空格、去行首 ASCII 空格、去正文行首全角缩进、规范标题后的空格
4. 若识别为明显非法律文本（如 GB/标准类文档），第二阶段明确拒绝：`Stage2: rejected (non-law-document)`。
5. 若第二阶段未识别法律结构或保真校验失败，则自动 no-op，不改文本。
6. 默认执行第三阶段检查（双子阶段，硬门槛）：
   - Stage3-A：校验 `stage2` 相对 `stage1` 的文字内容准确性（去标题符号与空白后字符流必须一致）
   - Stage3-B：校验结构效果（结构层级、条标题规则、非法律策略、空格规范、项/目换行）
   - 任一失败触发自动重走，最多 2 次；仍失败默认报错退出

## 二阶段识别参数

- `--law-decision law`：调用方已判定为法律文本，直接按法律结构优化。
- `--law-decision non-law`：调用方已判定为非法律文本，阶段二直接拒绝。
- `--law-decision auto`：不传判定时的默认模式，使用脚本内硬规则。

## 三阶段参数

- `--skip-stage3-check`：跳过第三阶段检查（默认不跳过）。
- `--stage3-max-retries`：失败后自动重走次数，默认 `2`。
- `--stage3-strict` / `--no-stage3-strict`：
  - 默认严格模式（失败即报错退出）
  - 非严格模式仅输出报告，不阻断流程
- `--artifact-level minimal|standard|debug`：
  - `minimal`（默认）：面向交付，输出最少
  - `standard`：保留过程文件（`stage1/stage2/stage3-check`）便于排查
  - `debug`：保留全部过程产物（包含调试信息）

## 输出规则

- 默认输出到输入文件同目录的 `markdown/` 子目录，并按输入文件名创建独立目录：
  - `markdown/<文件名>/`
- 默认（`--artifact-level minimal`）输出：
  - `<原文件名>+审核报告.md`（详细过程和结论）
  - `<原文件名>+最终成果.md`（仅法律文本且审核通过时生成）
- 非法律文档（如 GB/标准类）：
  - 结论为“拒绝处理”
  - 仅输出 `<原文件名>+审核报告.md`
  - 不输出 `<原文件名>+最终成果.md`
- 审核未通过时会自动保留过程文件用于排查：
  - `<文件名>.stage1.md`
  - `<文件名>.stage2.md`
  - `<文件名>.stage3-check.md`
- 若需更多产物可切换：
  - `--artifact-level standard`：保留 `stage1/stage2/stage3-check`
  - `--artifact-level debug`：保留全部调试产物
- 可通过命令参数指定 `--out` 或 `--out-dir`。

## 执行顺序与本地核验

每次任务按以下顺序执行，路径均相对于本 skill 根目录解析：

1. 在用户工作目录定位输入文件并确认扩展名；不要把原文复制到回复中，也不要手工改写转换结果或审核报告。
2. 先记录输入文件的字节级校验值（如 SHA-256），再调用下方 bundled script。`.txt` 直接调用；`.docx`/`.pdf` 先按上面的 `mineru-ocr` 规则处理。
3. 根据文件内容判断法律/非法律，并将判断作为 `--law-decision law|non-law` 传给脚本；只有无法可靠判断时才用 `auto`。
4. 脚本成功返回后，按报告中的路径检查最终成果（仅通过时应存在）和审核报告是否存在；再复算输入文件校验值，确认与运行前一致。
5. 最终回复只报告实际生成的相对路径、法律/非法律判断、审核结论、Stage 3 A/B/overall 状态和源文件字节核验结果。若任一核验失败，不得宣称“审核通过、可交付”。

## 常用命令

```bash
python3 law-to-markdown/scripts/law_to_markdown.py "input.txt" --law-decision law
python3 law-to-markdown/scripts/law_to_markdown.py "input.docx" --law-decision law
python3 law-to-markdown/scripts/law_to_markdown.py "input.pdf" --law-decision law
```

无法可靠判断时才省略 `--law-decision`，使用 `auto` 硬规则回退；明确非法律时传 `--law-decision non-law`。命令成功后，以脚本生成的审核结论和产物清单为准，并完成上述存在性与字节核验后才能回复“审核通过、可交付”。

用户明确同意回退时：

```bash
python3 law-to-markdown/scripts/law_to_markdown.py "input.docx" --allow-fallback
python3 law-to-markdown/scripts/law_to_markdown.py "input.pdf" --allow-fallback
```
