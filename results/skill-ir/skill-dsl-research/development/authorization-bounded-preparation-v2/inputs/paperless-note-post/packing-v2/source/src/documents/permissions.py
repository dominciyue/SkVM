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
class PaperlessNotePermissions(BasePermission):
    """
    Permissions class that checks for model permissions for Notes.
    """

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
