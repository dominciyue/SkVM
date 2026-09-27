class ShareLinkSerializer(OwnedObjectSerializer):
    document_title = serializers.CharField(
        source="document.title",
        read_only=True,
    )

    class Meta:
        model = ShareLink
        fields = (
            "id",
            "created",
            "expiration",
            "slug",
            "document",
            "document_title",
            "file_version",
        )

    def create(self, validated_data):
        validated_data["slug"] = get_random_string(50)
        return super().create(validated_data)

    def validate_document(self, document):
        if (
            self.user is not None
            and self.user.has_perm("documents.view_document")
            and has_perms_owner_aware(
                self.user,
                "view_document",
                document,
            )
        ):
            return document
        raise PermissionDenied(
            _("Insufficient permissions."),
        )
