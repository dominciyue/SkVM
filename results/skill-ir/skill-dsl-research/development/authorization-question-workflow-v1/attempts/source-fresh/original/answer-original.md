## 结论

Download 的实际入口是 `GET /api/documents/{pk}/download/`：`documents` 注册到 `UnifiedSearchViewSet`，后者继承 `DocumentViewSet`；`download` 是 `detail=True` 的 GET action。[src/paperless/urls.py:74-77](src/paperless/urls.py#L74-L77) [src/documents/views.py:2503](src/documents/views.py#L2503) [src/documents/views.py:1834-1839](src/documents/views.py#L1834-L1839) [framework/rest_framework-3.18.1/rest_framework/routers.py:128-135](framework/rest_framework-3.18.1/rest_framework/routers.py#L128-L135)

核心授权结论是：

> 权限检查针对 URL 中 `pk` 直接标识的 `request_doc`；随后选择的最新版、显式 `version` 或原始/归档文件不会再接受对象权限检查。

因此，版本选择可能改变实际返回的 `Document` 记录，而授权对象保持为 `request_doc`。`original` 只改变所选 Document 的文件表示，不改变授权资源。

## 请求、版本和返回文件

1. `download()` 将路由中的 `pk` 交给 `file_response()`，并固定使用 `attachment` disposition。[src/documents/views.py:1834-1839](src/documents/views.py#L1834-L1839)

2. `file_response()` 以 `include_deleted=True` 查找 `id=pk`：
   - 使用 `Document.global_objects`，所以路径中的 `pk` 可以命中已删除记录；
   - 找不到则返回 404；
   - 随后确定该记录所属的根文档。[src/documents/views.py:1401-1420](src/documents/views.py#L1401-L1420)

3. 对版本的选择如下：[src/documents/views.py:1375-1399](src/documents/views.py#L1375-L1399) [src/documents/versioning.py:140-143](src/documents/versioning.py#L140-L143) [src/documents/versioning.py:159-195](src/documents/versioning.py#L159-L195)

   - **`pk` 本身是版本，且完全没有 `version` 参数**：直接返回这个 `request_doc`。
   - **其他情况下没有 `version` 参数**：选择根文档的最新非删除版本；没有版本时回退到根文档。
   - **`version=<整数ID>`**：候选必须是根文档本身，或其直接版本；否则 404。显式版本查询使用全局 manager，因此可以选择已删除版本。
   - **`version=` 空字符串**：它在调用层被视为“提供过版本参数”，但解析层将其视为 falsy，结果是从包含已删除记录的集合中选择最新版。
   - **非整数参数**：抛出 `NotFound("Invalid version parameter")`。
   - **不存在或不属于同一版本族的 ID**：404。

4. 选定 `file_doc` 后，表示选择为：[src/documents/views.py:1429-1448](src/documents/views.py#L1429-L1448)

   - 仅当查询参数严格为 `original=true` 时请求原始文件；
   - 否则，如果 `file_doc.has_archive_version` 为真，返回归档文件；
   - 否则回退到原始/source 文件。
   - `original=false`、大小写不同或其他值都不算请求原始文件。

5. `serve_file()` 的最终分支：
   - 归档：`doc.archive_file`，MIME 固定为 `application/pdf`；
   - 原始：`doc.source_file`，MIME 使用 `doc.mime_type`；
   - 返回 `FileResponse` 并设置 `Content-Disposition: attachment`。[src/documents/views.py:4941-4973](src/documents/views.py#L4941-L4973) [src/documents/views.py:4988-4995](src/documents/views.py#L4988-L4995)

`follow_formatting` 只控制使用存储文件名还是公开格式化文件名，不改变所返回的文件内容。它未经布尔解析直接传入，所以任何非空字符串在这些 Python 分支中都为 truthy。[src/documents/views.py:1442-1448](src/documents/views.py#L1442-L1448) [src/documents/views.py:4952-4965](src/documents/views.py#L4952-L4965)

## 授权顺序与授权资源

授权分两层：

1. **进入 action 前的框架级检查**  
   `DocumentViewSet` 配置了 `IsAuthenticated` 和 `PaperlessObjectPermissions`。DRF 在调用 handler 前先执行认证和 `check_permissions()`。[src/documents/views.py:1008-1027](src/documents/views.py#L1008-L1027) [framework/rest_framework-3.18.1/rest_framework/views.py:404-421](framework/rest_framework-3.18.1/rest_framework/views.py#L404-L421)

   对 GET，Paperless 的权限映射要求模型级 `documents.view_document`；DRF 最终调用 `request.user.has_perms(...)`。[src/documents/permissions.py:30-44](src/documents/permissions.py#L30-L44) [framework/rest_framework-3.18.1/rest_framework/permissions.py:233-246](framework/rest_framework-3.18.1/rest_framework/permissions.py#L233-L246)

2. **应用代码中的对象检查**  
   路径 `pk` 被解析成 `request_doc` 后，代码调用：

   `has_perms_owner_aware(request.user, "view_document", request_doc)`

   该检查在任何版本或文件表示选择之前发生；失败时立即返回 403。[src/documents/views.py:1408-1427](src/documents/views.py#L1408-L1427)

   检查允许以下任一情形：
   - 文档没有 owner；
   - 当前用户就是 owner；
   - Guardian `ObjectPermissionChecker` 对该对象授予 `view_document`。[src/documents/permissions.py:624-635](src/documents/permissions.py#L624-L635)

该 action 没有调用 `self.get_object()`，因此没有触发 DRF 通常由对象查找带来的另一轮 `check_object_permissions()`；这里的决定点就是上述显式 owner-aware 检查。

### 不同选择下的授权对象

| 请求情形 | 被授权对象 | 实际文件所属 Document |
|---|---|---|
| `pk` 是版本，无 `version` 参数 | 该版本 | 同一版本 |
| `pk` 是根文档，无 `version` 参数 | 根文档 | 最新版本，或无版本时为根文档 |
| 任意同族 `pk`，显式 `version=<id>` | URL 中的 `request_doc` | 参数指定的根文档、版本或兄弟版本 |
| `original=true` | 不变 | 同一 `file_doc` 的 source 文件 |
| 默认/归档分支 | 不变 | 同一 `file_doc` 的 archive 文件（若存在），否则 source |

所以：

- **原始与归档切换只改变表示。**
- **版本选择会改变实际返回的 Document 资源，但不会改变授权对象。**
- 特别是根文档默认下载最新版，以及显式选择另一版本时，授权对象与返回文件所属对象可以不同。
- 所选 `file_doc` 的 owner 或对象授权不会在 Download 路径中重新检查。

正常 consumer 创建版本时会复制根文档的 `owner_id`，但这只证明该创建路径的默认行为，并不能证明所有现存版本的 owner 和对象授权始终相同。[src/documents/consumer.py:272-281](src/documents/consumer.py#L272-L281)

## 缺失事实及其阻止的结论

- **用户是否拥有模型级 `documents.view_document`**：决定请求能否通过进入 action 前的 `PaperlessObjectPermissions`。
- **`request_doc` 的 owner 及其对象级 grant**：决定显式 owner-aware 检查是通过还是返回 403。
- **所选版本的 owner、对象 grant，以及版本族内权限是否强制同步**：决定“在授权一个记录后返回另一版本”是否形成实际未授权披露。代码路径存在对象不一致，但现有事实不足以断言某个用户确实取得了无权查看的版本。
- **实际 `pk`、`version`、删除状态及版本族数据**：决定最终选择哪个 Document，或返回哪一种 404。
- **所选 Document 是否有 archive、对应文件是否存在**：决定返回 archive、source，或因文件缺失而成为 404。[src/documents/views.py:1835-1839](src/documents/views.py#L1835-L1839)
- **认证后端和 Guardian 中的实际授权数据**：决定具体用户的 grants；允许的源代码只确定检查方式，不能确定运行时结果。
- **部署层文件传输设置**：可能影响字节如何交付，但不改变这里已确定的应用授权对象和选择顺序。

辅助属性检查仍为 `unknown`，原因是其调用关系绑定未完整建立；以上结论来自所列原始源代码，不依赖该机器判定。