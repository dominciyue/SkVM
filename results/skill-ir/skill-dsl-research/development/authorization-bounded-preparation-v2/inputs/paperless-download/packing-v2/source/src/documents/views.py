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
