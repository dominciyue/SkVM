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


