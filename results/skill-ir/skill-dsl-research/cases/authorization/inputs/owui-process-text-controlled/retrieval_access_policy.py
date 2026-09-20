# Cropped from backend/open_webui/retrieval/utils.py at
# https://github.com/open-webui/open-webui/tree/841c9045d789005145274955e7ef60b1b11a9be9
# Original lines 1061-1109.
async def filter_accessible_collections(
    collection_names: set[str],
    user: UserModel,
    access_type: str = 'read',
) -> set[str]:
    """
    Return only the collection names the user is allowed to access.
    Admins bypass all checks.  For non-admins the policy is:

      - file-*          → validated via has_access_to_file
      - user-memory-*   → must match user's own memory collection
      - web-search-*    → ephemeral per-query collections, always allowed
      - knowledge-bases → always denied (system meta-collection)
      - everything else → if the name matches a knowledge base, validated
                          via Knowledges.check_access_by_user_id; if no
                          such KB exists, the name is treated as an
                          ephemeral/legacy collection and allowed
    """
    if user.role == 'admin':
        return collection_names

    validated = set()
    for name in collection_names:
        if name == 'knowledge-bases':
            # System meta-collection — never exposed to non-admins.
            continue
        elif name.startswith('file-'):
            file_id = name[len('file-') :]
            if await has_access_to_file(file_id=file_id, access_type=access_type, user=user):
                validated.add(name)
        elif name.startswith('user-memory-'):
            if name == f'user-memory-{user.id}':
                validated.add(name)
        elif name.startswith('web-search-'):
            # Ephemeral collections created by process_web_search — safe
            # to allow because they contain only transient web-search
            # results scoped to the requesting user's session.
            validated.add(name)
        else:
            # May be a knowledge-base ID or a legacy/ephemeral collection.
            # If it IS a KB, enforce access control.  If no such KB
            # exists, treat it as a non-sensitive collection (e.g. legacy
            # model knowledge, process_text SHA256 collections) and allow.
            if await Knowledges.check_access_by_user_id(name, user.id, permission=access_type):
                validated.add(name)
            elif not await Knowledges.get_knowledge_by_id(name):
                # Not a KB at all — legacy/ephemeral collection, allow
                validated.add(name)
    return validated
