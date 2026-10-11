## 结论

Download 的直接入口是：

```text
GET /api/documents/{pk}/download/
```

`documents` 路由注册到 `UnifiedSearchViewSet`，它继承 `DocumentViewSet`；DRF 为 `detail=True` 的 `download` action 生成 `{prefix}/{lookup}/download/` 路由。[src/paperless/urls.py:74-77](src/paperless/urls.py#L74-L77) [framework/rest_framework-3.18.1/rest_framework/routers.py:115-135](framework/rest_framework-3.18.1/rest_framework/routers.py#L115-L135) [src/documents/views.py:2503-2507](src/documents/views.py#L2503-L2507)

另外，`/fetch/doc/{pk}` 会重定向到同一 Download URL。[src/paperless/urls.py:301-313](src/paperless/urls.py#L301-L313)

## 1. 文档与文件选择流程

### 请求中的 `pk`

`download()` 将路由里的 `pk` 原样交给 `file_response()`，并要求响应采用 `attachment` disposition；文件不存在时转为 404。[src/documents/views.py:1834-1839](src/documents/views.py#L1834-L1839)

`file_response()` 首先通过 `Document.global_objects.get(id=pk)` 查找请求指定的 Document 行，因此根文档、版本行以及软删除行都可以成为初始 `request_doc`；不存在则为 404。随后从该行解析其 `root_doc`。[src/documents/views.py:1401-1427](src/documents/views.py#L1401-L1427) 文档版本通过 `root_document` 外键关联到根文档。[src/documents/models.py:315-330](src/documents/models.py#L315-L330)

### 版本选择

权限检查通过后，返回文件所对应的 `file_doc` 按以下分支选择：

1. **`pk` 本身指向版本行，且完全没有 `version` 参数**  
   直接使用该 `request_doc`，不会自动切换到最新版本。[src/documents/views.py:1388-1399](src/documents/views.py#L1388-L1399)

2. **`pk` 指向根文档，且没有 `version` 参数**  
   选择该根文档最新的未删除版本；没有版本时回退到根文档。最新顺序为 `version_index` 降序、再按 ID 降序。[src/documents/versioning.py:23-28](src/documents/versioning.py#L23-L28) [src/documents/versioning.py:159-182](src/documents/versioning.py#L159-L182)

3. **存在非空 `version=<id>`**  
   将参数解析为整数，并仅接受：
   - 根文档自身 ID；或
   - `root_document_id` 等于当前根文档 ID 的版本。

   不存在或属于另一根文档时为 404；非整数产生 “Invalid version parameter” 的 404。这一路径允许解析软删除版本。[src/documents/versioning.py:169-195](src/documents/versioning.py#L169-L195) [src/documents/views.py:1375-1386](src/documents/views.py#L1375-L1386)

4. **存在空参数 `?version=`**  
   代码把“参数存在”与“参数值为空”区别处理：它进入显式版本解析并启用包含软删除行的 manager，但解析函数把空值当作“取最新版本”。因此会选择包含软删除版本在内的最新版本，而不是通常的最新未删除版本。[src/documents/versioning.py:140-143](src/documents/versioning.py#L140-L143) [src/documents/versioning.py:175-182](src/documents/versioning.py#L175-L182) [src/documents/views.py:1375-1381](src/documents/views.py#L1375-L1381)

### original/archive 选择

确定 `file_doc` 后：

- 只有查询值**严格等于小写字符串** `original=true` 才明确要求原始文件。
- 否则，只要所选 `file_doc.archive_filename` 非空，就返回 archive 文件。
- 若没有 archive，则回退到原始 source 文件。[src/documents/views.py:1368-1373](src/documents/views.py#L1368-L1373) [src/documents/views.py:1442-1447](src/documents/views.py#L1442-L1447) [src/documents/models.py:452-475](src/documents/models.py#L452-L475)

Archive 分支打开 `archive_file`、使用 PDF MIME 类型；source 分支打开 `source_file`、使用文档自身 MIME 类型。[src/documents/views.py:4941-4971](src/documents/views.py#L4941-L4971)

`follow_formatting` 没有严格解析成布尔值：任何非空查询值，包括 `follow_formatting=false`，在 Python 条件中都为真，因而会采用磁盘文件名；省略或空值才使用公开格式化文件名。最后响应设置 `Content-Disposition: attachment` 以及 ASCII 和 RFC 5987 文件名。[src/documents/views.py:4948-4995](src/documents/views.py#L4948-L4995)

## 2. 授权检查及顺序

顺序如下：

1. **框架级认证与 view 权限**  
   DRF 在进入 `download()` 前依次执行认证和 permission classes。[framework/rest_framework-3.18.1/rest_framework/views.py:404-421](framework/rest_framework-3.18.1/rest_framework/views.py#L404-L421)

2. **必须是认证用户**  
   `DocumentViewSet` 配置了 `IsAuthenticated` 和 `PaperlessObjectPermissions`；前者要求 `request.user.is_authenticated`。[src/documents/views.py:1008-1027](src/documents/views.py#L1008-L1027) [framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151](framework/rest_framework-3.18.1/rest_framework/permissions.py#L145-L151)

3. **必须具有模型级 `documents.view_document` 权限**  
   `PaperlessObjectPermissions` 把 GET 映射到 `view_document`；继承的 `has_permission()` 在没有具体对象的情况下调用 `request.user.has_perms(...)`。[src/documents/permissions.py:30-44](src/documents/permissions.py#L30-L44) [framework/rest_framework-3.18.1/rest_framework/permissions.py:233-246](framework/rest_framework-3.18.1/rest_framework/permissions.py#L233-L246)

4. **按 `pk` 查找请求行并解析根文档。**

5. **只对根文档进行 owner-aware 对象授权**  
   根文档满足以下任一条件才通过：
   - 无 owner；
   - 当前用户是 owner；
   - Guardian 对该根文档授予 `view_document`。

   否则直接返回 403。[src/documents/views.py:1417-1427](src/documents/views.py#L1417-L1427) [src/documents/permissions.py:624-635](src/documents/permissions.py#L624-L635)

6. **授权之后才选择最终版本和 original/archive 文件**  
   `file_response()` 先完成上述根文档授权，再调用 `_get_effective_file_doc()` 选择版本，最后决定 archive 或 original。[src/documents/views.py:1429-1448](src/documents/views.py#L1429-L1448)

Download 没有调用 DRF 的 `get_object()`；后者才会自动执行 `check_object_permissions()`。这里对象级保护是上述自定义根文档检查。[framework/rest_framework-3.18.1/rest_framework/generics.py:79-105](framework/rest_framework-3.18.1/rest_framework/generics.py#L79-L105)

## 3. 切换版本或 original/archive 是否改变授权资源

**不会。**

授权资源始终是从 URL `pk` 所属版本族解析出的 `root_doc`。授权通过后：

- `version=<id>` 只改变该根文档版本族中使用的 `file_doc`；
- URL 直接指向版本且无 `version` 参数时，只改变被直接采用的版本行；
- `original=true` 只改变所选 `file_doc` 中打开 source 还是 archive；
- archive 是否存在只影响文件表示选择。

没有针对最终 `file_doc`、其 owner、其对象授权，或者 archive/source 文件表示的第二次权限检查。[src/documents/views.py:1388-1448](src/documents/views.py#L1388-L1448)

因此，源码可以确定的是：**根文档授权涵盖随后可选择的关联版本和文件表示。** 是否符合产品授权策略，则取决于版本是否被设计成与根文档共享权限，不能仅凭此路径判定为授权漏洞。

## 4. 缺失事实与受阻结论

| 缺失事实 | 无法据此确定的结论 |
|---|---|
| 当前用户的模型级 `documents.view_document` 权限 | 无法确定请求能否通过框架级 GET 权限检查。 |
| 根文档的 owner、是否无 owner，以及当前用户/组的 Guardian 对象授权 | 无法确定具体用户会在根文档检查处得到 403 还是继续下载。 |
| 实际 `pk`、版本关系、删除状态和 `version` 查询值 | 无法确定最终选择根文档、特定版本还是最新版本。 |
| 所选版本的 `archive_filename` 及 `original` 参数 | 无法确定返回 archive PDF 还是 source 文件。 |
| 实际文件系统和存储配置 | 无法确定文件能成功打开还是最终返回 404。 |
| 版本与根文档是否在产品策略上共享授权；版本 owner、内容敏感性和预期访问主体 | 无法把“只检查根文档、不再检查所选版本”定性为越权或跨主体披露。 |
| 允许范围外的认证配置和部署入口 | 无法确定采用 session、token 等哪种认证机制，或该 URL 是否经额外代理策略保护；但应用源码明确要求最终 `request.user` 已认证。 |

所以，在所有权和对象授权未给出的前提下，不能断言该 authenticated user 有权或无权下载某个具体文件；能确定的是完整的授权和选择顺序，以及最终版本/表示不会改变被检查的授权对象。