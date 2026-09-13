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
- 若任务提供合同、清单或输出 schema，先读取并把允许修改/新建/保护的文件、文本确认规则、key 规则和精确输出字段作为本次工作的边界；精确字段列表是闭集，不自行增删字段
- 在上述边界内扫描源代码目录结构；未获允许时不安装依赖、不访问网络、不创建额外文件

### 2. 硬编码文本扫描
- 在 `.js/.jsx/.ts/.tsx/.vue/.py/.java/.go` 等文件中搜索硬编码字符串
- 排除：变量名、URL、正则表达式、import 路径、日志调试信息
- 标记：用户可见的 UI 文本、错误提示、通知消息
- 若合同定义了确认标记或选择规则，只提取满足该规则的文本，并原样采用合同指定的 key；不要把“未发现/不适用”写成已确认结果

### 3. 语言文件生成
根据项目框架生成对应格式，并确保所有声明 locale 的 key 集合与已提取 key 完全一致：
- **JSON** (i18next/react-intl): `{ "key": "value" }`
- **YAML** (vue-i18n): `key: value`
- **PO/POT** (gettext): 标准格式
- **Properties** (Java): `key=value`

### 4. 代码替换
- 将硬编码文本替换为当前框架的 i18n 函数调用，并补齐项目所需的最小导入/初始化接线
- 保持原有格式和变量插值；将表达式转换为具名占位符时，传给翻译函数的标识符必须与占位符逐一一致
- 示例：
  ```javascript
  // 替换前
  alert('保存成功');
  // 替换后
  alert(t('alert.saveSuccess'));
  ```

### 5. 完整性检查
- 对比源文件提取 key、主语言文件与各翻译文件的 key 差异
- 按合同要求区分“缺失 key”与空缺失列表，并统计翻译完成度百分比
- 验证输出 schema（必填字段、类型、枚举、是否允许额外字段及数组顺序/去重语义）
- 复核最终文件集合：只改/建声明的文件，并确认保护文件未变；优先使用项目已有的校验或编译命令，受限时报告未执行项及原因

## 输出格式
若任务给出精确报告 ABI/schema，以其为准并只输出声明字段；否则使用以下默认的人类可读报告：
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
