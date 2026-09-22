export interface Principal {
  id: string
  roles: string[]
}

export interface RecordRow {
  ownerId: string
  archived: boolean
}

export async function archiveRecord(principal: Principal, record: RecordRow): Promise<RecordRow> {
  const mayArchive = record.ownerId === principal.id || principal.roles.includes("supervisor")
  if (!mayArchive) throw new Error("archive denied")
  record.archived = true
  return record
}
