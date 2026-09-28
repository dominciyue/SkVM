// CreateMemoShare creates a new share grant.
func (s *Store) CreateMemoShare(ctx context.Context, create *MemoShare) (*MemoShare, error) {
	if create == nil {
		return nil, errors.New("memo share is required")
	}
	if err := validateMemoWritePolicy(create.Policy); err != nil {
		return nil, err
	}
	if create.Policy == nil {
		return s.driver.CreateMemoShare(ctx, create)
	}
	return s.driver.CreateMemoShare(ctx, create)
}
