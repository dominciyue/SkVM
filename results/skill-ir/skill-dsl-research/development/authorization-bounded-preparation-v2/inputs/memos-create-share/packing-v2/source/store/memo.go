// ValidateMemoWriteSnapshot applies the transport-independent write
// invariants to current database state.
func ValidateMemoWriteSnapshot(policy *MemoWritePolicy, update *UpdateMemo, snapshot *MemoWriteSnapshot) error {
	if err := validateMemoWritePolicy(policy); err != nil {
		return err
	}
	if policy == nil || snapshot == nil {
		return errors.New("memo write policy snapshot is required")
	}
	// An instance administrator is the superuser for named memo operations and
	// is not held to authorship or Space membership. Structural validity below
	// still applies to every actor.
	if !snapshot.ActorIsAdmin && snapshot.CreatorID != policy.ActorUserID {
		return ErrMemoPermissionDenied
	}
	if snapshot.RowStatus != Normal && snapshot.RowStatus != Archived {
		return ErrMemoMutationConflict
	}
	if policy.CreatingShare && snapshot.RowStatus != Normal {
		return ErrMemoMutationConflict
	}
	if !isValidVisibility(snapshot.Visibility) {
		return ErrMemoMutationConflict
	}
	if policy.LifecycleOnly && !isLifecycleOnlyMemoUpdate(update) {
		// The source-writability exception exists only for an author's explicit
		// move or withdrawal after membership removal. It must never authorize a
		// content or metadata mutation in the same transaction.
		return ErrMemoSpaceMembershipRequired
	}
	if snapshot.SpaceID != nil {
		if !snapshot.SourceSpaceExists {
			return ErrMemoSpaceNotWritable
		}
		if !policy.LifecycleOnly && !snapshot.ActorIsAdmin && !snapshot.SourceMemberActive {
			return ErrMemoSpaceMembershipRequired
		}
	}

	resultSpaceID := snapshot.SpaceID
	resultVisibility := snapshot.Visibility
	if update != nil {
		if update.SpaceID != nil {
			if !snapshot.TargetSpaceExists {
				return ErrMemoSpaceNotWritable
			}
			if !snapshot.ActorIsAdmin && !snapshot.TargetMemberActive {
				return ErrMemoSpaceMembershipRequired
			}
			resultSpaceID = update.SpaceID
		} else if update.ClearSpace {
			resultSpaceID = nil
		}
		if update.Visibility != nil {
			resultVisibility = *update.Visibility
		}
	}
	if !isValidVisibility(resultVisibility) {
		return ErrMemoMutationConflict
	}
	placementChanged := !sameMemoSpace(resultSpaceID, snapshot.SpaceID)
	if placementChanged && snapshot.Visibility == SpaceAudience && (update == nil || update.Visibility == nil) {
		// Moving a current SPACE memo changes which membership grants
		// access. Require the audience to be explicitly confirmed in the same
		// mutation, even if a caller read an older audience before the transaction.
		return ErrMemoMutationConflict
	}
	if policy.LifecycleOnly && !placementChanged {
		return ErrMemoSpaceMembershipRequired
	}
	if resultVisibility == SpaceAudience && resultSpaceID == nil {
		return ErrMemoSpaceNotWritable
	}
	if policy.CreatingShare && resultVisibility == SpaceAudience {
