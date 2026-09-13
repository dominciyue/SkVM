---
name: i18n-helper
description: 国际化/本地化助手 — 扫描代码中的硬编码文本、生成 i18n 配置、批量翻译
---

# 🌍 i18n-helper — 国际化/本地化助手

## 触发条件
当用户要求以下操作时激活此技能：
- 扫描代码中的硬编码中文/英文文本
- 为项目添加国际化支持（i18n）
- 批量提取和翻译语言文件
- 检查翻译完整性（缺失 key 检测）

## 工作流程

### 1. 先确定项目与交付边界
- 检测项目类型（React/Vue/Angular/Node.js/Python/Java 等）及已使用的 i18n 框架（react-intl、vue-i18n、i18next、gettext 等）。
- 若项目提供 `i18n-contract.json`、schema 或其他公开契约，先完整读取并将其作为本次任务的权威边界：严格使用其中声明的规则、键名、文件路径、必需字段和输出 ABI，不凭经验补充字段或文件。
- 记录允许修改的既有文件、必须新建的文件和受保护文件；不得修改受保护文件，也不得创建清单之外的文件。任务要求的“仅修改”通常表示既有文件的修改白名单，而不是可随意扩展输出。
- 扫描源代码目录，并在动手前确认扫描范围和实际输入文件。

### 2. 按规则扫描并确认文本
- 在 `.js/.jsx/.ts/.tsx/.vue/.py/.java/.go` 等文件中搜索硬编码字符串。
- 只转换契约或项目规则明确确认的用户可见文本；排除变量名、URL、正则表达式、import 路径、日志调试信息和技术术语等非 UI 文本。
- 对契约限定的标记、属性或键格式逐项核对；不确定的文本保留并作为残余判断，不要猜测。

### 3. 语言文件生成
根据项目框架生成对应格式：
- **JSON** (i18next/react-intl): `{ "key": "value" }`
- **YAML** (vue-i18n): `key: value`
- **PO/POT** (gettext): 标准格式
- **Properties** (Java): `key=value`
- 契约声明 exact schema 或 additional-properties 禁止时，只输出声明的字段；每个 locale 使用同一完整确认键集，并保留所有插值标识符。

### 4. 代码替换
- 将确认的硬编码文本替换为对应 i18n 函数调用，使用契约要求的原始键名；保持原有结构、属性和变量插值。
- React/i18next 场景中确保 `useTranslation` 与配置导入方式符合项目现有模块结构，并将 JSX 表达式转换为命名插值且把相同变量传给 `t()`。
- 示例：
  ```javascript
  // 替换前
  alert('保存成功');
  // 替换后
  alert(t('alert.saveSuccess'));
  ```

### 5. 生成报告并做交付前差异审计
- 对比主语言文件与翻译文件的 key 差异，输出缺失翻译的 key 列表。
- 报告必须严格符合公开 ABI：必需字段齐全、字段名和类型准确、枚举值合法、数组无重复，locale-keyed 缺失列表完整；禁止加入 schema 未声明的顶层字段。
- 写入后重新读取并解析所有输出，列出工作目录相对初始状态的新增、删除和修改文件。逐项与允许修改文件及必需新文件的声明集合比较：集合必须完全一致，受保护文件必须未变，输出文件内容也必须满足 ABI。若发现多余文件或误改文件，先清理或恢复，再结束任务。
- 仅在审计通过后汇报完成；不得安装依赖、联网或用临时文件污染交付目录。

## 输出格式
```markdown
## 📊 i18n 扫描报告

### 硬编码文本
| 文件 | 行号 | 内容 | 建议 key |
|------|------|------|----------|
| src/App.tsx | 42 | '欢迎使用' | page.welcome |

### 语言文件
已生成 `locales/zh-CN.json` 和 `locales/en-US.json`

### 翻译完整性
- zh-CN: 45/45 (100%) ✅
- en-US: 42/45 (93.3%) ⚠️ 缺少 3 个 key
```

## 支持的 i18n 框架
- react-intl / FormatJS
- vue-i18n
- i18next / react-i18next / next-i18next
- Angular @ngx-translate
- Python gettext / Flask-Babel
- Java ResourceBundle / Spring MessageSource
- Go go-i18n

## 注意事项
- 不要翻译技术术语（API、SDK、HTTP 等）
- 保留变量占位符 `{name}` `{{count}}` `%s` 等格式
- 复数形式和性别变体需要特殊处理
- 日期、数字、货币格式需使用 locale 感知的格式化函数
