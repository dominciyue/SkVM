# CPU Profile

| Duration | Samples | Interval | Functions |
|----------|---------|----------|----------|
| 52.83s | 6803 | 1.0ms | 209 |

**Top 10:** `childForFieldName` 14.3%, `setValue` 12.0%, `(anonymous)` 7.2%, `marshalNode` 6.0%, `update` 5.7%, `stringify` 5.3%, `Hash` 3.8%, `filter` 3.5%, `digest` 3.2%, `tree-sitter.wasm.wasm-function[ts_tree_cursor_child_iterator_next]` 3.1%

## Hot Functions (Self Time)

| Self% | Self | Total% | Total | Function | Location |
|------:|-----:|-------:|------:|----------|----------|
| 14.3% | 7.59s | 14.4% | 7.62s | `childForFieldName` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:729` |
| 12.0% | 6.37s | 12.0% | 6.37s | `setValue` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3268` |
| 7.2% | 3.85s | 7.2% | 3.85s | `(anonymous)` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:536` |
| 6.0% | 3.20s | 6.0% | 3.20s | `marshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1103` |
| 5.7% | 3.01s | 5.7% | 3.01s | `update` | `[native code]` |
| 5.3% | 2.80s | 5.3% | 2.80s | `stringify` | `[native code]` |
| 3.8% | 2.02s | 3.8% | 2.02s | `Hash` | `[native code]` |
| 3.5% | 1.87s | 4.9% | 2.60s | `filter` | `[native code]` |
| 3.2% | 1.71s | 3.2% | 1.71s | `digest` | `[native code]` |
| 3.1% | 1.68s | 3.1% | 1.68s | `tree-sitter.wasm.wasm-function[ts_tree_cursor_child_iterator_next]` | `[native code]` |
| 2.9% | 1.58s | 5.1% | 2.73s | `tree-sitter.wasm.wasm-function[ts_node_child_by_field_id_wasm]` | `[native code]` |
| 2.9% | 1.53s | 36.4% | 19.27s | `expressionEvents` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:242` |
| 2.3% | 1.23s | 3.1% | 1.64s | `setValue` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3280` |
| 1.9% | 1.01s | 1.9% | 1.01s | `tree-sitter.wasm.wasm-function[ts_node_symbol_wasm]` | `[native code]` |
| 1.9% | 1.00s | 100.0% | 136.86s | `flatIntoArrayWithCallback` | `[native code]` |
| 1.7% | 906.4ms | 2.1% | 1.14s | `tree-sitter.wasm.wasm-function[ts_node_child_by_field_id]` | `[native code]` |
| 1.5% | 798.2ms | 8.2% | 4.33s | `type` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:595` |
| 1.3% | 695.1ms | 2.8% | 1.48s | `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_sibling_internal]` | `[native code]` |
| 1.0% | 566.6ms | 4.1% | 2.16s | `tree-sitter.wasm.wasm-function[ts_node_named_children_wasm]` | `[native code]` |
| 0.9% | 489.2ms | 100.0% | 67.44s | `expressionEvents` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:247` |
| 0.8% | 465.8ms | 2.5% | 1.36s | `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_first_child_internal]` | `[native code]` |
| 0.7% | 414.9ms | 8.5% | 4.52s | `get namedChildren` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:864` |
| 0.6% | 362.9ms | 0.6% | 362.9ms | `(anonymous)` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:916` |
| 0.6% | 343.6ms | 12.5% | 6.62s | `hash` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\source-identities.ts:6` |
| 0.6% | 321.7ms | 3.6% | 1.91s | `marshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1104` |
| 0.5% | 307.1ms | 20.6% | 10.93s | `children` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:181` |
| 0.5% | 295.9ms | 0.5% | 295.9ms | `expressionEvents` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:243` |
| 0.5% | 291.0ms | 0.5% | 291.0ms | `LE_HEAP_STORE_I32` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:2496` |
| 0.5% | 269.5ms | 7.0% | 3.72s | `callEvent` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:235` |
| 0.4% | 257.0ms | 0.4% | 257.0ms | `tree-sitter.wasm.wasm-function[ts_tree_cursor_current_node]` | `[native code]` |
| 0.4% | 244.8ms | 0.4% | 244.8ms | `get namedChildren` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:867` |
| 0.4% | 243.2ms | 3.6% | 1.94s | `tree-sitter.wasm.wasm-function[ts_node_is_named]` | `[native code]` |
| 0.4% | 239.4ms | 0.4% | 239.4ms | `tree-sitter.wasm.wasm-function[ts_node__child]` | `[native code]` |
| 0.4% | 235.7ms | 0.4% | 235.7ms | `structuredClone` | `[native code]` |
| 0.4% | 219.0ms | 0.4% | 219.0ms | `unmarshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js` |
| 0.4% | 213.4ms | 3.2% | 1.72s | `marshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1108` |
| 0.4% | 211.7ms | 5.5% | 2.94s | `childForFieldId` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:719` |
| 0.3% | 210.7ms | 0.3% | 210.7ms | `tree-sitter.wasm.wasm-function[dlfree]` | `[native code]` |
| 0.3% | 179.7ms | 100.0% | 131.80s | `flatMap` | `[native code]` |
| 0.3% | 179.4ms | 7.6% | 4.03s | `Node` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:547` |
| 0.3% | 169.8ms | 2.2% | 1.20s | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:285` |
| 0.3% | 165.4ms | 3.6% | 1.93s | `marshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1106` |
| 0.2% | 158.2ms | 0.2% | 158.2ms | `getText` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:134` |
| 0.2% | 146.8ms | 0.2% | 146.8ms | `(anonymous)` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts` |
| 0.2% | 138.8ms | 0.2% | 138.8ms | `tree-sitter.wasm.wasm-function[dlmalloc]` | `[native code]` |
| 0.2% | 133.4ms | 0.2% | 133.4ms | `unmarshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1129` |
| 0.2% | 131.1ms | 3.1% | 1.67s | `marshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1110` |
| 0.2% | 130.9ms | 0.2% | 130.9ms | `digest` | `node:crypto:196` |
| 0.2% | 113.5ms | 0.2% | 113.5ms | `stringSplitFast` | `[native code]` |
| 0.2% | 111.9ms | 0.2% | 111.9ms | `includes` | `[native code]` |
| 0.2% | 109.9ms | 3.2% | 1.72s | `marshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1112` |
| 0.2% | 108.8ms | 5.9% | 3.14s | `get namedChildren` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:871` |
| 0.2% | 108.7ms | 6.5% | 3.45s | `callId` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:742` |
| 0.1% | 102.7ms | 0.1% | 102.7ms | `tree-sitter.wasm.wasm-function[__memset]` | `[native code]` |
| 0.1% | 95.9ms | 0.1% | 95.9ms | `tree-sitter.wasm.wasm-function[ts_node_end_index_wasm]` | `[native code]` |
| 0.1% | 92.8ms | 0.1% | 92.8ms | `LE_HEAP_STORE_I32` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js` |
| 0.1% | 75.9ms | 0.1% | 75.9ms | `(anonymous)` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3944` |
| 0.1% | 67.9ms | 0.1% | 67.9ms | `tree-sitter.wasm.wasm-function[ts_node_symbol]` | `[native code]` |
| 0.1% | 63.1ms | 12.6% | 6.69s | `sourceSyntaxAnchorId` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\source-identities.ts:7` |
| 0.1% | 61.4ms | 0.1% | 61.4ms | `find` | `[native code]` |
| 0.1% | 56.2ms | 3.9% | 2.07s | `Hash` | `node:crypto:178` |
| 0.1% | 54.8ms | 0.1% | 54.8ms | `flatIntoArray` | `[native code]` |
| 0.0% | 52.3ms | 0.0% | 52.3ms | `(anonymous)` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:2490` |
| 0.0% | 47.6ms | 0.0% | 47.6ms | `tree-sitter.wasm.wasm-function[ts_tree_cursor_reset]` | `[native code]` |
| 0.0% | 47.2ms | 0.3% | 204.0ms | `(anonymous)` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:766` |
| 0.0% | 45.0ms | 0.5% | 272.1ms | `callableValue` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:940` |
| 0.0% | 44.8ms | 84.7% | 44.77s | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:283` |
| 0.0% | 44.0ms | 2.0% | 1.06s | `anchor` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:276` |
| 0.0% | 43.4ms | 0.3% | 166.1ms | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:280` |
| 0.0% | 43.0ms | 10.2% | 5.40s | `callEvent` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:234` |
| 0.0% | 41.3ms | 0.0% | 42.2ms | `Hash` | `node:crypto:179` |
| 0.0% | 34.5ms | 100.0% | 56.93s | `expressionEvents` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:248` |
| 0.0% | 32.0ms | 0.2% | 133.5ms | `(anonymous)` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:950` |
| 0.0% | 31.9ms | 0.0% | 31.9ms | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts` |
| 0.0% | 30.9ms | 0.4% | 227.5ms | `tree-sitter.wasm.wasm-function[dlcalloc]` | `[native code]` |
| 0.0% | 30.4ms | 0.0% | 30.4ms | `flat` | `[native code]` |
| 0.0% | 29.1ms | 0.0% | 29.1ms | `(anonymous)` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:2496` |
| 0.0% | 27.7ms | 0.0% | 27.7ms | `192` | `[native code]` |
| 0.0% | 18.0ms | 0.0% | 18.0ms | `sourceExpressionEvents` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:233` |
| 0.0% | 16.8ms | 0.0% | 16.8ms | `270` | `[native code]` |
| 0.0% | 16.5ms | 0.4% | 235.9ms | `endIndex` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:659` |
| 0.0% | 16.4ms | 0.3% | 187.6ms | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:279` |
| 0.0% | 16.2ms | 95.4% | 50.41s | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:760` |
| 0.0% | 16.0ms | 0.0% | 16.0ms | `tree-sitter.wasm.wasm-function[ts_node_child_with_descendant]` | `[native code]` |
| 0.0% | 16.0ms | 0.3% | 172.8ms | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:275` |
| 0.0% | 16.0ms | 0.0% | 16.9ms | `callableValue` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:947` |
| 0.0% | 15.9ms | 0.4% | 227.1ms | `argumentPlacement` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:927` |
| 0.0% | 15.5ms | 0.0% | 15.5ms | `copyDataProperties` | `[native code]` |
| 0.0% | 15.3ms | 0.0% | 15.3ms | `setValue` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3288` |
| 0.0% | 14.9ms | 0.0% | 14.9ms | `resolveCall` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1206` |
| 0.0% | 14.9ms | 0.7% | 378.9ms | `instanceBinding` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:916` |
| 0.0% | 14.6ms | 0.0% | 14.6ms | `Hash` | `node:crypto:177` |
| 0.0% | 14.5ms | 0.0% | 14.5ms | `callableValue` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts` |
| 0.0% | 14.5ms | 0.0% | 14.5ms | `sourceExpressionEvents` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:240` |
| 0.0% | 14.1ms | 0.4% | 259.5ms | `some` | `[native code]` |
| 0.0% | 13.9ms | 0.0% | 14.9ms | `resolveCall` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1176` |
| 0.0% | 13.7ms | 0.4% | 241.4ms | `get namedChildren` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:874` |
| 0.0% | 13.7ms | 0.0% | 13.7ms | `owned` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts` |
| 0.0% | 3.9ms | 0.0% | 3.9ms | `expressionEvents` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts` |
| 0.0% | 2.7ms | 0.6% | 319.9ms | `text` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:670` |
| 0.0% | 2.0ms | 0.1% | 75.7ms | `tree-sitter.wasm.wasm-function[ts_node_descendants_of_type_wasm]` | `[native code]` |
| 0.0% | 1.3ms | 1.6% | 869.8ms | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:284` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `unmarshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1115` |
| 0.0% | 1.1ms | 0.0% | 1.1ms | `owned` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:684` |
| 0.0% | 1.0ms | 0.0% | 1.0ms | `(anonymous)` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:313` |
| 0.0% | 1.0ms | 0.0% | 1.0ms | `Node` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:555` |
| 0.0% | 1.0ms | 0.0% | 1.0ms | `setValue` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js` |
| 0.0% | 1.0ms | 0.0% | 1.0ms | `resolveCall` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1126` |
| 0.0% | 998us | 0.0% | 998us | `moduleQualified` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts` |
| 0.0% | 974us | 0.7% | 410.9ms | `wasm-stub` | `[native code]` |
| 0.0% | 970us | 0.0% | 970us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:676` |
| 0.0% | 952us | 0.0% | 952us | `async (anonymous)` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js` |
| 0.0% | 948us | 0.0% | 948us | `LazyTransform` | `internal:streams/lazy_transform` |
| 0.0% | 939us | 0.0% | 939us | `/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/` | `[native code]` |
| 0.0% | 932us | 1.7% | 946.8ms | `forEach` | `[native code]` |
| 0.0% | 865us | 5.2% | 2.78s | `hash` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:171` |
| 0.0% | 863us | 0.0% | 863us | `resolveDefinitionProofs` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:501` |

