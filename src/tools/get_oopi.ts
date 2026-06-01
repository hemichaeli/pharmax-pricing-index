import catalog from "../data/catalog.json";
import { GetOopiInput, type GetOopiInputT } from "../schemas";

interface OopiIndexEntry {
  molecule: string;
  oopi_pct: number;
  us_price: number;
  intl_price: number;
  source: string;
}

interface OopiTopMover {
  molecule: string;
  oopi_pct: number;
  direction: string;
}

export interface OopiResult {
  month: string;
  available: boolean;
  methodology_url: string;
  top_movers: OopiTopMover[];
  full_index: OopiIndexEntry[];
}

export function runGetOopi(rawInput: unknown): OopiResult {
  const input: GetOopiInputT = GetOopiInput.parse(rawInput);
  const oopi = catalog.oopi as {
    month: string;
    methodology_url: string;
    top_movers: OopiTopMover[];
    full_index: OopiIndexEntry[];
  };

  const requested = input.month ?? oopi.month;
  const available = requested === oopi.month;

  if (!available) {
    return {
      month: requested,
      available: false,
      methodology_url: oopi.methodology_url,
      top_movers: [],
      full_index: [],
    };
  }

  return {
    month: oopi.month,
    available: true,
    methodology_url: oopi.methodology_url,
    top_movers: oopi.top_movers,
    full_index: oopi.full_index,
  };
}
