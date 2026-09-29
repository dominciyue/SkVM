class PassUserMixin(GenericAPIView[Any]):
    """
    Pass a user object to serializer
    """

class BulkPermissionMixin:
    """
    Prefetch Django-Guardian permissions for a list before serialization, to avoid N+1 queries.
    """

class DocumentViewSet(
    BulkPermissionMixin,
    PassUserMixin,
    RetrieveModelMixin,
    UpdateModelMixin,
    DestroyModelMixin,
    ListModelMixin,
    GenericViewSet[Document],
):
    model = Document
    queryset = Document.objects.all()
    serializer_class = DocumentSerializer
    pagination_class = StandardPagination
    permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
    filter_backends = (
        DjangoFilterBackend,
        SearchFilter,
        DocumentsOrderingFilter,
        PermittedObjectsFilter,
    )
    filterset_class = DocumentFilterSet
    search_fields = ("title", "correspondent__name", "effective_content")
    ordering_fields = (
        "id",
        "title",
        "correspondent__name",
        "document_type__name",
        "storage_path__name",
        "created",
        "modified",
        "added",
        "archive_serial_number",
        "num_notes",
        "owner",
        "page_count",
        "custom_field_",
    )

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
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        document_ids = serializer.validated_data["document_ids"]
        documents_qs = Document.objects.filter(pk__in=document_ids).select_related(
            "owner",
        )
        found_ids = set(documents_qs.values_list("pk", flat=True))
        missing = sorted(set(document_ids) - found_ids)
        if missing:
            raise ValidationError(
                {
                    "document_ids": _(
                        "Documents not found: %(ids)s",
                    )
                    % {"ids": ", ".join(str(item) for item in missing)},
                },
            )

        documents = list(documents_qs)
        permitted_ids = set(permitted_document_ids(request.user))
        for document in documents:
            if document.pk not in permitted_ids:
                raise ValidationError(
                    {
                        "document_ids": _(
                            "Insufficient permissions to share document %(id)s.",
                        )
                        % {"id": document.pk},
                    },
                )

        document_map = {document.pk: document for document in documents}
        ordered_documents = [document_map[doc_id] for doc_id in document_ids]

        bundle = serializer.save(
            owner=request.user,
            documents=ordered_documents,
        )
        bundle.remove_file()
        bundle.status = ShareLinkBundle.Status.PENDING
        bundle.last_error = None
        bundle.size_bytes = None
        bundle.built_at = None
        bundle.file_path = ""
        bundle.save(
            update_fields=[
                "status",
                "last_error",
                "size_bytes",
                "built_at",
                "file_path",
            ],
        )
        build_share_link_bundle.apply_async(
            kwargs={"bundle_id": bundle.pk},
            headers={"trigger_source": PaperlessTask.TriggerSource.MANUAL},
        )
        bundle.document_total = len(ordered_documents)
        response_serializer = self.get_serializer(bundle)
        headers = self.get_success_headers(response_serializer.data)
        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers,
        )

