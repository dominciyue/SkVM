## 结论

Download 的入口是：

```text
GET /api/documents/{pk}/download/
```

URL 中的 `pk` 先确定一个“请求文档”，该文档随后被归一到其根文档。**认证和文档级授权针对根文档执行，并发生在版本选择之前。** `version` 参数可能使最终读取文件来自根文档或其某个版本，但不会把授权对象改成所选版本；`original` 只在所选版本上切换原件与归档件，也不会触发新的授权检查。

## 1. 路由与请求文档

`UnifiedSearchViewSet` 以 `documents` 前缀注册到位于 `/api/` 下的 DRF router，并继承 `DocumentViewSet`；`download` 是一个 `detail=True` 的 GET action。因此 router 的动态详情路由形成 `/api/documents/{pk}/download/`。[src/paperless/urls.py:74-78](src/paperless/urls.py#L74-L78) [src/paperless/urls.py:97-100](src/paperless/urls.py#L97-L100) [src/paperless/urls.py:297-299](src/paperless/urls.py#L297-L299) [framework/rest_framework-3.18.1/rest_framework/routers.py:128-135](framework/rest_framework-3.18.1/rest_framework/routers.py#L128-L135) [src/documents/views.py:2503-2507](src/documents/views.py#L2503-L2507)

`download()` 本身只调用：

```python
self.file_response(pk, request, "attachment")
```

文件不存在或文档在处理过程中消失时转成 404。[src/documents/views.py:1834-1839](src/documents/views.py#L1834-L1839)

`file_response()` 用 URL 中的 `pk` 直接查询 `Document.global_objects`，并预取 `owner` 和 `root_document`。因此这里不是普通 DRF `get_object()`，也没有经过 `filter_queryset()` 或 `PermittedObjectsFilter`；它可以查到普通 manager 排除的软删除记录。[src/documents/views.py:1401-1415](src/documents/views.py#L1401-L1415) [src/documents/views.py:1429-1434](src/documents/views.py#L1429-L1434)

然后：

- 若该行本身是根文档，即 `root_document_id is None`，根文档就是它自己。
- 若它是版本，则使用其 `root_document`。
- 模型关系明确把版本建模为指向根文档的自引用外键。[src/documents/versioning.py:146-156](src/documents/versioning.py#L146-L156) [src/documents/models.py:315-329](src/documents/models.py#L315-L329)

## 2. 版本选择的全部相关分支

根文档授权成功后，`_get_effective_file_doc()` 才决定实际提供文件的 `file_doc`。[src/documents/views.py:1435-1441](src/documents/views.py#L1435-L1441)

### 没有 `version` 参数

- **URL `pk` 指向一个版本**：直接使用这个版本；不会自动改成最新版本。
- **URL `pk` 指向根文档**：选择该根文档当前最新、未删除的版本；如果没有版本，则退回根文档自身。

“最新”按 `version_index` 降序、再按 ID 降序决定。[src/documents/views.py:1388-1399](src/documents/views.py#L1388-L1399) [src/documents/versioning.py:23-28](src/documents/versioning.py#L23-L28) [src/documents/versioning.py:159-166](src/documents/versioning.py#L159-L166)

### 存在 `version` 参数

参数值被解释为一个 **Document ID，而不是 `version_index`**：

1. 非空值必须能转换为整数，否则返回 404 `"Invalid version parameter"`。
2. 该 ID 必须存在。
3. 候选必须是根文档自身，或者 `candidate.root_document_id == root_doc.id`。
4. 其他文档家族的 ID 返回 404。
5. 显式版本查找允许软删除记录。[src/documents/versioning.py:140-143](src/documents/versioning.py#L140-L143) [src/documents/versioning.py:169-195](src/documents/versioning.py#L169-L195) [src/documents/views.py:1375-1386](src/documents/views.py#L1375-L1386)

一个细节是 `?version=`：参数虽然存在，但值为空。它进入“显式请求版本”的路径，不过 resolver 将空值视为“未指定具体 ID”，因而选择包含软删除项在内的最新版本。[src/documents/versioning.py:175-182](src/documents/versioning.py#L175-L182) [src/documents/views.py:1375-1381](src/documents/views.py#L1375-L1381)

如果 URL `pk` 本身指向一个版本，同时又给出 `version`，URL 中的版本只用于找到其根文档；最终文件由 `version` 在该根文档家族内重新选择。

## 3. 原件与归档件

版本选择完成后，代码在所选 `file_doc` 上计算：

```python
use_archive = (
    not original_requested(request)
    and file_doc.has_archive_version
)
```

只有查询参数严格为 `original=true` 才算请求原件；大小写不同、`1`、`false` 或未提供均不算。[src/documents/views.py:1368-1373](src/documents/views.py#L1368-L1373) [src/documents/views.py:1442-1447](src/documents/views.py#L1442-L1447)

分支如下：

| 条件 | 返回文件 |
|---|---|
| `original=true` | 所选版本的 `source_file` |
| 未严格请求原件，且所选版本有 `archive_filename` | 所选版本的 `archive_file`，MIME 固定为 `application/pdf` |
| 未严格请求原件，但没有归档件 | 回退到所选版本的 `source_file` |

`has_archive_version` 仅判断 `archive_filename is not None`；实际文件缺失会在打开时产生 `FileNotFoundError`，最终由 `download()` 转成 404。[src/documents/models.py:452-475](src/documents/models.py#L452-L475) [src/documents/views.py:4941-4973](src/documents/views.py#L4941-L4973)

响应是 `FileResponse`，下载 disposition 固定为 `attachment`。`follow_formatting` 只影响下载文件名是使用内部存储名还是公开格式化名称，不改变读取哪一个文件；这里直接按查询参数真值判断，所以任意非空字符串，包括 `"false"`，也会进入真分支。[src/documents/views.py:1442-1448](src/documents/views.py#L1442-L1448) [src/documents/views.py:4952-4965](src/documents/views.py#L4952-L4965) [src/documents/views.py:4973-4995](src/documents/views.py#L4973-L4995)

## 4. 授权检查及其顺序

执行顺序是：

1. **框架认证和视图级权限**
2. 按 `pk` 查询请求文档并解析根文档
3. **对根文档执行 owner-aware `view_document` 检查**
4. 选择实际版本
5. 选择原件或归档件
6. 打开并返回文件

### 框架级检查

`DocumentViewSet` 配置：

```python
permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
```

`IsAuthenticated` 要求 `request.user.is_authenticated`。[src/documents/views.py:1008-1027](src/documents/views.py#L1008-L1027) [framework/rest_framework-3.18.1/rest_framework/permissions.py:145-152](framework/rest_framework-3.18.1/rest_framework/permissions.py#L145-L152)

`PaperlessObjectPermissions` 把 GET 映射为模型权限 `documents.view_document`。DRF 在调用 action 之前运行认证和每个 permission class 的 `has_permission()`，后者会执行 `request.user.has_perms(...)`。[src/documents/permissions.py:30-44](src/documents/permissions.py#L30-L44) [framework/rest_framework-3.18.1/rest_framework/permissions.py:233-246](framework/rest_framework-3.18.1/rest_framework/permissions.py#L233-L246) [framework/rest_framework-3.18.1/rest_framework/views.py:404-420](framework/rest_framework-3.18.1/rest_framework/views.py#L404-L420)

所以，仅“已经登录”还不够；还必须通过全局模型级 `documents.view_document` 检查。

### 文档级检查

解析根文档后，应用调用：

```python
has_perms_owner_aware(
    request.user,
    "view_document",
    root_doc,
)
```

通过条件是以下任一项：

- 根文档没有 owner；
- 用户就是根文档 owner；
- Guardian `ObjectPermissionChecker` 判定用户对根文档具有 `view_document`。

失败时直接返回 403 `"Insufficient permissions"`。[src/documents/views.py:1417-1427](src/documents/views.py#L1417-L1427) [src/documents/permissions.py:624-635](src/documents/permissions.py#L624-L635)

该 action 没有调用 DRF 的 `get_object()`；通常由 `get_object()` 触发的 `check_object_permissions()` 因此不参与此路径。这里的显式根文档检查就是实际的对象级决定点。[framework/rest_framework-3.18.1/rest_framework/generics.py:79-103](framework/rest_framework-3.18.1/rest_framework/generics.py#L79-L103)

## 5. 版本或原件/归档选择是否改变授权资源

**不会。**

- 若 URL `pk` 指向版本，代码先转到其根文档，并对根文档授权。
- 若 `version=<id>` 选择另一个版本，只检查它是否属于同一根文档家族；没有对该版本的 owner 或对象 grants 再做检查。
- 选择 original 或 archive 发生得更晚，也没有独立权限检查。

因此：

```text
授权资源 = 根文档
返回内容来源 = 选中的根文档/版本行
返回表示 = 该行的 source_file 或 archive_file
```

这在源码层面是确定的。版本行是独立 `Document` 行，而且现有文档被合并成版本时，更新字段只包含根关系、版本序号、ASN 和可选标签，并不重写 owner；不过这并不自动证明安全缺陷，因为版本是否应当继承根文档权限属于资源模型语义。[src/documents/bulk_edit.py:632-681](src/documents/bulk_edit.py#L632-L681)

## 6. 未知事实及其阻止的结论

| 未知事实 | 因而无法下的结论 |
|---|---|
| 请求用户是否具有全局 `documents.view_document` | 无法断言请求能通过视图级权限。 |
| 根文档的 owner，以及用户/组对象 grants | 无法断言特定用户会通过或失败于根文档级检查。 |
| `pk` 对应的数据行及其根关系、删除状态 | 无法确定实际请求文档、根文档，或是否立即 404。 |
| `version` 的实际值以及数据库中的版本关系 | 无法确定最终版本，或请求是否因无效、缺失、跨家族 ID 而 404。 |
| 所选版本是否有 `archive_filename` | 无法确定默认返回归档件还是原件。 |
| 实际文件、存储配置与文件存在性 | 无法断言成功返回具体字节，而不是文件打开时 404。 |
| 版本行与根文档之间是否允许具有不同安全所有者，以及项目对版本权限继承的设计意图 | 虽然可以确定代码只授权根文档，但无法仅据此认定访问另一版本构成越权漏洞。 |
| 允许范围外的认证后端和部署配置 | 无法说明用户如何获得身份，以及权限失败最终呈现为 401 还是 403；不影响“action 前必须通过认证和权限检查”的源码结论。 |

总体而言，源码明确建立的是**根文档级授权、随后进行同一家族版本选择、最后进行文件表示选择**。具体用户是否能下载，以及下载哪一份实际文件，取决于上述数据库和存储事实。