## Call Tree (Total Time)

| Total% | Total | Self% | Self | Function | Location |
|-------:|------:|------:|-----:|----------|----------|
| 100.0% | 136.86s | 1.9% | 1.00s | `flatIntoArrayWithCallback` | `[native code]` |
| 100.0% | 131.80s | 0.3% | 179.7ms | `flatMap` | `[native code]` |
| 100.0% | 67.44s | 0.9% | 489.2ms | `expressionEvents` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:247` |
| 100.0% | 56.93s | 0.0% | 34.5ms | `expressionEvents` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:248` |
| 95.4% | 50.41s | 0.0% | 16.2ms | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:760` |
| 94.9% | 50.16s | 0.0% | 0us | `sourceStoreOrder` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:289` |
| 84.7% | 44.77s | 0.0% | 44.8ms | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:283` |
| 36.6% | 19.38s | 0.0% | 0us | `field` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:180` |
| 36.4% | 19.27s | 2.9% | 1.53s | `expressionEvents` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:242` |
| 22.2% | 11.75s | 0.0% | 0us | `childForFieldName` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:730` |
| 20.6% | 10.93s | 0.5% | 307.1ms | `children` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:181` |
| 16.8% | 8.92s | 0.0% | 0us | `childForFieldId` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:718` |
| 14.4% | 7.62s | 14.3% | 7.59s | `childForFieldName` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:729` |
| 12.6% | 6.69s | 0.1% | 63.1ms | `sourceSyntaxAnchorId` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\source-identities.ts:7` |
| 12.5% | 6.62s | 0.6% | 343.6ms | `hash` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\source-identities.ts:6` |
| 12.0% | 6.37s | 12.0% | 6.37s | `setValue` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3268` |
| 10.2% | 5.40s | 0.0% | 43.0ms | `callEvent` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:234` |
| 8.5% | 4.52s | 0.7% | 414.9ms | `get namedChildren` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:864` |
| 8.2% | 4.33s | 1.5% | 798.2ms | `type` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:595` |
| 7.6% | 4.03s | 0.0% | 0us | `unmarshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1126` |
| 7.6% | 4.03s | 0.3% | 179.4ms | `Node` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:547` |
| 7.2% | 3.85s | 7.2% | 3.85s | `(anonymous)` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:536` |
| 7.0% | 3.72s | 0.5% | 269.5ms | `callEvent` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:235` |
| 6.5% | 3.45s | 0.2% | 108.7ms | `callId` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:742` |
| 6.0% | 3.20s | 6.0% | 3.20s | `marshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1103` |
| 5.9% | 3.14s | 0.2% | 108.8ms | `get namedChildren` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:871` |
| 5.7% | 3.01s | 5.7% | 3.01s | `update` | `[native code]` |
| 5.5% | 2.94s | 0.4% | 211.7ms | `childForFieldId` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:719` |
| 5.3% | 2.80s | 5.3% | 2.80s | `stringify` | `[native code]` |
| 5.2% | 2.78s | 0.0% | 865us | `hash` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:171` |
| 5.1% | 2.73s | 2.9% | 1.58s | `tree-sitter.wasm.wasm-function[ts_node_child_by_field_id_wasm]` | `[native code]` |
| 4.9% | 2.60s | 3.5% | 1.87s | `filter` | `[native code]` |
| 4.4% | 2.33s | 0.0% | 0us | `typeId` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:582` |
| 4.1% | 2.16s | 1.0% | 566.6ms | `tree-sitter.wasm.wasm-function[ts_node_named_children_wasm]` | `[native code]` |
| 4.0% | 2.13s | 0.0% | 0us | `createHash` | `node:crypto:201` |
| 3.9% | 2.07s | 0.1% | 56.2ms | `Hash` | `node:crypto:178` |
| 3.8% | 2.02s | 3.8% | 2.02s | `Hash` | `[native code]` |
| 3.6% | 1.94s | 0.4% | 243.2ms | `tree-sitter.wasm.wasm-function[ts_node_is_named]` | `[native code]` |
| 3.6% | 1.93s | 0.3% | 165.4ms | `marshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1106` |
| 3.6% | 1.91s | 0.6% | 321.7ms | `marshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1104` |
| 3.2% | 1.72s | 0.4% | 213.4ms | `marshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1108` |
| 3.2% | 1.72s | 0.2% | 109.9ms | `marshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1112` |
| 3.2% | 1.71s | 3.2% | 1.71s | `digest` | `[native code]` |
| 3.1% | 1.68s | 3.1% | 1.68s | `tree-sitter.wasm.wasm-function[ts_tree_cursor_child_iterator_next]` | `[native code]` |
| 3.1% | 1.67s | 0.2% | 131.1ms | `marshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1110` |
| 3.1% | 1.64s | 2.3% | 1.23s | `setValue` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3280` |
| 2.8% | 1.48s | 1.3% | 695.1ms | `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_sibling_internal]` | `[native code]` |
| 2.5% | 1.36s | 0.8% | 465.8ms | `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_first_child_internal]` | `[native code]` |
| 2.2% | 1.20s | 0.3% | 169.8ms | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:285` |
| 2.1% | 1.14s | 1.7% | 906.4ms | `tree-sitter.wasm.wasm-function[ts_node_child_by_field_id]` | `[native code]` |
| 2.1% | 1.12s | 0.0% | 0us | `map` | `[native code]` |
| 2.0% | 1.06s | 0.0% | 44.0ms | `anchor` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:276` |
| 1.9% | 1.01s | 1.9% | 1.01s | `tree-sitter.wasm.wasm-function[ts_node_symbol_wasm]` | `[native code]` |
| 1.8% | 966.3ms | 0.0% | 0us | `sourceArgumentBindings` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\source-arguments.ts:18` |
| 1.8% | 966.3ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1249` |
| 1.7% | 946.8ms | 0.0% | 932us | `forEach` | `[native code]` |
| 1.7% | 946.8ms | 0.0% | 0us | `resolveCall` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1192` |
| 1.7% | 945.8ms | 0.0% | 0us | `(anonymous)` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1192` |
| 1.6% | 869.8ms | 0.0% | 1.3ms | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:284` |
| 1.6% | 858.7ms | 0.0% | 0us | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:271` |
| 1.6% | 856.9ms | 0.0% | 0us | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:278` |
| 1.1% | 602.2ms | 0.0% | 0us | `sourceStoreOrder` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:268` |
| 1.1% | 591.3ms | 0.0% | 0us | `get namedChildren` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:863` |
| 0.8% | 473.0ms | 0.0% | 0us | `expressionEvents` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:245` |
| 0.7% | 410.9ms | 0.0% | 974us | `wasm-stub` | `[native code]` |
| 0.7% | 380.9ms | 0.0% | 0us | `resolveCall` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1180` |
| 0.7% | 378.9ms | 0.0% | 14.9ms | `instanceBinding` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:916` |
| 0.6% | 362.9ms | 0.6% | 362.9ms | `(anonymous)` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:916` |
| 0.6% | 351.9ms | 0.0% | 0us | `callableValue` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:942` |
| 0.6% | 319.9ms | 0.0% | 2.7ms | `text` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:670` |
| 0.5% | 295.9ms | 0.5% | 295.9ms | `expressionEvents` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:243` |
| 0.5% | 291.0ms | 0.5% | 291.0ms | `LE_HEAP_STORE_I32` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:2496` |
| 0.5% | 276.8ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:630` |
| 0.5% | 276.5ms | 0.0% | 0us | `resolveCall` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1022` |
| 0.5% | 274.4ms | 0.0% | 0us | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:277` |
| 0.5% | 272.1ms | 0.0% | 45.0ms | `callableValue` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:940` |
| 0.4% | 259.5ms | 0.0% | 14.1ms | `some` | `[native code]` |
| 0.4% | 259.5ms | 0.0% | 0us | `callableValue` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:950` |
| 0.4% | 257.0ms | 0.4% | 257.0ms | `tree-sitter.wasm.wasm-function[ts_tree_cursor_current_node]` | `[native code]` |
| 0.4% | 245.0ms | 0.0% | 0us | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:273` |
| 0.4% | 244.8ms | 0.4% | 244.8ms | `get namedChildren` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:867` |
| 0.4% | 241.4ms | 0.0% | 13.7ms | `get namedChildren` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:874` |
| 0.4% | 239.4ms | 0.4% | 239.4ms | `tree-sitter.wasm.wasm-function[ts_node__child]` | `[native code]` |
| 0.4% | 236.0ms | 0.0% | 0us | `(anonymous)` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:247` |
| 0.4% | 235.9ms | 0.0% | 16.5ms | `endIndex` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:659` |
| 0.4% | 235.7ms | 0.4% | 235.7ms | `structuredClone` | `[native code]` |
| 0.4% | 234.2ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:613` |
| 0.4% | 227.5ms | 0.0% | 30.9ms | `tree-sitter.wasm.wasm-function[dlcalloc]` | `[native code]` |
| 0.4% | 227.1ms | 0.0% | 15.9ms | `argumentPlacement` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:927` |
| 0.4% | 219.0ms | 0.4% | 219.0ms | `unmarshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js` |
| 0.3% | 210.7ms | 0.3% | 210.7ms | `tree-sitter.wasm.wasm-function[dlfree]` | `[native code]` |
| 0.3% | 204.0ms | 0.0% | 0us | `count` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:766` |
| 0.3% | 204.0ms | 0.0% | 47.2ms | `(anonymous)` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:766` |
| 0.3% | 187.6ms | 0.0% | 16.4ms | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:279` |
| 0.3% | 187.4ms | 0.0% | 0us | `resolveDefinitionProofs` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:532` |
| 0.3% | 184.6ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1230` |
| 0.3% | 172.8ms | 0.0% | 16.0ms | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:275` |
| 0.3% | 166.1ms | 0.0% | 43.4ms | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:280` |
| 0.3% | 160.6ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1247` |
| 0.3% | 159.0ms | 0.0% | 0us | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:282` |
| 0.2% | 158.2ms | 0.2% | 158.2ms | `getText` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:134` |
| 0.2% | 150.7ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1271` |
| 0.2% | 146.8ms | 0.2% | 146.8ms | `(anonymous)` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts` |
| 0.2% | 145.7ms | 0.0% | 0us | `resolveCall` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1025` |
| 0.2% | 138.8ms | 0.2% | 138.8ms | `tree-sitter.wasm.wasm-function[dlmalloc]` | `[native code]` |
| 0.2% | 138.1ms | 0.0% | 0us | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:281` |
| 0.2% | 133.5ms | 0.0% | 32.0ms | `(anonymous)` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:950` |
| 0.2% | 133.4ms | 0.2% | 133.4ms | `unmarshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1129` |
| 0.2% | 130.9ms | 0.2% | 130.9ms | `digest` | `node:crypto:196` |
| 0.2% | 113.5ms | 0.2% | 113.5ms | `stringSplitFast` | `[native code]` |
| 0.2% | 111.9ms | 0.2% | 111.9ms | `includes` | `[native code]` |
| 0.2% | 110.0ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:770` |
| 0.1% | 102.7ms | 0.1% | 102.7ms | `tree-sitter.wasm.wasm-function[__memset]` | `[native code]` |
| 0.1% | 99.9ms | 0.0% | 0us | `get typeId` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:582` |
| 0.1% | 95.9ms | 0.1% | 95.9ms | `tree-sitter.wasm.wasm-function[ts_node_end_index_wasm]` | `[native code]` |
| 0.1% | 93.9ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:771` |
| 0.1% | 92.8ms | 0.1% | 92.8ms | `LE_HEAP_STORE_I32` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js` |
| 0.1% | 77.6ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1699` |
| 0.1% | 75.9ms | 0.1% | 75.9ms | `(anonymous)` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3944` |
| 0.1% | 75.9ms | 0.0% | 0us | `getText` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:121` |
| 0.1% | 75.7ms | 0.0% | 2.0ms | `tree-sitter.wasm.wasm-function[ts_node_descendants_of_type_wasm]` | `[native code]` |
| 0.1% | 75.7ms | 0.0% | 0us | `descendants` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:182` |
| 0.1% | 75.7ms | 0.0% | 0us | `descendantsOfType` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:905` |
| 0.1% | 67.9ms | 0.1% | 67.9ms | `tree-sitter.wasm.wasm-function[ts_node_symbol]` | `[native code]` |
| 0.1% | 61.4ms | 0.1% | 61.4ms | `find` | `[native code]` |
| 0.1% | 57.3ms | 0.0% | 0us | `expressionEvents` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:244` |
| 0.1% | 54.8ms | 0.1% | 54.8ms | `flatIntoArray` | `[native code]` |
| 0.0% | 52.3ms | 0.0% | 52.3ms | `(anonymous)` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:2490` |
| 0.0% | 52.3ms | 0.0% | 0us | `unmarshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1125` |
| 0.0% | 52.3ms | 0.0% | 0us | `getValue` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:2662` |
| 0.0% | 47.6ms | 0.0% | 47.6ms | `tree-sitter.wasm.wasm-function[ts_tree_cursor_reset]` | `[native code]` |
| 0.0% | 45.9ms | 0.0% | 0us | `resolveDefinitionProofs` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:473` |
| 0.0% | 44.9ms | 0.0% | 0us | `tree-sitter.wasm.wasm-function[ts_parser_parse_wasm]` | `[native code]` |
| 0.0% | 44.9ms | 0.0% | 0us | `parse` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3973` |
| 0.0% | 44.9ms | 0.0% | 0us | `(anonymous)` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3646` |
| 0.0% | 44.9ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:304` |
| 0.0% | 42.2ms | 0.0% | 41.3ms | `Hash` | `node:crypto:179` |
| 0.0% | 33.4ms | 0.0% | 0us | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:274` |
| 0.0% | 32.9ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:292` |
| 0.0% | 32.9ms | 0.0% | 0us | `(module)` | `D:\skill优化\SkVM\results\skill-ir\skill-dsl-research\development\authorization-task-binding-v1\profile-hot-file.ts:7` |
| 0.0% | 32.5ms | 0.0% | 0us | `expressionEvents` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:269` |
| 0.0% | 31.9ms | 0.0% | 31.9ms | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts` |
| 0.0% | 30.7ms | 0.0% | 0us | `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_next_sibling]` | `[native code]` |
| 0.0% | 30.7ms | 0.0% | 0us | `callableValue` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:941` |
| 0.0% | 30.4ms | 0.0% | 30.4ms | `flat` | `[native code]` |
| 0.0% | 29.8ms | 0.0% | 0us | `tree-sitter.wasm.wasm-function[ts_stack_push]` | `[native code]` |
| 0.0% | 29.1ms | 0.0% | 29.1ms | `(anonymous)` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:2496` |
| 0.0% | 27.7ms | 0.0% | 27.7ms | `192` | `[native code]` |
| 0.0% | 18.1ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:313` |
| 0.0% | 18.0ms | 0.0% | 18.0ms | `sourceExpressionEvents` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:233` |
| 0.0% | 18.0ms | 0.0% | 0us | `event` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:287` |
| 0.0% | 16.9ms | 0.0% | 16.0ms | `callableValue` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:947` |
| 0.0% | 16.8ms | 0.0% | 16.8ms | `270` | `[native code]` |
| 0.0% | 16.2ms | 0.0% | 0us | `get parent` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:970` |
| 0.0% | 16.0ms | 0.0% | 0us | `sourceStoreOrder` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:267` |
| 0.0% | 16.0ms | 0.0% | 0us | `tree-sitter.wasm.wasm-function[ts_node_parent_wasm]` | `[native code]` |
| 0.0% | 16.0ms | 0.0% | 16.0ms | `tree-sitter.wasm.wasm-function[ts_node_child_with_descendant]` | `[native code]` |
| 0.0% | 15.5ms | 0.0% | 15.5ms | `copyDataProperties` | `[native code]` |
| 0.0% | 15.3ms | 0.0% | 15.3ms | `setValue` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3288` |
| 0.0% | 15.1ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:666` |
| 0.0% | 15.1ms | 0.0% | 0us | `sourceControlPath` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:214` |
| 0.0% | 15.0ms | 0.0% | 0us | `parent` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:971` |
| 0.0% | 15.0ms | 0.0% | 0us | `tree-sitter.wasm.wasm-function[stack__iter]` | `[native code]` |
| 0.0% | 15.0ms | 0.0% | 0us | `tree-sitter.wasm.wasm-function[ts_parser__reduce]` | `[native code]` |
| 0.0% | 14.9ms | 0.0% | 14.9ms | `resolveCall` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1206` |
| 0.0% | 14.9ms | 0.0% | 13.9ms | `resolveCall` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1176` |
| 0.0% | 14.6ms | 0.0% | 14.6ms | `Hash` | `node:crypto:177` |
| 0.0% | 14.5ms | 0.0% | 14.5ms | `callableValue` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts` |
| 0.0% | 14.5ms | 0.0% | 14.5ms | `sourceExpressionEvents` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:240` |
| 0.0% | 13.7ms | 0.0% | 0us | `(anonymous)` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:722` |
| 0.0% | 13.7ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:722` |
| 0.0% | 13.7ms | 0.0% | 13.7ms | `owned` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts` |
| 0.0% | 13.3ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:409` |
| 0.0% | 12.7ms | 0.0% | 0us | `localConstructor` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:992` |
| 0.0% | 12.5ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:774` |
| 0.0% | 3.9ms | 0.0% | 3.9ms | `expressionEvents` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts` |
| 0.0% | 2.9ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:787` |
| 0.0% | 1.9ms | 0.0% | 0us | `moduleQualified` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:906` |
| 0.0% | 1.2ms | 0.0% | 1.2ms | `unmarshalNode` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1115` |
| 0.0% | 1.1ms | 0.0% | 0us | `(anonymous)` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:685` |
| 0.0% | 1.1ms | 0.0% | 1.1ms | `owned` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:684` |
| 0.0% | 1.1ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:685` |
| 0.0% | 1.1ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:651` |
| 0.0% | 1.0ms | 0.0% | 1.0ms | `Node` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:555` |
| 0.0% | 1.0ms | 0.0% | 1.0ms | `(anonymous)` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:313` |
| 0.0% | 1.0ms | 0.0% | 0us | `attribute` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:903` |
| 0.0% | 1.0ms | 0.0% | 0us | `linearize` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:863` |
| 0.0% | 1.0ms | 0.0% | 0us | `resolveCall` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1166` |
| 0.0% | 1.0ms | 0.0% | 0us | `boundedText` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:655` |
| 0.0% | 1.0ms | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:656` |
| 0.0% | 1.0ms | 0.0% | 0us | `get parent` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:971` |
| 0.0% | 1.0ms | 0.0% | 1.0ms | `setValue` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js` |
| 0.0% | 1.0ms | 0.0% | 1.0ms | `resolveCall` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1126` |
| 0.0% | 998us | 0.0% | 998us | `moduleQualified` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts` |
| 0.0% | 983us | 0.0% | 0us | `(anonymous)` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:630` |
| 0.0% | 970us | 0.0% | 970us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:676` |
| 0.0% | 952us | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:297` |
| 0.0% | 952us | 0.0% | 0us | `async init` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3870` |
| 0.0% | 952us | 0.0% | 0us | `async (anonymous)` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:176` |
| 0.0% | 952us | 0.0% | 0us | `async (anonymous)` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:174` |
| 0.0% | 952us | 0.0% | 0us | `languages` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:177` |
| 0.0% | 952us | 0.0% | 0us | `async initializeBinding` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3833` |
| 0.0% | 952us | 0.0% | 0us | `async initializeBinding` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3835` |
| 0.0% | 952us | 0.0% | 952us | `async (anonymous)` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js` |
| 0.0% | 952us | 0.0% | 0us | `async init` | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3869` |
| 0.0% | 949us | 0.0% | 0us | `async buildStructureIndex` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:328` |
| 0.0% | 948us | 0.0% | 948us | `LazyTransform` | `internal:streams/lazy_transform` |
| 0.0% | 939us | 0.0% | 939us | `/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/` | `[native code]` |
| 0.0% | 863us | 0.0% | 863us | `resolveDefinitionProofs` | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:501` |

