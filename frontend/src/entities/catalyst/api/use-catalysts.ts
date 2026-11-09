import { useFetch } from "@/shared/api";
import type { CatalystData } from "../model/types";

/** basePath: 국가 쌍(/api/pairs/{id}) 또는 국가(/api/countries/{code}) */
export const useCatalysts = (basePath: string | null, days = 90) =>
  useFetch<CatalystData>(basePath ? `${basePath}/catalysts?days=${days}` : null);
