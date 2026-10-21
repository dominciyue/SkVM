package access

import (
 "context"
 "encoding/json"
 "errors"
 "fmt"
 "os"
 "testing"
 "github.com/usememos/memos/store"
)

type userRow struct { ID int32; RowStatus store.RowStatus; Role store.Role; Error string }
type spaceRow struct { ID int32; Error string }
type memberRow struct { SpaceID, UserID int32; Role store.SpaceMemberRole; Error string }
type world struct {
 Memo *store.Memo
 Viewer *store.User
 AllowAnonymous bool
 SharedMemoID *int32
 Users []userRow
 Spaces []spaceRow
 Memberships []memberRow
}
type observationEvent struct { Name string `json:"name"`; Arguments any `json:"arguments"`; Value any `json:"value"`; Error any `json:"error"` }
type buStore struct { world world; events []observationEvent }
func failure(s string) error { if s == "" { return nil }; return errors.New(s) }
func (s *buStore) record(name string, args, value any, err error) { var message any; if err != nil { message=err.Error() }; s.events=append(s.events,observationEvent{name,args,value,message}) }
func (s *buStore) GetUser(_ context.Context, f *store.FindUser) (*store.User,error) {
 var result *store.User; var err error
 for _,r := range s.world.Users { if f.ID != nil && r.ID == *f.ID { err=failure(r.Error); if err==nil { result=&store.User{ID:r.ID,RowStatus:r.RowStatus,Role:r.Role} }; break } }
 s.record("GetUser",map[string]any{"ID":f.ID},result,err); return result,err
}
func (s *buStore) GetSpace(_ context.Context, f *store.FindSpace) (*store.Space,error) {
 var result *store.Space; var err error
 for _,r := range s.world.Spaces { if f.ID != nil && r.ID == *f.ID { err=failure(r.Error); if err==nil { result=&store.Space{} }; break } }
 var value any; if result!=nil { value=map[string]any{"ID":*f.ID} }
 s.record("GetSpace",map[string]any{"ID":f.ID},value,err); return result,err
}
func (s *buStore) GetSpaceMember(_ context.Context, f *store.FindSpaceMember) (*store.SpaceMember,error) {
 var result *store.SpaceMember; var err error
 for _,r := range s.world.Memberships { if f.SpaceID != nil && f.UserID != nil && r.SpaceID == *f.SpaceID && r.UserID == *f.UserID { err=failure(r.Error); if err==nil { result=&store.SpaceMember{Role:r.Role} }; break } }
 s.record("GetSpaceMember",map[string]any{"SpaceID":f.SpaceID,"UserID":f.UserID},result,err); return result,err
}
func TestBUObserve(t *testing.T) {
 file:=os.Getenv("BU_OBSERVER_INPUT"); if file=="" { t.Skip("no observation requested") }
 bytes,err:=os.ReadFile(file); if err!=nil { t.Fatal(err) }
 var w world; if err=json.Unmarshal(bytes,&w);err!=nil { t.Fatal(err) }
 s:=&buStore{world:w,events:[]observationEvent{}}
 ctx,err:=ResolveMemoReadContext(context.Background(),s,w.Memo,w.Viewer,w.AllowAnonymous,w.SharedMemoID)
 var decision any; var message any
 if err!=nil { message=err.Error() } else { d:=CheckMemoReadContext(ctx); decision=map[string]any{"allowed":d.Allowed(),"denial":d.Denial,"class":d.Class} }
 output,_:=json.Marshal(map[string]any{"events":s.events,"result":decision,"error":message,"status":"observed","scope":"ResolveMemoReadContext+CheckMemoReadContext","evidenceKind":"original-functions-with-store-type-shim"})
 fmt.Println("BU_OBSERVATION="+string(output))
}
