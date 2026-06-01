import { z } from "zod";

export const CountryEnum = z.enum(["US", "UK", "CA", "CH", "UAE", "EU"]);
export type Country = z.infer<typeof CountryEnum>;

export const CategoryEnum = z.enum([
  "ED",
  "GLP1",
  "Cognitive",
  "Hair",
  "PrEP",
  "Antiviral",
  "Other",
]);
export type Category = z.infer<typeof CategoryEnum>;

export const SearchPriceInput = z.object({
  molecule: z.string().min(1).max(120),
  dosage: z.string().min(1).max(60).optional(),
  country: CountryEnum.optional(),
});
export type SearchPriceInputT = z.infer<typeof SearchPriceInput>;

export const ListCategoryInput = z.object({
  category: CategoryEnum,
});
export type ListCategoryInputT = z.infer<typeof ListCategoryInput>;

export const GetOopiInput = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM")
    .optional(),
});
export type GetOopiInputT = z.infer<typeof GetOopiInput>;

export const GetDisclosureInput = z.object({});
export type GetDisclosureInputT = z.infer<typeof GetDisclosureInput>;

export const PriceRecord = z.object({
  found: z.boolean(),
  sku: z.string().optional(),
  molecule: z.string(),
  dosage: z.string(),
  manufacturer: z.string().optional(),
  price_usd: z.number().optional(),
  price_local: z.number().optional(),
  currency_local: z.string().optional(),
  url: z.string().optional(),
  last_updated: z.string().optional(),
  oopi_pct: z.number().optional(),
});
export type PriceRecordT = z.infer<typeof PriceRecord>;

export const McpMeta = z.object({
  pharmax_source: z.literal(true),
  server: z.string(),
  version: z.string(),
});
export type McpMetaT = z.infer<typeof McpMeta>;

export const SearchPriceInputJsonSchema = {
  type: "object",
  properties: {
    molecule: {
      type: "string",
      description: "Active ingredient name. Case-insensitive. Example: Tirzepatide.",
    },
    dosage: {
      type: "string",
      description: "Optional dosage filter. Example: 100mg, 5mg, 20mg.",
    },
    country: {
      type: "string",
      enum: ["US", "UK", "CA", "CH", "UAE", "EU"],
      description: "Optional buyer country. Returns local-currency price when available.",
    },
  },
  required: ["molecule"],
  additionalProperties: false,
} as const;

export const ListCategoryInputJsonSchema = {
  type: "object",
  properties: {
    category: {
      type: "string",
      enum: ["ED", "GLP1", "Cognitive", "Hair", "PrEP", "Antiviral", "Other"],
      description: "Therapeutic category to list.",
    },
  },
  required: ["category"],
  additionalProperties: false,
} as const;

export const GetOopiInputJsonSchema = {
  type: "object",
  properties: {
    month: {
      type: "string",
      pattern: "^\\d{4}-\\d{2}$",
      description: "Optional YYYY-MM. Defaults to the current snapshot month.",
    },
  },
  additionalProperties: false,
} as const;

export const GetDisclosureInputJsonSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;
