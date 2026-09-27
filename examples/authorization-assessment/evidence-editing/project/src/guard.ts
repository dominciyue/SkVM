type Principal = { id: string; authenticated: boolean; supervisor: boolean }
type RecordItem = { ownerId: string }
export function mayArchive(principal: Principal, record: RecordItem) {
  return principal.authenticated && (principal.id === record.ownerId || principal.supervisor)
}
