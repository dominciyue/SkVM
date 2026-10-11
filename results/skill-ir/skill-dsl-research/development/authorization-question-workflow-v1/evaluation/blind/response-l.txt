## 结论摘要

Download 的标准入口是 `GET /api/documents/<pk>/download/`。URL 中的 `pk` 首先标识“请求文档”，但实际返回的文件可能属于同一版本族中的另一文档。关键点是：

- DRF 首先执行认证以及模型级 `documents.view_document` 权限检查。
- 应用随后只对请求文档对应的 **根文档** 执行 owner-aware `view_document` 检查。
- 通过该检查后，代码才依据 `?version=` 选择实际 `file_doc`。
- 被显式选择的版本、其 owner 或其对象授权不会被再次检查。
- `?original=true` 只选择该 `file_doc` 的原件；否则有 archive 时默认返回 archive，没有时回退原件。

因此，授权对象是 **根文档**，最终文件对象是 **选出的 `file_doc`**；两者不一定是同一数据库行。

## 请求入口

`UnifiedSearchViewSet` 注册在 API router 的 `documents` 前缀下，而它继承 `DocumentViewSet`；router URL 被纳入 `/api/` 路径。因此 `@action(detail=True)` 的 `download` 形成 `/api/documents/<pk>/download/` 路由。[src/paperless/urls.py:74-78](src/paperless/urls.py#L74-L78) [src/paperless/urls.py:97-100](src/paperless/urls.py#L97-L100) [src/paperless/urls.py:297-300](src/paperless/urls.py#L297-L300) [framework/rest_framework-3.18.1/rest_framework/routers.py:128-134](framework/rest_framework-3.18.1/rest_framework/routers.py#L128-L134)

`download()` 仅把 `pk`、request 和 `"attachment"` disposition 交给 `file_response()`；文件不存在或文档在处理期间消失时转换为 404。[src/documents/views.py:1834-1839](src/documents/views.py#L1834-L1839)

## 授权顺序

### 1. DRF 的前置检查

该 ViewSet 配置：

```python
permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
```

[src/documents/views.py:1008-1027](src/documents/views.py#L1008-L1027)

DRF 在调用 action handler 前依次完成认证和 `check_permissions()`。[framework/rest_framework-3.18.1/rest_framework/views.py:404-421](framework/rest_framework-3.18.1/rest_framework/views.py#L404-L421) [framework/rest_framework-3.18.1/rest_framework/views.py:490-524](framework/rest_framework-3.18.1/rest_framework/views.py#L490-L524)

相应门槛是：

1. `IsAuthenticated` 要求 `request.user.is_authenticated` 为真。[framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151](framework/rest_framework-3.18.1/rest_framework/permissions.py#L145-L151)
2. `PaperlessObjectPermissions` 将 GET 映射为 `view_document`。[src/documents/permissions.py:30-44](src/documents/permissions.py#L30-L44)
3. 其继承的模型级 `has_permission()` 调用 `request.user.has_perms()`，因此要求全局/模型级 `documents.view_document` 权限，而不是在此阶段依据文档所有权放行。[framework/rest_framework-3.18.1/rest_framework/permissions.py:233-246](framework/rest_framework-3.18.1/rest_framework/permissions.py#L233-L246)

Download 没有调用 `get_object()` 或 `check_object_permissions()`；DRF 不会仅因它是 detail action 就自动检查 `pk` 对应对象。这里真正的对象检查是下面的应用级手工检查。

### 2. 解析请求文档并检查根文档

`file_response()` 以 `include_deleted=True` 调用 `_resolve_request_and_root_doc()`。[src/documents/views.py:1429-1436](src/documents/views.py#L1429-L1436)

解析过程为：

1. 使用 `Document.global_objects.get(id=pk)` 加载 `request_doc`，所以软删除文档也在候选范围内；不存在则 404。
2. 从它取得 `root_doc`：若请求的是根文档，则根就是自身；若请求的是版本，则取其 `root_document`。
3. 对 **`root_doc`** 调用  
   `has_perms_owner_aware(request.user, "view_document", root_doc)`。
4. 失败立即返回 403，成功才继续选择实际文件文档。

[src/documents/views.py:1401-1427](src/documents/views.py#L1401-L1427) [src/documents/versioning.py:146-156](src/documents/versioning.py#L146-L156)

owner-aware 判定在以下任一条件成立时成功：

- 根文档无 owner；
- 根文档 owner 是当前用户；
- Guardian `ObjectPermissionChecker` 确认用户拥有该根文档的指定权限。

[src/documents/permissions.py:624-635](src/documents/permissions.py#L624-L635)

所以，题设“用户拥有请求文档”产生两种结果：

- **`pk` 是根文档**：题设所有权足以通过这个手工根文档检查，但仍不证明前面的模型级权限检查会通过。
- **`pk` 是某个版本**：拥有该版本并不足以通过检查；必须另外知道用户是否拥有根文档、根文档是否无 owner，或用户是否获得根文档的 `view_document` 对象授权。

## 版本选择的全部主要分支

授权成功后才调用 `_get_effective_file_doc()`；所以版本选择发生在根文档授权之后。[src/documents/views.py:1435-1441](src/documents/views.py#L1435-L1441)

### 没有 `version` 查询键

- 请求文档是某个版本（`root_document_id != None`）：直接返回该 `request_doc`。
- 请求文档是根文档：选择该根下最新版本；没有版本时返回根文档自身。

[src/documents/views.py:1388-1399](src/documents/views.py#L1388-L1399) [src/documents/versioning.py:159-166](src/documents/versioning.py#L159-L166)

“最新”按 `version_index` 降序、再按 ID 降序决定。[src/documents/versioning.py:23-28](src/documents/versioning.py#L23-L28)

### 存在 `version` 查询键

`version` 从 `request.query_params` 读取。[src/documents/versioning.py:140-143](src/documents/versioning.py#L140-L143)

- 空值 `?version=`：由于键存在，会进入版本解析；空值又被解析器当作“未指定具体版本”，因此选择最新版本。
- 非整数：产生 `"Invalid version parameter"` 的 404。
- 整数但文档不存在：404。
- 整数指向其他版本族的文档：404。
- 整数指向当前根文档自身，或其直接版本：选为 `file_doc`。

[src/documents/versioning.py:169-195](src/documents/versioning.py#L169-L195) [src/documents/views.py:1375-1386](src/documents/views.py#L1375-L1386)

因为 Download 使用 `include_deleted=True`，请求文档、默认最新版本和显式版本解析均使用包括软删除记录的 manager。

## 原件与 archive 的选择

选定 `file_doc` 后：

```python
use_archive = (
    not original_requested(request)
    and file_doc.has_archive_version
)
```

只有查询参数恰为 `original=true` 才算请求原件。[src/documents/views.py:1368-1373](src/documents/views.py#L1368-L1373) [src/documents/views.py:1442-1447](src/documents/views.py#L1442-L1447)

结果如下：

| 查询及状态 | 返回内容 |
|---|---|
| `original=true` | `file_doc.source_file` |
| 未提供 `original=true`，且 `file_doc` 有 archive | `file_doc.archive_file` |
| 未提供 `original=true`，但没有 archive | `file_doc.source_file` |

`has_archive_version` 等价于 `archive_filename is not None`。原件从 `ORIGINALS_DIR` 打开，archive 从 `ARCHIVE_DIR` 打开。[src/documents/models.py:452-475](src/documents/models.py#L452-L475)

archive 响应固定使用 `application/pdf`；原件使用文档的 `mime_type`。响应为 `FileResponse`，并因 Download 传入 `"attachment"` 而设置附件形式的 `Content-Disposition`。[src/documents/views.py:4941-4973](src/documents/views.py#L4941-L4973) [src/documents/views.py:4988-4995](src/documents/views.py#L4988-L4995)

`follow_formatting` 只影响下载文件名选择，不改变文档、原件/archive 或实际文件路径。[src/documents/views.py:4952-4965](src/documents/views.py#L4952-L4965)

## 授权资源与返回资源的关系

明确结论是：

- **DRF 模型级授权资源**：Document 模型权限。
- **应用对象级授权资源**：`root_doc`。
- **版本选择后的文件资源**：`file_doc`，可以是根、请求版本、最新版本或同根下显式选择的另一版本。
- **原件/archive 选择**：只改变 `file_doc` 上被打开的文件表示，不产生新的对象级授权。
- 所有文件选择都发生在根文档权限检查之后；被选版本没有独立 owner/object-grant 检查。
- 版本 ID 受到同一根文档族约束，不能借 `version` 选择任意无关文档。

## 尚缺事实及其阻断的结论

1. **用户是否有模型级 `documents.view_document` 权限**未知。  
   这阻断“请求能否到达 Download handler”的结论；拥有请求文档本身不足以回答该问题。

2. **当 `pk` 指向版本时，根文档的 owner、无 owner 状态及 Guardian 授权**未知。  
   这阻断“手工根文档检查是否放行”的结论。

3. **具体 `pk`、`version`、版本族及 `version_index` 数据**未知。  
   这阻断确定某次请求最终选择哪个 `file_doc`，但不影响上述分支规则。

4. **所选文档是否有 `archive_filename`，以及 `original` 的实际参数值**未知。  
   这阻断确定最终打开 source 还是 archive。

5. **运行时 `ORIGINALS_DIR`、`ARCHIVE_DIR` 和文件是否实际存在**未知。  
   这阻断确定绝对文件路径及下载是否成功完成；文件打开失败会最终成为 404。

6. **认证后端和对象权限数据库的运行时配置/内容**不在给定证据内。  
   这阻断判定具体凭据如何认证、非 owner 对根文档的 Guardian 权限是否成立；不改变代码中检查对象和检查顺序。

辅助属性检查仍返回 `unknown/unresolved`（未绑定到其机器语义位置）；以上结论依据所列原始源码，而不是机器认证结果。