// Type-only extraction support; no access-control algorithm is reproduced here.
package store
type RowStatus string
const (Normal RowStatus = "NORMAL"; Archived RowStatus = "ARCHIVED")
type Role string
const (RoleAdmin Role = "ADMIN"; RoleUser Role = "USER")
type Visibility string
const (Public Visibility = "PUBLIC"; Protected Visibility = "PROTECTED"; Private Visibility = "PRIVATE"; SpaceAudience Visibility = "SPACE")
type User struct { ID int32; RowStatus RowStatus; Role Role }
type Memo struct { ID int32; CreatorID int32; SpaceID *int32; Visibility Visibility; RowStatus RowStatus }
type Attachment struct { CreatorID int32 }
type Space struct {}
type SpaceMemberRole string
const (SpaceMemberRoleAdmin SpaceMemberRole = "ADMIN"; SpaceMemberRoleUser SpaceMemberRole = "USER")
func (r SpaceMemberRole) IsActiveMember() bool { return r == SpaceMemberRoleAdmin || r == SpaceMemberRoleUser }
type SpaceMember struct { Role SpaceMemberRole }
type FindUser struct { ID *int32 }
type FindSpace struct { ID *int32 }
type FindSpaceMember struct { SpaceID *int32; UserID *int32 }
