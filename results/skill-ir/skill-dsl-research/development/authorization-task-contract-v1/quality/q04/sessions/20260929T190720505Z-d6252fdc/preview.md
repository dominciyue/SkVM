<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1; task-contract: current-v1 -->

# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts. Address every supplied analysis question and report its coverage without inventing an answer.

## Canonical declaration
This is task owui-process-file-write, expressed with source-authorization-assessment/v0. At this fixed source ref, determine whether a verified non-admin user who owns the supplied file can cause that file's content to be written to an existing knowledge-base collection for which the user has no write permission by supplying that collection name to POST /process/file.
Assess repository https://github.com/open-webui/open-webui at source ref 841c9045d789005145274955e7ef60b1b11a9be9 in fixed-context mode. Source discovery status is not-tested.

The accepted policy material is:
- policy:destination-knowledge-write-policy is a explicit-task-requirement at inputs/owui-process-file-write/task.json#/normativeRequirement, revision authorization-case-input/v1@841c9045.
  Policy text: Owning the source file does not authorize writing to an unrelated knowledge base. A verified non-admin may write to an existing knowledge-base collection only when the user owns it or has an explicit write grant.
  Acceptance is accepted; accepting actor role: task-author; reason: The study task author supplied this bounded normative requirement for the comparison.

The principals are:
- principal:verified-non-admin-file-owner has role verified non-administrator who owns the supplied source file. Author facts: ["A signed-in non-admin whose file ownership is distinct from authorization on the destination knowledge base."]
  Starting capabilities: authenticated-as-verified-user, owns-supplied-source-file, can-submit-process-file-form.

The resources are:
- resource:existing-destination-knowledge-base is a knowledge-base-vector-collection. Author facts: ["An existing knowledge-base collection selected by the caller and not owned by or write-granted to the principal."]

The declared source entries are:
- entry:post-process-file names POST /process/file -> process_file.
  Source location: backend/open_webui/routers/retrieval.py, startLine 1546, endLine 1762.

The authorization obligations are:
- scenario:file-owner-without-destination-write-grant: principal principal:verified-non-admin-file-owner, resource resource:existing-destination-knowledge-base, relation owns-source-file-but-no-destination-write-grant, operation write-file-content-to-existing-knowledge-base, expected policy disposition deny.
  Policy source: policy:destination-knowledge-write-policy. Declared entries: entry:post-process-file.
  Condition caller-supplies-existing-collection-name: The natural task fixes a caller-selected existing knowledge-base collection.
  Condition principal-is-not-admin: The task asks about a verified non-admin and the source exposes a separate admin branch.

Scope assurance: Only explicitly declared scenarios and supplied source are assessed; repository discovery and deployment behavior are not tested.
Required analysis:
- Trace entry, identity and resource binding, strongest authorization control, and protected effect. Explain decisive missing source-external facts.
- identify the principal, operation, target resource relation, entry, and write sink
- trace the user-controlled collection name through any target-specific authorization control
- distinguish file ownership from destination knowledge-base write permission
- Use exact input locations to support the source-visible behavior and policy comparison.
Constraints:
- Use only supplied fixed source context. Do not execute or modify the target, contact a deployment, or claim repository-wide discovery.
- Use only the allowed case inputs.
- Do not search for advisories, fixes, later versions, or deployment behavior.
- Do not execute the project or propose a patch.
Allowed decision kinds: observed for allow/deny expectations; conditional-policy for conditional expectations.

## Public analysis questions
Decide the current scenario at the stated boundary from the supplied fixed source and accepted policy. Treat listed premises as question assumptions at the named entry, not as source or deployment proof. Trace the decisive authorization control and protected effect with exact supplied-source locations. Answer every explicitly requested counterfactual branch separately, identifying its changed assumptions and any decisive unknown. Include only the response details requested below. Do not execute the target, infer missing deployment facts, or consult later versions.
Current question: Can a verified non-admin who owns the supplied file write its content to an existing caller-selected knowledge-base collection without a write grant through POST /process/file?
Analysis boundary: declared-entry.
Task premise: At POST /process/file the verified non-admin owns the supplied file but has no ownership or write grant on the existing caller-selected destination collection.
Required response detail: Identify the destination write sink and distinguish source-file ownership from destination write permission.

