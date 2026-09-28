def permitted_object_ids(
    user: User | None,
    model: type[Model],
    perm: str,
    *,
    include_deleted: bool = False,
def permitted_document_ids(
    user: User | None,
    *,
    perm: str = "view_document",
    include_deleted: bool = False,
def has_perms_owner_aware(user, perms, obj):
    """
    Legacy slow path (guardian-backed) single-object permission check.

    The queryset-filtering side of this migrated onto
    ``PermittedObjectsFilter``/``permitted_object_ids()``, but this
    single-object check still has many production callers. Several callers
    remain across ``documents/``, ``paperless_mail/``, and ``paperless_ai/``
    -- grep for this function name before removing it.
    """
    checker = ObjectPermissionChecker(user)
    return obj.owner is None or obj.owner == user or (perms != "change_document" and checker.has_perm(perms, obj))


