import { z } from "zod"

const FileReference = z.string().min(1).refine(value => value.trim().length > 0 && !value.includes("\0"), "Provide a nonempty file path.")
const VariantId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/, "Use 1-80 ASCII letters, digits, hyphens or underscores; start with a letter or digit.")
  .refine(value => !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value), "Windows device names are not allowed.")

export const AuthorizationWorkspaceSchema = z.object({
  schemaVersion: z.literal("authorization-scenario-workspace/v1"),
  base: FileReference,
  variants: z.array(z.object({ id: VariantId, replacements: FileReference }).strict()).min(1).max(50, "At most 50 explicit variants are supported; no Cartesian expansion is performed."),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>()
  value.variants.forEach((variant, index) => {
    const key = variant.id.toLowerCase()
    if (seen.has(key)) context.addIssue({ code: "custom", path: ["variants", index, "id"], message: "Variant ids must be unique, ignoring filename case." })
    seen.add(key)
  })
})

// The existing composer remains the authority for allowed fields and duplicate fields.
export const AuthorizationReplacementsSchema = z.array(z.object({
  field: z.string().min(1),
  value: z.unknown(),
  origin: z.string().refine(value => value.trim().length > 0, "Replacement origin must be nonempty."),
}).strict().refine(value => Object.hasOwn(value, "value"), "Replacement value must be explicitly supplied."))
export type AuthorizationWorkspace = z.infer<typeof AuthorizationWorkspaceSchema>
export type AuthorizationReplacement = z.infer<typeof AuthorizationReplacementsSchema>[number]
