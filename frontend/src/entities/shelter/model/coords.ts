// 대피소 조회 경로. node --test 로 바로 돌리므로 별칭(@/) import 없이 단일 파일로 둔다.
// 좌표가 들어가는 요청 경로는 이 파일에서만 만든다(서버에는 반올림한 좌표만 보내도록).

const COORD_DECIMALS = 2; // 소수점 2자리 ≈ 1km
const SCALE = 10 ** COORD_DECIMALS;

/** 위경도를 소수점 2자리로 반올림 */
export function roundCoord(v: number): number {
  return Math.round(v * SCALE) / SCALE;
}

/** 내 주변 대피소 요청 경로. 반올림은 여기서 한다. */
export function sheltersPath(lat: number, lon: number): string {
  return `/api/shelters?${new URLSearchParams({ lat: String(roundCoord(lat)), lon: String(roundCoord(lon)) })}`;
}

/** 지역(시·도[ 시·군·구]) 대피소 요청 경로 */
export function regionPath(region: string): string {
  return `/api/shelters?region=${encodeURIComponent(region)}`;
}
