// Synthetic source for the premise example; check reads this file without executing it.
type Caller = { id: string; authenticated: boolean; objectReadGrant: boolean }
type OwnedRecord = { ownerId: string | null }

export function readRecord(caller: Caller, record: OwnedRecord) {
  if (!caller.authenticated) return { status: 401 }
  if (record.ownerId === null) return { status: 200 }
  if (record.ownerId === caller.id || caller.objectReadGrant) return { status: 200 }
  return { status: 403 }
}
