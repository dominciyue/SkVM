func (s *Store) GetMemoShare(ctx context.Context, find *FindMemoShare) (*MemoShare, error) {
	return s.driver.GetMemoShare(ctx, find)
}
