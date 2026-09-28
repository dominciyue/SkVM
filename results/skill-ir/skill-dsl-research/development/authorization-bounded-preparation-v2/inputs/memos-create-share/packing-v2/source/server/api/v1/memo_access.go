func memoWritePolicy(actorUserID int32, lifecycleOnly bool) *store.MemoWritePolicy {
	return &store.MemoWritePolicy{
		ActorUserID:   actorUserID,
		LifecycleOnly: lifecycleOnly,
	}
}
