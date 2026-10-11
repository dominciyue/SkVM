## 结论

Download 的授权对象与最终文件对象并不总是相同：

- 请求先以 URL 中的 `pk` 找到 `request_doc`，再解析它的 `root_doc`。
- 显式对象授权始终针对 `root_doc` 执行。
- 授权通过后，`version` 参数或 URL 指向的具体版本可以令 `file_doc` 变成同一版本族中的另一个文档。
- `original=true` 只在 `file_doc` 内选择原始文件；否则优先返回归档文件。两者都没有独立的再次授权。

因此，**选择其他版本可以改变实际返回的文档记录和文件，但不会把授权对象从根文档改成该版本**。

## 1. 路由和请求入口

`DefaultRouter` 把 `documents` 注册到 `UnifiedSearchViewSet`；该类继承 `DocumentViewSet`。路由被包含在 `/api/` 下。DRF 对 `@action(detail=True)` 生成 `{prefix}/{lookup}/{url_path}/` 形式的动态详情路由，因此入口是：

```text
GET /api/documents/{pk}/download/
```

相关依据：

- `documents` 注册：`src/paperless/urls.py:74-77`
- 路由包含于 `/api/`：`src/paperless/urls.py:97-100,285-300`
- 动态详情路由形式：`framework/rest_framework-3.18.1/rest_framework/routers.py:128-135`
- `download` 是 GET 详情 action，并把 `pk` 传给 `file_response(..., "attachment")`：`src/documents/views.py:1834-1839`
- `UnifiedSearchViewSet` 继承 `DocumentViewSet`：`src/documents/views.py:2503`

## 2. 授权顺序

### 2.1 DRF 入口权限

`DocumentViewSet` 配置：

```python
permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
```

见 `src/documents/views.py:1008-1027`。

DRF 在调用 action 之前依次执行认证和视图级权限检查；权限失败时不会进入 `download`：

- `initial()` 先认证、再 `check_permissions()`：`framework/rest_framework-3.18.1/rest_framework/views.py:404-421`
- 随后 `dispatch()` 才调用绑定的 GET handler：`framework/rest_framework-3.18.1/rest_framework/views.py:490-529`
- `IsAuthenticated` 要求 `request.user.is_authenticated`：`framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151`
- `PaperlessObjectPermissions` 的 GET 模型权限映射位于 `src/documents/permissions.py:34-44`；DRF 的模型权限检查调用 `request.user.has_perms(...)`：`framework/rest_framework-3.18.1/rest_framework/permissions.py:233-246`

这里没有通过 `self.get_object()` 查找下载对象，所以不会因此自动调用通常的 `check_object_permissions()`。`PaperlessObjectPermissions.has_object_permission()` 的“对象 owner 即允许”规则位于 `src/documents/permissions.py:46-53`，但 Download 的真正单对象检查是下面的显式根文档检查。

### 2.2 应用内显式对象权限

`file_response()` 调用：

```python
_resolve_request_and_root_doc(pk, request, include_deleted=True)
```

这一步：

1. 用 `Document.global_objects.get(id=pk)` 查找 `request_doc`，因此包括已删除记录；
2. 从它解析 `root_doc`；
3. 检查调用者对 **`root_doc`** 的 `view_document` 权限；
4. 失败立即返回 HTTP 403；
5. 成功后才选择版本和文件。

见 `src/documents/views.py:1401-1441`。

具体检查为：

```python
has_perms_owner_aware(request.user, "view_document", root_doc)
```

该 helper 在以下任一条件下允许：

- 根文档没有 owner；
- 调用者就是根文档 owner；
- guardian 对象权限检查器确认该权限。

见 `src/documents/permissions.py:624-635`。

虽然代码对 `request.user is None` 跳过这个显式检查，但正常 DRF 路径此前已有 `IsAuthenticated`，所以匿名请求不应到达这里。

## 3. 请求文档和版本选择

### URL `pk`

`pk` 首先选择 `request_doc`。不存在时为 404。随后：

- 如果它本身是根文档，`root_doc = request_doc`；
- 如果它是版本，则使用其 `root_document`；
- 若关联根记录无法取得，helper 回退到传入文档本身。

见：

- `src/documents/views.py:1408-1427`
- `src/documents/versioning.py:146-156`

### 没有 `version` 参数

存在两个分支：

1. **URL 的 `pk` 指向一个版本文档**  
   即 `request_doc.root_document_id is not None`。在没有 `version` 参数时直接返回这个 `request_doc`，不会改选最新版本：  
   `src/documents/views.py:1388-1399`

