import { useFetch } from "@/shared/api";
import type { ShelterRegions, ShelterResult } from "../model/types";

/** path 는 sheltersPath·regionPath 로 만든 경로. null 이면 조회하지 않음 */
export const useShelters = (path: string | null) => useFetch<ShelterResult>(path);
export const useShelterRegions = () => useFetch<ShelterRegions>("/api/shelters/regions");
