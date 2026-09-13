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
- 扫描源代码目录结构
- 先读取项目内的 i18n 约定、schema 或用户给出的文件清单；其中的框架、提取规则、允许修改/新建/保护文件及输出 ABI 优先于本技能的通用默认值。若字段列表或 schema 声明为精确/封闭集合，不添加未声明字段
- 有文件范围限制时，编辑前记录相关文件清单与受保护文件状态，后续仅触碰允许路径

### 2. 硬编码文本扫描
- 在约定允许的源文件中搜索 `.js/.jsx/.ts/.tsx/.vue/.py/.java/.go` 等代码的硬编码字符串
- 若项目约定用标记或属性确认待提取文本，只处理完全满足该规则的文本，并原样使用约定的 key；无此约定时再按通用规则判断
- 排除：变量名、URL、正则表达式、import 路径、日志调试信息
- 标记：用户可见的 UI 文本、错误提示、通知消息

### 3. 语言文件生成
根据项目框架生成对应格式：
- **JSON** (i18next/react-intl): `{ "key": "value" }`
- **YAML** (vue-i18n): `key: value`
- **PO/POT** (gettext): 标准格式
- **Properties** (Java): `key=value`
- 所有目标 locale 使用相同且完整的 key 集；保留并逐一核对插值标识符

### 4. 代码替换
- 将已确认的硬编码文本替换为 i18n 函数调用，不顺带改写未确认文本
- 保持原有格式和变量插值；将表达式转为框架对应的命名占位符时，把同名变量传给翻译函数
- 示例：
  ```javascript
  // 替换前
  alert('保存成功');
  // 替换后
  alert(t('alert.saveSuccess'));
  ```

### 5. 完整性检查
- 对比主语言文件与翻译文件的 key 差异，并检查每条翻译的占位符集合一致
- 若有输出 ABI/schema，按其 required、类型、枚举、顺序/去重和 additionalProperties 规则验证；`not applicable` 或缺少条件不得写成成功结果
- 复核实际修改/新增文件恰好符合允许清单、受保护文件未变，且未产生临时或额外文件
- 输出缺失翻译的 key 列表；若要求按 locale 分组，保留每个声明 locale（包括空数组）
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
