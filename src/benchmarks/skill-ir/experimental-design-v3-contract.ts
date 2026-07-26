import { posix, win32 } from "node:path";
import { z } from "zod";

export {
  assessExperimentalDesignV2Allocation as assessExperimentalDesignV3Allocation,
  deriveExperimentalDesignV2LimitationFlags as deriveExperimentalDesignV3LimitationFlags,
  parseExperimentalDesignV2AllocationCsv as parseExperimentalDesignV3AllocationCsv,
  parseExperimentalDesignV2Study as parseExperimentalDesignV3Study,
} from "./experimental-design-v2-contract.ts";
export type {
  ExperimentalDesignV2AllocationRow as ExperimentalDesignV3AllocationRow,
  ExperimentalDesignV2Properties as ExperimentalDesignV3Properties,
  ExperimentalDesignV2Study as ExperimentalDesignV3Study,
} from "./experimental-design-v2-contract.ts";

const SafeRelativePathSchema = z
  .string()
  .min(1)
  .refine((value) => {
    if (posix.isAbsolute(value) || win32.isAbsolute(value) || value.includes("\\")) {
      return false;
    }
    return value
      .split("/")
      .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  }, "source path must be a safe POSIX relative path");

export const ExperimentalDesignV3PublicContractSourceAuditSchema = z
  .object({
    schemaVersion: z.literal(
      "skill-ir-experimental-design-v3-public-contract-source-audit/v1",
    ),
    contractId: z.literal("experimental-design-public-contract-v3"),
    entries: z
      .array(
        z
          .object({
            claimId: z
              .string()
              .min(1)
              .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
            source: z
              .object({
                path: SafeRelativePathSchema,
                sha256: z.string().regex(/^[a-f0-9]{64}$/),
              })
              .strict(),
            quote: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((audit, context) => {
    const claimIds = audit.entries.map((entry) => entry.claimId);
    if (new Set(claimIds).size !== claimIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entries"],
        message: "source audit claim IDs must be unique",
      });
    }
  });
