/** GET /api/shelters 응답 항목 */
export interface Shelter {
  name: string;
  address: string;
  lat: number;
  lon: number;
  distance_m: number | null; // 지역 조회면 null
  capacity: number | null;
  kind: string | null; // 시설 구분(행정안전부 원문)
}

export interface ShelterResult {
  available: boolean;
  as_of: string | null; // 원천 갱신일
  items: Shelter[];
  total: number; // 안전 상한으로 자르기 전 건수(items 길이보다 클 수 있음)
}

/** GET /api/shelters/regions 응답 */
export interface ShelterRegions {
  available: boolean;
  regions: { sido: string; sigungu: string[] }[];
}

/** 외부 지도(카카오맵 공개 링크 URL)에서 대피소 위치 보기 */
export const mapUrl = (s: Shelter) => `https://map.kakao.com/link/map/${encodeURIComponent(s.name)},${s.lat},${s.lon}`;