## Function Details

### `childForFieldName`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:729` | Self: 14.3% (7.59s) | Total: 14.4% (7.62s) | Samples: 994

**Called by:**
- `field` (997)

**Calls:**
- `unmarshalNode` (3)

### `setValue`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3268` | Self: 12.0% (6.37s) | Total: 12.0% (6.37s) | Samples: 872

**Called by:**
- `marshalNode` (182)
- `marshalNode` (178)
- `marshalNode` (177)
- `marshalNode` (168)
- `marshalNode` (167)

### `(anonymous)`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:536` | Self: 7.2% (3.85s) | Total: 7.2% (3.85s) | Samples: 466

**Called by:**
- `Node` (466)

### `marshalNode`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1103` | Self: 6.0% (3.20s) | Total: 6.0% (3.20s) | Samples: 399

**Called by:**
- `childForFieldId` (205)
- `typeId` (85)
- `get namedChildren` (69)
- `endIndex` (22)
- `get typeId` (16)
- `get parent` (2)

### `update`
`[native code]` | Self: 5.7% (3.01s) | Total: 5.7% (3.01s) | Samples: 371

**Called by:**
- `hash` (214)
- `hash` (157)

### `stringify`
`[native code]` | Self: 5.3% (2.80s) | Total: 5.3% (2.80s) | Samples: 353

