## 结论

`GET /api/documents/{pk}/download/` 先针对 URL 中 `{pk}` 所属的**根文档**做授权，然后才选择具体版本及该版本的 original/archive 文件。选择其他版本或切换 original/archive **不会改变授权对象**；它只改变授权成功后返回的文件。

因此，拥有根文档查看权限的用户可以下载同一版本链中选定版本的文件，即使该版本自身的 owner 或对象授权不同。现有代码没有对选中的版本再次执行对象授权。

## 请求与路由

- `UnifiedSearchViewSet` 注册为 `documents` 路由，并继承 `DocumentViewSet`：  
  `src/paperless/urls.py:74-78`，`src/documents/views.py:2503-2507`
- DRF 的 detail action 路由格式是 `documents/{pk}/download/`，置于 `/api/` 下：  
  `framework/rest_framework-3.18.1/rest_framework/routers.py:128-134`，`src/paperless/urls.py:97-100,297`
- `download` 是 GET detail action，并把 `{pk}` 传给 `file_response`：  
  `src/documents/views.py:1834-1839`

最终入口为：

```text
GET /api/documents/{pk}/download/
```

`pk` 可以指向根文档，也可以直接指向版本文档。

## 授权顺序

### 1. DRF 请求级检查

在调用 `download()` 前，DRF 依次执行认证和 permission checks：

`framework/rest_framework-3.18.1/rest_framework/views.py:404-421`

该 ViewSet 配置：

```python
permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
```

`src/documents/views.py:1008-1027`

这意味着：

1. `IsAuthenticated` 要求 `request.user.is_authenticated`：  
   `framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151`
2. `PaperlessObjectPermissions` 对 GET 映射为 `documents.view_document`：  
   `src/documents/permissions.py:30-44`
3. 其继承的请求级实现使用 `request.user.has_perms(perms)` 检查模型级权限：  
   `framework/rest_framework-3.18.1/rest_framework/permissions.py:233-246`

所以“已认证”本身还不够；用户还必须通过 GET 所需的模型权限检查。

### 2. 按 URL `pk` 加载请求文档

`file_response()` 调用：

```python
_resolve_request_and_root_doc(pk, request, include_deleted=True)
```

`src/documents/views.py:1429-1436`

由于 `include_deleted=True`，它通过 `Document.global_objects` 加载 URL 指定记录，包括软删除记录：

`src/documents/views.py:1401-1415`

找不到时返回 404。

### 3. 将 URL 文档归一化为根文档

- 如果 URL 文档本身是根文档，根文档就是它自己。
- 如果 URL 文档是一个版本，则使用其 `root_document`。

`src/documents/versioning.py:146-156`

版本关系由 `root_document` 自关联字段表达：

`src/documents/models.py:315-330`

### 4. 只对根文档执行对象授权

代码检查：

```python
has_perms_owner_aware(
    request.user,
    "view_document",
    root_doc,
)
```

`src/documents/views.py:1417-1426`

该检查允许以下任一情况：

- 根文档无 owner；
- 当前用户是根文档 owner；
- 当前用户对根文档拥有 Guardian `view_document` 对象权限。

`src/documents/permissions.py:624-635`

失败时直接返回 `403 Insufficient permissions`。

这里没有调用 DRF `get_object()` 或 `check_object_permissions()`；`PaperlessObjectPermissions.has_object_permission()` 因而不是下载操作的对象检查路径。下载使用的是上述显式、针对根文档的 `has_perms_owner_aware()`。

## 版本选择的全部分支

对象授权通过后，`_get_effective_file_doc()` 决定哪一个 `Document` 行提供文件：

`src/documents/views.py:1388-1399`

### A. URL `pk` 指向一个版本，且没有 `version` 查询参数

直接返回 URL 指向的版本：

```python
if request_doc.root_document_id is not None
   and get_request_version_param(request) is None:
    return request_doc
```

不会自动换成最新版本。

### B. URL `pk` 指向根文档，且没有 `version` 参数

从该根文档的版本中选择最新版本；排序为：

1. `version_index` 降序，null 最后；
2. ID 降序。

如果没有版本，则使用根文档自身。

`src/documents/versioning.py:23-28,159-166`

此分支使用普通 `Document.objects`，所以版本查询不包含软删除版本：

`src/documents/views.py:1375-1385`

### C. 显式提供 `?version=<id>`

该值解析为整数，并查找指定文档：

`src/documents/versioning.py:169-195`

候选只有满足以下条件才被接受：

