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
