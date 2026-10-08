import { createHash } from "node:crypto"
import type { StructureMethodChoice, StructureMethodLookup } from "./structure-index.ts"

// Shared syntax/value identities must not load the source parser into the
// semantic compiler. These ordinary tokens carry no authorization meaning.
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24)
export const sourceSyntaxAnchorId = (sourceId: string, startIndex: number, endIndex: number, kind: string, name?: string) => `anchor-${hash([sourceId, startIndex, endIndex, kind, name])}`
export const sourceMethodChoiceToken = (proof: StructureMethodChoice, choice: StructureMethodChoice["choices"][number]) => `method-value-${hash([proof.schemaVersion, proof.name, proof.receiver, choice])}`
export const sourceMethodChoiceSentinel = (proof: StructureMethodChoice) => `method-uncreated-${hash(proof)}`
export const sourceMethodLookupToken = (proof: StructureMethodLookup, choice: StructureMethodLookup["choices"][number]) => `method-lookup-value-${hash([proof, choice])}`
export const sourceMethodLookupSelector = (proof: StructureMethodLookup) => proof.selector.literalKnown ? { literal: proof.selector.literalValue } : { binding: proof.selector.resultBinding ?? proof.selector.expression }