- 候选就是根文档本身；或
- 候选的 `root_document_id` 等于已经授权的根文档 ID。

其他版本链中的文档被当作未找到，返回 404。因此该参数不能跨版本链任意选文档。

因为参数存在时启用 `include_deleted=True`，显式版本选择可以找到软删除版本：

`src/documents/views.py:1375-1381`

分支结果：

- 非整数值：DRF `NotFound("Invalid version parameter")`，即 404。
- 整数但记录不存在：404。
- 记录属于别的版本链：404。
- 合法的同链根文档或版本：作为 `file_doc` 返回。

### D. `?version=` 是空值

这是一个细微分支：

- 参数“存在”，所以 `include_deleted=True`；
- 但空字符串在解析函数中被视为没有具体值；
- 因而选择该版本链的最新版本，并且这次最新版本查询包含软删除记录。

依据：`src/documents/versioning.py:140-143,175-182`，`src/documents/views.py:1375-1381`。

## original/archive 文件选择

确定 `file_doc` 后，代码计算：

```python
use_archive = (
    not original_requested(request)
    and file_doc.has_archive_version
)
```

`src/documents/views.py:1442-1447`

`original_requested()` 仅在参数值精确等于小写字符串 `"true"` 时成立：

`src/documents/views.py:1368-1373`

所以：

| 请求及文件状态 | 返回文件 |
|---|---|
| `?original=true` | `file_doc.source_file` |
| 没有 `original=true`，且版本有 archive | `file_doc.archive_file` |
| 没有 `original=true`，但版本无 archive | 回退到 `file_doc.source_file` |
| `?original=True`、`?original=1`、`?original=false` | 都不算请求 original；优先 archive |

`has_archive_version` 只是检查该版本的 `archive_filename` 是否非空：

`src/documents/models.py:452-475`

`serve_file()` 的具体行为：

- archive：
  - 打开 `doc.archive_file`；
  - MIME 固定为 `application/pdf`。
- original：
  - 打开 `doc.source_file`；
  - MIME 使用 `doc.mime_type`。

`src/documents/views.py:4941-4973`

响应是 `FileResponse`，下载 disposition 为 `attachment`，并设置经过规范化和 URL 编码的 `Content-Disposition` 文件名：

`src/documents/views.py:4973-4995`

`follow_formatting` 只影响响应文件名，不影响版本或文件内容：

- truthy 时使用磁盘文件名；
- 否则使用公开格式化文件名。

`src/documents/views.py:4948-4965`

代码直接读取查询值而没有布尔解析，因此任何非空字符串——包括 `follow_formatting=false`——在该条件中都会被当作真值：

`src/documents/views.py:1447`

文件不存在时，`FileNotFoundError` 被转换为 404：

`src/documents/views.py:1835-1839`

## 授权对象与返回资源的关系

| 阶段 | 使用的对象 |
|---|---|
| URL 查找 | `{pk}` 指向的根文档或版本文档 |
| 对象授权 | 该版本链的 **根文档** |
| `version` 约束 | 候选必须属于同一根文档版本链 |
| 最终文件对象 | URL 版本、最新版本或显式指定版本 |
| original/archive 选择 | 最终版本自身的 source/archive 文件 |

所以：

- 选择另一个版本会改变实际读取的 `Document` 行和文件；
- 但不会把授权对象从根文档改成该版本；
- original/archive 只是在已选版本内部切换文件表示；
- archive 文件没有独立权限检查；
- 选定版本也没有独立 owner/Guardian 权限检查。

## 无法从现有证据确定的事实

1. **当前用户是否能下载某一实际文档**  
   缺少用户的模型级 `documents.view_document` 权限、根文档 owner、根文档对象授权及组授权。只能确定判定规则，不能判定具体用户的结果。

2. **认证失败最终是 401 还是 403**  
   这取决于实际 authentication classes 及其 `WWW-Authenticate` 行为；相关配置不在允许证据中。

3. **实际返回 original 还是 archive**  
   取决于选定版本数据库中的 `archive_filename`、查询参数的精确值以及对应存储文件是否存在。

4. **默认选择的是哪个实际版本**  
   需要当前版本链的记录、`version_index`、删除状态和 ID。

5. **软删除版本仍可下载是否符合产品策略**  
   源码明确显示下载查找 URL 文档以及显式版本时使用 `global_objects`，但缺少产品策略或设计文档，无法判断这是有意的恢复/垃圾箱行为还是策略偏差。