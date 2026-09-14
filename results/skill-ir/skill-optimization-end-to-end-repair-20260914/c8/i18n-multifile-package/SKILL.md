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

### 1. 项目分析
- 检测项目类型（React/Vue/Angular/Node.js/Python/Java 等）
- 识别已使用的 i18n 框架（react-intl, vue-i18n, i18next, gettext 等）
- 扫描源代码目录结构；若用户提供 contract、schema 或 semantics 文件，先读取并以其 sourceFiles、allowed/protected files、required outputs、字段枚举和占位符规则为准，不凭经验补充字段或改动范围
- 对 contract 指定的每个源文件逐一处理，确认基线/输入文件实际存在；无法读取的引用不得臆造，仍须完成可验证的现有输入并报告限制

### 2. 硬编码文本扫描
- 在 `.js/.jsx/.ts/.tsx/.vue/.py/.java/.go` 等文件中搜索硬编码字符串
- 排除：变量名、URL、正则表达式、import 路径、日志调试信息，以及技术术语、选择器和其他非用户可见值
- 标记：用户可见的 UI 文本、属性文本（如 `aria-label`、`title`）、错误提示、通知消息；相同原文在同一来源中的多个出现可复用一个 key，但报告 occurrences 总数
- 为每个条目记录来源文件、原文、稳定且唯一的点分隔 key、占位符名称集合和出现次数；原文中的单大括号占位符转换为语言文件约定的插值语法，不能改变变量名

### 3. 语言文件生成
根据项目框架生成对应格式：
- **JSON** (i18next/react-intl): `{ "key": "value" }`
- **YAML** (vue-i18n): `key: value`
- **PO/POT** (gettext): 标准格式
- **Properties** (Java): `key=value`

### 4. 代码替换
- 将硬编码文本替换为 i18n 函数调用
- 保持原有格式和变量插值
- 示例：
  ```javascript
  // 替换前
  alert('保存成功');
  // 替换后
  alert(t('alert.saveSuccess'));
  ```

### 5. 完整性检查
- 对比主语言文件与翻译文件的 key 差异，并按 contract/输出 schema 要求生成缺失 key；不要把“无缺失”改写成未检查
- 检查每个代码引用都有对应 locale key，且各 locale 的占位符集合与原文一致
- 若 contract 定义了报告 ABI，严格输出必需字段、类型、枚举值和禁止的额外字段；`scannedFiles` 按声明顺序且不重复，entries 按条目去重
- 最后复读所有允许输出，核对引用 key、locale key、报告条目/occurrences、保留的 URL/选择器/日志/技术术语，以及受保护文件未被修改；工具不可用时明确报告未执行的检查
- 输出缺失翻译的 key 列表
- 统计翻译完成度百分比

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