**Called by:**
- `hash` (257)
- `hash` (96)

### `Hash`
`[native code]` | Self: 3.8% (2.02s) | Total: 3.8% (2.02s) | Samples: 250

**Called by:**
- `Hash` (250)

### `filter`
`[native code]` | Self: 3.5% (1.87s) | Total: 4.9% (2.60s) | Samples: 263

**Called by:**
- `children` (262)
- `instanceBinding` (45)
- `count` (27)
- `resolveCall` (21)
- `async buildStructureIndex` (1)
- `async buildStructureIndex` (1)
- `async buildStructureIndex` (1)
- `localConstructor` (1)

**Calls:**
- `(anonymous)` (44)
- `(anonymous)` (27)
- `(anonymous)` (22)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)

### `digest`
`[native code]` | Self: 3.2% (1.71s) | Total: 3.2% (1.71s) | Samples: 227

**Called by:**
- `hash` (136)
- `callId` (91)

### `tree-sitter.wasm.wasm-function[ts_tree_cursor_child_iterator_next]`
`[native code]` | Self: 3.1% (1.68s) | Total: 3.1% (1.68s) | Samples: 229

**Called by:**
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_first_child_internal]` (117)
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_sibling_internal]` (112)

### `tree-sitter.wasm.wasm-function[ts_node_child_by_field_id_wasm]`
`[native code]` | Self: 2.9% (1.58s) | Total: 5.1% (2.73s) | Samples: 224

**Called by:**
- `childForFieldId` (386)

**Calls:**
- `tree-sitter.wasm.wasm-function[ts_node_child_by_field_id]` (162)

### `expressionEvents`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:242` | Self: 2.9% (1.53s) | Total: 36.4% (19.27s) | Samples: 203

**Called by:**
- `flatIntoArrayWithCallback` (2186)
- `expressionEvents` (237)
- `event` (129)
- `event` (7)
- `expressionEvents` (4)
- `async buildStructureIndex` (2)

**Calls:**
- `field` (2323)
- `unmarshalNode` (37)
- `childForFieldId` (2)

### `setValue`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3280` | Self: 2.3% (1.23s) | Total: 3.1% (1.64s) | Samples: 147

**Called by:**
- `marshalNode` (44)
- `marshalNode` (42)
- `marshalNode` (42)
- `marshalNode` (40)
- `marshalNode` (31)

**Calls:**
- `LE_HEAP_STORE_I32` (36)
- `LE_HEAP_STORE_I32` (14)
- `(anonymous)` (2)

### `tree-sitter.wasm.wasm-function[ts_node_symbol_wasm]`
`[native code]` | Self: 1.9% (1.01s) | Total: 1.9% (1.01s) | Samples: 136

**Called by:**
- `type` (124)
- `wasm-stub` (12)

### `flatIntoArrayWithCallback`
`[native code]` | Self: 1.9% (1.00s) | Total: 100.0% (136.86s) | Samples: 119

**Called by:**
- `flatMap` (16903)
- `sourceStoreOrder` (509)
- `sourceArgumentBindings` (105)
- `expressionEvents` (26)
- `async buildStructureIndex` (21)
- `flatIntoArrayWithCallback` (10)
- `event` (2)

**Calls:**
- `event` (5817)
- `expressionEvents` (4325)
- `expressionEvents` (4256)
- `expressionEvents` (2186)
- `event` (148)
- `map` (126)
- `event` (116)
- `event` (102)
- `event` (98)
- `(anonymous)` (38)
- `event` (32)
- `event` (29)
- `event` (28)
- `expressionEvents` (26)
- `expressionEvents` (23)
- `event` (21)
- `event` (18)
- `event` (16)
- `event` (15)
- `flatIntoArray` (13)
- `flatIntoArrayWithCallback` (10)
- `expressionEvents` (4)
- `event` (4)
- `expressionEvents` (3)
- `event` (3)

### `tree-sitter.wasm.wasm-function[ts_node_child_by_field_id]`
`[native code]` | Self: 1.7% (906.4ms) | Total: 2.1% (1.14s) | Samples: 125

**Called by:**
- `tree-sitter.wasm.wasm-function[ts_node_child_by_field_id_wasm]` (162)

**Calls:**
- `tree-sitter.wasm.wasm-function[ts_node__child]` (37)

### `type`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:595` | Self: 1.5% (798.2ms) | Total: 8.2% (4.33s) | Samples: 85

**Called by:**
- `expressionEvents` (260)
- `(anonymous)` (38)
- `event` (34)
- `event` (32)
- `event` (29)
- `event` (25)
- `event` (21)
- `event` (18)
- `event` (16)
- `event` (16)
- `event` (13)
- `event` (11)
- `event` (10)
- `event` (3)
- `boundedText` (1)

**Calls:**
- `typeId` (276)
- `tree-sitter.wasm.wasm-function[ts_node_symbol_wasm]` (124)
- `get typeId` (16)
- `wasm-stub` (13)
- `192` (7)
- `tree-sitter.wasm.wasm-function[ts_node_symbol]` (6)

### `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_sibling_internal]`
`[native code]` | Self: 1.3% (695.1ms) | Total: 2.8% (1.48s) | Samples: 93

**Called by:**
- `tree-sitter.wasm.wasm-function[ts_node_named_children_wasm]` (114)
- `tree-sitter.wasm.wasm-function[ts_node_is_named]` (87)
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_next_sibling]` (3)
- `tree-sitter.wasm.wasm-function[ts_node_descendants_of_type_wasm]` (1)

**Calls:**
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_child_iterator_next]` (112)

### `tree-sitter.wasm.wasm-function[ts_node_named_children_wasm]`
`[native code]` | Self: 1.0% (566.6ms) | Total: 4.1% (2.16s) | Samples: 91

**Called by:**
- `get namedChildren` (304)

**Calls:**
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_sibling_internal]` (114)
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_first_child_internal]` (56)
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_current_node]` (21)
- `tree-sitter.wasm.wasm-function[dlcalloc]` (17)
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_reset]` (5)

### `expressionEvents`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:247` | Self: 0.9% (489.2ms) | Total: 100.0% (67.44s) | Samples: 56

**Called by:**
- `event` (4340)
- `flatIntoArrayWithCallback` (4256)
- `expressionEvents` (23)
- `expressionEvents` (23)
- `event` (19)

**Calls:**
- `flatMap` (4628)
- `expressionEvents` (1817)
- `callEvent` (656)
- `callEvent` (488)
- `children` (269)
- `type` (260)
- `expressionEvents` (237)
- `field` (116)
- `unmarshalNode` (73)
- `flatIntoArrayWithCallback` (26)
- `expressionEvents` (23)
- `expressionEvents` (10)
- `unmarshalNode` (2)

### `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_first_child_internal]`
`[native code]` | Self: 0.8% (465.8ms) | Total: 2.5% (1.36s) | Samples: 54

**Called by:**
- `tree-sitter.wasm.wasm-function[ts_node_is_named]` (109)
- `tree-sitter.wasm.wasm-function[ts_node_named_children_wasm]` (56)
- `tree-sitter.wasm.wasm-function[ts_node_descendants_of_type_wasm]` (4)
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_next_sibling]` (2)

**Calls:**
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_child_iterator_next]` (117)

### `get namedChildren`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:864` | Self: 0.7% (414.9ms) | Total: 8.5% (4.52s) | Samples: 57

**Called by:**
- `children` (605)

**Calls:**
- `tree-sitter.wasm.wasm-function[ts_node_named_children_wasm]` (304)
- `tree-sitter.wasm.wasm-function[ts_node_is_named]` (244)

### `(anonymous)`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:916` | Self: 0.6% (362.9ms) | Total: 0.6% (362.9ms) | Samples: 44

**Called by:**
- `filter` (44)

### `hash`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\source-identities.ts:6` | Self: 0.6% (343.6ms) | Total: 12.5% (6.62s) | Samples: 32

**Called by:**
- `sourceSyntaxAnchorId` (810)

**Calls:**
- `stringify` (257)
- `update` (214)
- `createHash` (171)
- `digest` (136)

### `marshalNode`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1104` | Self: 0.6% (321.7ms) | Total: 3.6% (1.91s) | Samples: 40

**Called by:**
- `childForFieldId` (209)
- `typeId` (30)
- `endIndex` (1)

**Calls:**
- `setValue` (167)
- `setValue` (31)
- `setValue` (1)
- `setValue` (1)

### `children`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:181` | Self: 0.5% (307.1ms) | Total: 20.6% (10.93s) | Samples: 41

**Called by:**
- `expressionEvents` (986)
- `expressionEvents` (269)
- `sourceStoreOrder` (74)
- `event` (68)
- `async buildStructureIndex` (2)

**Calls:**
- `get namedChildren` (605)
- `get namedChildren` (370)
- `filter` (262)
- `get namedChildren` (69)
- `get namedChildren` (29)
- `get namedChildren` (23)

### `expressionEvents`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:243` | Self: 0.5% (295.9ms) | Total: 0.5% (295.9ms) | Samples: 44

**Called by:**
- `flatIntoArrayWithCallback` (26)
- `expressionEvents` (10)
- `event` (7)
- `event` (1)

### `LE_HEAP_STORE_I32`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:2496` | Self: 0.5% (291.0ms) | Total: 0.5% (291.0ms) | Samples: 36

**Called by:**
- `setValue` (36)

### `callEvent`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:235` | Self: 0.5% (269.5ms) | Total: 7.0% (3.72s) | Samples: 41

**Called by:**
- `expressionEvents` (488)

**Calls:**
- `callId` (446)
- `(anonymous)` (1)

### `tree-sitter.wasm.wasm-function[ts_tree_cursor_current_node]`
`[native code]` | Self: 0.4% (257.0ms) | Total: 0.4% (257.0ms) | Samples: 34

**Called by:**
- `tree-sitter.wasm.wasm-function[ts_node_named_children_wasm]` (21)
- `tree-sitter.wasm.wasm-function[ts_node_is_named]` (12)
- `tree-sitter.wasm.wasm-function[ts_node_descendants_of_type_wasm]` (1)

### `get namedChildren`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:867` | Self: 0.4% (244.8ms) | Total: 0.4% (244.8ms) | Samples: 29

**Called by:**
- `children` (29)

### `tree-sitter.wasm.wasm-function[ts_node_is_named]`
`[native code]` | Self: 0.4% (243.2ms) | Total: 3.6% (1.94s) | Samples: 26

