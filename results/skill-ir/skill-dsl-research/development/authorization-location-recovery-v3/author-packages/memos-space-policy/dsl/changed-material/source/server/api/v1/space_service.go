func (s *APIV1Service) requireCurrentSpaceUser(ctx context.Context) (*store.User, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	if user == nil {
		return nil, status.Error(codes.Unauthenticated, "user not authenticated")
	}
	return user, nil
}
func (s *APIV1Service) resolveMemberSpace(ctx context.Context, name string, currentUser *store.User) (*store.Space, *store.SpaceMember, error) {
	uid, err := ExtractSpaceUIDFromName(name)
	if err != nil {
		return nil, nil, status.Errorf(codes.InvalidArgument, "invalid space name: %v", err)
	}
	space, err := s.Store.GetSpace(ctx, &store.FindSpace{UID: &uid, MemberUserID: &currentUser.ID})
	if err != nil {
		return nil, nil, status.Errorf(codes.Internal, "failed to get space: %v", err)
	}
	if space == nil {
		return nil, nil, status.Error(codes.NotFound, "space not found")
	}
	member, err := s.Store.GetSpaceMember(ctx, &store.FindSpaceMember{SpaceID: &space.ID, UserID: &currentUser.ID})
	if err != nil {
		return nil, nil, status.Errorf(codes.Internal, "failed to get space membership: %v", err)
	}
	if member == nil || !member.Role.IsActiveMember() {
		// A non-member must not be able to distinguish an existing private
		// collaboration boundary from a missing resource.
		return nil, nil, status.Error(codes.NotFound, "space not found")
	}
	return space, member, nil
}
func requireSpaceAdministrator(member *store.SpaceMember) error {
	if member == nil || member.Role != store.SpaceMemberRoleAdmin {
		return status.Error(codes.PermissionDenied, "space administrator permission required")
	}
	return nil
}
func mapSpaceMutationError(err error, operation string) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, store.ErrLastSpaceAdmin):
		return status.Error(codes.FailedPrecondition, "a space must retain an active administrator")
	case errors.Is(err, store.ErrSpacePermissionDenied):
		return status.Error(codes.NotFound, "space not found")
	case errors.Is(err, store.ErrSpaceMemberNotActive):
		return status.Error(codes.FailedPrecondition, "space members must be active users")
	case errors.Is(err, store.ErrSpaceAlreadyExists):
		return status.Error(codes.AlreadyExists, "space already exists")
	case errors.Is(err, store.ErrSpaceMemberAlreadyExists):
		return status.Error(codes.AlreadyExists, "space membership or invitation already exists")
	case errors.Is(err, store.ErrSpaceInvitationNotFound):
		return status.Error(codes.NotFound, "space invitation not found")
	case errors.Is(err, store.ErrSpaceNotFound), errors.Is(err, store.ErrSpaceMemberNotFound):
		return status.Error(codes.NotFound, "space or membership not found")
	case errors.Is(err, sql.ErrNoRows):
		return status.Error(codes.NotFound, "space or membership not found")
	default:
		return status.Errorf(codes.Internal, "%s: %v", operation, err)
	}
}
func (s *APIV1Service) GetSpace(ctx context.Context, request *v1pb.GetSpaceRequest) (*v1pb.Space, error) {
	currentUser, err := s.requireCurrentSpaceUser(ctx)
	if err != nil {
		return nil, err
	}
	space, _, err := s.resolveMemberSpace(ctx, request.Name, currentUser)
	if err != nil {
		return nil, err
	}
	return convertSpaceFromStore(space), nil
}
func (s *APIV1Service) resolveSpaceMemberResource(ctx context.Context, name string, currentUser *store.User) (*store.Space, *store.User, *store.SpaceMember, *store.SpaceMember, error) {
	spaceUID, username, err := ExtractSpaceMemberTokensFromName(name)
	if err != nil {
		return nil, nil, nil, nil, status.Errorf(codes.InvalidArgument, "invalid space member name: %v", err)
	}
	space, callerMembership, err := s.resolveMemberSpace(ctx, buildSpaceName(spaceUID), currentUser)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	targetUser, err := ResolveUserByName(ctx, s.Store, BuildUserName(username))
	if err != nil {
		return nil, nil, nil, nil, status.Errorf(codes.Internal, "failed to resolve member user: %v", err)
	}
	if targetUser == nil {
		return nil, nil, nil, nil, status.Error(codes.NotFound, "space member not found")
	}
	if targetUser.RowStatus != store.Normal {
		return nil, nil, nil, nil, status.Error(codes.NotFound, "space member not found")
	}
	targetMembership, err := s.Store.GetSpaceMember(ctx, &store.FindSpaceMember{
		SpaceID:      &space.ID,
		UserID:       &targetUser.ID,
		ViewerUserID: &currentUser.ID,
	})
	if err != nil {
		return nil, nil, nil, nil, status.Errorf(codes.Internal, "failed to get space membership: %v", err)
	}
	if targetMembership == nil || !targetMembership.Role.IsActiveMember() {
		return nil, nil, nil, nil, status.Error(codes.NotFound, "space member not found")
	}
	return space, targetUser, callerMembership, targetMembership, nil
}
func (s *APIV1Service) GetSpaceMember(ctx context.Context, request *v1pb.GetSpaceMemberRequest) (*v1pb.SpaceMember, error) {
	currentUser, err := s.requireCurrentSpaceUser(ctx)
	if err != nil {
		return nil, err
	}
	space, targetUser, _, membership, err := s.resolveSpaceMemberResource(ctx, request.Name, currentUser)
	if err != nil {
		return nil, err
	}
	return convertSpaceMemberFromStore(space, targetUser, membership), nil
}
// DeleteSpaceMember removes a membership or lets a member leave a space.
func (s *APIV1Service) DeleteSpaceMember(ctx context.Context, request *v1pb.DeleteSpaceMemberRequest) (*emptypb.Empty, error) {
	currentUser, err := s.requireCurrentSpaceUser(ctx)
	if err != nil {
		return nil, err
	}
	_, targetUser, callerMembership, targetMembership, err := s.resolveSpaceMemberResource(ctx, request.Name, currentUser)
	if err != nil {
		return nil, err
	}
	isSelf := targetUser.ID == currentUser.ID
	if !isSelf {
		if err := requireSpaceAdministrator(callerMembership); err != nil {
			return nil, err
		}
	}
	if err := s.Store.DeleteSpaceMember(ctx, &store.DeleteSpaceMember{
		SpaceID: targetMembership.SpaceID,
		UserID:  targetMembership.UserID,
	}, currentUser.ID); err != nil {
		return nil, mapSpaceMutationError(err, "failed to delete space member")
	}
	s.SSEHub.publishSpaceChanged()
	return &emptypb.Empty{}, nil
}
