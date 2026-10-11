## 结论

下载接口授权的是**请求文档所属的根文档 `root_doc`**。通过该检查后，`version` 参数可以改变实际返回的 `file_doc`；`original=true` 再决定返回该 `file_doc` 的原始文件还是归档文件。代码不会针对所选版本或原始/归档表示重新执行对象授权。

因此，若用户对根文档拥有查看权限，则可下载该根文档家族中的相应版本；选择其他版本只改变返回资源，不改变授权对象。

## 请求入口

- `UnifiedSearchViewSet` 以 `documents` 前缀注册在 `DefaultRouter` 下，并继承 `DocumentViewSet`；路由挂载于 `/api/`。[src/paperless/urls.py:74-78] [src/paperless/urls.py:97-100] [src/paperless/urls.py:297-298] [src/documents/views.py:2503-2507]
- `download` 是 GET detail action，因此形成形如：

  `GET /api/documents/{pk}/download/`

  的路由。它将路径参数 `{pk}` 原样传给 `file_response`，并固定使用 `attachment` disposition。[framework/rest_framework-3.18.1/rest_framework/routers.py:130-131] [src/documents/views.py:1834-1839]

## 授权顺序

### 1. DRF 请求级检查

`DocumentViewSet` 配置：

```python
permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
```

[src/documents/views.py:1008-1027]

DRF 在调用 `download` 前依次执行认证和请求级权限检查。[framework/rest_framework-3.18.1/rest_framework/views.py:404-421]

这意味着：

1. `IsAuthenticated` 要求 `request.user.is_authenticated`。[framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151]
2. `PaperlessObjectPermissions` 把 GET 映射为模型权限 `documents.view_document`。[src/documents/permissions.py:30-44]
3. 它继承的请求级实现根据 view queryset 的模型调用 `request.user.has_perms(...)`，所以用户还须通过该模型级查看权限检查。[framework/rest_framework-3.18.1/rest_framework/permissions.py:218-246]

### 2. 路径文档及根文档检查

进入处理器后，`pk` 使用 `Document.global_objects.get(id=pk)` 查找，因此这里未使用普通 queryset 或 `PermittedObjectsFilter`；找不到即 404。[src/documents/views.py:1401-1415]

随后：

1. 将该行记为 `request_doc`。
2. 若它是版本文档，则取得它的 `root_document`；否则根文档就是它自己。[src/documents/views.py:1417-1420] [src/documents/versioning.py:146-156]
3. 对 **`root_doc`** 调用：

   ```python
   has_perms_owner_aware(request.user, "view_document", root_doc)
   ```

   失败时立即返回 403，尚未选择最终版本或打开文件。[src/documents/views.py:1421-1427]

该检查允许以下任一情况：

- 根文档无 owner；
- 根文档 owner 是当前用户；
- Guardian `ObjectPermissionChecker` 确认当前用户对根文档有 `view_document` 对象权限。

[src/documents/permissions.py:624-635]

这个 action 不调用 `self.get_object()` 或 `check_object_permissions()`；所以 `PaperlessObjectPermissions.has_object_permission()` 并不是这里的最终对象检查，应用自己的 `has_perms_owner_aware(..., root_doc)` 才是。[framework/rest_framework-3.18.1/rest_framework/views.py:344-355]

## 版本选择

授权通过后才计算 `file_doc`。[src/documents/views.py:1429-1441]

### 路径 `pk` 本身是版本文档，且没有 `version` 参数

直接返回该 `request_doc`，即 URL 中指定的版本本身。[src/documents/views.py:1388-1399]

### 其他情况

从 `root_doc` 解析版本：

- 没有 `version`，或者其值为空：选择按 `version_index DESC NULLS LAST, id DESC` 排序的最新版本；没有版本时退回根文档。[src/documents/versioning.py:23-28] [src/documents/versioning.py:159-166] [src/documents/versioning.py:169-182]
- `version` 不是整数：`NotFound("Invalid version parameter")`。[src/documents/versioning.py:184-187] [src/documents/views.py:1375-1385]
- 指定 ID 不存在：404。
- 指定文档既不是根文档本身，也不以当前根文档为 `root_document`：404。
- 否则，该候选文档成为 `file_doc`。[src/documents/versioning.py:189-195]

