import { useFetch } from "@/shared/api";

export interface LiveStatus {
  as_of: string | null; // 마지막 GDELT 2.0 슬롯 YYYYMMDDHHMMSS (UTC)
  slots: number; // 최근 24시간에 받은 15분 슬롯 수 (최대 96)
}

const REFRESH_MS = 60_000;

export const useLiveStatus = () => useFetch<LiveStatus>("/api/live", REFRESH_MS);