## Explicit assessment program
- Current question scenario%3Afile-owner-without-destination-write-grant::entry%3Apost-process-file at entry:post-process-file; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): premise-1: At POST /process/file the verified non-admin owns the supplied file but has no ownership or write grant on the existing caller-selected destination collection..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: Identify the destination write sink and distinguish source-file ownership from destination write permission..

## Result contract
Use compact wire/v6: top-level results only. Each item has obligationId, decision and branchResults, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation. Do not output conclusion or policyStatus at the item level. For an authored allow/deny expectation, return decision {kind:"observed",observed:"allow"|"deny"|"unknown"} describing the source-visible behavior, independently of the normative expectation. The host compares that observed behavior with the authored expectation. For an authored conditional expectation, return decision {kind:"conditional-policy",policyStatus:"satisfied"|"violated"|"undetermined"}; the host uses this policy judgment without a binary observed comparison. Unknown requires decisiveMissingFacts and suggestedObservations. Do not infer observed behavior from the expectation or prose.
Every result includes branchResults, an empty array if no branch is requested. For each explicitly requested branch below, return its exact id and assumptions, a reachable/blocked/unknown effect, a causal explanation, same-obligation factIds for known effects, and decisive missingFacts for unknown effects. Counterfactual assumptions are hypotheses; they do not alter the current scenario or establish source/deployment facts. Extra or missing branches are invalid.
Exact requested branch IDs and assumptions (closed list):
- (none)
Exact runnable obligation IDs (closed list):
- scenario%3Afile-owner-without-destination-write-grant::entry%3Apost-process-file
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

## Fixed source context
Preparation status: partial

Closure claim: declared-dependencies-only

Prepared from: https://github.com/open-webui/open-webui@841c9045d789005145274955e7ef60b1b11a9be9; root ../../../authorization-evidence-editing-v1/public-source/owui

Included original ranges: backend/open_webui/routers/retrieval.py:1340-1543 [host-context:symbol-e2cecd47ed4a9e8b9693e061, model-proposal:dep-vector-save-duplicate-content-check, model-proposal:dep-vector-save-existing-collection-control, model-proposal:dep-vector-save-insert-effect, model-proposal:dep-process-file-form-client-collection-name]; backend/open_webui/routers/retrieval.py:1546-1764 [model-proposal:dep-process-file-auth-source-binding, entry:post-process-file, model-proposal:dep-process-file-destination-binding, model-proposal:dep-process-file-existing-content-path, model-proposal:dep-process-file-retrieval-bypass, model-proposal:dep-process-file-vector-write-call, model-proposal:dep-process-file-success-result, host-context:symbol-eca905a6724b9af45b4ebf5b]; backend/open_webui/routers/retrieval.py:2339-2354 [model-proposal:dep-collection-write-access-validator, host-context:symbol-22cc9876de142e84e839b8bb]

Unresolved gaps: context:range:backend/open_webui/routers/retrieval.py:1540-1543: range-uncertain (backend/open_webui/routers/retrieval.py)

