func ResolveMemoReadContext(ctx context.Context, s MemoReadStore, memo *store.Memo, viewer *store.User, allowAnonymous bool, sharedMemoID *int32) (MemoReadContext, error) {
	facts, err := ResolveMemoReadFacts(ctx, s, memo)
	if err != nil {
		return MemoReadContext{}, err
	}
	return facts.WithViewer(ctx, s, viewer, allowAnonymous, sharedMemoID)
}
