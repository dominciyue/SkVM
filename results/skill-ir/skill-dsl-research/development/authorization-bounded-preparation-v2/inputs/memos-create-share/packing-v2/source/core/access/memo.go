// IsInstanceAdmin reports whether the user is an active application ADMIN.
// An instance administrator is the superuser for named memo operations: every
// memo-local authorization check (authorship, audience, Space membership and
// participation, attachment and reaction ownership) passes. Structural
// validity still applies, and collection listings keep the audience predicate
// so feeds never surface other users' private memos.
func IsInstanceAdmin(user *store.User) bool {
	return IsActiveUser(user) && user.Role == store.RoleAdmin
}

// CanManageMemo reports whether the actor may perform author-level operations
// on the memo: the active author, or an instance administrator.
func CanManageMemo(actor *store.User, memo *store.Memo) bool {
	return memo != nil && ownsOrAdministers(actor, memo.CreatorID)
}

// CanManageAttachment reports whether the actor may mutate an attachment row
// directly: the active owner, or an instance administrator.
func CanManageAttachment(actor *store.User, attachment *store.Attachment) bool {
	return attachment != nil && ownsOrAdministers(actor, attachment.CreatorID)
}

func ownsOrAdministers(actor *store.User, creatorID int32) bool {
	return IsActiveUser(actor) && (actor.ID == creatorID || actor.Role == store.RoleAdmin)
}
