func (r SpaceMemberRole) IsActiveMember() bool {
	return r == SpaceMemberRoleAdmin || r == SpaceMemberRoleUser
}
