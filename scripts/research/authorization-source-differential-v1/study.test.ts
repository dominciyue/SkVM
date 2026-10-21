import {expect,test} from "bun:test"
import {admit,optionsFor} from "./study.ts"
test("BU first attempts keep paired raw and blind review paths",()=>{
 for(const t of ["M","G"]){expect(optionsFor(`A-${t}-base`).domainProgramFile).toBe(optionsFor(`A-${t}-check`).domainProgramFile)}
 expect(optionsFor("L-M-bad").domainProgramFile).not.toContain("bad")
 expect(optionsFor("L-G-control").domainProgramFile).not.toContain("control")
 expect(optionsFor("A-M-base").sourceVerificationFile).toBeUndefined()
 expect(optionsFor("A-M-check").sourceVerificationFile).toBeDefined()
 expect(optionsFor("A-G-check").sourceVerificationFile).toBeUndefined()
})
test("BU active unknown and third confirmation cannot dispatch",()=>{
 expect(()=>admit([],"A-M-base","first",[])).toThrow("registered-order")
 expect(()=>admit([{position:"L-M-bad",status:"unknown",lifecycle:{localExecution:"closed"}}],"L-G-control","first",[])).toThrow("active-unknown")
 const closed=[{position:"L-M-bad",attempt:"first",status:"completed",lifecycle:{localExecution:"closed"}}]
 expect(()=>admit(closed,"L-G-control","first",[])).not.toThrow()
 const used=[...closed,...["a","b"].map(c=>({...closed[0],repairCause:c}))]
 expect(()=>admit(used,"L-M-bad","confirm",[{position:"L-M-bad",attempt:"confirm",cause:"c",evidence:"x",uniqueConfirmation:true}])).toThrow("confirmation-limit")
})
