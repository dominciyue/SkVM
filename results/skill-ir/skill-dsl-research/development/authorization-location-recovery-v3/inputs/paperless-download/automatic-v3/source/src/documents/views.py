    def original_requested(request):
        return (
            "original" in request.query_params
            and request.query_params["original"] == "true"
        )

    def _get_effective_file_doc(
        self,
        request_doc: Document,
        root_doc: Document,
        request: Request,
    def _resolve_request_and_root_doc(
        self,
        pk,
        request: Request,
        *,
        include_deleted: bool = False,
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