删除状态还有两个分支：

- 显式出现 `version` 参数时，版本解析使用包含已删除记录的 manager；空的 `?version=` 也算“参数出现”。
- 根文档无 `version` 时，最新版本解析使用普通 manager。
- 若 URL 中的 `pk` 本身是版本文档且没有 `version`，它来自前面的 `global_objects` 查找并直接成为 `file_doc`。

[src/documents/views.py:1375-1399] [src/documents/views.py:1408-1413]

## 原始文件与归档文件

`original_requested()` 只在参数值**严格等于字符串 `"true"`**时成立。[src/documents/views.py:1368-1373]

传给 `serve_file` 的选择为：

```python
use_archive =
    not original_requested(request)
    and file_doc.has_archive_version
```

[src/documents/views.py:1442-1448]

所以：

| 条件 | 返回内容 |
|---|---|
| `original=true` | `file_doc.source_file` |
| 未提供 `original=true`，且 `file_doc.archive_filename` 存在 | `file_doc.archive_file` |
| 未提供 `original=true`，但没有归档版本 | 回退到 `file_doc.source_file` |

`has_archive_version` 仅检查 `archive_filename is not None`；原始和归档文件分别从配置的 originals/archive 目录打开。[src/documents/models.py:452-475]

归档分支使用 PDF MIME 类型；原始分支使用文档自己的 MIME 类型。最终构造 `FileResponse`，设置 `Content-Disposition: attachment` 及文件名后返回。[src/documents/views.py:4941-4995]

`follow_formatting` 只改变下载文件名，不改变实际文件。代码直接使用查询参数值的 Python truthiness，没有解析布尔值，因此非空的 `follow_formatting=false` 也会进入真分支。[src/documents/views.py:1447] [src/documents/views.py:4953-4965]

缺失物理文件引发的 `FileNotFoundError` 会由 `download` 转为 404。[src/documents/views.py:1835-1839]

## 授权对象与返回对象的关系

授权对象始终是：

```text
root_doc
```

实际返回对象是：

```text
file_doc = request_doc、最新版本、或显式 version 指定的同根版本
```

因此：

- 选择另一版本会改变实际读取的 `Document` 和文件；
- 选择 original/archive 只改变该 `file_doc` 的文件表示；
- 两者都不会把授权对象从 `root_doc` 改为所选版本或文件表示；
- 所选版本自身的 owner 或对象授权没有被单独检查；
- 显式版本必须属于已获授权的根文档家族，不能用其 ID跳到其他根文档。[src/documents/views.py:1417-1448] [src/documents/versioning.py:189-195]

## 尚缺事实及其阻断的结论

1. **用户是否拥有全局 `documents.view_document` 权限未知**  
   阻止判断请求能否通过 DRF 请求级权限检查。

2. **根文档的 owner、是否无 owner，以及 Guardian 对象授权未知**  
   阻止判断特定用户会收到 403 还是进入版本选择。

3. **`pk`、`version`、`original` 和 `follow_formatting` 的实际值未知**  
   阻止确定具体 `file_doc`、原始/归档分支及下载文件名。

4. **数据库中的根—版本关系、删除状态和 `archive_filename` 未提供**  
   阻止确定版本是否存在、是否属于该根，以及是否有归档表示。

5. **底层原始/归档文件是否实际存在以及存储目录配置未知**  
   阻止断言下载最终成功；文件缺失将产生 404。

6. **认证后端及实际身份配置不在允许证据范围内**  
   源码能证明认证发生在 handler 前，但不能证明某次部署如何认证用户或具体 `request.user` 是谁。

这些未知事实不影响源码层面的顺序结论：**请求级认证/模型权限 → 按 `pk` 取得请求文档及根文档 → 对根文档做 owner-aware 授权 → 选择版本 → 选择原始/归档表示 → 返回文件。**