## 结论

**不符合给定策略。** 下载路径明确检查的是版本族的 `root_doc`，但实际返回文件可能来自随后选出的另一个 `file_doc`。源码中未见对该 `file_doc` 再执行精确对象的 `view_document` 授权。

### 控制流程

1. `DocumentViewSet` 要求 `IsAuthenticated` 和 `PaperlessObjectPermissions`。  
   `src/documents/views.py:1008-1027`

2. `download` 将请求的 `pk` 交给 `file_response`；文档或文件不存在时转换为 404。  
   `src/documents/views.py:1835-1839`

3. 解析器：
   - 由 `pk` 加载 `request_doc`；
   - 如果它是版本文档，则取得其 `root_doc`；
   - 对 **`root_doc`** 执行 owner-aware `view_document` 检查，失败返回 403。  
   `src/documents/views.py:1401-1427`

4. owner-aware 检查在以下任一条件成立时允许：
   - 对象没有 owner；
   - 当前用户就是 owner；
   - 当前用户拥有该对象的对象级权限。  
   `src/documents/permissions.py:624-635`

5. 授权之后才确定实际文件文档：
   - 请求的 `pk` 本身是版本且没有 `version` 参数：使用该版本文档；
   - 否则，根据 `version` 选择根文档或同一版本族中的文档；
   - 不属于该根文档版本族的候选会被拒绝。  
   `src/documents/views.py:1375-1399`  
   `src/documents/versioning.py:169-195`

6. 返回内容来自选定 `file_doc`：
   - 默认在存在 archive 时返回 `archive_file`；
   - `original=true` 或没有 archive 时返回 `source_file`。  
   `src/documents/views.py:1369-1373,1429-1448,4941-4995`

### 资源绑定结果

- **选择其他版本会改变实际提供文件的 Document**，但显式授权对象仍是 `root_doc`。
- **选择 original/archive 不改变被选中的 Document**，只是在同一个 `file_doc` 的 `source_file` 与 `archive_file` 之间选择表示形式。
- 当 `file_doc == root_doc` 时，检查对象与文件对象一致。
- 当下载版本文档，或 `version` 选择了另一个版本而使 `file_doc != root_doc` 时，仅拥有根文档权限即可通过所示检查；这违反“必须授权实际返回文件所属精确文档”的外部策略。

### 未知运行时事实

具体请求最终允许还是拒绝，仍取决于源码外尚未给定的事实：

- 根文档是否无 owner、是否属于当前用户；
- 当前用户是否具有根文档或版本文档的对象授权；
- `pk`、`version`、删除状态和版本族关系；
- 文件是否存在以及是否具有 archive；
- 未被当前语义跟踪完整解析的其他异常及其最终 HTTP 结果。

这些未知事实不会改变源码中的关键关系：**授权检查绑定到 `root_doc`，返回文件绑定到授权后确定的 `file_doc`。**