**Called by:**
- `get namedChildren` (244)

**Calls:**
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_first_child_internal]` (109)
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_sibling_internal]` (87)
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_current_node]` (12)
- `tree-sitter.wasm.wasm-function[dlcalloc]` (9)
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_reset]` (1)

### `tree-sitter.wasm.wasm-function[ts_node__child]`
`[native code]` | Self: 0.4% (239.4ms) | Total: 0.4% (239.4ms) | Samples: 37

**Called by:**
- `tree-sitter.wasm.wasm-function[ts_node_child_by_field_id]` (37)

### `structuredClone`
`[native code]` | Self: 0.4% (235.7ms) | Total: 0.4% (235.7ms) | Samples: 25

**Called by:**
- `resolveCall` (25)

### `unmarshalNode`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js` | Self: 0.4% (219.0ms) | Total: 0.4% (219.0ms) | Samples: 21

**Called by:**
- `get namedChildren` (21)

### `marshalNode`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1108` | Self: 0.4% (213.4ms) | Total: 3.2% (1.72s) | Samples: 23

**Called by:**
- `childForFieldId` (200)
- `typeId` (37)
- `endIndex` (3)

**Calls:**
- `setValue` (177)
- `setValue` (40)

### `childForFieldId`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:719` | Self: 0.4% (211.7ms) | Total: 5.5% (2.94s) | Samples: 27

**Called by:**
- `childForFieldName` (406)
- `(anonymous)` (3)
- `expressionEvents` (2)
- `event` (2)

**Calls:**
- `tree-sitter.wasm.wasm-function[ts_node_child_by_field_id_wasm]` (386)

### `tree-sitter.wasm.wasm-function[dlfree]`
`[native code]` | Self: 0.3% (210.7ms) | Total: 0.3% (210.7ms) | Samples: 20

**Called by:**
- `wasm-stub` (20)

### `flatMap`
`[native code]` | Self: 0.3% (179.7ms) | Total: 100.0% (131.80s) | Samples: 23

**Called by:**
- `expressionEvents` (6322)
- `sourceStoreOrder` (5976)
- `expressionEvents` (4628)

**Calls:**
- `flatIntoArrayWithCallback` (16903)

### `Node`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:547` | Self: 0.3% (179.4ms) | Total: 7.6% (4.03s) | Samples: 29

**Called by:**
- `unmarshalNode` (495)

**Calls:**
- `(anonymous)` (466)

### `event`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:285` | Self: 0.3% (169.8ms) | Total: 2.2% (1.20s) | Samples: 17

**Called by:**
- `flatIntoArrayWithCallback` (148)

**Calls:**
- `anchor` (123)
- `text` (8)

### `marshalNode`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1106` | Self: 0.3% (165.4ms) | Total: 3.6% (1.93s) | Samples: 21

**Called by:**
- `childForFieldId` (203)
- `typeId` (39)
- `endIndex` (2)
- `get parent` (1)

**Calls:**
- `setValue` (182)
- `setValue` (42)

### `getText`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:134` | Self: 0.2% (158.2ms) | Total: 0.2% (158.2ms) | Samples: 20

**Called by:**
- `text` (19)
- `(anonymous)` (1)

### `(anonymous)`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts` | Self: 0.2% (146.8ms) | Total: 0.2% (146.8ms) | Samples: 23

**Called by:**
- `filter` (22)
- `map` (1)

### `tree-sitter.wasm.wasm-function[dlmalloc]`
`[native code]` | Self: 0.2% (138.8ms) | Total: 0.2% (138.8ms) | Samples: 14

**Called by:**
- `tree-sitter.wasm.wasm-function[dlcalloc]` (13)
- `tree-sitter.wasm.wasm-function[stack__iter]` (1)

### `unmarshalNode`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1129` | Self: 0.2% (133.4ms) | Total: 0.2% (133.4ms) | Samples: 15

**Called by:**
- `get namedChildren` (12)
- `expressionEvents` (2)
- `event` (1)

### `marshalNode`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1110` | Self: 0.2% (131.1ms) | Total: 3.1% (1.67s) | Samples: 16

**Called by:**
- `childForFieldId` (184)
- `typeId` (41)
- `endIndex` (1)

**Calls:**
- `setValue` (168)
- `setValue` (42)

### `digest`
`node:crypto:196` | Self: 0.2% (130.9ms) | Total: 0.2% (130.9ms) | Samples: 20

**Called by:**
- `hash` (20)

### `stringSplitFast`
`[native code]` | Self: 0.2% (113.5ms) | Total: 0.2% (113.5ms) | Samples: 14

**Called by:**
- `(anonymous)` (11)
- `moduleQualified` (2)
- `resolveCall` (1)

### `includes`
`[native code]` | Self: 0.2% (111.9ms) | Total: 0.2% (111.9ms) | Samples: 10

**Called by:**
- `some` (10)

### `marshalNode`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1112` | Self: 0.2% (109.9ms) | Total: 3.2% (1.72s) | Samples: 10

**Called by:**
- `childForFieldId` (188)
- `typeId` (44)

**Calls:**
- `setValue` (178)
- `setValue` (44)

### `get namedChildren`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:871` | Self: 0.2% (108.8ms) | Total: 5.9% (3.14s) | Samples: 14

**Called by:**
- `children` (370)

**Calls:**
- `unmarshalNode` (313)
- `unmarshalNode` (21)
- `unmarshalNode` (12)
- `unmarshalNode` (10)

### `callId`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:742` | Self: 0.2% (108.7ms) | Total: 6.5% (3.45s) | Samples: 12

**Called by:**
- `callEvent` (446)

**Calls:**
- `hash` (343)
- `digest` (91)

### `tree-sitter.wasm.wasm-function[__memset]`
`[native code]` | Self: 0.1% (102.7ms) | Total: 0.1% (102.7ms) | Samples: 10

**Called by:**
- `tree-sitter.wasm.wasm-function[dlcalloc]` (9)
- `tree-sitter.wasm.wasm-function[ts_stack_push]` (1)

### `tree-sitter.wasm.wasm-function[ts_node_end_index_wasm]`
`[native code]` | Self: 0.1% (95.9ms) | Total: 0.1% (95.9ms) | Samples: 12

**Called by:**
- `text` (5)
- `callEvent` (5)
- `event` (2)

### `LE_HEAP_STORE_I32`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js` | Self: 0.1% (92.8ms) | Total: 0.1% (92.8ms) | Samples: 14

**Called by:**
- `setValue` (14)

### `(anonymous)`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3944` | Self: 0.1% (75.9ms) | Total: 0.1% (75.9ms) | Samples: 5

**Called by:**
- `getText` (5)

### `tree-sitter.wasm.wasm-function[ts_node_symbol]`
`[native code]` | Self: 0.1% (67.9ms) | Total: 0.1% (67.9ms) | Samples: 6

**Called by:**
- `type` (6)

### `sourceSyntaxAnchorId`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\source-identities.ts:7` | Self: 0.1% (63.1ms) | Total: 12.6% (6.69s) | Samples: 9

**Called by:**
- `callEvent` (633)
- `anchor` (124)
- `event` (26)
- `argumentPlacement` (19)
- `expressionEvents` (8)
- `event` (5)
- `event` (4)

**Calls:**
- `hash` (810)

### `find`
`[native code]` | Self: 0.1% (61.4ms) | Total: 0.1% (61.4ms) | Samples: 6

**Called by:**
- `callableValue` (4)
- `resolveCall` (2)

### `Hash`
`node:crypto:178` | Self: 0.1% (56.2ms) | Total: 3.9% (2.07s) | Samples: 4

**Called by:**
- `createHash` (254)

**Calls:**
- `Hash` (250)

### `flatIntoArray`
`[native code]` | Self: 0.1% (54.8ms) | Total: 0.1% (54.8ms) | Samples: 13

**Called by:**
- `flatIntoArrayWithCallback` (13)

### `(anonymous)`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:2490` | Self: 0.0% (52.3ms) | Total: 0.0% (52.3ms) | Samples: 10

**Called by:**
- `getValue` (10)

### `tree-sitter.wasm.wasm-function[ts_tree_cursor_reset]`
`[native code]` | Self: 0.0% (47.6ms) | Total: 0.0% (47.6ms) | Samples: 6

**Called by:**
- `tree-sitter.wasm.wasm-function[ts_node_named_children_wasm]` (5)
- `tree-sitter.wasm.wasm-function[ts_node_is_named]` (1)

### `(anonymous)`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:766` | Self: 0.0% (47.2ms) | Total: 0.3% (204.0ms) | Samples: 5

**Called by:**
- `filter` (27)

**Calls:**
- `field` (7)
- `text` (5)
- `childForFieldId` (3)
- `childForFieldId` (3)
- `unmarshalNode` (2)
- `getText` (1)
- `unmarshalNode` (1)

### `callableValue`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:940` | Self: 0.0% (45.0ms) | Total: 0.5% (272.1ms) | Samples: 3

**Called by:**
- `(anonymous)` (25)

**Calls:**
- `argumentPlacement` (22)

### `event`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:283` | Self: 0.0% (44.8ms) | Total: 84.7% (44.77s) | Samples: 11

**Called by:**
- `flatIntoArrayWithCallback` (5817)

**Calls:**
- `expressionEvents` (4340)
- `expressionEvents` (1112)
- `expressionEvents` (129)
- `field` (84)
- `unmarshalNode` (48)
- `expressionEvents` (28)
- `text` (27)
- `type` (21)
- `expressionEvents` (7)
- `expressionEvents` (5)
- `childForFieldId` (2)
- `flatIntoArrayWithCallback` (2)
- `unmarshalNode` (1)

### `anchor`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:276` | Self: 0.0% (44.0ms) | Total: 2.0% (1.06s) | Samples: 3

**Called by:**
- `event` (123)
- `event` (9)
- `event` (1)

**Calls:**
- `sourceSyntaxAnchorId` (124)
- `endIndex` (6)

### `event`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:280` | Self: 0.0% (43.4ms) | Total: 0.3% (166.1ms) | Samples: 3

**Called by:**
- `flatIntoArrayWithCallback` (15)

**Calls:**
- `type` (11)
- `anchor` (1)

### `callEvent`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:234` | Self: 0.0% (43.0ms) | Total: 10.2% (5.40s) | Samples: 6

**Called by:**
- `expressionEvents` (656)

**Calls:**
- `sourceSyntaxAnchorId` (633)
- `endIndex` (12)
- `tree-sitter.wasm.wasm-function[ts_node_end_index_wasm]` (5)

### `Hash`
`node:crypto:179` | Self: 0.0% (41.3ms) | Total: 0.0% (42.2ms) | Samples: 3

**Called by:**
- `createHash` (4)

**Calls:**
- `LazyTransform` (1)

### `expressionEvents`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:248` | Self: 0.0% (34.5ms) | Total: 100.0% (56.93s) | Samples: 6

**Called by:**
- `flatIntoArrayWithCallback` (4325)
- `expressionEvents` (1817)
- `event` (1112)
- `event` (29)
- `expressionEvents` (28)
- `async buildStructureIndex` (2)
- `map` (1)

**Calls:**
- `flatMap` (6322)
- `children` (986)

