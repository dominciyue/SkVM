## 结论摘要

下载入口是：

```text
GET /api/documents/{pk}/download/
```

`pk` 可以指向根文档，也可以直接指向该根文档的某个版本。授权始终针对解析出的**根文档**进行；之后才选择具体版本，以及该版本的 original/archive 文件。因此：

- `version` 不会把授权对象改成所选版本；
- `original` 不会把授权对象改成具体文件；
- 它们只改变根文档授权成功后返回的 `Document` 版本及文件表示；
- 显式选择的版本必须属于已授权根文档的版本树，不能借此选择另一根文档。

## 1. 请求入口与文档识别

`UnifiedSearchViewSet` 注册在 `documents` 路由上，并继承 `DocumentViewSet`；其 `download` 是 `detail=True` 的 GET action。DRF 的 detail action 路由形式为 `{prefix}/{lookup}/{url_path}/`，所以最终入口是 `/api/documents/{pk}/download/`。[src/paperless/urls.py:74-78](src/paperless/urls.py#L74-L78) [src/paperless/urls.py:97-100](src/paperless/urls.py#L97-L100) [src/paperless/urls.py:297](src/paperless/urls.py#L297) [src/documents/views.py:2503-2507](src/documents/views.py#L2503-L2507) [src/documents/views.py:1834-1839](src/documents/views.py#L1834-L1839) [framework/rest_framework-3.18.1/rest_framework/routers.py:128-143](framework/rest_framework-3.18.1/rest_framework/routers.py#L128-L143)

进入 `file_response` 后：

1. 使用 `Document.global_objects.get(id=pk)` 查找请求直接指定的 `request_doc`，因此该路径明确使用包括已删除对象在内的管理器。
2. 从它得到 `root_doc`：根文档自身的 `root_document_id` 为空；版本通过自引用外键关联根文档。
3. 找不到 `pk` 时返回 404。[src/documents/views.py:1401-1420](src/documents/views.py#L1401-L1420) [src/documents/models.py:315-322](src/documents/models.py#L315-L322)

## 2. 授权检查及其顺序

顺序如下：

### A. 进入 handler 前的请求级检查

DRF 在调用 `download` 前先执行认证和权限类。[framework/rest_framework-3.18.1/rest_framework/views.py:404-421](framework/rest_framework-3.18.1/rest_framework/views.py#L404-L421)

`DocumentViewSet` 配置了：

```python
permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
```

所以用户必须：

1. 已认证；
2. 通过 `PaperlessObjectPermissions` 对 GET 的模型级检查，即拥有 `documents.view_document` 模型权限。[src/documents/views.py:1008-1027](src/documents/views.py#L1008-L1027) [src/documents/permissions.py:30-44](src/documents/permissions.py#L30-L44) [framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151](framework/rest_framework-3.18.1/rest_framework/permissions.py#L145-L151) [framework/rest_framework-3.18.1/rest_framework/permissions.py:233-246](framework/rest_framework-3.18.1/rest_framework/permissions.py#L233-L246)

### B. 查找 `pk`、解析根文档，然后检查根文档

查到 `request_doc` 和 `root_doc` 后，代码执行：

```python
has_perms_owner_aware(request.user, "view_document", root_doc)
```

失败直接返回 403。该帮助函数在以下任一条件成立时允许访问：

- 根文档无 owner；
- 当前用户就是根文档 owner；
- `ObjectPermissionChecker` 报告用户对根文档拥有该权限。[src/documents/views.py:1408-1427](src/documents/views.py#L1408-L1427) [src/documents/permissions.py:624-635](src/documents/permissions.py#L624-L635)

值得注意的是，`download` 没有调用 DRF 的 `self.get_object()`。DRF 的标准 `get_object()` 才会自动调用 `check_object_permissions()`；这里采用的是上述手工根文档检查。[framework/rest_framework-3.18.1/rest_framework/generics.py:79-104](framework/rest_framework-3.18.1/rest_framework/generics.py#L79-L104)

### C. 授权成功后才选择版本和文件表示

只有根文档检查通过后，`_get_effective_file_doc()` 才确定实际返回哪个版本；随后才选择 archive 或 original。[src/documents/views.py:1429-1448](src/documents/views.py#L1429-L1448)

## 3. 版本选择的所有相关分支

### 未提供 `version`

- 如果 URL 中的 `pk` 本身指向一个版本，直接返回该版本。
- 如果 `pk` 指向根文档，则解析该根文档的最新版本；没有版本时回退到根文档自身。
- “最新”按 `version_index` 降序、再按 ID 降序确定。[src/documents/views.py:1388-1399](src/documents/views.py#L1388-L1399) [src/documents/versioning.py:23-28](src/documents/versioning.py#L23-L28) [src/documents/versioning.py:159-166](src/documents/versioning.py#L159-L166)

### 提供非空 `version=<id>`

该值必须能转换为整数。候选版本只在满足以下条件之一时接受：

- 候选 ID 就是当前根文档 ID；
- 候选的 `root_document_id` 等于当前根文档 ID。

不存在或属于其他根文档的候选返回 404；非整数参数产生 “Invalid version parameter” 的 404。[src/documents/versioning.py:169-195](src/documents/versioning.py#L169-L195) [src/documents/views.py:1375-1386](src/documents/views.py#L1375-L1386)

### 空的 `version=`

这是一个细微分支：

- `_get_effective_file_doc()` 认为参数“存在”，所以不会采用“URL 的 `pk` 本身就是版本”分支；
- 解析器又把空字符串当成 falsy，最终选择根文档的最新版本。

因此，对版本 ID URL 添加空的 `?version=`，可能把结果从该指定版本切换为最新版本。[src/documents/versioning.py:140-143](src/documents/versioning.py#L140-L143) [src/documents/versioning.py:175-182](src/documents/versioning.py#L175-L182)

这些解析都传入 `include_deleted=True`，使用 `Document.global_objects`。[src/documents/views.py:1429-1434](src/documents/views.py#L1429-L1434) [src/documents/versioning.py:136-137](src/documents/versioning.py#L136-L137)

## 4. Original/archive 表示选择

版本选定为 `file_doc` 后：

| 条件 | 返回文件 |
|---|---|
| `original=true`，必须完全匹配小写字符串 `"true"` | `file_doc.source_file` |
| 未提供 `original`、值不是 `"true"`，且该版本有 archive | `file_doc.archive_file` |
| 未提供 `original`、值不是 `"true"`，但无 archive | `file_doc.source_file` |

[src/documents/views.py:1368-1373](src/documents/views.py#L1368-L1373) [src/documents/views.py:1442-1448](src/documents/views.py#L1442-L1448)

返回细节：

- archive：MIME 固定为 `application/pdf`；
- original：使用该版本的 `mime_type`；
- `download` 使用 `Content-Disposition: attachment`；
- `follow_formatting` 为真时使用磁盘文件名，否则使用公开格式化文件名；
- 实际代码未将 `follow_formatting` 解析为布尔值，而是直接传递查询字符串，因此任何非空字符串，包括 `"false"`，在该条件中都是真值；
- 文件打开失败或相关文档消失时转成 404。[src/documents/views.py:1835-1839](src/documents/views.py#L1835-L1839) [src/documents/views.py:4941-4973](src/documents/views.py#L4941-L4973) [src/documents/views.py:4974-4995](src/documents/views.py#L4974-L4995)

## 5. 备用版本是否改变授权资源

**不会。**

授权对象始终是由 URL `pk` 归一化得到的 `root_doc`。显式 `version` 只是：

1. 在根文档权限通过之后选择文件文档；
2. 验证候选是根文档自身或其直接版本。

所选版本不会再次接受 owner 或对象权限检查。archive/original 更只是同一所选版本上的文件表示选择。因此，源码建立的安全边界是：

```text
根文档授权
  → 仅限该根文档版本树的版本选择
  → 该版本的 original/archive 表示选择
```

## 6. 无法由现有事实确定的结论

| 缺失事实 | 阻止的结论 |
|---|---|
| 用户是否拥有全局 `documents.view_document` | 无法确定请求能否通过 handler 前的模型权限检查 |
| 根文档 owner 是否为空、是否为当前用户 | 无法确定 owner-aware 根文档检查是否直接允许 |
| 用户/组在根文档上的实际对象授权，以及 Guardian/backend 配置和数据 | 无法确定 `ObjectPermissionChecker.has_perm()` 的实际结果 |
| 实际 `pk`、文档及版本关系、删除状态 | 无法确定解析出的根文档和版本 |
| `version`、`original`、`follow_formatting` 的实际值 | 无法确定最终版本、original/archive 及文件名分支 |
| 所选版本是否有 archive、底层文件是否存在 | 无法确定返回 archive、original，还是最终 404 |
| 认证后端、代理及部署配置 | 无法断言生产环境中身份如何建立或错误如何在边缘层呈现 |

因此可以确定**源码中的授权对象和选择顺序**，但在 ownership、权限授予、请求参数及数据库状态未给出时，不能断言某个具体用户能够或不能下载某个具体文件。