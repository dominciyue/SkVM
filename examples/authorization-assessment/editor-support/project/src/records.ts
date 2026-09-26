export type Principal = { id: string; role: "member" | "supervisor"; authenticated: boolean }
export type RecordData = { id: string; ownerId: string; archived: boolean }

// Synthetic policy: only an authenticated owner or supervisor may archive.
// The author declares this requirement; the assessment compares source to it.
export function archiveRecord(principal: Principal, record: RecordData): RecordData {
  if (!principal.authenticated) throw new Error("Authentication required")
  const isOwner = principal.id === record.ownerId
  const isSupervisor = principal.role === "supervisor"
  if (!isOwner && !isSupervisor) throw new Error("Forbidden")
  return { ...record, archived: true }
}