### `(anonymous)`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:950` | Self: 0.0% (32.0ms) | Total: 0.2% (133.5ms) | Samples: 6

**Called by:**
- `some` (17)

**Calls:**
- `stringSplitFast` (11)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts` | Self: 0.0% (31.9ms) | Total: 0.0% (31.9ms) | Samples: 1

**Called by:**
- `async buildStructureIndex` (1)

### `tree-sitter.wasm.wasm-function[dlcalloc]`
`[native code]` | Self: 0.0% (30.9ms) | Total: 0.4% (227.5ms) | Samples: 4

**Called by:**
- `tree-sitter.wasm.wasm-function[ts_node_named_children_wasm]` (17)
- `tree-sitter.wasm.wasm-function[ts_node_is_named]` (9)

**Calls:**
- `tree-sitter.wasm.wasm-function[dlmalloc]` (13)
- `tree-sitter.wasm.wasm-function[__memset]` (9)

### `flat`
`[native code]` | Self: 0.0% (30.4ms) | Total: 0.0% (30.4ms) | Samples: 2

**Called by:**
- `argumentPlacement` (2)

### `(anonymous)`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:2496` | Self: 0.0% (29.1ms) | Total: 0.0% (29.1ms) | Samples: 2

**Called by:**
- `setValue` (2)

### `192`
`[native code]` | Self: 0.0% (27.7ms) | Total: 0.0% (27.7ms) | Samples: 7

**Called by:**
- `type` (7)

### `sourceExpressionEvents`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:233` | Self: 0.0% (18.0ms) | Total: 0.0% (18.0ms) | Samples: 3

**Called by:**
- `expressionEvents` (3)

### `270`
`[native code]` | Self: 0.0% (16.8ms) | Total: 0.0% (16.8ms) | Samples: 2

**Called by:**
- `get namedChildren` (2)

### `endIndex`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:659` | Self: 0.0% (16.5ms) | Total: 0.4% (235.9ms) | Samples: 2

**Called by:**
- `text` (12)
- `callEvent` (12)
- `anchor` (6)
- `event` (1)

**Calls:**
- `marshalNode` (22)
- `marshalNode` (3)
- `marshalNode` (2)
- `marshalNode` (1)
- `marshalNode` (1)

### `event`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:279` | Self: 0.0% (16.4ms) | Total: 0.3% (187.6ms) | Samples: 2

**Called by:**
- `flatIntoArrayWithCallback` (21)

**Calls:**
- `type` (10)
- `anchor` (9)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:760` | Self: 0.0% (16.2ms) | Total: 95.4% (50.41s) | Samples: 2

**Calls:**
- `sourceStoreOrder` (6421)
- `sourceStoreOrder` (74)
- `sourceStoreOrder` (2)
- `expressionEvents` (2)
- `expressionEvents` (2)
- `sourceControlPath` (2)
- `copyDataProperties` (1)
- `map` (1)

### `tree-sitter.wasm.wasm-function[ts_node_child_with_descendant]`
`[native code]` | Self: 0.0% (16.0ms) | Total: 0.0% (16.0ms) | Samples: 2

**Called by:**
- `tree-sitter.wasm.wasm-function[ts_node_parent_wasm]` (2)

### `event`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:275` | Self: 0.0% (16.0ms) | Total: 0.3% (172.8ms) | Samples: 1

**Called by:**
- `flatIntoArrayWithCallback` (28)

**Calls:**
- `type` (16)
- `sourceSyntaxAnchorId` (5)
- `text` (4)
- `field` (2)

### `callableValue`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:947` | Self: 0.0% (16.0ms) | Total: 0.0% (16.9ms) | Samples: 1

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/` (1)

### `argumentPlacement`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:927` | Self: 0.0% (15.9ms) | Total: 0.4% (227.1ms) | Samples: 1

**Called by:**
- `callableValue` (22)

**Calls:**
- `sourceSyntaxAnchorId` (19)
- `flat` (2)

### `copyDataProperties`
`[native code]` | Self: 0.0% (15.5ms) | Total: 0.0% (15.5ms) | Samples: 1

**Called by:**
- `async buildStructureIndex` (1)

### `setValue`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3288` | Self: 0.0% (15.3ms) | Total: 0.0% (15.3ms) | Samples: 1

**Called by:**
- `marshalNode` (1)

### `resolveCall`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1206` | Self: 0.0% (14.9ms) | Total: 0.0% (14.9ms) | Samples: 1

**Called by:**
- `callableValue` (1)

### `instanceBinding`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:916` | Self: 0.0% (14.9ms) | Total: 0.7% (378.9ms) | Samples: 1

**Called by:**
- `resolveCall` (46)

**Calls:**
- `filter` (45)

### `Hash`
`node:crypto:177` | Self: 0.0% (14.6ms) | Total: 0.0% (14.6ms) | Samples: 2

**Called by:**
- `createHash` (2)

### `callableValue`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts` | Self: 0.0% (14.5ms) | Total: 0.0% (14.5ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `sourceExpressionEvents`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:240` | Self: 0.0% (14.5ms) | Total: 0.0% (14.5ms) | Samples: 2

**Called by:**
- `expressionEvents` (2)

### `some`
`[native code]` | Self: 0.0% (14.1ms) | Total: 0.4% (259.5ms) | Samples: 1

**Called by:**
- `callableValue` (28)

**Calls:**
- `(anonymous)` (17)
- `includes` (10)

### `resolveCall`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1176` | Self: 0.0% (13.9ms) | Total: 0.0% (14.9ms) | Samples: 1

**Called by:**
- `map` (2)

**Calls:**
- `moduleQualified` (1)

### `get namedChildren`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:874` | Self: 0.0% (13.7ms) | Total: 0.4% (241.4ms) | Samples: 1

**Called by:**
- `children` (23)

**Calls:**
- `wasm-stub` (20)
- `270` (2)

### `owned`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts` | Self: 0.0% (13.7ms) | Total: 0.0% (13.7ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `expressionEvents`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts` | Self: 0.0% (3.9ms) | Total: 0.0% (3.9ms) | Samples: 4

**Called by:**
- `flatIntoArrayWithCallback` (4)

### `text`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:670` | Self: 0.0% (2.7ms) | Total: 0.6% (319.9ms) | Samples: 3

**Called by:**
- `event` (27)
- `event` (8)
- `(anonymous)` (5)
- `event` (4)

**Calls:**
- `getText` (19)
- `endIndex` (12)
- `tree-sitter.wasm.wasm-function[ts_node_end_index_wasm]` (5)
- `getText` (5)

### `tree-sitter.wasm.wasm-function[ts_node_descendants_of_type_wasm]`
`[native code]` | Self: 0.0% (2.0ms) | Total: 0.1% (75.7ms) | Samples: 2

**Called by:**
- `wasm-stub` (13)

**Calls:**
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_next_sibling]` (5)
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_first_child_internal]` (4)
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_sibling_internal]` (1)
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_current_node]` (1)

### `event`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:284` | Self: 0.0% (1.3ms) | Total: 1.6% (869.8ms) | Samples: 1

**Called by:**
- `flatIntoArrayWithCallback` (98)

**Calls:**
- `field` (54)
- `type` (25)
- `unmarshalNode` (18)

### `unmarshalNode`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1115` | Self: 0.0% (1.2ms) | Total: 0.0% (1.2ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `owned`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:684` | Self: 0.0% (1.1ms) | Total: 0.0% (1.1ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `(anonymous)`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:313` | Self: 0.0% (1.0ms) | Total: 0.0% (1.0ms) | Samples: 1

**Called by:**
- `filter` (1)

### `Node`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:555` | Self: 0.0% (1.0ms) | Total: 0.0% (1.0ms) | Samples: 1

**Called by:**
- `unmarshalNode` (1)

### `setValue`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js` | Self: 0.0% (1.0ms) | Total: 0.0% (1.0ms) | Samples: 1

**Called by:**
- `marshalNode` (1)

### `resolveCall`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1126` | Self: 0.0% (1.0ms) | Total: 0.0% (1.0ms) | Samples: 1

**Called by:**
- `map` (1)

### `moduleQualified`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts` | Self: 0.0% (998us) | Total: 0.0% (998us) | Samples: 1

**Called by:**
- `resolveCall` (1)

### `wasm-stub`
`[native code]` | Self: 0.0% (974us) | Total: 0.7% (410.9ms) | Samples: 1

**Called by:**
- `get namedChildren` (20)
- `type` (13)
- `descendantsOfType` (13)
- `(anonymous)` (2)

**Calls:**
- `tree-sitter.wasm.wasm-function[dlfree]` (20)
- `tree-sitter.wasm.wasm-function[ts_node_descendants_of_type_wasm]` (13)
- `tree-sitter.wasm.wasm-function[ts_node_symbol_wasm]` (12)
- `tree-sitter.wasm.wasm-function[ts_parser_parse_wasm]` (2)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:676` | Self: 0.0% (970us) | Total: 0.0% (970us) | Samples: 1

### `async (anonymous)`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js` | Self: 0.0% (952us) | Total: 0.0% (952us) | Samples: 1

**Called by:**
- `async initializeBinding` (1)

### `LazyTransform`
`internal:streams/lazy_transform` | Self: 0.0% (948us) | Total: 0.0% (948us) | Samples: 1

**Called by:**
- `Hash` (1)

### `/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/`
`[native code]` | Self: 0.0% (939us) | Total: 0.0% (939us) | Samples: 1

**Called by:**
- `callableValue` (1)

### `forEach`
`[native code]` | Self: 0.0% (932us) | Total: 1.7% (946.8ms) | Samples: 1

**Called by:**
- `resolveCall` (108)

**Calls:**
- `(anonymous)` (107)

### `hash`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:171` | Self: 0.0% (865us) | Total: 5.2% (2.78s) | Samples: 1

**Called by:**
- `callId` (343)
- `async buildStructureIndex` (10)
- `expressionEvents` (5)
- `callableValue` (4)
- `(anonymous)` (1)

**Calls:**
- `update` (157)
- `stringify` (96)
- `createHash` (89)
- `digest` (20)

### `resolveDefinitionProofs`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:501` | Self: 0.0% (863us) | Total: 0.0% (863us) | Samples: 1

**Called by:**
- `async buildStructureIndex` (1)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:651` | Self: 0.0% (0us) | Total: 0.0% (1.1ms) | Samples: 0

**Calls:**
- `get parent` (1)

### `sourceControlPath`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:214` | Self: 0.0% (0us) | Total: 0.0% (15.1ms) | Samples: 0

**Called by:**
- `async buildStructureIndex` (2)

**Calls:**
- `get parent` (2)

### `boundedText`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:655` | Self: 0.0% (0us) | Total: 0.0% (1.0ms) | Samples: 0

**Called by:**
- `map` (1)

**Calls:**
- `type` (1)

### `linearize`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:863` | Self: 0.0% (0us) | Total: 0.0% (1.0ms) | Samples: 0

**Called by:**
- `attribute` (1)

**Calls:**
- `map` (1)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:297` | Self: 0.0% (0us) | Total: 0.0% (952us) | Samples: 0

**Called by:**
- `async buildStructureIndex` (1)

**Calls:**
- `languages` (1)

### `resolveCall`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1180` | Self: 0.0% (0us) | Total: 0.7% (380.9ms) | Samples: 0

