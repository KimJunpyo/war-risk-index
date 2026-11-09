import { useFetch } from "@/shared/api";
import type { ThreatData } from "../model/types";

const REFRESH_MS = 30 * 60_000; // 서버는 1시간마다 다시 계산

export const useThreat = () => useFetch<ThreatData>("/api/threat", REFRESH_MS);
