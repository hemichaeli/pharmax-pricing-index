import catalog from "../data/catalog.json";
import { ListCategoryInput, type ListCategoryInputT } from "../schemas";

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

export interface CategoryItem {
  found: boolean;
  sku: string;
  molecule: string;
  dosage: string;
  manufacturer: string;
  price_usd: number;
  url: string;
  last_updated: string;
  oopi_pct?: number;
}

export function runListCategory(rawInput: unknown): {
  category: string;
  count: number;
  items: CategoryItem[];
} {
  const input: ListCategoryInputT = ListCategoryInput.parse(rawInput);
  const skus = catalog.skus as SkuRecord[];

  const matched = skus.filter((s) => s.category === input.category);

  const items: CategoryItem[] = matched.map((s) => {
    const item: CategoryItem = {
      found: true,
      sku: s.sku,
      molecule: s.molecule,
      dosage: s.dosage,
      manufacturer: s.manufacturer,
      price_usd: s.price_usd,
      url: s.url,
      last_updated: s.last_updated,
    };
    if (s.oopi_pct !== undefined) {
      item.oopi_pct = s.oopi_pct;
    }
    return item;
  });

  return {
    category: input.category,
    count: items.length,
    items,
  };
}
