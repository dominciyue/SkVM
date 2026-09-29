func (d MemoReadDecision) Allowed() bool {
	return d.Denial == MemoReadDenialNone
}
func IsActiveUser(user *store.User) bool {
	return user != nil && user.RowStatus == store.Normal
}
func IsInstanceAdmin(user *store.User) bool {
	return IsActiveUser(user) && user.Role == store.RoleAdmin
}
func CheckMemoReadContext(ctx MemoReadContext) MemoReadDecision {
	memo := ctx.Memo
	if memo == nil || !ctx.CreatorValid {
		return MemoReadDecision{Denial: MemoReadDenialNotFound}
	}
	if memo.Visibility != store.Public && memo.Visibility != store.Protected && memo.Visibility != store.Private && memo.Visibility != store.SpaceAudience {
		return MemoReadDecision{Denial: MemoReadDenialNotFound}
	}
	if memo.Visibility == store.SpaceAudience && (memo.SpaceID == nil || !ctx.SpaceValid) {
		return MemoReadDecision{Denial: MemoReadDenialNotFound}
	}

	if memo.RowStatus != store.Normal && memo.RowStatus != store.Archived {
		return MemoReadDecision{Denial: MemoReadDenialNotFound}
	}
	// A structurally valid memo is readable by name to an instance
	// administrator regardless of audience, placement, or lifecycle state.
	if IsInstanceAdmin(ctx.Viewer) {
		return MemoReadDecision{Class: MemoReadClassPrivate}
	}

	viewerActive := IsActiveUser(ctx.Viewer)
	viewerIsAuthor := viewerActive && ctx.Viewer.ID == memo.CreatorID
	if memo.RowStatus == store.Archived && !viewerIsAuthor {
		return MemoReadDecision{Denial: MemoReadDenialNotFound}
	}

	shareApplies := ctx.SharedMemoID != nil && memo.ID == *ctx.SharedMemoID && memo.Visibility != store.SpaceAudience
	if shareApplies {
		return MemoReadDecision{Class: MemoReadClassPrivate}
	}

	switch memo.Visibility {
	case store.Public:
		if ctx.AllowAnonymous {
			return MemoReadDecision{Class: MemoReadClassPublic}
		}
		if viewerActive {
			return MemoReadDecision{Class: MemoReadClassPrivate}
		}
		return MemoReadDecision{Denial: MemoReadDenialUnauthenticated}
	case store.Protected:
		if viewerActive {
			return MemoReadDecision{Class: MemoReadClassPrivate}
		}
		return MemoReadDecision{Denial: MemoReadDenialUnauthenticated}
	case store.Private:
		if !viewerActive {
			return MemoReadDecision{Denial: MemoReadDenialUnauthenticated}
		}
		if !viewerIsAuthor {
			return MemoReadDecision{Denial: MemoReadDenialPermission}
		}
		return MemoReadDecision{Class: MemoReadClassPrivate}
	case store.SpaceAudience:
		if !viewerActive {
			return MemoReadDecision{Denial: MemoReadDenialUnauthenticated}
		}
		if ctx.ViewerSpaceMember {
			return MemoReadDecision{Class: MemoReadClassPrivate}
		}
		return MemoReadDecision{Denial: MemoReadDenialPermission}
	default:
		return MemoReadDecision{Denial: MemoReadDenialNotFound}
	}
}