===== BEGIN ALLOWED INPUT: backend/open_webui/routers/retrieval.py =====
Source ID: src-eaa1fec9716aeb48
Location note: crop lines 1340-2354; original locations: backend/open_webui/routers/retrieval.py:1340-1543, backend/open_webui/routers/retrieval.py:1546-1764, backend/open_webui/routers/retrieval.py:2339-2354
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
1340 | def save_docs_to_vector_db(
1341 |     request: Request,
1342 |     docs,
1343 |     collection_name,
1344 |     metadata: Optional[dict] = None,
1345 |     overwrite: bool = False,
1346 |     split: bool = True,
1347 |     add: bool = False,
1348 |     user=None,
1349 | ) -> bool:
1350 |     def _get_docs_info(docs: list[Document]) -> str:
1351 |         docs_info = set()
1352 | 
1353 |         # Trying to select relevant metadata identifying the document.
1354 |         for doc in docs:
1355 |             metadata = getattr(doc, 'metadata', {})
1356 |             doc_name = metadata.get('name', '')
1357 |             if not doc_name:
1358 |                 doc_name = metadata.get('title', '')
1359 |             if not doc_name:
1360 |                 doc_name = metadata.get('source', '')
1361 |             if doc_name:
1362 |                 docs_info.add(doc_name)
1363 | 
1364 |         return ', '.join(docs_info)
1365 | 
1366 |     log.debug(f'save_docs_to_vector_db: document {_get_docs_info(docs)} {collection_name}')
1367 | 
1368 |     # Check if entries with the same hash (metadata.hash) already exist
1369 |     if metadata and 'hash' in metadata:
1370 |         result = VECTOR_DB_CLIENT.query(
1371 |             collection_name=collection_name,
1372 |             filter={'hash': metadata['hash']},
1373 |         )
1374 | 
1375 |         if result is not None and result.ids and len(result.ids) > 0:
1376 |             existing_doc_ids = result.ids[0]
1377 |             if existing_doc_ids:
1378 |                 # Check if the existing document belongs to the same file
1379 |                 # If same file_id, this is a re-add/reindex - allow it
1380 |                 # If different file_id, this is a duplicate - block it
1381 |                 existing_file_id = None
1382 |                 if result.metadatas and result.metadatas[0]:
1383 |                     existing_file_id = result.metadatas[0][0].get('file_id')
1384 | 
1385 |                 if existing_file_id != metadata.get('file_id'):
1386 |                     log.info(f'Document with hash {metadata["hash"]} already exists')
1387 |                     raise ValueError(ERROR_MESSAGES.DUPLICATE_CONTENT)
1388 | 
1389 |     if split:
1390 |         if request.app.state.config.ENABLE_MARKDOWN_HEADER_TEXT_SPLITTER:
1391 |             log.info('Using markdown header text splitter')
1392 |             # Define headers to split on - covering most common markdown header levels
1393 |             markdown_splitter = MarkdownHeaderTextSplitter(
1394 |                 headers_to_split_on=[
1395 |                     ('#', 'Header 1'),
1396 |                     ('##', 'Header 2'),
1397 |                     ('###', 'Header 3'),
1398 |                     ('####', 'Header 4'),
1399 |                     ('#####', 'Header 5'),
1400 |                     ('######', 'Header 6'),
1401 |                 ],
1402 |                 strip_headers=False,  # Keep headers in content for context
1403 |             )
1404 | 
1405 |             split_docs = []
1406 |             for doc in docs:
1407 |                 split_docs.extend(
1408 |                     [
1409 |                         Document(
1410 |                             page_content=split_chunk.page_content,
1411 |                             metadata={**doc.metadata},
1412 |                         )
1413 |                         for split_chunk in markdown_splitter.split_text(doc.page_content)
1414 |                     ]
1415 |                 )
1416 | 
1417 |             docs = split_docs
1418 |             if request.app.state.config.CHUNK_MIN_SIZE_TARGET > 0:
1419 |                 docs = merge_docs_to_target_size(request, docs)
1420 | 
1421 |         if request.app.state.config.TEXT_SPLITTER in ['', 'character']:
1422 |             text_splitter = RecursiveCharacterTextSplitter(
1423 |                 chunk_size=request.app.state.config.CHUNK_SIZE,
1424 |                 chunk_overlap=request.app.state.config.CHUNK_OVERLAP,
1425 |                 add_start_index=True,
1426 |             )
1427 |             docs = text_splitter.split_documents(docs)
1428 |         elif request.app.state.config.TEXT_SPLITTER == 'token':
1429 |             log.info(f'Using token text splitter: {request.app.state.config.TIKTOKEN_ENCODING_NAME}')
1430 | 
1431 |             tiktoken.get_encoding(str(request.app.state.config.TIKTOKEN_ENCODING_NAME))
1432 |             text_splitter = TokenTextSplitter(
1433 |                 encoding_name=str(request.app.state.config.TIKTOKEN_ENCODING_NAME),
1434 |                 chunk_size=request.app.state.config.CHUNK_SIZE,
1435 |                 chunk_overlap=request.app.state.config.CHUNK_OVERLAP,
1436 |                 add_start_index=True,
1437 |             )
1438 |             docs = text_splitter.split_documents(docs)
1439 |         else:
1440 |             raise ValueError(ERROR_MESSAGES.DEFAULT('Invalid text splitter'))
1441 | 
1442 |     if len(docs) == 0:
1443 |         raise ValueError(ERROR_MESSAGES.EMPTY_CONTENT)
1444 | 
1445 |     texts = [sanitize_text_for_db(doc.page_content) for doc in docs]
1446 |     metadatas = [
1447 |         {
1448 |             **doc.metadata,
1449 |             **(metadata if metadata else {}),
1450 |             'embedding_config': {
1451 |                 'engine': request.app.state.config.RAG_EMBEDDING_ENGINE,
1452 |                 'model': request.app.state.config.RAG_EMBEDDING_MODEL,
1453 |             },
1454 |         }
1455 |         for doc in docs
1456 |     ]
1457 | 
1458 |     try:
1459 |         if VECTOR_DB_CLIENT.has_collection(collection_name=collection_name):
1460 |             log.info(f'collection {collection_name} already exists')
1461 | 
1462 |             if overwrite:
1463 |                 VECTOR_DB_CLIENT.delete_collection(collection_name=collection_name)
1464 |                 log.info(f'deleting existing collection {collection_name}')
1465 |             elif add is False:
1466 |                 log.info(f'collection {collection_name} already exists, overwrite is False and add is False')
1467 |                 return True
1468 | 
1469 |         log.info(f'generating embeddings for {collection_name}')
1470 |         embedding_function = get_embedding_function(
1471 |             request.app.state.config.RAG_EMBEDDING_ENGINE,
1472 |             request.app.state.config.RAG_EMBEDDING_MODEL,
1473 |             request.app.state.ef,
1474 |             (
1475 |                 request.app.state.config.RAG_OPENAI_API_BASE_URL
1476 |                 if request.app.state.config.RAG_EMBEDDING_ENGINE == 'openai'
1477 |                 else (
1478 |                     request.app.state.config.RAG_OLLAMA_BASE_URL
1479 |                     if request.app.state.config.RAG_EMBEDDING_ENGINE == 'ollama'
1480 |                     else request.app.state.config.RAG_AZURE_OPENAI_BASE_URL
1481 |                 )
1482 |             ),
1483 |             (
1484 |                 request.app.state.config.RAG_OPENAI_API_KEY
1485 |                 if request.app.state.config.RAG_EMBEDDING_ENGINE == 'openai'
1486 |                 else (
1487 |                     request.app.state.config.RAG_OLLAMA_API_KEY
1488 |                     if request.app.state.config.RAG_EMBEDDING_ENGINE == 'ollama'
1489 |                     else request.app.state.config.RAG_AZURE_OPENAI_API_KEY
1490 |                 )
1491 |             ),
1492 |             request.app.state.config.RAG_EMBEDDING_BATCH_SIZE,
1493 |             azure_api_version=(
1494 |                 request.app.state.config.RAG_AZURE_OPENAI_API_VERSION
1495 |                 if request.app.state.config.RAG_EMBEDDING_ENGINE == 'azure_openai'
1496 |                 else None
1497 |             ),
1498 |             enable_async=request.app.state.config.ENABLE_ASYNC_EMBEDDING,
1499 |             concurrent_requests=request.app.state.config.RAG_EMBEDDING_CONCURRENT_REQUESTS,
1500 |         )
1501 | 
1502 |         # Run async embedding in sync context using the main event loop
1503 |         # This allows the main loop to stay responsive to health checks during long operations
1504 |         embedding_timeout = RAG_EMBEDDING_TIMEOUT
1505 | 
1506 |         future = asyncio.run_coroutine_threadsafe(
1507 |             embedding_function(
1508 |                 list(map(lambda x: x.replace('\n', ' '), texts)),
1509 |                 prefix=RAG_EMBEDDING_CONTENT_PREFIX,
1510 |                 user=user,
1511 |             ),
1512 |             request.app.state.main_loop,
1513 |         )
1514 |         embeddings = future.result(timeout=embedding_timeout)
1515 |         log.info(f'embeddings generated {len(embeddings)} for {len(texts)} items')
1516 | 
1517 |         items = [
1518 |             {
1519 |                 'id': str(uuid.uuid4()),
1520 |                 'text': text,
1521 |                 'vector': embeddings[idx],
1522 |                 'metadata': metadatas[idx],
1523 |             }
1524 |             for idx, text in enumerate(texts)
1525 |         ]
1526 | 
1527 |         log.info(f'adding to collection {collection_name}')
1528 |         VECTOR_DB_CLIENT.insert(
1529 |             collection_name=collection_name,
1530 |             items=items,
1531 |         )
1532 | 
1533 |         log.info(f'added {len(items)} items to collection {collection_name}')
1534 |         return True
1535 |     except Exception as e:
1536 |         log.exception(e)
1537 |         raise e
1538 | 
1539 | 
1540 | class ProcessFileForm(BaseModel):
1541 |     file_id: str
1542 |     content: Optional[str] = None
1543 |     collection_name: Optional[str] = None
[OMITTED original lines 1544-1545]
1546 | @router.post('/process/file')
1547 | async def process_file(
1548 |     request: Request,
1549 |     form_data: ProcessFileForm,
1550 |     user=Depends(get_verified_user),
1551 |     db: AsyncSession = Depends(get_async_session),
1552 | ):
1553 |     """
1554 |     Process a file and save its content to the vector database.
1555 |     Process a file and save its content to the vector database.
1556 |     Note: granular session management is used to prevent connection pool exhaustion.
1557 |     The session is committed before external API calls, and updates use a fresh session.
1558 |     """
1559 |     if user.role == 'admin':
1560 |         file = await Files.get_file_by_id(form_data.file_id, db=db)
1561 |     else:
1562 |         file = await Files.get_file_by_id_and_user_id(form_data.file_id, user.id, db=db)
1563 | 
1564 |     if file:
1565 |         try:
1566 |             collection_name = form_data.collection_name
1567 | 
1568 |             if collection_name is None:
1569 |                 collection_name = f'file-{file.id}'
1570 | 
1571 |             if form_data.content:
1572 |                 # Update the content in the file
1573 |                 # Usage: /files/{file_id}/data/content/update, /files/ (audio file upload pipeline)
1574 | 
1575 |                 try:
1576 |                     # /files/{file_id}/data/content/update
1577 |                     await ASYNC_VECTOR_DB_CLIENT.delete_collection(collection_name=f'file-{file.id}')
1578 |                 except Exception:
1579 |                     # Audio file upload pipeline
1580 |                     pass
1581 | 
1582 |                 docs = [
1583 |                     Document(
1584 |                         page_content=form_data.content.replace('<br/>', '\n'),
1585 |                         metadata={
1586 |                             **file.meta,
1587 |                             'name': file.filename,
1588 |                             'created_by': file.user_id,
1589 |                             'file_id': file.id,
1590 |                             'source': file.filename,
1591 |                         },
1592 |                     )
1593 |                 ]
1594 | 
1595 |                 text_content = form_data.content
1596 |             elif form_data.collection_name:
1597 |                 # Check if the file has already been processed and save the content
1598 |                 # Usage: /knowledge/{id}/file/add, /knowledge/{id}/file/update
1599 | 
1600 |                 result = await ASYNC_VECTOR_DB_CLIENT.query(
1601 |                     collection_name=f'file-{file.id}', filter={'file_id': file.id}
1602 |                 )
1603 | 
1604 |                 if result is not None and len(result.ids[0]) > 0:
1605 |                     docs = [
1606 |                         Document(
1607 |                             page_content=result.documents[0][idx],
1608 |                             metadata=result.metadatas[0][idx],
1609 |                         )
1610 |                         for idx, id in enumerate(result.ids[0])
1611 |                     ]
1612 |                 else:
1613 |                     docs = [
1614 |                         Document(
1615 |                             page_content=file.data.get('content', ''),
1616 |                             metadata={
1617 |                                 **file.meta,
1618 |                                 'name': file.filename,
1619 |                                 'created_by': file.user_id,
1620 |                                 'file_id': file.id,
1621 |                                 'source': file.filename,
1622 |                             },
1623 |                         )
1624 |                     ]
1625 | 
1626 |                 text_content = file.data.get('content', '')
1627 |             else:
1628 |                 # Process the file and save the content
1629 |                 # Usage: /files/
1630 |                 file_path = file.path
1631 |                 if file_path:
1632 |                     file_path = await asyncio.to_thread(Storage.get_file, file_path)
1633 |                     loader = build_loader_from_config(request)
1634 |                     loader.user = user
1635 |                     docs = await loader.aload(file.filename, file.meta.get('content_type'), file_path)
1636 | 
1637 |                     docs = [
1638 |                         Document(
1639 |                             page_content=doc.page_content,
1640 |                             metadata={
1641 |                                 **filter_metadata(doc.metadata),
1642 |                                 'name': file.filename,
1643 |                                 'created_by': file.user_id,
1644 |                                 'file_id': file.id,
1645 |                                 'source': file.filename,
1646 |                             },
1647 |                         )
1648 |                         for doc in docs
1649 |                     ]
1650 |                 else:
1651 |                     docs = [
1652 |                         Document(
1653 |                             page_content=file.data.get('content', ''),
1654 |                             metadata={
1655 |                                 **file.meta,
1656 |                                 'name': file.filename,
1657 |                                 'created_by': file.user_id,
1658 |                                 'file_id': file.id,
1659 |                                 'source': file.filename,
1660 |                             },
1661 |                         )
1662 |                     ]
1663 |                 text_content = ' '.join([doc.page_content for doc in docs])
1664 | 
1665 |             log.debug(f'text_content: {text_content}')
1666 |             await Files.update_file_data_by_id(
1667 |                 file.id,
1668 |                 {'content': text_content},
1669 |                 db=db,
1670 |             )
1671 |             hash = calculate_sha256_string(text_content)
1672 | 
1673 |             if request.app.state.config.BYPASS_EMBEDDING_AND_RETRIEVAL:
1674 |                 await Files.update_file_data_by_id(file.id, {'status': 'completed'}, db=db)
1675 |                 await Files.update_file_hash_by_id(file.id, hash, db=db)
1676 |                 return {
1677 |                     'status': True,
1678 |                     'collection_name': None,
1679 |                     'filename': file.filename,
1680 |                     'content': text_content,
1681 |                 }
1682 |             else:
1683 |                 try:
1684 |                     # Commit any pending changes before the slow embedding step.
1685 |                     # Note: file is already a Pydantic model (not ORM), so no expunge needed.
1686 |                     await db.commit()
1687 | 
1688 |                     # External embedding API takes time (5-60s+).
1689 |                     # Subsequent updates use fresh async sessions.
1690 |                     # NOTE: save_docs_to_vector_db is a sync function that
1691 |                     # calls asyncio.run_coroutine_threadsafe(..., main_loop).result()
1692 |                     # which blocks the calling thread.  We MUST run it in a
1693 |                     # worker thread to avoid deadlocking the event loop.
1694 |                     result = await run_in_threadpool(
1695 |                         save_docs_to_vector_db,
1696 |                         request,
1697 |                         docs=docs,
1698 |                         collection_name=collection_name,
1699 |                         metadata={
1700 |                             'file_id': file.id,
1701 |                             'name': file.filename,
1702 |                             'hash': hash,
1703 |                         },
1704 |                         add=(True if form_data.collection_name else False),
1705 |                         user=user,
1706 |                     )
1707 |                     log.info(f'added {len(docs)} items to collection {collection_name}')
1708 | 
1709 |                     if result:
1710 |                         # Fresh session for the final update.
1711 |                         async with get_async_db() as session:
1712 |                             await Files.update_file_metadata_by_id(
1713 |                                 file.id,
1714 |                                 {
1715 |                                     'collection_name': collection_name,
1716 |                                 },
1717 |                                 db=session,
1718 |                             )
1719 | 
1720 |                             await Files.update_file_data_by_id(
1721 |                                 file.id,
1722 |                                 {'status': 'completed'},
1723 |                                 db=session,
1724 |                             )
1725 |                             await Files.update_file_hash_by_id(file.id, hash, db=session)
1726 | 
1727 |                             return {
1728 |                                 'status': True,
1729 |                                 'collection_name': collection_name,
1730 |                                 'filename': file.filename,
1731 |                                 'content': text_content,
1732 |                             }
1733 |                     else:
1734 |                         raise Exception('Error saving document to vector database')
1735 |                 except Exception as e:
1736 |                     raise e
1737 | 
1738 |         except Exception as e:
1739 |             log.exception(e)
1740 |             # Fresh session for error status update.
1741 |             async with get_async_db() as session:
1742 |                 await Files.update_file_data_by_id(
1743 |                     file.id,
1744 |                     {'status': 'failed'},
1745 |                     db=session,
1746 |                 )
1747 |                 # Clear the hash so the file can be re-uploaded after fixing the issue
1748 |                 await Files.update_file_hash_by_id(file.id, None, db=session)
1749 | 
1750 |             if 'No pandoc was found' in str(e):
1751 |                 raise HTTPException(
1752 |                     status_code=status.HTTP_400_BAD_REQUEST,
1753 |                     detail=ERROR_MESSAGES.PANDOC_NOT_INSTALLED,
1754 |                 )
1755 |             else:
1756 |                 raise HTTPException(
1757 |                     status_code=status.HTTP_400_BAD_REQUEST,
1758 |                     detail=str(e),
1759 |                 )
1760 | 
1761 |     else:
1762 |         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=ERROR_MESSAGES.NOT_FOUND)
1763 | 
1764 | 
[OMITTED original lines 1765-2338]
2339 | async def _validate_collection_access(collection_names: list[str], user, access_type: str = 'read') -> None:
2340 |     """
2341 |     Raise 403 if the user lacks access to any of the requested collections.
2342 |     Delegates to the shared filter_accessible_collections utility so the
2343 |     access rules stay in one place.
2344 |     """
2345 |     requested = set(collection_names)
2346 |     allowed = await filter_accessible_collections(requested, user, access_type=access_type)
2347 |     denied = requested - allowed
2348 |     if denied:
2349 |         raise HTTPException(
2350 |             status_code=status.HTTP_403_FORBIDDEN,
2351 |             detail=ERROR_MESSAGES.ACCESS_PROHIBITED,
2352 |         )
2353 | 
2354 | 
===== END ALLOWED INPUT: backend/open_webui/routers/retrieval.py =====
