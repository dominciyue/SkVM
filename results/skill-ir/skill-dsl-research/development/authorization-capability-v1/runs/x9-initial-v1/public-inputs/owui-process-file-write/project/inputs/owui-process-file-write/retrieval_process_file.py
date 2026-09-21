# Cropped from backend/open_webui/routers/retrieval.py at
# https://github.com/open-webui/open-webui/tree/841c9045d789005145274955e7ef60b1b11a9be9
# Original lines 1517-1531, inside save_docs_to_vector_db.
items = [
    {
        'id': str(uuid.uuid4()),
        'text': text,
        'vector': embeddings[idx],
        'metadata': metadatas[idx],
    }
    for idx, text in enumerate(texts)
]

log.info(f'adding to collection {collection_name}')
VECTOR_DB_CLIENT.insert(
    collection_name=collection_name,
    items=items,
)

# Original lines 1540-1570.
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

# Original lines 1571-1687 load content, build metadata, and commit file updates;
# they contain no call that authorizes collection_name and are omitted from this crop.

# Original lines 1688-1706.
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
