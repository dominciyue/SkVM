func requireSpaceAdministrator(member *store.SpaceMember) error {
	if member == nil || member.Role != store.SpaceMemberRoleAdmin {
		return status.Error(codes.PermissionDenied, "space administrator permission required")
	}
	return nil
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
