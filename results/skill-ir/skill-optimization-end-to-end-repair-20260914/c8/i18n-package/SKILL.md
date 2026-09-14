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
- 若项目提供公开的 i18n 合约、清单或配置，先读取并以其声明的框架、扫描范围、可修改/新增/保护文件、文本确认规则、key/插值规则和报告字段为边界；未声明的值不要猜测或扩展
- 否则检测项目类型（React/Vue/Angular/Node.js/Python/Java 等）、已有 i18n 框架（react-intl, vue-i18n, i18next, gettext 等）和源代码目录结构
- 检查现有依赖并遵守用户与项目约束，不改动完成任务不需要的文件

### 2. 硬编码文本扫描
- 只扫描用户或合约指定的文件；未指定时再在 `.js/.jsx/.ts/.tsx/.vue/.py/.java/.go` 等源文件中搜索
- 合约定义“已确认文本”时严格按该规则提取；否则标记用户可见的 UI 文本、错误提示、通知消息
- 排除合约列出的类别，并默认排除变量名、URL、正则表达式、import 路径、选择器、技术术语和日志调试信息

### 3. 语言文件生成
按合约或现有项目框架生成对应格式：
- **JSON** (i18next/react-intl): `{ "key": "value" }`
- **YAML** (vue-i18n): `key: value`
- **PO/POT** (gettext): 标准格式
- **Properties** (Java): `key=value`

### 4. 代码替换
- 将已确认文本替换为对应框架的 i18n 调用；合约提供 key 时必须原样使用，不自行重命名
- 保持原有行为、元素属性和变量插值；把表达式转换为目标框架占位符时，调用参数、各语言值和报告中的占位符名称必须一致
- 示例：
  ```javascript
  // 替换前
  alert('保存成功');
  // 替换后
  alert(t('alert.saveSuccess'));
  ```

### 5. 完整性检查
- 对比代码调用、主语言文件与所有翻译文件的 key 集合，并逐 key 对比占位符集合
- 按合约要求输出扫描文件、提取 key、占位符和各语言缺失 key；仅在需要时统计完成度
- 完成前复核：只改动/创建允许的路径，保护文件保持不变，排除文本未被替换，生成文件可解析且框架初始化与项目依赖一致

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
