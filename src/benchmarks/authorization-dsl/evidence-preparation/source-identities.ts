import { createHash } from "node:crypto"
import type { StructureCall, StructureMethodChoice, StructureMethodLookup, StructureSymbol, StructureCallableValue } from "./structure-index.ts"

// Shared syntax/value identities must not load the source parser into the
// semantic compiler. These ordinary tokens carry no authorization meaning.
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24)
export const sourceSyntaxAnchorId = (sourceId: string, startIndex: number, endIndex: number, kind: string, name?: string) => `anchor-${hash([sourceId, startIndex, endIndex, kind, name])}`
export const sourceMethodChoiceToken = (proof: StructureMethodChoice, choice: StructureMethodChoice["choices"][number]) => `method-value-${hash([proof.schemaVersion, proof.name, proof.receiver, choice])}`
export const sourceMethodChoiceSentinel = (proof: StructureMethodChoice) => `method-uncreated-${hash(proof)}`
export const sourceMethodLookupToken = (proof: StructureMethodLookup, choice: StructureMethodLookup["choices"][number]) => `method-lookup-value-${hash([proof.schemaVersion, proof.name, proof.receiver, proof.creationCallId, proof.source, choice.method, choice.targetId, choice.targetSha256])}`
export const sourceMethodLookupSentinel = (proof: StructureMethodLookup) => `method-lookup-uncreated-${hash([proof.schemaVersion, proof.name, proof.receiver, proof.creationCallId, proof.source])}`
export const sourceMethodLookupSelector = (proof: StructureMethodLookup) => proof.selector.literalKnown ? { literal: proof.selector.literalValue } : { binding: proof.selector.resultBinding ?? proof.selector.expression }
export const sourceFieldMethodToken = (target: { targetId: string; targetSha256: string }) => `field-method-value-${hash(["source-field-method/v1", target.targetId, target.targetSha256])}`
export const sourceMethodCaptureName = (sourceCallId: string) => `method-capture-${sourceCallId}`
export const sourceMethodCaptureResult = (sourceCallId: string) => `method-capture-object-${sourceCallId}`
export const sourceCallableToken = (target: { targetId: string; targetSha256: string }) => `source-function-value-${hash(["source-callable/v1", target.targetId, target.targetSha256])}`
export const sourceCallableValueResult = (ownerId: string, proof: Pick<StructureCallableValue, "source">) => `source-function-object-${hash([ownerId, proof.source.startIndex, proof.source.endIndex])}`
export const sourceCallableValueAnchor = (ownerId: string, proof: Pick<StructureCallableValue, "source">) => sourceSyntaxAnchorId(ownerId, proof.source.startIndex, proof.source.endIndex, "assignment", sourceCallableValueResult(ownerId, proof))
export const sourceCallableValueName = (ownerId: string, proof: Pick<StructureCallableValue, "source">) => `callable-value-${sourceCallableValueAnchor(ownerId, proof)}`
export const sourceCallableDefinitionName = (anchorId: string) => `callable-definition-${anchorId}`
/** Direct instance access reads the slot at this call. A previously created
 * alias reads at its assignment instead; super bypasses the instance slot. */
export const sourceDirectMethodRead = (call: StructureCall, target: StructureSymbol) => call.receiver && call.expression === `${call.receiver}.${target.name}` && !/^super\(\)\./.test(call.expression) && !call.methodBinding && !call.methodChoices && !call.methodLookup && !call.methodField && target.className && target.attributes.methodBinding !== "static" && !target.attributes.bindingWrapped && !target.attributes.callableAsync && !target.decorators?.length ? { receiver: call.receiver, method: target.name } : undefined
