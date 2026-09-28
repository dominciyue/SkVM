// CreateMemoShare creates an opaque share link for a memo.
// Only the memo's creator may call this.
func (s *APIV1Service) CreateMemoShare(ctx context.Context, request *v1pb.CreateMemoShareRequest) (*v1pb.MemoShare, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get user")
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}
	if err := s.throttleAndCharge(ratelimit.ScopeWriteUser, userKey(user.ID), 1); err != nil {
		return nil, err
	}

	memoUID, err := ExtractMemoUIDFromName(request.Parent)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid memo name: %v", err)
	}
	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &memoUID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get memo")
	}
	if memo == nil {
		return nil, status.Errorf(codes.NotFound, "memo not found")
	}
	if memo.RowStatus != store.Normal {
		return nil, status.Errorf(codes.FailedPrecondition, "only active memos can be shared")
	}
	if !access.CanManageMemo(user, memo) {
		return nil, status.Errorf(codes.PermissionDenied, "permission denied")
	}
	if memo.Visibility == store.SpaceAudience {
		return nil, status.Errorf(codes.FailedPrecondition, "SPACE audience memos cannot be shared")
	}
	var expiresTs *int64
	if request.MemoShare != nil && request.MemoShare.ExpireTime != nil {
		ts := request.MemoShare.ExpireTime.AsTime().Unix()
		if ts <= time.Now().Unix() {
			return nil, status.Errorf(codes.InvalidArgument, "expire_time must be in the future")
		}
		expiresTs = &ts
	}

	// Generate a URL-safe token using shortuuid (base57-encoded UUID v4, 22 chars, 122-bit entropy).
	policy := memoWritePolicy(user.ID, false)
	policy.CreatingShare = true
	ms, err := s.Store.CreateMemoShare(ctx, &store.MemoShare{
		UID:       shortuuid.New(),
		MemoID:    memo.ID,
		CreatorID: user.ID,
		ExpiresTs: expiresTs,
		Policy:    policy,
	})
	if err != nil {
		return nil, mapMemoWriteError(err, "failed to create memo share")
	}

	return convertMemoShareFromStore(ms, memo.UID), nil