**Called by:**
- `map` (27)
- `callableValue` (14)
- `async buildStructureIndex` (4)
- `async buildStructureIndex` (3)

**Calls:**
- `instanceBinding` (46)
- `moduleQualified` (1)
- `moduleQualified` (1)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:787` | Self: 0.0% (0us) | Total: 0.0% (2.9ms) | Samples: 0

**Calls:**
- `descendants` (3)

### `resolveCall`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1025` | Self: 0.0% (0us) | Total: 0.2% (145.7ms) | Samples: 0

**Called by:**
- `map` (9)
- `callableValue` (7)
- `async buildStructureIndex` (4)
- `async buildStructureIndex` (2)

**Calls:**
- `filter` (21)
- `localConstructor` (1)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:774` | Self: 0.0% (0us) | Total: 0.0% (12.5ms) | Samples: 0

**Calls:**
- `descendants` (1)

### `resolveDefinitionProofs`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:473` | Self: 0.0% (0us) | Total: 0.0% (45.9ms) | Samples: 0

**Called by:**
- `async buildStructureIndex` (6)

**Calls:**
- `descendants` (6)

### `async init`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3869` | Self: 0.0% (0us) | Total: 0.0% (952us) | Samples: 0

**Called by:**
- `async (anonymous)` (1)

**Calls:**
- `async init` (1)

### `resolveCall`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1166` | Self: 0.0% (0us) | Total: 0.0% (1.0ms) | Samples: 0

**Called by:**
- `async buildStructureIndex` (1)

**Calls:**
- `attribute` (1)

### `moduleQualified`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:906` | Self: 0.0% (0us) | Total: 0.0% (1.9ms) | Samples: 0

**Called by:**
- `resolveCall` (1)
- `resolveCall` (1)

**Calls:**
- `stringSplitFast` (2)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1247` | Self: 0.0% (0us) | Total: 0.3% (160.6ms) | Samples: 0

**Calls:**
- `resolveCall` (13)
- `resolveCall` (4)
- `resolveCall` (4)
- `resolveCall` (1)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:771` | Self: 0.0% (0us) | Total: 0.1% (93.9ms) | Samples: 0

**Calls:**
- `count` (11)

### `resolveDefinitionProofs`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:532` | Self: 0.0% (0us) | Total: 0.3% (187.4ms) | Samples: 0

**Called by:**
- `async buildStructureIndex` (27)

**Calls:**
- `sourceStoreOrder` (27)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1699` | Self: 0.0% (0us) | Total: 0.1% (77.6ms) | Samples: 0

**Calls:**
- `hash` (10)

### `(anonymous)`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:247` | Self: 0.0% (0us) | Total: 0.4% (236.0ms) | Samples: 0

**Called by:**
- `flatIntoArrayWithCallback` (38)

**Calls:**
- `type` (38)

### `async initializeBinding`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3835` | Self: 0.0% (0us) | Total: 0.0% (952us) | Samples: 0

**Called by:**
- `async initializeBinding` (1)

**Calls:**
- `async (anonymous)` (1)

### `(anonymous)`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:685` | Self: 0.0% (0us) | Total: 0.0% (1.1ms) | Samples: 0

**Called by:**
- `filter` (1)

**Calls:**
- `owned` (1)

### `expressionEvents`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:244` | Self: 0.0% (0us) | Total: 0.1% (57.3ms) | Samples: 0

**Called by:**
- `flatIntoArrayWithCallback` (3)
- `event` (2)

**Calls:**
- `hash` (5)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:613` | Self: 0.0% (0us) | Total: 0.4% (234.2ms) | Samples: 0

**Calls:**
- `resolveDefinitionProofs` (27)
- `resolveDefinitionProofs` (6)
- `resolveDefinitionProofs` (1)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:313` | Self: 0.0% (0us) | Total: 0.0% (18.1ms) | Samples: 0

**Calls:**
- `children` (2)
- `filter` (1)

### `field`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:180` | Self: 0.0% (0us) | Total: 36.6% (19.38s) | Samples: 0

**Called by:**
- `expressionEvents` (2323)
- `expressionEvents` (116)
- `event` (84)
- `event` (54)
- `(anonymous)` (7)
- `event` (2)
- `event` (2)
- `async buildStructureIndex` (1)

**Calls:**
- `childForFieldName` (1592)
- `childForFieldName` (997)

### `childForFieldName`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:730` | Self: 0.0% (0us) | Total: 22.2% (11.75s) | Samples: 0

**Called by:**
- `field` (1592)

**Calls:**
- `childForFieldId` (1186)
- `childForFieldId` (406)

### `callableValue`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:950` | Self: 0.0% (0us) | Total: 0.4% (259.5ms) | Samples: 0

**Called by:**
- `(anonymous)` (28)

**Calls:**
- `some` (28)

### `event`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:274` | Self: 0.0% (0us) | Total: 0.0% (33.4ms) | Samples: 0

**Called by:**
- `flatIntoArrayWithCallback` (4)

**Calls:**
- `sourceSyntaxAnchorId` (4)

### `callableValue`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:941` | Self: 0.0% (0us) | Total: 0.0% (30.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (4)

**Calls:**
- `find` (4)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:630` | Self: 0.0% (0us) | Total: 0.5% (276.8ms) | Samples: 0

**Calls:**
- `sourceStoreOrder` (37)

### `async (anonymous)`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:176` | Self: 0.0% (0us) | Total: 0.0% (952us) | Samples: 0

**Called by:**
- `async (anonymous)` (1)

**Calls:**
- `async init` (1)

### `attribute`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:903` | Self: 0.0% (0us) | Total: 0.0% (1.0ms) | Samples: 0

**Called by:**
- `resolveCall` (1)

**Calls:**
- `linearize` (1)

### `event`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:277` | Self: 0.0% (0us) | Total: 0.5% (274.4ms) | Samples: 0

**Called by:**
- `flatIntoArrayWithCallback` (29)

**Calls:**
- `type` (29)

### `getValue`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:2662` | Self: 0.0% (0us) | Total: 0.0% (52.3ms) | Samples: 0

**Called by:**
- `unmarshalNode` (10)

**Calls:**
- `(anonymous)` (10)

### `map`
`[native code]` | Self: 0.0% (0us) | Total: 2.1% (1.12s) | Samples: 0

**Called by:**
- `flatIntoArrayWithCallback` (126)
- `async buildStructureIndex` (1)
- `async buildStructureIndex` (1)
- `linearize` (1)

**Calls:**
- `resolveCall` (68)
- `resolveCall` (27)
- `resolveCall` (19)
- `resolveCall` (9)
- `resolveCall` (2)
- `expressionEvents` (1)
- `boundedText` (1)
- `resolveCall` (1)
- `(anonymous)` (1)

### `sourceArgumentBindings`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\source-arguments.ts:18` | Self: 0.0% (0us) | Total: 1.8% (966.3ms) | Samples: 0

**Called by:**
- `async buildStructureIndex` (105)

**Calls:**
- `flatIntoArrayWithCallback` (105)

### `(anonymous)`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:722` | Self: 0.0% (0us) | Total: 0.0% (13.7ms) | Samples: 0

**Called by:**
- `filter` (1)

**Calls:**
- `owned` (1)

### `async (anonymous)`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:174` | Self: 0.0% (0us) | Total: 0.0% (952us) | Samples: 0

**Called by:**
- `languages` (1)

**Calls:**
- `async (anonymous)` (1)

### `languages`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:177` | Self: 0.0% (0us) | Total: 0.0% (952us) | Samples: 0

**Called by:**
- `async buildStructureIndex` (1)

**Calls:**
- `async (anonymous)` (1)

### `async init`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3870` | Self: 0.0% (0us) | Total: 0.0% (952us) | Samples: 0

**Called by:**
- `async init` (1)

**Calls:**
- `async initializeBinding` (1)

### `sourceStoreOrder`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:268` | Self: 0.0% (0us) | Total: 1.1% (602.2ms) | Samples: 0

**Called by:**
- `async buildStructureIndex` (74)

**Calls:**
- `children` (74)

### `tree-sitter.wasm.wasm-function[ts_parser_parse_wasm]`
`[native code]` | Self: 0.0% (0us) | Total: 0.0% (44.9ms) | Samples: 0

**Called by:**
- `wasm-stub` (2)

**Calls:**
- `tree-sitter.wasm.wasm-function[ts_stack_push]` (1)
- `tree-sitter.wasm.wasm-function[ts_parser__reduce]` (1)

### `descendantsOfType`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:905` | Self: 0.0% (0us) | Total: 0.1% (75.7ms) | Samples: 0

**Called by:**
- `descendants` (13)

**Calls:**
- `wasm-stub` (13)

### `sourceStoreOrder`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:289` | Self: 0.0% (0us) | Total: 94.9% (50.16s) | Samples: 0

**Called by:**
- `async buildStructureIndex` (6421)
- `async buildStructureIndex` (37)
- `resolveDefinitionProofs` (27)

**Calls:**
- `flatMap` (5976)
- `flatIntoArrayWithCallback` (509)

### `async initializeBinding`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3833` | Self: 0.0% (0us) | Total: 0.0% (952us) | Samples: 0

**Called by:**
- `async init` (1)

**Calls:**
- `async initializeBinding` (1)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1230` | Self: 0.0% (0us) | Total: 0.3% (184.6ms) | Samples: 0

**Calls:**
- `resolveCall` (10)
- `resolveCall` (4)
- `resolveCall` (3)
- `resolveCall` (2)
- `resolveCall` (1)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:292` | Self: 0.0% (0us) | Total: 0.0% (32.9ms) | Samples: 0

**Called by:**
- `(module)` (2)

**Calls:**
- `async buildStructureIndex` (1)
- `async buildStructureIndex` (1)

### `(anonymous)`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1192` | Self: 0.0% (0us) | Total: 1.7% (945.8ms) | Samples: 0

**Called by:**
- `forEach` (107)

**Calls:**
- `callableValue` (47)
- `callableValue` (28)
- `callableValue` (25)
- `callableValue` (4)
- `callableValue` (2)
- `callableValue` (1)

### `get parent`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:970` | Self: 0.0% (0us) | Total: 0.0% (16.2ms) | Samples: 0

**Called by:**
- `sourceControlPath` (2)
- `async buildStructureIndex` (1)

**Calls:**
- `marshalNode` (2)
- `marshalNode` (1)

### `parent`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:971` | Self: 0.0% (0us) | Total: 0.0% (15.0ms) | Samples: 0

**Called by:**
- `sourceStoreOrder` (1)

**Calls:**
- `tree-sitter.wasm.wasm-function[ts_node_parent_wasm]` (1)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:656` | Self: 0.0% (0us) | Total: 0.0% (1.0ms) | Samples: 0

**Calls:**
- `map` (1)

### `typeId`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:582` | Self: 0.0% (0us) | Total: 4.4% (2.33s) | Samples: 0

**Called by:**
- `type` (276)

**Calls:**
- `marshalNode` (85)
- `marshalNode` (44)
- `marshalNode` (41)
- `marshalNode` (39)
- `marshalNode` (37)
- `marshalNode` (30)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:685` | Self: 0.0% (0us) | Total: 0.0% (1.1ms) | Samples: 0

**Calls:**
- `filter` (1)

### `event`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:282` | Self: 0.0% (0us) | Total: 0.3% (159.0ms) | Samples: 0

