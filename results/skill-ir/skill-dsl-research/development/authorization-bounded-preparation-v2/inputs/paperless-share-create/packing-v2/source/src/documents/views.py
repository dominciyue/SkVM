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
class ShareLinkViewSet(
    PassUserMixin,
    CreateModelMixin,
    RetrieveModelMixin,
    DestroyModelMixin,
    ListModelMixin,
    GenericViewSet,
):
    model = ShareLink

    queryset = ShareLink.objects.select_related("document")

    serializer_class = ShareLinkSerializer
    pagination_class = StandardPagination
    permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
    filter_backends = (
        DjangoFilterBackend,
        OrderingFilter,
        PermittedObjectsFilter,
    )
    filterset_class = ShareLinkFilterSet
    ordering_fields = ("created", "expiration", "document__title")
