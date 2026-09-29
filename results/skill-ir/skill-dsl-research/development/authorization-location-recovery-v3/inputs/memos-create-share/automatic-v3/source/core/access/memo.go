func IsActiveUser(user *store.User) bool {
	return user != nil && user.RowStatus == store.Normal
}
func CanManageMemo(actor *store.User, memo *store.Memo) bool {
	return memo != nil && ownsOrAdministers(actor, memo.CreatorID)
}
func ownsOrAdministers(actor *store.User, creatorID int32) bool {
	return IsActiveUser(actor) && (actor.ID == creatorID || actor.Role == store.RoleAdmin)
}
