import { useFetch } from "@/shared/api";
import type { IndexPoint } from "../model/types";

/** basePath: 국가 쌍(/api/pairs/{id}) 또는 국가(/api/countries/{code}) */
export const useRiskIndex = (basePath: string | null) =>
  useFetch<IndexPoint[]>(basePath ? `${basePath}/index` : null);
