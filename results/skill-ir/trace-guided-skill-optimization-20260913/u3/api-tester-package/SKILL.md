---
name: api-tester
description: API 自动化测试 - OpenAPI 解析、测试用例生成、集成测试
---

# API 测试生成器

## 触发条件
当用户要求测试 API、生成测试用例、接口测试、集成测试时激活此技能。

## 工作流程

### 第 1 步：确认契约并发现 API
先读取用户指定的 API 文件及接口/输出契约；其中的输入路径、命令参数、必填字段、允许依赖、受保护文件和精确输出集合优先于本技能的默认值。未提供明确路径时，再按优先级查找：
1. OpenAPI/Swagger 文件（`openapi.yaml`、`swagger.json`）
2. 路由定义文件（Express routes、Flask blueprints、Spring controllers）
3. API 目录结构（`/api/`、`/routes/`、`/controllers/`）

使用结构化解析器读取 JSON/YAML，解析 `$ref` 后枚举 operation、参数、请求 Schema、安全要求和已声明响应；不要用 grep 猜测 YAML。仅在资源策略允许时使用已有的验证工具，不要为验证擅自安装包或访问网络。

### 第 2 步：生成测试用例
为每个 operation 生成契约要求的类别；默认至少包括：
- **正常场景**（happy path）— 从 Schema 生成合法输入并选择该 operation 已声明的成功响应
- **边界值测试** — 围绕 `required`、`min/max`、长度、格式、枚举等约束生成边界内外样例
- **错误场景** — 只断言该 operation 明确声明或现有实现可证实的状态码；认证、缺失资源及业务冲突若需要运行时状态，使用占位 fixture 并注明前置条件，不要猜测结果

用稳定排序、确定性样例和唯一 ID 保证重复生成一致；每个 case 应可独立执行，认证值和环境相关资源使用参数/环境占位符。

### 第 3 步：生成测试代码或计划
根据用户要求及项目技术栈生成可执行测试代码；若任务定义了生成器 CLI、JSON 计划或报告契约，则严格按该契约实现，不要替换成模板中的框架或字段形状。所有输入/输出路径必须来自任务参数或契约，不得写死默认示例路径。

### 第 4 步：测试数据生成

**策略**：
| 策略 | 适用场景 | 工具/方法 |
|------|---------|----------|
| 固定数据 | 简单接口、确定性测试 | JSON fixture 文件 |
| Faker 随机生成 | 大量测试数据、压力测试 | `@faker-js/faker`、`Faker`(Python) |
| 工厂模式 | 复杂对象关系 | factory_boy、fishery |
| 从 Schema 生成 | 基于 OpenAPI 自动生成 | `json-schema-faker` |

### 第 5 步：执行和复测

- 先运行契约指定命令；否则使用项目现有测试命令。只使用策略允许的运行时、依赖和网络能力。
- 校验命令退出码、输出可解析性、必填字段、operation/case 数量、类别与状态码来源；要求确定性时，用同一输入重复生成并比较结果。
- 若输入受保护，验证其未改变；若要求精确输出集合，确认未创建额外文件。
- 根据真实失败信息修正 fixture、认证、状态码或环境依赖后复测，确认测试独立且可重复。
- 报告应区分“生成器/静态契约验证”和“真实 API 执行”：前者通过不代表后者通过；未联系服务器时将 API 执行记为 `not-run`，并列出凭据、fixture、服务器状态及未覆盖 Schema 特性的限制。

## 测试模板

### pytest (Python)
```python
import pytest

# 正常场景
def test_get_users_success(client):
    response = client.get("/api/users")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

# 边界值测试
def test_create_user_empty_name(client):
    response = client.post("/api/users", json={"name": ""})
    assert response.status_code == 422

# 认证测试
def test_get_users_unauthorized(client):
    response = client.get("/api/users", headers={})
    assert response.status_code == 401

# 参数化批量测试
@pytest.mark.parametrize("name,expected_status", [
    ("Alice", 200),
    ("", 422),
    ("a" * 500, 422),
    (None, 422),
])
def test_create_user_validation(client, name, expected_status):
    response = client.post("/api/users", json={"name": name})
    assert response.status_code == expected_status
```

### Jest (JavaScript/TypeScript)
```typescript
import request from 'supertest';
import app from '../src/app';

describe('GET /api/users', () => {
  it('应返回用户列表', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('未认证应返回 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/users', () => {
  it('空名称应返回 422', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ name: '' });
    expect(res.status).toBe(422);
  });

  it('有效数据应返回 201', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Alice', email: 'alice@test.com' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });
});
```

### curl 测试脚本
```bash
#!/bin/bash
BASE_URL="http://localhost:3000/api"
API_TOKEN="${API_TOKEN:?请先设置 API_TOKEN}"

# 正常请求
echo "=== GET /users ==="
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -H "Authorization: Bearer $API_TOKEN" \
  "$BASE_URL/users"

# POST 创建资源
echo "=== POST /users ==="
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d '{"name":"Alice","email":"alice@test.com"}' \
  "$BASE_URL/users"

# 错误场景 - 空 body
echo "=== POST /users (empty) ==="
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{}' \
  "$BASE_URL/users"
```

## 注意事项
- 测试用例应独立运行，不依赖执行顺序
- 使用 `beforeEach` 或 fixture 管理测试数据的初始化和清理
- 敏感信息（API Key、Token）使用环境变量，不要硬编码
- 集成测试建议使用独立的测试数据库
- 关注响应时间，添加超时断言

## Bounded deterministic fast path

When a task supplies an ordinary-input binding with schema version
`skill-ir-api-tester-production-binding/v2` and its OpenAPI document is within
`api-tester-openapi-subset-v2`, resolve the helper path
relative to this SKILL.md and run:

`bun <skill-directory>/scripts/api-task-solidify.js --binding <binding.json> --workdir <task-workdir> --out-dir <new-empty-output-dir> --node <node-executable>`

The output directory must not be inside the task work directory (or contain
it); use an empty sibling directory such as `../solidification-output`. The
binding-declared plan and report are still written into the task work directory.

The helper constructs the requested plan and report, then runs a separate
public-contract checker. Read its JSON result and the generated report. Do not
repeat work proved by the checker, but continue the residual workflow for live
API interaction, credentials, unsupported schema features, server state, or
any task duty outside the bounded contract.

Exit code 2 with `status: unsupported` is a normal not-applicable result: do
not claim an artifact passed, and continue the residual workflow using the
general process above. Exit code 1 is an implementation or binding failure;
preserve the error and do not treat it as an unsupported contract.
