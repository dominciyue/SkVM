## 结论

Download 的最终授权对象是**版本家族的根 Document**，而不是所选历史版本，也不是 original/archive 物理文件。版本与 original/archive 参数只会在根文档授权成功后决定返回哪个文件。

## 请求与路由

- `UnifiedSearchViewSet` 注册为 `documents` 路由，并继承 `DocumentViewSet`：[src/paperless/urls.py:74-77](src/paperless/urls.py#L74-L77)、[src/documents/views.py:2503-2507](src/documents/views.py#L2503-L2507)。
- `download` 是 `detail=True` 的 GET action，因此地址为：
  `GET /api/documents/{pk}/download/`  
  [src/documents/views.py:1834-1839](src/documents/views.py#L1834-L1839)、[framework/rest_framework-3.18.1/rest_framework/routers.py:128-135](framework/rest_framework-3.18.1/rest_framework/routers.py#L128-L135)。
- `/fetch/doc/{pk}` 只是重定向至上述地址：[src/paperless/urls.py:304-313](src/paperless/urls.py#L304-L313)。

`pk` 首先标识一个 `Document` 行；它既可以是根文档 ID，也可以是属于某个根文档的版本 ID。

## 授权与选择顺序

1. **DRF 请求级检查**
   - 在调用 `download()` 前，DRF 先执行认证和 `has_permission()`：[rest_framework/views.py:404-421](framework/rest_framework-3.18.1/rest_framework/views.py#L404-L421)。
   - ViewSet 配置了 `IsAuthenticated` 和 `PaperlessObjectPermissions`：[src/documents/views.py:1008-1027](src/documents/views.py#L1008-L1027)。
   - 因而用户必须：
     - 已认证；
     - 对 GET 通过全局 `documents.view_document` 模型权限检查。该 GET 映射见 [src/documents/permissions.py:30-44](src/documents/permissions.py#L30-L44)，继承的模型权限执行见 [rest_framework/permissions.py:233-246](framework/rest_framework-3.18.1/rest_framework/permissions.py#L233-L246)。

2. **查找 URL 指定的文档和根文档**
   - `file_response()` 使用 `Document.global_objects` 查找 `pk`，所以代码有意允许查找软删除记录。
   - 若 `pk` 是版本，则通过 `root_document` 得到根文档；若本身是根，则根文档就是自身。  
     [src/documents/views.py:1401-1420](src/documents/views.py#L1401-L1420)、[src/documents/versioning.py:146-156](src/documents/versioning.py#L146-L156)。

3. **根文档对象授权**
   - 对根文档调用 `has_perms_owner_aware(user, "view_document", root_doc)`：
     - 根文档无 owner：允许；
     - 用户是根文档 owner：允许；
     - 否则必须具有根文档的 Guardian `view_document` 对象权限。  
     [src/documents/views.py:1421-1427](src/documents/views.py#L1421-L1427)、[src/documents/permissions.py:624-635](src/documents/permissions.py#L624-L635)。
   - 失败直接返回 403 `"Insufficient permissions"`。

Download 没有调用 DRF 的 `self.get_object()`，所以 DRF 的自动 `check_object_permissions()` 不会在这里运行；应用用上述根文档手工检查替代它。标准自动检查只位于 `get_object()` 中：[rest_framework/generics.py:79-105](framework/rest_framework-3.18.1/rest_framework/generics.py#L79-L105)。

4. **授权通过后选择文件版本**
   - 若 URL 的 `pk` 本身是版本，且没有 `version` 参数：直接使用该版本。
   - 否则以根文档为范围解析版本：
     - 无 `version`：按最高 `version_index` 选择最新版本；没有版本则使用根文档。
     - `version=<整数ID>`：只接受根文档本身或 `root_document_id` 等于该根文档的版本。
     - 非整数：404 `"Invalid version parameter"`。
     - 不存在或属于其他根文档：404。  
     [src/documents/views.py:1375-1399](src/documents/views.py#L1375-L1399)、[src/documents/versioning.py:159-195](src/documents/versioning.py#L159-L195)。

特别分支：`?version=` 是“参数存在但值为空”。它会选择最新版本，但解析时启用包含软删除记录的 manager；这是 `is not None` 与随后 `if not version_param` 组合产生的行为。

## original/archive 表示选择

选定 `file_doc` 后才选择表示：

| 参数及文件状态 | 返回内容 |
|---|---|
| `original=true`，严格小写字符串 | `file_doc.source_file` |
| 未提供或不是精确的 `true`，且有 archive | `file_doc.archive_file` |
| 未提供或不是精确的 `true`，且无 archive | `file_doc.source_file` |

依据：[src/documents/views.py:1368-1373](src/documents/views.py#L1368-L1373)、[src/documents/views.py:1429-1448](src/documents/views.py#L1429-L1448)、[src/documents/views.py:4941-4965](src/documents/views.py#L4941-L4965)。

Archive 响应使用 `application/pdf`；original 使用所选版本的 `mime_type`。响应为 `FileResponse`，并设置 `Content-Disposition: attachment`。`follow_formatting` 只控制下载文件名使用磁盘文件名还是公开格式化名称，不改变文件内容：[src/documents/views.py:4973-4995](src/documents/views.py#L4973-L4995)。

## 授权资源是否随选择改变

不会：

- `version` 可改变最终 `file_doc`，但候选必须属于已授权根文档的版本家族。
- 代码不检查所选版本自己的 owner 或对象授权。
- `original`/archive 只在所选版本上切换文件路径，也没有独立 ACL。
- 因此授权资源始终是**根 Document**；版本和物理文件只是授权后的表示选择。

## 无法从现有证据确定的事实

- 未给出用户是否拥有全局 `documents.view_document` 权限。
- 未给出根文档 owner、用户/组对象授权，因此无法断言某个具体用户会被允许还是拒绝。
- 未给出实际 `pk`、版本关系、软删除状态、archive 是否存在及磁盘文件状态。
- 认证后端与部署配置不在允许源码内，因此不能确定接受哪些凭据或认证失败最终表现为 401 还是 403。
- 若要判断“不单独检查历史版本 ACL”是否构成安全缺陷，还缺少产品策略：版本究竟应继承根文档权限，还是应具有独立权限。当前源码明确实现的是前者。