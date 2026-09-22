import {test,expect} from "bun:test"
import {readFileSync} from "node:fs"
import {composeAuthorizationAuthoring} from "./authoring-compose.ts"
const base=JSON.parse(readFileSync(new URL("../../../examples/authorization-assessment/reusable-skill/authoring.json",import.meta.url),"utf8"))
test("composition replaces whole fields, preserves input, and records origins",()=>{
 const result=composeAuthorizationAuthoring(base,[{field:"taskId",value:"changed",origin:"new task"},{field:"principals",value:{reader:{role:"reader"}},origin:"caller"}])
 expect(result.input.taskId).toBe("changed")
 expect(result.input.principals).toEqual({reader:{role:"reader"}})
 expect(base.taskId).not.toBe("changed")
 expect(result.fieldOrigins.principals).toBe("caller")
 expect(result.fieldOrigins.sources).toBe("base")
 expect(result.baseSha256).toHaveLength(64)
})
test("composition rejects conflicts, unknown fields and malformed replacements",()=>{
 expect(()=>composeAuthorizationAuthoring(base,[{field:"taskId",value:"a",origin:"a"},{field:"taskId",value:"b",origin:"b"}])).toThrow("Duplicate")
 expect(()=>composeAuthorizationAuthoring(base,[{field:"schemaVersion",value:"next",origin:"a"}])).toThrow("Unsupported")
 expect(()=>composeAuthorizationAuthoring(base,[{field:"sources",value:"oops",origin:"a"}])).toThrow()
 expect(()=>composeAuthorizationAuthoring(base,[{field:"taskId",value:"next",origin:""}])).toThrow("origin")
})
