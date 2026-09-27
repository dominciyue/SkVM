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

    def get_metadata(self, file, mime_type):
        if not Path(file).is_file():
            return None

        parser_class = get_parser_registry().get_parser_for_file(
            mime_type,
            Path(file).name,
            Path(file),
        )
        if parser_class:
            try:
                with parser_class() as parser:
                    return parser.extract_metadata(file, mime_type)
            except Exception:  # pragma: no cover
                logger.exception(f"Issue getting metadata for {file}")
                return []
        else:  # pragma: no cover
            logger.warning(f"No parser for {mime_type}")
            return []

    def get_filesize(self, filename):
        if Path(filename).is_file():
            return Path(filename).stat().st_size
        return None

    @action(methods=["get"], detail=True, filter_backends=[])
    @method_decorator(cache_control(no_cache=True))
    @method_decorator(
        condition(etag_func=metadata_etag, last_modified_func=metadata_last_modified),
    )
    def metadata(self, request, pk=None):
        resolved = self._resolve_request_and_root_doc(pk, request)
        if isinstance(resolved, HttpResponseForbidden):
            return resolved

        # Choose the effective document (newest version by default,
        # or explicit via ?version=).
        doc = self._get_effective_file_doc(
            resolved.request_doc,
            resolved.root_doc,
            request,
        )

        document_cached_metadata = get_metadata_cache(doc.pk)

        archive_metadata = None
        archive_filesize = (
            self.get_filesize(doc.archive_path) if doc.has_archive_version else None
        )
        if document_cached_metadata is not None:
            original_metadata = document_cached_metadata.original_metadata
            archive_metadata = document_cached_metadata.archive_metadata
            refresh_metadata_cache(doc.pk)
        else:
            original_metadata = self.get_metadata(doc.source_path, doc.mime_type)

            if doc.has_archive_version:
                archive_metadata = self.get_metadata(
                    doc.archive_path,
                    "application/pdf",
                )
            set_metadata_cache(doc, original_metadata, archive_metadata)

        meta = {
            "original_checksum": doc.checksum,
            "original_size": self.get_filesize(doc.source_path),
            "original_mime_type": doc.mime_type,
            "media_filename": doc.filename,
            "has_archive_version": doc.has_archive_version,
            "original_metadata": original_metadata,
            "archive_checksum": doc.archive_checksum,
            "archive_media_filename": doc.archive_filename,
            "original_filename": doc.original_filename,
            "archive_size": archive_filesize,
            "archive_metadata": archive_metadata,
        }

        lang = "en"
        try:
            lang = detect(doc.content)
        except Exception:
            pass
        meta["lang"] = lang

        return Response(meta)

    @action(methods=["get"], detail=True, filter_backends=[])
    @method_decorator(cache_control(no_cache=True))
    @method_decorator(
        condition(
            etag_func=suggestions_etag,
            last_modified_func=suggestions_last_modified,
        ),
    )
    def suggestions(self, request, pk=None):
        doc = get_object_or_404(
            Document.objects.select_related("owner").prefetch_related("versions"),
            pk=pk,
        )
        if request.user is not None and not has_perms_owner_aware(
            request.user,
            "change_document",
            doc,
        ):
            return HttpResponseForbidden("Insufficient permissions")

        document_suggestions = get_suggestion_cache(doc.pk)

        if document_suggestions is not None:
            refresh_suggestions_cache(doc.pk)
            return Response(document_suggestions.suggestions)

        classifier = load_classifier()

        dates = []
        if settings.NUMBER_OF_SUGGESTED_DATES > 0:
            with get_date_parser() as date_parser:
                gen = date_parser.parse(doc.filename, doc.content)
                dates = sorted(
                    {
                        i
                        for i in itertools.islice(
                            gen,
                            settings.NUMBER_OF_SUGGESTED_DATES,
                        )
                    },
                )

        resp_data = {
            "correspondents": [
                c.id for c in match_correspondents(doc, classifier, request.user)
            ],
            "tags": [t.id for t in match_tags(doc, classifier, request.user)],
            "document_types": [
                dt.id for dt in match_document_types(doc, classifier, request.user)
            ],
            "storage_paths": [
                dt.id for dt in match_storage_paths(doc, classifier, request.user)
            ],
            "dates": [date.strftime("%Y-%m-%d") for date in dates if date is not None],
        }

        # Cache the suggestions and the classifier hash for later
        set_suggestions_cache(doc.pk, resp_data, classifier)

        return Response(resp_data)

    @action(
        methods=["get"],
        detail=True,
        filter_backends=[],
        url_path="ai_suggestions",
    )
    @method_decorator(cache_control(no_cache=True))
    def ai_suggestions(self, request, pk=None):
        doc = get_object_or_404(
            Document.objects.select_related("owner").prefetch_related("versions"),
            pk=pk,
        )
        if request.user is not None and not has_perms_owner_aware(
            request.user,
            "change_document",
            doc,
        ):
            return HttpResponseForbidden("Insufficient permissions")

        ai_config = AIConfig()
        if not ai_config.ai_enabled:
            return HttpResponseBadRequest("AI is required for this feature")

        output_language = get_llm_output_language(
            ai_config=ai_config,
            user=request.user,
        )
        llm_cache_backend = ":".join(
            part
            for part in (
                ai_config.llm_backend,
                ai_config.llm_model,
                ai_config.llm_endpoint,
                output_language,
                f"user={request.user.pk}",
            )
            if part
        )

        cached_llm_suggestions = get_llm_suggestion_cache(
            doc.pk,
            backend=llm_cache_backend,
        )

        if cached_llm_suggestions:
            # Only the raw model choices are cached, never resolved object
            # ids. resolve_choice() below still runs permission filtering
            # freshly for this requester on every request, cache hit or not,
            # so a resolved id cached for one user's visibility can never be
            # handed unfiltered to a second, less-privileged requester of
            # the same (backend + user-keyed) cache entry.
            refresh_llm_suggestions_cache(
                doc.pk,
                backend=llm_cache_backend,
            )
            llm_suggestions = cached_llm_suggestions.suggestions
        else:
            try:
                llm_suggestions = get_ai_document_classification(
                    doc,
                    request.user,
                    output_language,
                )
            except ValueError as exc:
                logger.exception(
                    "Invalid AI configuration while generating suggestions for "
                    "document %s: %s",
                    doc.pk,
                    exc,
                    exc_info=True,
                )
                raise ValidationError(
                    {"ai": [_("Invalid AI configuration.")]},
                ) from exc
            except LLMTimeoutError as exc:
                logger.exception(
                    "AI backend timed out while generating suggestions for "
                    "document %s: %s",
                    doc.pk,
                    exc,
                    exc_info=True,
                )
                return Response(
                    {"ai": [_("AI backend request timed out.")]},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            except LLMProviderError:
                logger.exception(
                    "AI backend rejected the request for document %s",
                    doc.pk,
                )
                return Response(
                    {
                        "ai": [
                            _(
                                "AI backend rejected the request. "
                                "Check logs for details.",
                            ),
                        ],
                    },
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            set_llm_suggestions_cache(
                doc.pk,
                llm_suggestions,
                backend=llm_cache_backend,
            )

        tags_choice: TaxonomyChoiceDict = llm_suggestions["tags"]
        correspondents_choice: TaxonomyChoiceDict = llm_suggestions["correspondents"]
        document_types_choice: TaxonomyChoiceDict = llm_suggestions["document_types"]
        storage_paths_choice: TaxonomyChoiceDict = llm_suggestions["storage_paths"]

        def resolve_choice(
            choice: "TaxonomyChoiceDict",
            resolve_ids: Callable[[list[int], User], list],
            match_names: Callable[[list[str], User], list],
        ) -> list:
            """The ids the model picked from the candidates it was shown, plus
            name matches for the values it proposed as new. The schema allows
            the same object to satisfy both an existing_id and a new_name in
            one valid response, so results are deduplicated by pk (keeping
            first-seen order) rather than trusting the two lookups to be
            disjoint.
            """
            matched = resolve_ids(choice["existing_ids"], request.user) + match_names(
                choice["new_names"],
                request.user,
            )
            seen_ids: set[int] = set()
            deduped = []
            for obj in matched:
                if obj.pk in seen_ids:
                    continue
                seen_ids.add(obj.pk)
                deduped.append(obj)
            return deduped

        matched_tags = resolve_choice(
            tags_choice,
            resolve_tag_ids,
            match_tags_by_name,
        )
        matched_correspondents = resolve_choice(
            correspondents_choice,
            resolve_correspondent_ids,
            match_correspondents_by_name,
        )
        matched_types = resolve_choice(
            document_types_choice,
            resolve_document_type_ids,
            match_document_types_by_name,
        )
        matched_paths = resolve_choice(
            storage_paths_choice,
            resolve_storage_path_ids,
            match_storage_paths_by_name,
        )

        resp_data = {
            "title": llm_suggestions["title"],
            "tags": [t.id for t in matched_tags],
            "suggested_tags": extract_unmatched_names(
                tags_choice["new_names"],
                matched_tags,
            ),
            "correspondents": [c.id for c in matched_correspondents],
            "suggested_correspondents": extract_unmatched_names(
                correspondents_choice["new_names"],
                matched_correspondents,
            ),
            "document_types": [d.id for d in matched_types],
            "suggested_document_types": extract_unmatched_names(
                document_types_choice["new_names"],
                matched_types,
            ),
            "storage_paths": [s.id for s in matched_paths],
            "suggested_storage_paths": extract_unmatched_names(
                storage_paths_choice["new_names"],
                matched_paths,
            ),
            "dates": llm_suggestions["dates"],
        }

        return Response(resp_data)

    @action(methods=["get"], detail=True, filter_backends=[])
    @method_decorator(cache_control(no_cache=True))
    @method_decorator(
        condition(etag_func=preview_etag, last_modified_func=preview_last_modified),
    )
    def preview(self, request, pk=None):
        resolved = self._resolve_request_and_root_doc(pk, request, include_deleted=True)
        if isinstance(resolved, HttpResponseForbidden):
            return resolved

        try:
            file_doc = self._get_effective_file_doc(
                resolved.request_doc,
                resolved.root_doc,
                request,
            )

            return serve_file(
                doc=file_doc,
                use_archive=not self.original_requested(request)
                and file_doc.has_archive_version,
                disposition="inline",
            )
        except FileNotFoundError:
            raise Http404

    @action(methods=["get"], detail=True, filter_backends=[])
    @method_decorator(cache_control(no_cache=True))
    @method_decorator(
        condition(
            etag_func=thumbnail_etag,
            last_modified_func=thumbnail_last_modified,
        ),
    )
    def thumb(self, request, pk=None):
        resolved = self._resolve_request_and_root_doc(pk, request, include_deleted=True)
        if isinstance(resolved, HttpResponseForbidden):
            return resolved

        try:
            file_doc = self._get_effective_file_doc(
                resolved.request_doc,
                resolved.root_doc,
                request,
            )
            handle = file_doc.thumbnail_file

            return FileResponse(handle, content_type="image/webp")
        except FileNotFoundError:
            raise Http404

    @action(methods=["get"], detail=True)
    def download(self, request, pk=None):
        try:
            return self.file_response(pk, request, "attachment")
        except (FileNotFoundError, Document.DoesNotExist):
            raise Http404
