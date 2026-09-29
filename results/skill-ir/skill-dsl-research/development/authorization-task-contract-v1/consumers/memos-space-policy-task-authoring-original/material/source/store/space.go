func (r SpaceMemberRole) IsActiveMember() bool {
	return r == SpaceMemberRoleAdmin || r == SpaceMemberRoleUser
}
func (s *Store) DeleteSpaceMember(ctx context.Context, delete *DeleteSpaceMember, actorUserID int32) error {
	if delete == nil || delete.SpaceID <= 0 || delete.UserID <= 0 || actorUserID <= 0 {
		return errors.New("space member deletion requires space, user, and actor")
	}
	return s.driver.DeleteSpaceMember(ctx, delete, actorUserID)
}
