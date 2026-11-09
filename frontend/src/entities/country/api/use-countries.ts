import { useFetch } from "@/shared/api";
import type { Country } from "../model/types";

const REFRESH_MS = 5 * 60_000; // 실시간 점수는 15분 단위로 바뀜

export const useCountries = () => useFetch<Country[]>("/api/countries", REFRESH_MS);
