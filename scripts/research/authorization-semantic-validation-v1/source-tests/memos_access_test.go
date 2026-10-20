package access

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/usememos/memos/store"
)

// This fake observes the original access functions; it does not implement them.
type btMemoStore struct {
	calls []string
	creator *store.User
	space *store.Space
	member *store.SpaceMember
	userErr, spaceErr, memberErr error
}

func (s *btMemoStore) GetUser(_ context.Context, _ *store.FindUser) (*store.User, error) {
	s.calls = append(s.calls, "GetUser")
	return s.creator, s.userErr
}
func (s *btMemoStore) GetSpace(_ context.Context, _ *store.FindSpace) (*store.Space, error) {
	s.calls = append(s.calls, "GetSpace")
	return s.space, s.spaceErr
}
func (s *btMemoStore) GetSpaceMember(_ context.Context, _ *store.FindSpaceMember) (*store.SpaceMember, error) {
	s.calls = append(s.calls, "GetSpaceMember")
	return s.member, s.memberErr
}

func TestBTOriginalResolveOrder(t *testing.T) {
	spaceID := int32(8)
	memo := &store.Memo{ID: 43, CreatorID: 17, SpaceID: &spaceID, Visibility: store.Private, RowStatus: store.Normal}
	viewer := &store.User{ID: 31, RowStatus: store.Normal, Role: store.RoleUser}
	sentinel := errors.New("BT storage failure")
	for _, tc := range []struct{
		name string
		s *btMemoStore
		viewer *store.User
		want []string
		err error
	}{
		{"invalid_creator_still_resolves_space", &btMemoStore{spaceErr: sentinel}, viewer, []string{"GetUser", "GetSpace"}, sentinel},
		{"invalid_creator_still_resolves_member", &btMemoStore{space: &store.Space{}, memberErr: sentinel}, viewer, []string{"GetUser", "GetSpace", "GetSpaceMember"}, sentinel},
		{"invalid_creator_denied_after_resolution", &btMemoStore{space: &store.Space{}}, viewer, []string{"GetUser", "GetSpace", "GetSpaceMember"}, nil},
		{"anonymous_skips_membership", &btMemoStore{space: &store.Space{}}, nil, []string{"GetUser", "GetSpace"}, nil},
		{"creator_error_stops_before_space", &btMemoStore{userErr: sentinel}, viewer, []string{"GetUser"}, sentinel},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, err := ResolveMemoReadContext(context.Background(), tc.s, memo, tc.viewer, true, &memo.ID)
			t.Logf("original calls=%v error=%v", tc.s.calls, err)
			if !reflect.DeepEqual(tc.s.calls, tc.want) || err != tc.err { t.Fatalf("calls=%v error=%v; want %v %v", tc.s.calls, err, tc.want, tc.err) }
			if err == nil && CheckMemoReadContext(ctx).Denial != MemoReadDenialNotFound { t.Fatal("invalid creator must be denied after resolution") }
		})
	}
}

func TestBTOriginalShareObjectBinding(t *testing.T) {
	memo := &store.Memo{ID: 43, CreatorID: 17, Visibility: store.Private, RowStatus: store.Normal}
	other := int32(89)
	for _, tc := range []struct{name string; share *int32; allowed bool}{
		{"same_object", &memo.ID, true},
		{"other_object", &other, false},
		{"no_share", nil, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			decision := CheckMemoReadContext(MemoReadContext{Memo: memo, CreatorValid: true, SpaceValid: true, SharedMemoID: tc.share})
			t.Logf("original decision=%+v", decision)
			if decision.Allowed() != tc.allowed { t.Fatalf("allowed=%v want %v", decision.Allowed(), tc.allowed) }
		})
	}
}
