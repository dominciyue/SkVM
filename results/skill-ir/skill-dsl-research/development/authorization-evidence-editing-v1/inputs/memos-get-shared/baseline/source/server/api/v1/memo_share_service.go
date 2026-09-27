// GetSharedMemo resolves a share token to its memo. No authentication required.
// Returns NOT_FOUND for invalid or expired tokens (no information leakage).
func (s *APIV1Service) GetSharedMemo(ctx context.Context, request *v1pb.GetSharedMemoRequest) (*v1pb.Memo, error) {
	ms, err := s.getActiveMemoShare(ctx, request.ShareToken)
	if err != nil {
		return nil, err
	}

	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{ID: &ms.MemoID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get memo")
	}
	// Treat archived or missing memos the same as an invalid token — no information leakage.
	if memo == nil || memo.RowStatus != store.Normal || memo.Visibility == store.SpaceAudience {
		return nil, status.Errorf(codes.NotFound, "not found")
	}
	readContext, err := s.buildMemoReadContext(ctx, memo, &ms.MemoID)
	if err != nil || !access.CheckMemoReadContext(readContext).Allowed() {
		return nil, status.Error(codes.NotFound, "not found")
	}

	reactions, err := s.Store.ListReactions(ctx, &store.FindReaction{
		MemoID: &memo.ID,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list reactions")
	}

	attachments, err := s.Store.ListAttachments(ctx, &store.FindAttachment{MemoID: &memo.ID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list attachments")
	}

	memoMessage, err := s.convertMemoFromStore(ctx, memo, reactions, attachments, nil)
	if err != nil {
		if stderrors.Is(err, errMemoCreatorNotFound) {
			return nil, status.Errorf(codes.NotFound, "not found")
		}
		return nil, errors.Wrap(err, "failed to convert memo")
	}
	// A share token grants access to this memo only, not to its surrounding
	// conversation or relation graph.
	memoMessage.Parent = nil
	return memoMessage, nil
