import { mayArchive } from "./guard"
type Principal = { id: string; authenticated: boolean; supervisor: boolean }
type RecordItem = { ownerId: string; archived: boolean }

export function archiveRecord(principal: Principal, record: RecordItem) {
  if (!mayArchive(principal, record)) return { status: 403, archived: record.archived }
  record.archived = true
  return { status: 200, archived: true }
}
