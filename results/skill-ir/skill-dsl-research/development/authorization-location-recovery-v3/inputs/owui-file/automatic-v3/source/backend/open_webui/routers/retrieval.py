class ProcessFileForm(BaseModel):
    file_id: str
    content: Optional[str] = None
    collection_name: Optional[str] = None
@router.post('/process/file')
async def process_file(
    request: Request,
    form_data: ProcessFileForm,
    user=Depends(get_verified_user),
    db: AsyncSession = Depends(get_async_session),
):
    """
    Process a file and save its content to the vector database.
    Process a file and save its content to the vector database.
    Note: granular session management is used to prevent connection pool exhaustion.
    The session is committed before external API calls, and updates use a fresh session.
    """
    if user.role == 'admin':
        file = await Files.get_file_by_id(form_data.file_id, db=db)
    else:
        file = await Files.get_file_by_id_and_user_id(form_data.file_id, user.id, db=db)

    if file:
        try:
            collection_name = form_data.collection_name

            if collection_name is None:
                collection_name = f'file-{file.id}'

            if form_data.content:
                # Update the content in the file
                # Usage: /files/{file_id}/data/content/update, /files/ (audio file upload pipeline)

                try:
                    # /files/{file_id}/data/content/update
                    await ASYNC_VECTOR_DB_CLIENT.delete_collection(collection_name=f'file-{file.id}')
                except Exception:
                    # Audio file upload pipeline
                    pass

                docs = [
                    Document(
                        page_content=form_data.content.replace('<br/>', '\n'),
                        metadata={
                            **file.meta,
                            'name': file.filename,
                            'created_by': file.user_id,
                            'file_id': file.id,
                            'source': file.filename,
                        },
                    )
                ]

                text_content = form_data.content
            elif form_data.collection_name:
                # Check if the file has already been processed and save the content
                # Usage: /knowledge/{id}/file/add, /knowledge/{id}/file/update

                result = await ASYNC_VECTOR_DB_CLIENT.query(
                    collection_name=f'file-{file.id}', filter={'file_id': file.id}
                )

                if result is not None and len(result.ids[0]) > 0:
                    docs = [
                        Document(
                            page_content=result.documents[0][idx],
                            metadata=result.metadatas[0][idx],
                        )
                        for idx, id in enumerate(result.ids[0])
                    ]
                else:
                    docs = [
                        Document(
                            page_content=file.data.get('content', ''),
                            metadata={
                                **file.meta,
                                'name': file.filename,
                                'created_by': file.user_id,
                                'file_id': file.id,
                                'source': file.filename,
                            },
                        )
                    ]

                text_content = file.data.get('content', '')
            else:
                # Process the file and save the content
                # Usage: /files/
                file_path = file.path
                if file_path:
                    file_path = await asyncio.to_thread(Storage.get_file, file_path)
                    loader = build_loader_from_config(request)
                    loader.user = user
                    docs = await loader.aload(file.filename, file.meta.get('content_type'), file_path)

                    docs = [
                        Document(
                            page_content=doc.page_content,
                            metadata={
                                **filter_metadata(doc.metadata),
                                'name': file.filename,
                                'created_by': file.user_id,
                                'file_id': file.id,
                                'source': file.filename,
                            },
                        )
                        for doc in docs
                    ]
                else:
                    docs = [
                        Document(
                            page_content=file.data.get('content', ''),
                            metadata={
                                **file.meta,
                                'name': file.filename,
                                'created_by': file.user_id,
                                'file_id': file.id,
                                'source': file.filename,
                            },
                        )
                    ]
                text_content = ' '.join([doc.page_content for doc in docs])

            log.debug(f'text_content: {text_content}')
            await Files.update_file_data_by_id(
                file.id,
                {'content': text_content},
                db=db,
            )
            hash = calculate_sha256_string(text_content)

            if request.app.state.config.BYPASS_EMBEDDING_AND_RETRIEVAL:
                await Files.update_file_data_by_id(file.id, {'status': 'completed'}, db=db)
                await Files.update_file_hash_by_id(file.id, hash, db=db)
                return {
                    'status': True,
                    'collection_name': None,
                    'filename': file.filename,
                    'content': text_content,
                }
            else:
                try:
                    # Commit any pending changes before the slow embedding step.
                    # Note: file is already a Pydantic model (not ORM), so no expunge needed.
                    await db.commit()

                    # External embedding API takes time (5-60s+).
                    # Subsequent updates use fresh async sessions.
                    # NOTE: save_docs_to_vector_db is a sync function that
                    # calls asyncio.run_coroutine_threadsafe(..., main_loop).result()
                    # which blocks the calling thread.  We MUST run it in a
                    # worker thread to avoid deadlocking the event loop.
                    result = await run_in_threadpool(
                        save_docs_to_vector_db,
                        request,
                        docs=docs,
                        collection_name=collection_name,
                        metadata={
                            'file_id': file.id,
                            'name': file.filename,
                            'hash': hash,
                        },
                        add=(True if form_data.collection_name else False),
                        user=user,
                    )
                    log.info(f'added {len(docs)} items to collection {collection_name}')

                    if result:
                        # Fresh session for the final update.
                        async with get_async_db() as session:
                            await Files.update_file_metadata_by_id(
                                file.id,
                                {
                                    'collection_name': collection_name,
                                },
                                db=session,
                            )

                            await Files.update_file_data_by_id(
                                file.id,
                                {'status': 'completed'},
                                db=session,
                            )
                            await Files.update_file_hash_by_id(file.id, hash, db=session)

                            return {
                                'status': True,
                                'collection_name': collection_name,
                                'filename': file.filename,
                                'content': text_content,
                            }
                    else:
                        raise Exception('Error saving document to vector database')
                except Exception as e:
                    raise e

        except Exception as e:
            log.exception(e)
            # Fresh session for error status update.
            async with get_async_db() as session:
                await Files.update_file_data_by_id(
                    file.id,
                    {'status': 'failed'},
                    db=session,
                )
                # Clear the hash so the file can be re-uploaded after fixing the issue
                await Files.update_file_hash_by_id(file.id, None, db=session)

            if 'No pandoc was found' in str(e):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=ERROR_MESSAGES.PANDOC_NOT_INSTALLED,
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=str(e),
                )

    else:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=ERROR_MESSAGES.NOT_FOUND)
