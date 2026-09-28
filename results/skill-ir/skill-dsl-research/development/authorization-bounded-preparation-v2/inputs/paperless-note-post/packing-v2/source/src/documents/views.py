    @action(
        methods=["get", "post", "delete"],
        detail=True,
        permission_classes=[PaperlessNotePermissions],
        pagination_class=None,
        filter_backends=[],
    )
    def notes(self, request, pk=None):
        currentUser = request.user
        try:
            doc = (
                Document.objects.select_related("owner")
                .prefetch_related("notes")
                .only("pk", "owner__id")
                .get(pk=pk)
            )
            if currentUser is not None and not has_perms_owner_aware(
                currentUser,
                "view_document",
                doc,
            ):
                return HttpResponseForbidden("Insufficient permissions to view notes")
        except Document.DoesNotExist:
            raise Http404

        serializer = self.get_serializer(doc)

        if request.method == "GET":
            try:
                notes = serializer.to_representation(doc).get("notes")
                return Response(notes)
            except Exception as e:
                logger.warning(f"An error occurred retrieving notes: {e!s}")
                return Response(
                    {"error": "Error retrieving notes, check logs for more detail."},
                )
        elif request.method == "POST":
            try:
                if currentUser is not None and not has_perms_owner_aware(
                    currentUser,
                    "change_document",
                    doc,
                ):
                    return HttpResponseForbidden(
                        "Insufficient permissions to create notes",
                    )

                c = Note.objects.create(
                    document=doc,
                    note=request.data["note"],
                    user=currentUser,
                )
                # If audit log is enabled make an entry in the log
                # about this note change
                if settings.AUDIT_LOG_ENABLED:
                    LogEntry.objects.log_create(
                        instance=doc,
                        changes={
                            "Note Added": ["None", c.id],
                        },
                        action=LogEntry.Action.UPDATE,
                    )

                doc.modified = timezone.now()
                doc.save(update_fields=["modified"])

                from documents.search import get_backend

                get_backend().add_or_update(doc)

                notes = serializer.to_representation(doc).get("notes")

                return Response(notes)
