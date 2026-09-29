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


def annotate_document_count_by_ids(
    queryset: QuerySet[Any],
    through_model: Any,
    related_object_field: str,
    document_ids: Any,
    target_field: str = "document_id",
) -> QuerySet[Any]:
    """
    Annotate a queryset with a document count for a relation to Document that
    goes through an M2M/through-model table (e.g. Tag via
    ``Document.tags.through``, or CustomField via ``CustomFieldInstance``),
    for an explicit, already-resolved set of document ids.

    Counts are computed via a single, independent GROUP BY over the relation
    table -- with the id filter expressed as a plain ``WHERE`` rather than an
    aggregate ``FILTER`` -- then injected via ``Case``/``When``. This
    deliberately avoids two slower alternatives found while building this:

    - A per-outer-row correlated subquery (one execution per row of the
      annotated queryset): fine at a handful of rows, catastrophic once the
      queryset has hundreds/thousands of rows.
    - ``Count(..., filter=Q(id__in=document_ids), distinct=True)`` applied
      directly to the M2M relation: Postgres can fail to plan the ``id__in``
      check as a semi-join and instead re-checks subquery membership once per
      row of the (much larger) M2M join -- worse than the correlated subquery.

    Aggregation is restricted to rows whose ``related_object_field`` is one of
    ``queryset``'s pks, so passing a subset (e.g. a handful of tag descendants)
    doesn't pay the cost of counting for every row matching ``document_ids``.

    Args:
        queryset: base queryset to annotate (must contain pk)
        through_model: model representing the relation (e.g., Document.tags.through
                       or CustomFieldInstance)
        related_object_field: field on the relation pointing back to queryset pk
        document_ids: the document ids to count against -- a concrete list/set,
                       or a simple (already resolved) queryset of ids. Callers
                       that need this filtered by a complex condition (e.g. a
                       permission check) should resolve it to a concrete list
                       first if the same ids will be reused across multiple
                       calls, rather than passing the complex queryset itself
                       into each -- see ``_get_selection_data_for_queryset``.
        target_field: field on the relation pointing to Document id
    """

    counts = (
        through_model.objects.filter(
            **{
                f"{related_object_field}__in": queryset.values("pk"),
                f"{target_field}__in": document_ids,
            },
        )
        .values(related_object_field)
        .annotate(c=Count(target_field, distinct=True))
    )
    counts_by_pk = {row[related_object_field]: row["c"] for row in counts}

    if not counts_by_pk:
        return queryset.annotate(
            document_count=Value(0, output_field=IntegerField()),
        )

    return queryset.annotate(
        document_count=Case(
            *(When(pk=pk, then=Value(count)) for pk, count in counts_by_pk.items()),
            default=Value(0),
            output_field=IntegerField(),
        ),
    )


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


