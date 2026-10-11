## 结论

Download 的授权对象与最终返回文件可能不是同一个 `Document` 行：

- URL 中的 `pk` 标识 `request_doc`，对象权限也只检查这个 `request_doc`。
- 随后 `version` 参数可能把实际文件切换为同一版本族中的根文档、最新版本或指定版本。
- `original=true` 只决定该已选版本返回原始文件还是归档文件，不会触发新的授权检查。

因此，**版本选择改变的是最终文件对应的资源，但不会改变或重新执行授权对象**。是否因此造成越权，取决于实际 owner 和对象授权；这些事实未提供。

## 1. 入口与请求标识

`DefaultRouter` 把 `documents` 注册到 `UnifiedSearchViewSet`；该类继承 `DocumentViewSet`。路由位于 `/api/` 下，detail action 的路由形状是 `{prefix}/{lookup}/{url_path}/`，所以入口是：

```text
GET /api/documents/{pk}/download/
```

依据：

- `documents` 注册：[src/paperless/urls.py:74-77](src/paperless/urls.py#L74-L77)
- API 前缀及 router URLs：[src/paperless/urls.py:97-100](src/paperless/urls.py#L97-L100)、[src/paperless/urls.py:297](src/paperless/urls.py#L297)
- DRF detail-action 路由模板：[framework/rest_framework-3.18.1/rest_framework/routers.py:131](framework/rest_framework-3.18.1/rest_framework/routers.py#L131)
- `download` 是 GET detail action，并调用 `file_response(pk, ..., "attachment")`：[src/documents/views.py:1834-1839](src/documents/views.py#L1834-L1839)

`pk` 随后直接用于 `Document` 的 `id` 查询。Download 明确传入 `include_deleted=True`，因此这里使用 `Document.global_objects`；不存在则是 404：[src/documents/views.py:1401-1415](src/documents/views.py#L1401-L1415)、[src/documents/views.py:1429-1436](src/documents/views.py#L1429-L1436)。

## 2. 授权顺序

### 框架级检查

`DocumentViewSet` 配置：

```python
permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
```

[src/documents/views.py:1008-1027](src/documents/views.py#L1008-L1027)

DRF 在调用 action 之前依次执行认证和 view-level permission checks：[framework/rest_framework-3.18.1/rest_framework/views.py:404-421](framework/rest_framework-3.18.1/rest_framework/views.py#L404-L421)。

对 GET 请求，`PaperlessObjectPermissions` 将模型权限映射为 `view_document`：[src/documents/permissions.py:30-44](src/documents/permissions.py#L30-L44)。其继承的 view-level `has_permission` 要求认证用户具有相应的全局模型权限：[framework/rest_framework-3.18.1/rest_framework/permissions.py:233-246](framework/rest_framework-3.18.1/rest_framework/permissions.py#L233-L246)。

但 DRF 的对象权限不会因 detail URL 自动执行；它只在代码调用 `check_object_permissions()` 时执行：[framework/rest_framework-3.18.1/rest_framework/views.py:331-355](framework/rest_framework-3.18.1/rest_framework/views.py#L331-L355)。Download 没有调用 `get_object()` 或 `check_object_permissions()`，而是使用下面的应用级手工检查。

### 应用级对象检查

加载 `request_doc` 并解析其根文档后，代码执行：

```python
has_perms_owner_aware(
    request.user,
    "view_document",
    request_doc,
)
```

失败时立即返回 `403 Insufficient permissions`：[src/documents/views.py:1408-1427](src/documents/views.py#L1408-L1427)。

该 helper 在以下任一条件下允许访问：

1. 文档无 owner；
2. 当前用户就是 owner；
3. Guardian 对当前用户和该对象授予 `view_document`。

[src/documents/permissions.py:624-635](src/documents/permissions.py#L624-L635)

关键顺序是：

1. 加载 URL `pk` 指定的 `request_doc`；
2. **授权 `request_doc`**；
3. 选择实际的 `file_doc`；
4. 在 `file_doc` 上选择 original/archive；
5. 打开并返回文件。

[src/documents/views.py:1429-1448](src/documents/views.py#L1429-L1448)

## 3. 版本选择的全部分支

`version` 来自 `request.query_params.get("version")`：[src/documents/versioning.py:140-143](src/documents/versioning.py#L140-L143)。

### A. URL `pk` 本身是一个版本，且完全没有 `version` 参数

若：

```python
request_doc.root_document_id is not None
and get_request_version_param(request) is None
```

则直接以 URL 指定的版本作为 `file_doc`：[src/documents/views.py:1388-1399](src/documents/views.py#L1388-L1399)。

授权对象和返回文件对应同一个版本行。

### B. URL `pk` 是根文档，且没有 `version` 参数

代码以该根文档为版本族，选择非删除版本中最新的版本；没有版本时退回根文档。最新顺序为：

1. `version_index` 降序、null 最后；
2. `id` 降序。

[src/documents/versioning.py:23-28](src/documents/versioning.py#L23-L28)、[src/documents/versioning.py:159-182](src/documents/versioning.py#L159-L182)

此时授权的是根文档，但返回的可能是另一个版本行。

### C. 提供非空 `version=<id>`

参数必须可以转换为整数，否则返回 `NotFound("Invalid version parameter")`：[src/documents/views.py:1375-1386](src/documents/views.py#L1375-L1386)、[src/documents/versioning.py:184-187](src/documents/versioning.py#L184-L187)。

指定 ID 只有在以下任一条件成立时才有效：

- ID 就是版本族根文档；
- 候选文档的 `root_document_id` 等于该根文档 ID。

不存在或属于其他版本族时返回 404：[src/documents/versioning.py:189-195](src/documents/versioning.py#L189-L195)。

由于显式提供了参数，该查询使用包含已删除对象的 manager。因此，一个有效的、已删除版本也可能被选中。

### D. 提供空参数 `version=`

这是一个细微分支：

- `_resolve_file_doc` 用“是否为 `None`”判断参数是否存在，因此空参数使 `include_deleted=True`；
- `resolve_requested_version_for_root` 又用 `if not version_param` 判断，因此空字符串按“没有指定 ID”处理并选择最新版本。

结果是：`version=` 选择“包含已删除版本集合中的最新版本”。依据见 [src/documents/views.py:1375-1381](src/documents/views.py#L1375-L1381) 与 [src/documents/versioning.py:169-182](src/documents/versioning.py#L169-L182)。

### E. URL `pk` 是版本，同时又提供 `version`

先从 URL 版本得到其根文档，再在该根版本族中解析参数。因此参数可以切换到：

- 根文档；
- 当前版本；
- 同族的另一个版本。

但授权仍然只针对 URL 中原始 `pk` 对应的 `request_doc`。

## 4. Original 与 archive 的选择

实际版本选定后：

```python
use_archive = (
    not original_requested(request)
    and file_doc.has_archive_version
)
```

[src/documents/views.py:1442-1448](src/documents/views.py#L1442-L1448)

`original_requested()` 仅在查询参数准确满足 `original=true` 时返回真；大小写不同、`1`、`false` 或缺省都不算 original 请求：[src/documents/views.py:1368-1373](src/documents/views.py#L1368-L1373)。

所以：

| 条件 | 返回内容 |
|---|---|
| `original=true` | `file_doc.source_file` |
| 未准确请求 original，且该版本有 archive | `file_doc.archive_file` |
| 未准确请求 original，但无 archive | `file_doc.source_file` |

`has_archive_version` 只检查 `archive_filename is not None`；原始和归档路径分别基于 `ORIGINALS_DIR` 与 `ARCHIVE_DIR`：[src/documents/models.py:452-475](src/documents/models.py#L452-L475)。

Archive 分支使用 PDF MIME 类型；source 分支使用文档自身 MIME 类型。最终构造 `FileResponse`，Download 的 disposition 固定为 `attachment`：[src/documents/views.py:4941-4973](src/documents/views.py#L4941-L4973)。

`follow_formatting` 只改变下载文件名是使用存储文件名还是公开格式化文件名，不改变文件内容。代码直接使用查询值的 Python truthiness，所以非空字符串 `"false"` 也会启用该分支：[src/documents/views.py:1447](src/documents/views.py#L1447)、[src/documents/views.py:4952-4965](src/documents/views.py#L4952-L4965)。

## 5. 授权对象与返回对象是否一致

分支结论如下：

| 请求形式 | 授权对象 | 可能返回的文件对象 |
|---|---|---|
| URL 指向版本，无 `version` | 该 URL 版本 | 同一版本 |
| URL 指向根，无 `version` | 根文档 | 最新版本或根 |
| 任意 URL，显式 `version=<id>` | URL 指定文档 | 根或同族任意指定版本 |
| `original=true` / archive 默认分支 | 不改变 | 仅切换已选 `file_doc` 的文件表示 |

因此：

- 版本切换可能改变实际资源；
- original/archive 只改变同一 `file_doc` 的表示；
- 二者都发生在对象授权之后；
- 对最终 `file_doc`、其 root、其 source 文件或 archive 文件都没有第二次授权。

每个 `Document` 行本身都有独立、可为空的 owner：[src/documents/models.py:33-44](src/documents/models.py#L33-L44)、[src/documents/models.py:158](src/documents/models.py#L158)。而 `merge_as_versions` 只更新 `root_document`、版本序号、ASN 和可选标签，并不统一 owner 或对象授权：[src/documents/bulk_edit.py:665-682](src/documents/bulk_edit.py#L665-L682)。

## 6. 缺失事实及其阻止的结论

1. **用户的全局 `documents.view_document` 权限未知**  
   阻止判断请求能否通过 DRF 的 view-level permission check。

2. **URL `request_doc` 的 owner、是否无 owner，以及 Guardian grant 未提供**  
   阻止判断手工对象检查是允许还是返回 403。

3. **根文档与各版本的 owner/grants 未提供**  
   因代码不重新授权 `file_doc`，这阻止判断版本切换是否产生实际的跨用户或跨授权数据读取。源码只能确定“检查对象与返回对象可能不同”，不能单凭当前事实确认越权。

4. **`pk`、`version` 的实际值以及版本族和删除状态未知**  
   阻止确定最终选中根、当前版本、最新版本、指定版本，还是返回 404。

5. **所选版本是否具有 `archive_filename`、`original` 的准确值未知**  
   阻止确定返回 source 还是 archive。

6. **底层文件是否实际存在以及存储目录配置未提供**  
   阻止确定操作最终成功还是因 `FileNotFoundError` 返回 404；也阻止给出具体磁盘路径和字节内容。

7. **认证后端及部署层行为不在允许证据内**  
   用户已假定为 authenticated，但具体认证方式以及框架拒绝时最终表现为 401 还是 403，不能从本次范围完整确定。

辅助属性检查器仍将跨函数的完成性和对象对应关系标为 unresolved；以上结论来自所列源码路径，而不是该机器检查的认证结果。