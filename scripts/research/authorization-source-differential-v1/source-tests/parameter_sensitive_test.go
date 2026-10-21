package access

import (
 "context"
 "testing"
 "github.com/usememos/memos/store"
)

// Initially failed against the retained BT fixture: a different identity
// must not silently return the same preset creator, space or membership.
func TestBUParameterSensitiveFixture(t *testing.T) {
 a, b := int32(17), int32(31)
 s := &buStore{world:world{Users:[]userRow{{ID:a, RowStatus:"NORMAL"}}, Spaces:[]spaceRow{{ID:a}}, Memberships:[]memberRow{{SpaceID:a,UserID:a,Role:"USER"}}}}
 u, _ := s.GetUser(context.Background(), &store.FindUser{ID:&b})
 if u != nil && u.ID == a { t.Error("wrong user query returned preset creator") }
 x, _ := s.GetSpace(context.Background(), &store.FindSpace{ID:&b})
 if x != nil { t.Error("unregistered space query returned preset space") }
 m, _ := s.GetSpaceMember(context.Background(), &store.FindSpaceMember{SpaceID:&b, UserID:&b})
 if m != nil { t.Error("unregistered member query returned preset membership") }
 u, _ = s.GetUser(context.Background(), &store.FindUser{ID:&a})
 if u == nil || u.ID != a { t.Error("registered creator was not returned") }
 x, _ = s.GetSpace(context.Background(), &store.FindSpace{ID:&a})
 if x == nil { t.Error("registered space was not returned") }
 m, _ = s.GetSpaceMember(context.Background(), &store.FindSpaceMember{SpaceID:&a,UserID:&a})
 if m == nil || m.Role != store.SpaceMemberRoleUser { t.Error("registered member was not returned") }
}
