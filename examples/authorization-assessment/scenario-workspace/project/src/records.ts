// Synthetic source fixture: read for assessment; the workspace tool does not execute it.
type Principal = { id: string; authenticated: boolean; supervisor: boolean }
type RecordItem = { id: string; ownerId: string; archived: boolean }
type ArchiveResult = { status: number; archived: boolean }

export function archiveRecord(principal: Principal, record: RecordItem): ArchiveResult {
  if (!principal.authenticated) return { status: 401, archived: record.archived }
  if (principal.id !== record.ownerId && !principal.supervisor)
    return { status: 403, archived: record.archived }
  record.archived = true
  return { status: 200, archived: true }
}
