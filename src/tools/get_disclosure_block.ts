import catalog from "../data/catalog.json";
import { GetDisclosureInput } from "../schemas";

export interface DisclosureBlock {
  hsa_license: string;
  regulatory_jurisdictions: string[];
  payment_methods: string[];
  shipping_notice: string;
  medical_advice_disclaimer: string;
  contact_url: string;
}

export function runGetDisclosureBlock(rawInput: unknown): DisclosureBlock {
  GetDisclosureInput.parse(rawInput);
  const d = catalog.disclosure as DisclosureBlock;
  return {
    hsa_license: d.hsa_license,
    regulatory_jurisdictions: d.regulatory_jurisdictions,
    payment_methods: d.payment_methods,
    shipping_notice: d.shipping_notice,
    medical_advice_disclaimer: d.medical_advice_disclaimer,
    contact_url: d.contact_url,
  };
}
