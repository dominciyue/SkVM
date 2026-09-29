def permitted_object_ids(
    user: User | None,
    model: type[Model],
    perm: str,
    *,
    include_deleted: bool = False,
) -> QuerySet[int]:
    """
    Generic version of ``permitted_document_ids`` for any model with an
    ``owner`` field and guardian object-level permissions. ``include_deleted``
    only has an effect for models exposing a ``global_objects``/``deleted_at``
    soft-delete pattern (currently only ``Document``); for every other model
    it is accepted but has no effect, since those models have no soft-delete
    concept.
    """
    has_soft_delete = hasattr(model, "global_objects")
    manager = (
        model.global_objects if include_deleted and has_soft_delete else model.objects
    )
    base_qs = manager.all().only("id", "owner")

    if user is None or not getattr(user, "is_authenticated", False):
        return base_qs.filter(owner__isnull=True).values_list("id", flat=True)

    # Deactivated users get nothing, deactivated superusers included, so this
    # has to come before the superuser shortcut. guardian's
    # ObjectPermissionChecker denies inactive users, but get_objects_for_user
    # (the pattern this replaces) does not, so it would not be inherited.
    if not getattr(user, "is_active", False):
        return base_qs.none().values_list("id", flat=True)

    if getattr(user, "is_superuser", False):
        return base_qs.values_list("id", flat=True)

    # Guardian's UserObjectPermission/GroupObjectPermission always store a bare
    # codename, but has_perm()-style callers commonly pass the qualified
    # "app_label.codename" form. content_type already disambiguates the
    # codename, so just drop any prefix rather than silently under-permitting.
    perm = perm.rsplit(".", 1)[-1]

    content_type = ContentType.objects.get_for_model(model)
    perm_filter = {
        "permission__codename": perm,
        "permission__content_type": content_type,
    }

    user_perm_ids = (
        UserObjectPermission.objects.filter(user=user, **perm_filter)
        .annotate(object_pk_int=Cast("object_pk", IntegerField()))
        .values_list("object_pk_int", flat=True)
    )
    group_perm_ids = (
        GroupObjectPermission.objects.filter(group__user=user, **perm_filter)
        .annotate(object_pk_int=Cast("object_pk", IntegerField()))
        .values_list("object_pk_int", flat=True)
    )
    permitted_ids = user_perm_ids.union(group_perm_ids)

    return base_qs.filter(
        Q(owner=user) | Q(owner__isnull=True) | Q(id__in=permitted_ids),
    ).values_list("id", flat=True)


def permitted_document_ids(
    user: User | None,
    *,
    perm: str = "view_document",
    include_deleted: bool = False,
) -> QuerySet[int]:
    """
    Document-specific convenience wrapper around ``permitted_object_ids``.
    Return a queryset of document IDs the user has ``perm`` on (default
    ``"view_document"``). By default limited to non-deleted documents; pass
    ``include_deleted=True`` for callers that need to check permission on
    soft-deleted documents (e.g. trash restore). This intentionally avoids
    ``get_objects_for_user`` to keep the subquery small and index-friendly.
    """
    return permitted_object_ids(user, Document, perm, include_deleted=include_deleted)


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
    return obj.owner is None or obj.owner == user or checker.has_perm(perms, obj)


    perms_map = {
        "OPTIONS": ["documents.view_note", "documents.view_document"],
        "GET": ["documents.view_note", "documents.view_document"],
        "POST": [
            "documents.add_note",
            "documents.view_document",
            "documents.change_document",
        ],
        "DELETE": [
            "documents.delete_note",
            "documents.view_document",
            "documents.change_document",
        ],
    }
    def has_permission(self, request, view):
        if not request.user or (not request.user.is_authenticated):  # pragma: no cover
            return False

        perms = self.perms_map[request.method]

        return request.user.has_perms(perms)