2. **URL 的 `pk` 指向根文档**  
   从该根的版本中选择最新的非删除版本；没有版本则回退到根文档：  
   `src/documents/versioning.py:159-182`

### 有 `version` 参数

`version` 来自 `request.query_params["version"]`：`src/documents/versioning.py:140-143`。

非空值必须能转成整数，并且候选文档必须：

- 就是当前 `root_doc`；或
- 其 `root_document_id` 等于当前根文档 ID。

因此，`version` 不能选择另一个无关版本族的文档。不存在或不属于该根的候选均产生 404；非整数产生 “Invalid version parameter” 的 404。见：

- `src/documents/versioning.py:169-195`
- `src/documents/views.py:1375-1386`

显式提供 `version` 时允许从 `global_objects` 中解析已删除版本。

一个细节是 `?version=`：

- `_get_effective_file_doc()` 把它视为“参数存在”，所以不采用“URL 直接指向版本”分支；
- 版本解析器又把空字符串视为 false，最终选择最新版本。

## 4. original/archive 文件选择

选定 `file_doc` 后：

```python
use_archive = (
    not original_requested(request)
    and file_doc.has_archive_version
)
```

`original_requested()` 只有在查询参数值精确等于小写字符串 `"true"` 时才为真。见 `src/documents/views.py:1368-1373,1429-1448`。

所以：

| 条件 | 返回内容 |
|---|---|
| `original=true` | `file_doc.source_file` |
| 未精确指定 `original=true`，且存在 archive | `file_doc.archive_file` |
| 未精确指定 `original=true`，且不存在 archive | `file_doc.source_file` |

`serve_file()` 的具体行为：

- archive：打开 `archive_file`，MIME 固定为 `application/pdf`；
- original：打开 `source_file`，使用文档自身 MIME；
- Download 传入 `disposition="attachment"`；
- 构造 `FileResponse` 和下载文件名。

见 `src/documents/views.py:4941-4995`。

`follow_formatting` 只影响文件名选择，不改变文件内容。代码直接使用查询参数的 Python 真值，因此诸如 `follow_formatting=false` 这样的非空字符串仍为真：`src/documents/views.py:1442-1448,4953-4965`。

底层文件不存在时，`download()` 捕获 `FileNotFoundError` 或 `Document.DoesNotExist` 并返回 404：`src/documents/views.py:1834-1839`。

## 5. 授权对象与返回对象的关系

授权和选择的准确顺序是：

```text
DRF 认证及视图级权限
  → 用 pk 找到 request_doc
  → 解析 root_doc
  → 对 root_doc 检查 view_document
  → 选择 file_doc（URL 指定版本、最新版本或 version 参数）
  → 在 file_doc 上选择 archive/source
  → 返回附件
```

由此可得：

- `version` 可以改变返回的 `file_doc`，但授权仍基于先前的 `root_doc`。
- URL 本身指向版本文档时，也检查其根文档，而不是该版本的 owner。
- `original` 与 archive 只是已选 `file_doc` 的两个文件表示，不改变授权资源。
- 选中的版本没有额外 owner 或对象 grant 检查。
- 版本解析器的同根约束阻止通过 `version=<任意其他文档ID>` 跨到无关版本族。

## 6. 在给定前提下可以和不可以确定什么

已知调用者拥有 URL 请求的文档，但这不足以覆盖所有分支：

1. **若 `pk` 指向根文档**  
   显式 `has_perms_owner_aware` 根检查会因 owner 相同而通过。

2. **若 `pk` 指向一个版本文档**  
   调用者拥有该版本，并不必然意味着拥有其根文档。根文档的 owner 或 guardian grant 未给出，所以无法确定显式检查会通过还是返回 403。

3. **DRF 的模型级 GET 权限**  
   调用者是否具有入口所要求的模型权限未给出。文档所有权本身不能证明这个视图级 `has_permission()` 检查一定通过；因此也无法无条件断言请求会进入 `download()`。

4. **具体返回哪个版本**  
   缺少实际 `pk`、`version` 参数以及数据库中的版本关系、删除状态和排序数据，所以只能确定选择算法，不能确定具体 `file_doc`。

5. **返回 original 还是 archive**  
   缺少实际 `original` 参数和所选文档的 `has_archive_version` 值，不能确定具体表示。

6. **下载是否最终成功**  
   存储文件是否实际存在、可打开并未给出；这只阻止确认成功流式返回，失败时相应路径是 404。

7. **部署层结论**  
   允许的源代码没有证明反向代理、外部身份策略或部署侧附加控制。因此可以说明应用源码行为，但不能据此断言部署环境不存在额外拒绝或路由限制。