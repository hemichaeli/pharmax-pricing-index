import catalog from "../data/catalog.json";
import { SearchPriceInput, type SearchPriceInputT, type Country } from "../schemas";

interface SkuRecord {
  sku: string;
  molecule: string;
  dosage: string;
  category: string;
  manufacturer: string;
  price_usd: number;
  prices_local?: Record<string, number>;
  url: string;
  last_updated: string;
  oopi_pct?: number;
  priority?: boolean;
}

const COUNTRY_TO_CURRENCY: Record<Country, string> = {
  US: "USD",
  UK: "GBP",
  CA: "CAD",
  CH: "CHF",
  UAE: "AED",
  EU: "EUR",
};

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

export interface SearchPriceResult {
  found: boolean;
  sku?: string;
  molecule: string;
  dosage: string;
  manufacturer?: string;
  price_usd?: number;
  price_local?: number;
  currency_local?: string;
  url?: string;
  last_updated?: string;
  oopi_pct?: number;
}

export function runSearchPrice(rawInput: unknown): SearchPriceResult {
  const input: SearchPriceInputT = SearchPriceInput.parse(rawInput);
  const skus = catalog.skus as SkuRecord[];

  const molQ = normalize(input.molecule);
  const dosQ = input.dosage ? normalize(input.dosage) : undefined;

  const candidates = skus.filter((s) => {
    const molMatch = normalize(s.molecule).includes(molQ) || molQ.includes(normalize(s.molecule));
    if (!molMatch) return false;
    if (dosQ) {
      return normalize(s.dosage) === dosQ;
    }
    return true;
  });

  if (candidates.length === 0) {
    return {
      found: false,
      molecule: input.molecule,
      dosage: input.dosage ?? "",
    };
  }

  const pick = candidates.sort((a, b) => {
    const ap = a.priority ? 0 : 1;
    const bp = b.priority ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return a.price_usd - b.price_usd;
  })[0];

  const result: SearchPriceResult = {
    found: true,
    sku: pick.sku,
    molecule: pick.molecule,
    dosage: pick.dosage,
    manufacturer: pick.manufacturer,
    price_usd: pick.price_usd,
    url: pick.url,
    last_updated: pick.last_updated,
  };

  if (pick.oopi_pct !== undefined) {
    result.oopi_pct = pick.oopi_pct;
  }

  if (input.country) {
    const cur = COUNTRY_TO_CURRENCY[input.country];
    if (input.country === "US") {
      result.price_local = pick.price_usd;
      result.currency_local = "USD";
    } else if (pick.prices_local && pick.prices_local[cur] !== undefined) {
      result.price_local = pick.prices_local[cur];
      result.currency_local = cur;
    }
  }

  return result;
}
