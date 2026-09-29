class ResolvedRequestDocs(NamedTuple):
    request_doc: Document
    root_doc: Document


class PassUserMixin(GenericAPIView[Any]):
    """
    Pass a user object to serializer
    """

    def get_serializer(self, *args, **kwargs):
        serializer_class = self.get_serializer_class()
        if isinstance(serializer_class, type) and issubclass(
            serializer_class,
            SerializerWithPerms,
        ):
            kwargs.setdefault("user", self.request.user)
            try:
                full_perms = get_boolean(
                    str(self.request.query_params.get("full_perms", "false")),
                )
            except ValueError:
                full_perms = False
            kwargs.setdefault(
                "full_perms",
                full_perms,
            )
        return super().get_serializer(*args, **kwargs)


class BulkPermissionMixin:
    """
    Prefetch Django-Guardian permissions for a list before serialization, to avoid N+1 queries.
    """

    def _get_object_perms(
        self,
        objects: list,
        perm_codenames: list[str],
        actor: Literal["users", "groups"],
    ) -> dict[int, dict[str, list[int]]]:
        """
        Collect object-level permissions for either users or groups.
        """
        model = self.queryset.model
        obj_perm_model = (
            get_user_obj_perms_model(model)
            if actor == "users"
            else get_group_obj_perms_model(model)
        )
        id_field = "user_id" if actor == "users" else "group_id"
        ctype = ContentType.objects.get_for_model(model)
        object_pks = [obj.pk for obj in objects]

        perms_qs = obj_perm_model.objects.filter(
            content_type=ctype,
            object_pk__in=object_pks,
            permission__codename__in=perm_codenames,
        ).values_list("object_pk", id_field, "permission__codename")

        perms: dict[int, dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))
        for object_pk, actor_id, codename in perms_qs:
            perms[int(object_pk)][codename].append(actor_id)

        # Ensure that all objects have all codenames, even if empty
        for pk in object_pks:
            for codename in perm_codenames:
                perms[pk][codename]

        return perms

    def get_serializer_context(self):
        """
        Get all permissions of the current list of objects at once and pass them to the serializer.
        This avoid fetching permissions object by object in database.
        """
        context = super().get_serializer_context()

        if getattr(self, "action", None) != "list":
            # Batching only pays off across a page of objects; for single-object
            # actions (retrieve, update, ...) the per-object fallback in
            # get_user_can_change()/_get_perms() is cheap and avoids scanning
            # the whole queryset here.
            return context

        # Check which objects are being paginated
        page = getattr(self, "paginator", None)
        if page and hasattr(page, "page"):
            queryset = page.page.object_list
        elif hasattr(self, "page"):
            queryset = self.page
        else:
            queryset = self.filter_queryset(self.get_queryset())

        model_name = self.queryset.model.__name__.lower()
        permission_name_view = f"view_{model_name}"
        permission_name_change = f"change_{model_name}"

        user_perms = self._get_object_perms(
            objects=queryset,
            perm_codenames=[permission_name_view, permission_name_change],
            actor="users",
        )
        group_perms = self._get_object_perms(
            objects=queryset,
            perm_codenames=[permission_name_view, permission_name_change],
            actor="groups",
        )

        context["users_view_perms"] = {
            pk: user_perms[pk][permission_name_view] for pk in user_perms
        }
        context["users_change_perms"] = {
            pk: user_perms[pk][permission_name_change] for pk in user_perms
        }
        context["groups_view_perms"] = {
            pk: group_perms[pk][permission_name_view] for pk in group_perms
        }
        context["groups_change_perms"] = {
            pk: group_perms[pk][permission_name_change] for pk in group_perms
        }

        return context


    def perform_update(self, serializer):
        old_parent = self.get_object().get_parent()
        tag = serializer.save()
        new_parent = tag.get_parent()
        if new_parent and old_parent != new_parent:
            update_document_parent_tags(tag, new_parent)


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

    def _get_selection_data_for_queryset(self, queryset):
        # Resolve once instead of once per model below. `queryset` can carry an
        # arbitrarily expensive WHERE clause (user filters plus the permission
        # filter); re-embedding it as a subquery inside 5 separate Count(...)
        # calls forces the database to re-evaluate that whole thing 5 times, and
        # -- for FK relations especially -- can defeat semi-join planning
        # entirely at scale. A concrete id list is cheap to reuse.
        # order_by() drops the default/user ordering -- irrelevant for a plain
        # id list, but left in place it forces a sort over the full filtered
        # set before the ids can even be collected.
        document_ids = list(queryset.order_by().values_list("pk", flat=True))

        correspondents = Correspondent.objects.annotate(
            document_count=Count(
                "documents",
                filter=Q(documents__id__in=document_ids),
                distinct=True,
            ),
        )
        document_types = DocumentType.objects.annotate(
            document_count=Count(
                "documents",
                filter=Q(documents__id__in=document_ids),
                distinct=True,
            ),
        )
        storage_paths = StoragePath.objects.annotate(
            document_count=Count(
                "documents",
                filter=Q(documents__id__in=document_ids),
                distinct=True,
            ),
        )
        # Tag and CustomField reach Document through an M2M/through-model table;
        # a plain Count(filter=...) there is a much more expensive plan than the
        # FK relations above once the bridge table is large -- see
        # annotate_document_count_by_ids() for why.
        tags = annotate_document_count_by_ids(
            Tag.objects.all(),
            through_model=Document.tags.through,
            related_object_field="tag_id",
            document_ids=document_ids,
        )
        custom_fields = annotate_document_count_by_ids(
            CustomField.objects.all(),
            through_model=CustomFieldInstance,
            related_object_field="field_id",
            document_ids=document_ids,
        )
        return {
            "selected_correspondents": [
                {"id": t.id, "document_count": t.document_count} for t in correspondents
            ],
            "selected_tags": [
                {"id": t.id, "document_count": t.document_count} for t in tags
            ],
            "selected_document_types": [
                {"id": t.id, "document_count": t.document_count} for t in document_types
            ],
            "selected_storage_paths": [
                {"id": t.id, "document_count": t.document_count} for t in storage_paths
            ],
            "selected_custom_fields": [
                {"id": t.id, "document_count": t.document_count} for t in custom_fields
            ],
        }

    def _content_filter_params(cls) -> tuple[str, ...]:
        """
        Query params whose filtering needs effective_content evaluated in SQL
        against every candidate row -- see
        _needs_effective_content_annotation(). Derived rather than
        hand-maintained so a new content-filtering param counts automatically.
        """
        params = [
            name
            for name, f in DocumentFilterSet.declared_filters.items()
            if isinstance(f, (TitleContentFilter, EffectiveContentFilter))
        ]
        if "effective_content" in cls.search_fields:
            params.append(SearchFilter().search_param)
        return tuple(params)

    def _needs_effective_content_annotation(self) -> bool:
        # effective_content is a per-row correlated subquery resolving each
        # document's latest version. Filtering *on* it forces the database to
        # evaluate it for every candidate row before reaching the LIMIT, which
        # the root_document_id self-join makes pathological on MariaDB
        # specifically once real candidate counts get large; otherwise the
        # "versions" prefetch + Document.get_effective_content() resolves only
        # the page that survives pagination. Every param here is deprecated in
        # favor of the Tantivy-backed search endpoint (see filters.py's
        # TitleContentFilter/EffectiveContentFilter docs), so pay that cost
        # only when one is actually used. Blank values don't count, matching
        # how those filters themselves no-op on them -- an empty `?search=`
        # applies no predicate.
        params = self.request.query_params
        return any(
            params.get(param, "").strip() for param in self._content_filter_params()
        )

    def _requested_fields(self) -> list[str] | None:
        # The sparse-fieldset `fields` param, as DynamicFieldsModelSerializer
        # wants it: None means "no restriction, serialize everything", which
        # a blank value means too. get_queryset() and get_serializer() both
        # branch on this, and they have to read it identically -- a queryset
        # that skips the content prefetch for a response that still
        # serializes content reintroduces get_effective_content()'s
        # per-instance fallback.
        fields_param = self.request.query_params.get("fields")
        return fields_param.split(",") if fields_param else None

    def _needs_effective_content_prefetch(self) -> bool:
        # The prefetch spares get_effective_content() a per-instance fallback
        # query, but only earns itself when content can reach the response.
        fields = self._requested_fields()
        return fields is None or "content" in fields

    def get_queryset(self):
        # A correlated subquery avoids the LEFT JOIN + Count() this used to
        # be, which forced a GROUP BY aggregate over every matching document
        # before the query could even be sorted or limited.
        note_count = Subquery(
            Note.objects.filter(document=OuterRef("pk"))
            .order_by()
            .values("document")
            .annotate(count=Count("pk"))
            .values("count"),
            output_field=IntegerField(),
        )
        # No .distinct() here: nothing in this base queryset can produce
        # duplicate document rows (select_related below is all FK-to-PK;
        # permission filtering is a boolean id__in predicate, not a join).
        # M2M-based filters that *do* introduce a join (e.g. tags__id__in)
        # already call .distinct() themselves where they need it -- see
        # ObjectFilter.filter(). A blanket .distinct() here forces the
        # database to fully sort and dedupe every visible document before
        # it can apply LIMIT, which is disastrous at scale.
        prefetches = [
            Prefetch(
                "versions",
                queryset=Document.objects.only(
                    "id",
                    "added",
                    "checksum",
                    "version_label",
                    "root_document_id",
                    "version_index",
                ),
            ),
            "tags",
            Prefetch(
                "custom_fields",
                queryset=CustomFieldInstance.objects.select_related("field"),
            ),
            # NotesSerializer nests the author, this avoids query per note
            Prefetch("notes", queryset=Note.objects.select_related("user")),
        ]
        if self._needs_effective_content_prefetch():
            prefetches.append(latest_version_content_prefetch())
        queryset = (
            Document.objects.filter(root_document__isnull=True)
            .order_by("-created", "-id")
            .annotate(num_notes=Coalesce(note_count, 0))
            .select_related("correspondent", "storage_path", "document_type", "owner")
            .prefetch_related(*prefetches)
        )
        if self._needs_effective_content_annotation():
            queryset = annotate_effective_content(queryset)
        return queryset

    def get_serializer(self, *args, **kwargs):
        truncate_content = self.request.query_params.get("truncate_content", "False")
        kwargs.setdefault("context", self.get_serializer_context())
        kwargs.setdefault("fields", self._requested_fields())
        kwargs.setdefault("truncate_content", truncate_content.lower() in ["true", "1"])
        try:
            full_perms = get_boolean(
                str(self.request.query_params.get("full_perms", "false")),
            )
        except ValueError:
            full_perms = False
        kwargs.setdefault(
            "full_perms",
            full_perms,
        )
        return super().get_serializer(*args, **kwargs)

    def root(self, request, pk=None):
        try:
            doc = Document.global_objects.select_related(
                "owner",
                "root_document",
            ).get(pk=pk)
        except Document.DoesNotExist:
            raise Http404

        root_doc = get_root_document(doc)
        if request.user is not None and not has_perms_owner_aware(
            request.user,
            "view_document",
            root_doc,
        ):
            return HttpResponseForbidden("Insufficient permissions")

        return Response({"root_id": root_doc.id})

    def retrieve(
        self,
        request: Request,
        *args: Any,
        **kwargs: Any,
    ) -> Response:
        response = super().retrieve(request, *args, **kwargs)
        if (
            "version" not in request.query_params
            or not isinstance(response.data, dict)
            or "content" not in response.data
        ):
            return response

        root_doc = self.get_object()
        content_doc = self._resolve_file_doc(root_doc, request)
        response.data["content"] = content_doc.content or ""
        return response

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        root_doc = self.get_object()
        content_doc = (
            self._resolve_file_doc(root_doc, request)
            if "version" in request.query_params
            else get_latest_version_for_root(root_doc)
        )
        content_updated = "content" in request.data
        updated_content = request.data.get("content") if content_updated else None

        data = request.data.copy()
        serializer_partial = partial
        if content_updated and content_doc.id != root_doc.id:
            if updated_content is None:
                raise ValidationError({"content": ["This field may not be null."]})
            data.pop("content", None)
            serializer_partial = True

        serializer = self.get_serializer(
            root_doc,
            data=data,
            partial=serializer_partial,
        )
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        if content_updated and content_doc.id != root_doc.id:
            content_doc.content = (
                str(updated_content) if updated_content is not None else ""
            )
            content_doc.save(update_fields=["content", "modified"])

        refreshed_doc = self.get_queryset().get(pk=root_doc.pk)
        response_data = self.get_serializer(refreshed_doc).data
        if "version" in request.query_params and "content" in response_data:
            response_data["content"] = content_doc.content
        response = Response(response_data)

        from documents.search import get_backend

        get_backend().add_or_update(refreshed_doc)

        document_updated.send(
            sender=self.__class__,
            document=refreshed_doc,
        )

        return response

    def list(self, request, *args, **kwargs):
        if not get_boolean(
            str(request.query_params.get("include_selection_data", "false")),
        ):
            return super().list(request, *args, **kwargs)

        queryset = self.filter_queryset(self.get_queryset())
        selection_data = self._get_selection_data_for_queryset(queryset)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            response = self.get_paginated_response(serializer.data)
            response.data["selection_data"] = selection_data
            return response

        serializer = self.get_serializer(queryset, many=True)
        return Response({"results": serializer.data, "selection_data": selection_data})

    def destroy(self, request, *args, **kwargs):
        from documents.search import get_backend

        get_backend().remove(self.get_object().pk)
        try:
            return super().destroy(request, *args, **kwargs)
        except Exception as e:
            if "Data too long for column" in str(e):
                logger.warning(
                    "Detected a possible incompatible database column. See https://docs.paperless-ngx.com/troubleshooting/#convert-uuid-field",
                )
            logger.error(f"Error deleting document: {e!s}")
            return HttpResponseBadRequest(
                "Error deleting document, check logs for more detail.",
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
            except Exception as e:
                logger.warning(f"An error occurred saving note: {e!s}")
                return Response(
                    {
                        "error": "Error saving note, check logs for more detail.",
                    },
                )
        elif request.method == "DELETE":
            if currentUser is not None and not has_perms_owner_aware(
                currentUser,
                "change_document",
                doc,
            ):
                return HttpResponseForbidden("Insufficient permissions to delete notes")

            note_id = request.GET.get("id")
            if not note_id:
                raise ValidationError({"id": "This field is required."})
            try:
                note_id_int = int(note_id)
            except ValueError:
                raise ValidationError({"id": "A valid integer is required."})
            note = get_object_or_404(Note, id=note_id_int, document=doc)
            if settings.AUDIT_LOG_ENABLED:
                LogEntry.objects.log_create(
                    instance=doc,
                    changes={
                        "Note Deleted": [note.id, "None"],
                    },
                    action=LogEntry.Action.UPDATE,
                )

            note.delete()

            doc.modified = timezone.now()
            doc.save(update_fields=["modified"])

            from documents.search import get_backend

            get_backend().add_or_update(doc)

            notes = serializer.to_representation(doc).get("notes")

            return Response(notes)

        return Response(
            {
                "error": "error",
            },
        )

    def share_links(self, request, pk=None):
        currentUser = request.user
        try:
            doc = Document.objects.select_related("owner").get(pk=pk)
            if currentUser is not None and not has_perms_owner_aware(
                currentUser,
                "change_document",
                doc,
            ):
                return HttpResponseForbidden(
                    "Insufficient permissions to add share link",
                )
        except Document.DoesNotExist:
            raise Http404

        if request.method == "GET":
            now = timezone.now()
            links = (
                ShareLink.objects.filter(document=doc)
                .select_related("document")
                .only(
                    "pk",
                    "created",
                    "expiration",
                    "slug",
                    "document__title",
                )
                .exclude(expiration__lt=now)
                .order_by("-created")
            )
            serializer = ShareLinkSerializer(links, many=True)
            return Response(serializer.data)

    def history(self, request, pk=None):
        if not settings.AUDIT_LOG_ENABLED:
            return HttpResponseBadRequest("Audit log is disabled")
        try:
            doc = Document.objects.get(pk=pk)
            if not request.user.has_perm("auditlog.view_logentry") or (
                doc.owner is not None
                and doc.owner != request.user
                and not request.user.is_superuser
            ):
                return HttpResponseForbidden(
                    "Insufficient permissions",
                )
        except Document.DoesNotExist:  # pragma: no cover
            raise Http404

        # documents
        entries = [
            {
                "id": entry.id,
                "timestamp": entry.timestamp,
                "action": entry.get_action_display(),
                "changes": entry.changes,
                "actor": (
                    {"id": entry.actor.id, "username": entry.actor.username}
                    if entry.actor
                    else None
                ),
            }
            for entry in LogEntry.objects.get_for_object(doc).select_related(
                "actor",
            )
        ]

        # custom fields
        for entry in LogEntry.objects.get_for_objects(
            doc.custom_fields.all(),
        ).select_related("actor"):
            entries.append(
                {
                    "id": entry.id,
                    "timestamp": entry.timestamp,
                    "action": entry.get_action_display(),
                    "changes": {
                        "custom_fields": {
                            "type": "custom_field",
                            "field": str(entry.object_repr).split(":")[0].strip(),
                            "value": str(entry.object_repr).split(":")[1].strip(),
                        },
                    },
                    "actor": (
                        {"id": entry.actor.id, "username": entry.actor.username}
                        if entry.actor
                        else None
                    ),
                },
            )

        return Response(sorted(entries, key=lambda x: x["timestamp"], reverse=True))

    def email_document(self, request, pk=None):
        request_data = request.data.copy()
        request_data.setlist("documents", [pk])
        return self.email_documents(request, data=request_data)

    def email_documents(self, request, data=None):
        serializer = EmailSerializer(data=data or request.data)
        serializer.is_valid(raise_exception=True)

        validated_data = serializer.validated_data
        document_ids = validated_data.get("documents")
        addresses = validated_data.get("addresses").split(",")
        addresses = [addr.strip() for addr in addresses]
        subject = validated_data.get("subject")
        message = validated_data.get("message")
        use_archive_version = validated_data.get("use_archive_version", True)

        documents = Document.objects.filter(pk__in=document_ids)
        if (
            request.user is not None
            and documents.exclude(
                pk__in=permitted_document_ids(request.user),
            ).exists()
        ):
            return HttpResponseForbidden("Insufficient permissions")

        try:
            attachments: list[EmailAttachment] = []
            for doc in documents:
                attachment_path = (
                    doc.archive_path
                    if use_archive_version and doc.has_archive_version
                    else doc.source_path
                )
                attachments.append(
                    EmailAttachment(
                        path=attachment_path,
                        mime_type=doc.mime_type,
                        friendly_name=doc.get_public_filename(
                            archive=use_archive_version and doc.has_archive_version,
                        ),
                    ),
                )

            send_email(
                subject=subject,
                body=message,
                to=addresses,
                attachments=attachments,
            )

            logger.debug(
                f"Sent documents {[doc.id for doc in documents]} via email to {addresses}",
            )
            return Response({"message": "Email sent"})
        except Exception as e:
            logger.warning(f"An error occurred emailing documents: {e!s}")
            return HttpResponseServerError(
                "Error emailing documents, check logs for more detail.",
            )

    def update_version(self, request, pk=None):
        serializer = DocumentVersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            request_doc = Document.objects.select_related(
                "owner",
                "root_document",
            ).get(pk=pk)
            root_doc = get_root_document(request_doc)
            if request.user is not None and (
                not request.user.has_perm("documents.change_document")
                or not has_perms_owner_aware(
                    request.user,
                    "change_document",
                    root_doc,
                )
            ):
                return HttpResponseForbidden("Insufficient permissions")
        except Document.DoesNotExist:
            raise Http404

        try:
            doc_name, doc_data = serializer.validated_data.get("document")
            version_label = serializer.validated_data.get("version_label")

            t = int(mktime(datetime.now().timetuple()))

            settings.SCRATCH_DIR.mkdir(parents=True, exist_ok=True)

            temp_file_path = Path(tempfile.mkdtemp(dir=settings.SCRATCH_DIR)) / Path(
                pathvalidate.sanitize_filename(doc_name),
            )

            temp_file_path.write_bytes(doc_data)

            os.utime(temp_file_path, times=(t, t))

            input_doc = ConsumableDocument(
                source=DocumentSource.ApiUpload,
                original_file=temp_file_path,
                root_document_id=root_doc.pk,
            )

            overrides = DocumentMetadataOverrides()
            if version_label:
                overrides.version_label = version_label.strip()
            if request.user is not None:
                overrides.owner_id = request.user.id
                overrides.actor_id = request.user.id

            async_task = consume_file.apply_async(
                kwargs={"input_doc": input_doc, "overrides": overrides},
                headers={"trigger_source": PaperlessTask.TriggerSource.WEB_UI},
            )
            logger.debug(
                f"Updated document {root_doc.id} with new version",
            )
            return Response(async_task.id)
        except Exception as e:
            logger.warning(f"An error occurred updating document: {e!s}")
            return HttpResponseServerError(
                "Error updating document, check logs for more detail.",
            )

    def _get_root_doc_for_version_action(self, pk) -> Document:
        try:
            root_doc = Document.objects.select_related(
                "owner",
                "root_document",
            ).get(pk=pk)
        except Document.DoesNotExist:
            raise Http404
        return get_root_document(root_doc)

    def _get_version_doc_for_root(self, root_doc: Document, version_id) -> Document:
        try:
            version_doc = Document.objects.select_related("owner").get(
                pk=version_id,
            )
        except Document.DoesNotExist:
            raise Http404

        if (
            version_doc.id != root_doc.id
            and version_doc.root_document_id != root_doc.id
        ):
            raise Http404
        return version_doc

    def delete_version(self, request, pk=None, version_id=None):
        root_doc = self._get_root_doc_for_version_action(pk)

        if request.user is not None and not has_perms_owner_aware(
            request.user,
            "delete_document",
            root_doc,
        ):
            return HttpResponseForbidden("Insufficient permissions")

        version_doc = self._get_version_doc_for_root(root_doc, version_id)

        if version_doc.id == root_doc.id:
            return HttpResponseBadRequest(
                "Cannot delete the root/original version. Delete the document instead.",
            )

        from documents.search import get_backend

        _backend = get_backend()
        _backend.remove(version_doc.pk)
        version_doc_id = version_doc.id
        version_doc.delete()
        root_doc.modified = timezone.now()
        Document.objects.filter(pk=root_doc.pk).update(modified=root_doc.modified)
        _backend.add_or_update(root_doc)
        if settings.AUDIT_LOG_ENABLED:
            actor = (
                request.user if request.user and request.user.is_authenticated else None
            )
            LogEntry.objects.log_create(
                instance=root_doc,
                changes={
                    "Version Deleted": ["None", version_doc_id],
                },
                action=LogEntry.Action.UPDATE,
                actor=actor,
                additional_data={
                    "reason": "Version deleted",
                    "version_id": version_doc_id,
                },
            )

        current = versions_newest_first(
            Document.objects.filter(Q(id=root_doc.id) | Q(root_document=root_doc)),
        ).first()

        document_updated.send(
            sender=self.__class__,
            document=root_doc,
        )
        return Response(
            {
                "result": "OK",
                "current_version_id": current.id if current else root_doc.id,
            },
        )

    def update_version_label(self, request, pk=None, version_id=None):
        serializer = DocumentVersionLabelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        root_doc = self._get_root_doc_for_version_action(pk)
        if request.user is not None and not has_perms_owner_aware(
            request.user,
            "change_document",
            root_doc,
        ):
            return HttpResponseForbidden("Insufficient permissions")

        version_doc = self._get_version_doc_for_root(root_doc, version_id)
        old_label = version_doc.version_label
        version_doc.version_label = serializer.validated_data["version_label"]
        version_doc.save(update_fields=["version_label"])
        root_doc.modified = timezone.now()
        Document.objects.filter(pk=root_doc.pk).update(modified=root_doc.modified)

        if settings.AUDIT_LOG_ENABLED and old_label != version_doc.version_label:
            actor = (
                request.user if request.user and request.user.is_authenticated else None
            )
            LogEntry.objects.log_create(
                instance=root_doc,
                changes={
                    "Version Label": [old_label, version_doc.version_label],
                },
                action=LogEntry.Action.UPDATE,
                actor=actor,
                additional_data={
                    "reason": "Version label updated",
                    "version_id": version_doc.id,
                },
            )

        document_updated.send(
            sender=self.__class__,
            document=root_doc,
        )

        return Response(
            {
                "id": version_doc.id,
                "added": version_doc.added,
                "version_label": version_doc.version_label,
                "checksum": version_doc.checksum,
                "is_root": version_doc.id == root_doc.id,
            },
        )


    def paginate_queryset(self, queryset):
        # v9: tasks endpoint was not paginated; preserve plain-list response
        if self.request.version and int(self.request.version) < 10:
            return None
        return super().paginate_queryset(queryset)

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