**Called by:**
- `flatIntoArrayWithCallback` (18)

**Calls:**
- `type` (18)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:409` | Self: 0.0% (0us) | Total: 0.0% (13.3ms) | Samples: 0

**Calls:**
- `descendants` (2)

### `tree-sitter.wasm.wasm-function[ts_parser__reduce]`
`[native code]` | Self: 0.0% (0us) | Total: 0.0% (15.0ms) | Samples: 0

**Called by:**
- `tree-sitter.wasm.wasm-function[ts_parser_parse_wasm]` (1)

**Calls:**
- `tree-sitter.wasm.wasm-function[stack__iter]` (1)

### `event`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:278` | Self: 0.0% (0us) | Total: 1.6% (856.9ms) | Samples: 0

**Called by:**
- `flatIntoArrayWithCallback` (116)

**Calls:**
- `expressionEvents` (29)
- `sourceSyntaxAnchorId` (26)
- `expressionEvents` (19)
- `type` (13)
- `expressionEvents` (12)
- `expressionEvents` (7)
- `tree-sitter.wasm.wasm-function[ts_node_end_index_wasm]` (2)
- `unmarshalNode` (2)
- `expressionEvents` (2)
- `field` (2)
- `endIndex` (1)
- `expressionEvents` (1)

### `sourceStoreOrder`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:267` | Self: 0.0% (0us) | Total: 0.0% (16.0ms) | Samples: 0

**Called by:**
- `async buildStructureIndex` (2)

**Calls:**
- `get parent` (1)
- `parent` (1)

### `getText`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:121` | Self: 0.0% (0us) | Total: 0.1% (75.9ms) | Samples: 0

**Called by:**
- `text` (5)

**Calls:**
- `(anonymous)` (5)

### `callableValue`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:942` | Self: 0.0% (0us) | Total: 0.6% (351.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (47)

**Calls:**
- `resolveCall` (17)
- `resolveCall` (14)
- `resolveCall` (7)
- `hash` (4)
- `resolveCall` (4)
- `resolveCall` (1)

### `tree-sitter.wasm.wasm-function[stack__iter]`
`[native code]` | Self: 0.0% (0us) | Total: 0.0% (15.0ms) | Samples: 0

**Called by:**
- `tree-sitter.wasm.wasm-function[ts_parser__reduce]` (1)

**Calls:**
- `tree-sitter.wasm.wasm-function[dlmalloc]` (1)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:328` | Self: 0.0% (0us) | Total: 0.0% (949us) | Samples: 0

**Calls:**
- `descendants` (1)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:666` | Self: 0.0% (0us) | Total: 0.0% (15.1ms) | Samples: 0

**Calls:**
- `field` (1)

### `get parent`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:971` | Self: 0.0% (0us) | Total: 0.0% (1.0ms) | Samples: 0

**Called by:**
- `sourceStoreOrder` (1)

**Calls:**
- `tree-sitter.wasm.wasm-function[ts_node_parent_wasm]` (1)

### `event`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:281` | Self: 0.0% (0us) | Total: 0.2% (138.1ms) | Samples: 0

**Called by:**
- `flatIntoArrayWithCallback` (16)

**Calls:**
- `type` (16)

### `event`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:273` | Self: 0.0% (0us) | Total: 0.4% (245.0ms) | Samples: 0

**Called by:**
- `flatIntoArrayWithCallback` (32)

**Calls:**
- `type` (32)

### `localConstructor`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:992` | Self: 0.0% (0us) | Total: 0.0% (12.7ms) | Samples: 0

**Called by:**
- `resolveCall` (1)

**Calls:**
- `filter` (1)

### `childForFieldId`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:718` | Self: 0.0% (0us) | Total: 16.8% (8.92s) | Samples: 0

**Called by:**
- `childForFieldName` (1186)
- `(anonymous)` (3)

**Calls:**
- `marshalNode` (209)
- `marshalNode` (205)
- `marshalNode` (203)
- `marshalNode` (200)
- `marshalNode` (188)
- `marshalNode` (184)

### `tree-sitter.wasm.wasm-function[ts_stack_push]`
`[native code]` | Self: 0.0% (0us) | Total: 0.0% (29.8ms) | Samples: 0

**Called by:**
- `tree-sitter.wasm.wasm-function[ts_parser_parse_wasm]` (1)

**Calls:**
- `tree-sitter.wasm.wasm-function[__memset]` (1)

### `resolveCall`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1192` | Self: 0.0% (0us) | Total: 1.7% (946.8ms) | Samples: 0

**Called by:**
- `map` (68)
- `callableValue` (17)
- `async buildStructureIndex` (13)
- `async buildStructureIndex` (10)

**Calls:**
- `forEach` (108)

### `(anonymous)`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3646` | Self: 0.0% (0us) | Total: 0.0% (44.9ms) | Samples: 0

**Called by:**
- `parse` (2)

**Calls:**
- `wasm-stub` (2)

### `resolveCall`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1022` | Self: 0.0% (0us) | Total: 0.5% (276.5ms) | Samples: 0

**Called by:**
- `map` (19)
- `async buildStructureIndex` (4)
- `callableValue` (4)
- `async buildStructureIndex` (1)

**Calls:**
- `structuredClone` (25)
- `find` (2)
- `stringSplitFast` (1)

### `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_next_sibling]`
`[native code]` | Self: 0.0% (0us) | Total: 0.0% (30.7ms) | Samples: 0

**Called by:**
- `tree-sitter.wasm.wasm-function[ts_node_descendants_of_type_wasm]` (5)

**Calls:**
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_sibling_internal]` (3)
- `tree-sitter.wasm.wasm-function[ts_tree_cursor_goto_first_child_internal]` (2)

### `tree-sitter.wasm.wasm-function[ts_node_parent_wasm]`
`[native code]` | Self: 0.0% (0us) | Total: 0.0% (16.0ms) | Samples: 0

**Called by:**
- `get parent` (1)
- `parent` (1)

**Calls:**
- `tree-sitter.wasm.wasm-function[ts_node_child_with_descendant]` (2)

### `get typeId`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:582` | Self: 0.0% (0us) | Total: 0.1% (99.9ms) | Samples: 0

**Called by:**
- `type` (16)

**Calls:**
- `marshalNode` (16)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1249` | Self: 0.0% (0us) | Total: 1.8% (966.3ms) | Samples: 0

**Calls:**
- `sourceArgumentBindings` (105)

### `createHash`
`node:crypto:201` | Self: 0.0% (0us) | Total: 4.0% (2.13s) | Samples: 0

**Called by:**
- `hash` (171)
- `hash` (89)

**Calls:**
- `Hash` (254)
- `Hash` (4)
- `Hash` (2)

### `(module)`
`D:\skill优化\SkVM\results\skill-ir\skill-dsl-research\development\authorization-task-binding-v1\profile-hot-file.ts:7` | Self: 0.0% (0us) | Total: 0.0% (32.9ms) | Samples: 0

**Calls:**
- `async buildStructureIndex` (2)

### `expressionEvents`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:245` | Self: 0.0% (0us) | Total: 0.8% (473.0ms) | Samples: 0

**Called by:**
- `event` (28)
- `flatIntoArrayWithCallback` (23)
- `event` (12)

**Calls:**
- `expressionEvents` (28)
- `expressionEvents` (23)
- `sourceSyntaxAnchorId` (8)
- `expressionEvents` (4)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:770` | Self: 0.0% (0us) | Total: 0.2% (110.0ms) | Samples: 0

**Calls:**
- `count` (16)

### `event`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:271` | Self: 0.0% (0us) | Total: 1.6% (858.7ms) | Samples: 0

**Called by:**
- `flatIntoArrayWithCallback` (102)

**Calls:**
- `children` (68)
- `type` (34)

### `expressionEvents`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:269` | Self: 0.0% (0us) | Total: 0.0% (32.5ms) | Samples: 0

**Called by:**
- `event` (5)

**Calls:**
- `sourceExpressionEvents` (3)
- `sourceExpressionEvents` (2)

### `descendants`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:182` | Self: 0.0% (0us) | Total: 0.1% (75.7ms) | Samples: 0

**Called by:**
- `resolveDefinitionProofs` (6)
- `async buildStructureIndex` (3)
- `async buildStructureIndex` (2)
- `async buildStructureIndex` (1)
- `async buildStructureIndex` (1)

**Calls:**
- `descendantsOfType` (13)

### `parse`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:3973` | Self: 0.0% (0us) | Total: 0.0% (44.9ms) | Samples: 0

**Called by:**
- `async buildStructureIndex` (2)

**Calls:**
- `(anonymous)` (2)

### `get namedChildren`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:863` | Self: 0.0% (0us) | Total: 1.1% (591.3ms) | Samples: 0

**Called by:**
- `children` (69)

**Calls:**
- `marshalNode` (69)

### `event`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:287` | Self: 0.0% (0us) | Total: 0.0% (18.0ms) | Samples: 0

**Called by:**
- `flatIntoArrayWithCallback` (3)

**Calls:**
- `type` (3)

### `count`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:766` | Self: 0.0% (0us) | Total: 0.3% (204.0ms) | Samples: 0

**Called by:**
- `async buildStructureIndex` (16)
- `async buildStructureIndex` (11)

**Calls:**
- `filter` (27)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:304` | Self: 0.0% (0us) | Total: 0.0% (44.9ms) | Samples: 0

**Calls:**
- `parse` (2)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:1271` | Self: 0.0% (0us) | Total: 0.2% (150.7ms) | Samples: 0

**Calls:**
- `flatIntoArrayWithCallback` (21)

### `async buildStructureIndex`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:722` | Self: 0.0% (0us) | Total: 0.0% (13.7ms) | Samples: 0

**Calls:**
- `filter` (1)

### `unmarshalNode`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1126` | Self: 0.0% (0us) | Total: 7.6% (4.03s) | Samples: 0

**Called by:**
- `get namedChildren` (313)
- `expressionEvents` (73)
- `event` (48)
- `expressionEvents` (37)
- `event` (18)
- `childForFieldName` (3)
- `(anonymous)` (2)
- `event` (2)

**Calls:**
- `Node` (495)
- `Node` (1)

### `(anonymous)`
`D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts:630` | Self: 0.0% (0us) | Total: 0.0% (983us) | Samples: 0

**Called by:**
- `callEvent` (1)

**Calls:**
- `hash` (1)

### `unmarshalNode`
`D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js:1125` | Self: 0.0% (0us) | Total: 0.0% (52.3ms) | Samples: 0

**Called by:**
- `get namedChildren` (10)

**Calls:**
- `getValue` (10)

## Files

| Self% | Self | File |
|------:|-----:|------|
| 49.7% | 26.26s | `D:\skill优化\SkVM\node_modules\@vscode\tree-sitter-wasm\wasm\tree-sitter.js` |
| 41.0% | 21.66s | `[native code]` |
| 8.0% | 4.24s | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\structure-index.ts` |
| 0.7% | 406.8ms | `D:\skill优化\SkVM\src\benchmarks\authorization-dsl\evidence-preparation\source-identities.ts` |
| 0.4% | 243.1ms | `node:crypto` |
| 0.0% | 948us | `internal:streams/lazy_transform` |
