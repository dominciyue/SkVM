// buildMemoReadContext resolves authorization inputs for exactly one memo.
// Relations never contribute access to either endpoint.
func (s *APIV1Service) buildMemoReadContext(ctx context.Context, memo *store.Memo, sharedMemoID *int32) (access.MemoReadContext, error) {
	viewer, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return access.MemoReadContext{}, status.Errorf(codes.Internal, "failed to get user")
	}
	allowAnonymous := false
	if viewer == nil {
		allowAnonymous, err = s.Store.AllowsAnonymousAccess(ctx)
		if err != nil {
			return access.MemoReadContext{}, status.Errorf(codes.Internal, "failed to resolve instance access policy")
		}
	}
	return s.buildMemoReadContextForViewer(ctx, memo, viewer, allowAnonymous, sharedMemoID)
}

func (s *APIV1Service) buildMemoReadContextForViewer(ctx context.Context, memo *store.Memo, viewer *store.User, allowAnonymous bool, sharedMemoID *int32) (access.MemoReadContext, error) {
	if memo == nil {
		return access.MemoReadContext{}, status.Error(codes.NotFound, "memo not found")
	}
	readContext, err := access.ResolveMemoReadContext(ctx, s.Store, memo, viewer, allowAnonymous, sharedMemoID)
	if err != nil {
		return access.MemoReadContext{}, status.Errorf(codes.Internal, "failed to resolve memo access")
	}
	return readContext, nil
