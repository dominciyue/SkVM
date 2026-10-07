import type { StructureCall, StructureIndex, StructureSymbol } from "./structure-index.ts"
import type { FiniteValue, Scalar } from "../../../task-dsl/authorization/control-evaluation.ts"

export interface SourceArgumentBinding {
  parameter: string; expression: string; literalKnown: boolean; literalValue?: FiniteValue; captureOwnerId?: string
}
/** Bind source syntax only. Unknown expansion never consumes a default or a
 * regular parameter, and forwarding packs are not permission/object proofs. */
export function sourceArgumentBindings(index: StructureIndex, call: StructureCall, target: StructureSymbol): { bindings: SourceArgumentBinding[]; gap?: string } {
  const fail = (reason: string) => ({ bindings: [], gap: `source-arguments-${reason}` })
  const caller = index.symbols.find(s => s.id === call.ownerId), facts: NonNullable<StructureCall["argumentFacts"]> = call.argumentFacts ?? call.arguments.map(expression => {
    const keyword = /^(\w+)\s*=(?!=)([\s\S]+)$/.exec(expression)
    return { expression: (keyword?.[2] ?? expression).trim(), parameterName: keyword?.[1], literalKnown: false }
  })
  const currentTarget = index.symbols.find(s => s.id === target.id), local = currentTarget?.localCallable
  if (local || target.localCallable) {
    const actual = caller && index.relatedCalls(caller.id, call.receiverClass).find(c => c.id === call.id)
    if (!local || local.gap || JSON.stringify(local) !== JSON.stringify(target.localCallable) || caller?.id !== local.ownerId || caller.sha256 !== local.ownerSha256 || !actual || actual.candidateIds.length !== 1 || actual.candidateIds[0] !== target.id || actual.expression !== call.expression || actual.sha256 !== call.sha256 || JSON.stringify(actual.argumentFacts) !== JSON.stringify(call.argumentFacts)) return fail("local-callable-unresolved")
  }
  const positional = facts.filter(a => !a.parameterName && !a.spread), keywords = facts.filter(a => a.parameterName), posPacks = facts.filter(a => a.spread === "positional"), keyPacks = facts.filter(a => a.spread === "keyword")
  if (posPacks.length > 1 || keyPacks.length > 1 || new Set(keywords.map(a => a.parameterName)).size !== keywords.length) return fail("duplicate")
  if (call.arguments.some(a => /^\*/.test(a)) && !call.argumentFacts) return fail("spread-unresolved")
  // Mixing fixed arguments after *args needs runtime length/position semantics.
  const firstPack = facts.findIndex(a => a.spread === "positional")
  if (firstPack >= 0 && facts.slice(firstPack + 1).some(a => !a.parameterName && !a.spread)) return fail("position-unresolved")
  const packSource = (pack: typeof facts[number] | undefined, kind: "variadic-positional" | "variadic-keyword") => pack && caller?.parameters.find(p => p.name === pack.expression.replace(/^\*+/, "").trim() && p.kind === kind && p.stableForwardPack)
  const posSource = packSource(posPacks[0], "variadic-positional"), keySource = packSource(keyPacks[0], "variadic-keyword")
  if (posPacks.length && !posSource || keyPacks.length && !keySource) return fail("spread-unresolved")
  const bindings: SourceArgumentBinding[] = [], usedKeywords = new Set<string>(), regular: string[] = []
  let position = 0, posConsumed = false, keyConsumed = false, partialGap: string | undefined
  for (const [i, parameter] of target.parameters.entries()) {
    if (parameter.kind === "variadic-positional" || parameter.kind === "variadic-keyword") {
      const isPosition = parameter.kind === "variadic-positional", pack = isPosition ? posSource : keySource, extras = isPosition ? positional.slice(position) : keywords.filter(a => !usedKeywords.has(a.parameterName!))
      if (pack) {
        if (extras.length) return fail("mixed-pack-unresolved")
        bindings.push({ parameter: parameter.name, expression: pack.name, literalKnown: false })
      } else {
        if (extras.some(a => !a.literalKnown || a.literalValue !== null && typeof a.literalValue === "object")) return fail("pack-values-unresolved")
        const value: FiniteValue = isPosition ? extras.map(a => a.literalValue as Scalar) : Object.fromEntries(extras.map(a => [a.parameterName!, a.literalValue as Scalar]))
        bindings.push({ parameter: parameter.name, expression: isPosition ? "[]" : "{}", literalKnown: true, literalValue: value })
      }
      if (isPosition) { position = positional.length; posConsumed = true } else { for (const a of extras) usedKeywords.add(a.parameterName!); keyConsumed = true }
      continue
    }
    const receiver = i === 0 && target.className && target.attributes.methodBinding !== "static" && call.receiver
    const suppliedPosition = !receiver && parameter.kind !== "keyword-only" ? positional[position++] : undefined, keyword = keywords.find(a => a.parameterName === parameter.name)
    if (posSource && !receiver && parameter.kind !== "keyword-only" && !suppliedPosition) return fail("position-unresolved")
    if (keyword && (receiver || suppliedPosition || parameter.kind === "positional-only")) return fail("duplicate-or-positional-only")
    if (keyword) usedKeywords.add(parameter.name)
    const supplied = suppliedPosition || keyword
    const expression = receiver ? /^super\(\)\./.test(call.expression) && caller?.className ? caller.parameters[0]?.name : receiver : supplied?.expression ?? parameter.defaultExpression
    regular.push(parameter.name)
    if (!expression) { partialGap ??= "source-arguments-missing"; continue }
    const literalKnown = supplied?.literalKnown ?? (!receiver && !!parameter.defaultLiteralKnown)
    bindings.push({ parameter: parameter.name, expression, literalKnown, ...(literalKnown ? { literalValue: supplied ? supplied.literalValue! : parameter.defaultLiteralValue! } : {}) })
    if (!supplied && !receiver && !literalKnown) partialGap ??= "source-arguments-default-dynamic"
    if (!supplied && !receiver && (posSource || keySource)) return fail("regular-pack-unresolved")
  }
  if (position < positional.length || keywords.some(a => !usedKeywords.has(a.parameterName!))) return fail("unexpected")
  if (posSource && !posConsumed || keySource && !keyConsumed) return fail("regular-pack-unresolved")
  // The caller signature excludes these keys only while its **kwargs remains
  // an unmodified, unescaped source pack. A renamed regular parameter may collide.
  if (keySource && regular.some(name => !caller!.parameters.some(p => p.name === name && !p.kind?.startsWith("variadic") && p.kind !== "positional-only"))) return fail("keyword-collision-unresolved")
  for (const capture of local?.captures ?? []) bindings.push({ parameter: capture.name, expression: capture.name, literalKnown: false, captureOwnerId: local!.ownerId })
  return { bindings, ...(partialGap ? { gap: partialGap } : {}) }
}
