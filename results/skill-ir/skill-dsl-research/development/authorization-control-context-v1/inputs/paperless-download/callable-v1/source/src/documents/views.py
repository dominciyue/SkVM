class ResolvedRequestDocs(NamedTuple):
    request_doc: Document
    root_doc: Document


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

    def original_requested(request):
        return (
            "original" in request.query_params
            and request.query_params["original"] == "true"
        )

    def _resolve_file_doc(self, root_doc: Document, request):
        version_requested = get_request_version_param(request) is not None
        resolution = resolve_requested_version_for_root(
            root_doc,
            request,
            include_deleted=version_requested,
        )
        if resolution.error == VersionResolutionError.INVALID:
            raise NotFound("Invalid version parameter")
        if resolution.document is None:
            raise Http404
        return resolution.document

    def _get_effective_file_doc(
        self,
        request_doc: Document,
        root_doc: Document,
        request: Request,
    ) -> Document:
        if (
            request_doc.root_document_id is not None
            and get_request_version_param(request) is None
        ):
            return request_doc
        return self._resolve_file_doc(root_doc, request)

    def _resolve_request_and_root_doc(
        self,
        pk,
        request: Request,
        *,
        include_deleted: bool = False,
    ) -> ResolvedRequestDocs | HttpResponseForbidden:
        manager = Document.global_objects if include_deleted else Document.objects
        try:
            request_doc = manager.select_related(
                "owner",
                "root_document",
            ).get(id=pk)
        except Document.DoesNotExist:
            raise Http404

        root_doc = get_root_document(
            request_doc,
            include_deleted=include_deleted,
        )
        if request.user is not None and not has_perms_owner_aware(
            request.user,
            "view_document",
            root_doc,
        ):
            return HttpResponseForbidden("Insufficient permissions")
        return ResolvedRequestDocs(request_doc=request_doc, root_doc=root_doc)

    def file_response(self, pk, request, disposition):
        resolved = self._resolve_request_and_root_doc(
            pk,
            request,
            include_deleted=True,
        )
        if isinstance(resolved, HttpResponseForbidden):
            return resolved
        file_doc = self._get_effective_file_doc(
            resolved.request_doc,
            resolved.root_doc,
            request,
        )
        return serve_file(
            doc=file_doc,
            use_archive=not self.original_requested(request)
            and file_doc.has_archive_version,
            disposition=disposition,
            follow_formatting=request.query_params.get("follow_formatting", False),
        )

    @action(methods=["get"], detail=True)
    def download(self, request, pk=None):
        try:
            return self.file_response(pk, request, "attachment")
        except (FileNotFoundError, Document.DoesNotExist):
            raise Http404

def serve_file(
    *,
    doc: Document,
    use_archive: bool,
    disposition: str,
    follow_formatting: bool = False,
) -> FileResponse:
    if use_archive:
        if TYPE_CHECKING:
            assert doc.archive_filename

        file_handle = doc.archive_file
        filename = (
            doc.archive_filename
            if follow_formatting
            else doc.get_public_filename(archive=True)
        )
        mime_type = "application/pdf"
    else:
        if TYPE_CHECKING:
            assert doc.filename

        file_handle = doc.source_file
        filename = doc.filename if follow_formatting else doc.get_public_filename()
        mime_type = doc.mime_type
        # Support browser previewing csv files by using text mime type
        if mime_type in {"application/csv", "text/csv"} and disposition == "inline":
            mime_type = "text/plain"
        # Tell browsers to use UTF-8 for the text files we parse as UTF-8
        if mime_type in {"text/plain", "text/csv", "application/csv"}:
            mime_type = f"{mime_type}; charset=utf-8"

    response = FileResponse(file_handle, content_type=mime_type)
    # Firefox is not able to handle unicode characters in filename field
    # RFC 5987 addresses this issue
    # see https://datatracker.ietf.org/doc/html/rfc5987#section-4.2
    # Chromium cannot handle commas in the filename
    filename_normalized = (
        normalize("NFKD", filename.replace(",", "_"))
        .encode(
            "ascii",
            "ignore",
        )
        .decode("ascii")
        .replace("\\", "_")
        .replace('"', "_")
    )
    filename_encoded = quote(filename)
    content_disposition = (
        f"{disposition}; "
        f'filename="{filename_normalized}"; '
        f"filename*=utf-8''{filename_encoded}"
    )
    response["Content-Disposition"] = content_disposition
    return response


