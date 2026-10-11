## 结论

Download 通过 `GET /api/documents/{pk}/download/` 进入 `DocumentViewSet.download()`。授权对象始终是路径所指文档所属的**根文档**；随后才选择具体版本，并在该版本上选择 original/source 或 archive 文件。因此，`version` 或 `original` 参数会改变返回文件，但不会把授权对象改为所选版本或文件表示。

## 请求与路由

- `documents` 路由注册的是 `UnifiedSearchViewSet`，它继承 `DocumentViewSet`；`download` 是 `detail=True` 的 GET action，所以路径中的 `{pk}` 是文档 ID。[src/paperless/urls.py:75-78] [src/documents/views.py:1834-1839]
- 代码中的兼容重定向也明确指向 `/api/documents/%(pk)s/download/`。[src/paperless/urls.py:305-312]
- `download()` 调用 `file_response(pk, request, "attachment")`，所以成功响应使用附件 disposition；文件不存在等错误转为 404。[src/documents/views.py:1834-1839]

## 授权顺序

1. **DRF 请求级检查先执行。** `APIView.initial()` 依次执行认证和 `check_permissions()`，之后才调用 action。[framework/rest_framework-3.18.1/rest_framework/views.py:404-421]
2. `DocumentViewSet` 配置了：
   - `IsAuthenticated`
   - `PaperlessObjectPermissions`  
   [src/documents/views.py:1008-1027]
3. `IsAuthenticated` 要求 `request.user.is_authenticated`。[framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151]
4. `PaperlessObjectPermissions` 将 GET 映射为 `view_document`；其继承的请求级实现对 `Document` 模型调用 `request.user.has_perms(...)`。因此用户还必须通过模型级 GET 权限检查。[src/documents/permissions.py:30-44] [framework/rest_framework-3.18.1/rest_framework/permissions.py:233-246]
5. 此 action 不调用通用的 `get_object()`，所以不会自动对路径对象调用 DRF 的 `check_object_permissions()`；它实施自己的对象检查。[src/documents/views.py:1834-1839] [framework/rest_framework-3.18.1/rest_framework/views.py:331-355]
6. `file_response()` 先查找路径 `{pk}` 指定的 `request_doc`。因为传入 `include_deleted=True`，这一步使用 `Document.global_objects`，可查到已删除记录；不存在则为 404。[src/documents/views.py:1401-1415] [src/documents/views.py:1429-1436]
7. 它把 `request_doc` 归一化为 `root_doc`，然后检查：
   `has_perms_owner_aware(request.user, "view_document", root_doc)`。失败立即返回 403，尚未选择具体版本或文件。[src/documents/views.py:1417-1427]
8. 该检查在以下任一条件下成功：
   - 根文档没有 owner；
   - 当前用户是根文档 owner；
   - Guardian 检查器确认用户对根文档具有 `view_document` 对象权限。  
   [src/documents/permissions.py:624-635]

## 版本选择

对象授权通过后，才计算 `file_doc`：[src/documents/views.py:1435-1445]

| 路径 `{pk}` 与查询参数 | 所选 `file_doc` |
|---|---|
| `{pk}` 指向版本记录，且完全没有 `version` 参数 | 该路径直接指定的版本 |
| `{pk}` 指向根文档，且没有 `version` 参数 | 最新的未删除版本；没有版本则为根文档 |
| 存在空的 `?version=` | 按“最新版本”处理；由于参数存在，此分支可考虑已删除版本 |
| `?version=<整数>` | 该 ID 必须是根文档本身，或其直接版本 |
| 非整数 `version` | 404，消息为 `Invalid version parameter` |
| ID 不存在或属于另一根文档 | 404 |

这些分支来自：

- 路径直接指向版本且没有 `version` 时，保留该版本；其他情况从根文档解析。[src/documents/views.py:1388-1399]
- 无值/空值选择最新版本；整数值只接受根文档本身或 `candidate.root_document_id == root_doc.id`，因此不能借此选择不相关文档。[src/documents/versioning.py:159-195]
- 显式存在 `version` 参数时，版本解析启用 `include_deleted`; 没有该参数、从根文档选择最新版本时则使用普通 manager。[src/documents/views.py:1375-1386]

## Original 与 archive 选择

版本确定以后，表示选择规则是：

```text
use_archive =
    original 不等于精确字符串 "true"
    且所选 file_doc 有 archive_filename
```

[src/documents/views.py:1368-1373] [src/documents/views.py:1442-1448]

因此：

- `?original=true`：返回所选版本的 `source_file`。
- 没有 `original`、或值不是精确小写 `"true"`：
  - 有 archive：返回 `archive_file`；
  - 无 archive：回退到 `source_file`。
- archive 的存在性仅由 `archive_filename is not None` 决定。[src/documents/models.py:452-475]

`serve_file()` 的最终分支：

- archive：打开 `doc.archive_file`，响应类型固定为 `application/pdf`；
- original/source：打开 `doc.source_file`，使用 `doc.mime_type`；
- 两者都构造 `FileResponse`，设置 `Content-Disposition: attachment` 并返回。[src/documents/views.py:4941-4973] [src/documents/views.py:4988-4995]

`follow_formatting` 只改变下载文件名，不改变字节来源：

- truthy：使用磁盘文件名；
- falsey：使用 `get_public_filename()`。
- 这里直接传递查询字符串，因此任意非空值（包括字符串 `"false"`）在 `serve_file()` 中都是真值。[src/documents/views.py:1447-1447] [src/documents/views.py:4952-4965]

## 授权资源与返回资源的关系

明确区分如下：

- **请求标识对象**：路径 `{pk}` 对应的 `request_doc`，可以是根文档或版本。
- **授权对象**：`root_doc`。
- **返回文件所属对象**：授权之后选出的 `file_doc`，可能是根文档、路径指定版本、最新版本或显式指定的同族版本。
- **返回表示**：`file_doc.source_file` 或 `file_doc.archive_file`。

没有针对所选 `file_doc` 再执行 owner/Guardian 检查，也没有分别针对 original/archive 检查权限。换言之，版本和表示选择只改变授权成功后返回的文件；它们不改变授权所针对的根文档。[src/documents/views.py:1417-1448]

## 无法由现有事实决定的结论

- **用户是否实际获准下载**：缺少该用户是否拥有模型级 `documents.view_document`、根文档 owner、以及根文档对象授权数据。
- **若版本与根文档具有不同 owner/grants，其安全含义如何**：源代码明确只检查根文档，但未提供实际所有权或授权数据，因此不能判断某次请求是否形成跨所有者访问。
- **最终返回哪个版本**：缺少请求的 `{pk}`、`version` 值以及数据库中的根/版本关系和删除状态。
- **最终返回 original 还是 archive**：缺少 `original` 参数和所选版本的 `archive_filename` 状态。
- **能否成功读取文件及具体绝对路径**：缺少运行时 `ORIGINALS_DIR`、`ARCHIVE_DIR`、存储内容和文件存在性；文件缺失会得到 404。[src/documents/models.py:452-475] [src/documents/views.py:1835-1839]
- **接受哪种凭据、外部代理是否施加额外控制**：相关运行时认证和部署配置不在允许证据中；只能确定进入 handler 前必须满足 DRF 的认证/权限检查。

辅助机器属性检查仍为 unresolved，主要缺少完整 dispatch 关系；以上结论来自所引原始源码的直接控制流，而非机器认证结果。