// 지역으로 찾은 대피소를 이 기기(Cache Storage)에 저장(이슈 #81, plan.md Q4 B). node --test 로 바로 돌리므로 값 import 는 별칭(@/) 없이 둔다.
// 위치(내 주변) 결과는 저장하지 않는다: 저장은 지역 결과에서 사용자가 누를 때만, 키 주소에는 지역 이름만 넣는다.
import type { ShelterResult } from "@/entities/shelter";

// public/sw.js 의 SAVED 와 같아야 한다(activate 가 이 이름은 지우지 않는다). 버전을 붙이지 않는다
export const SAVED_CACHE = "wri-saved-shelters";
// 키 주소. /api/·/emergency 와 겹치지 않는 경로라 sw.js 저장본·#79 의 caches.match("/emergency") 와 섞이지 않는다
const KEY_BASE = "/saved-shelters/";
const KST_OFFSET_MS = 9 * 3_600_000; // 한국 표준시 UTC+9(offline-status 의 savedAtKst 와 같은 규칙)

/** 저장 항목. savedAt 은 ISO 시각 */
export interface SavedShelters {
  region: string;
  savedAt: string;
  result: ShelterResult;
}

/** 저장 항목 키(주소): 지역 이름만 */
export const savedKey = (region: string): string => `${KEY_BASE}${encodeURIComponent(region)}`;

/** ISO 시각 → 한국 시각 "YYYY-MM-DD HH:mm". 읽을 수 없으면 null */
export function savedAtText(iso: string): string | null {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
}

/** 저장본 본문 검사. 모양이 다르면(예전 형식·손상) null */
export function parseSaved(data: unknown): SavedShelters | null {
  const d = data as Partial<SavedShelters> | null;
  return d && typeof d.region === "string" && typeof d.savedAt === "string" && Array.isArray(d.result?.items) ? (d as SavedShelters) : null;
}

/** 지역 1개만 저장한다(다시 저장하면 덮어씀). 새로 넣은 뒤 다른 지역을 지운다: 넣기가 실패해도(저장 공간 부족 등) 이전 저장본은 남는다 */
export async function saveShelters(region: string, result: ShelterResult): Promise<void> {
  const cache = await caches.open(SAVED_CACHE);
  const key = savedKey(region);
  const body: SavedShelters = { region, savedAt: new Date().toISOString(), result };
  await cache.put(key, new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }));
  for (const req of await cache.keys()) if (new URL(req.url).pathname !== key) await cache.delete(req);
}

/** 저장본. 없거나 읽을 수 없으면 null. 캐시가 없을 때 open 으로 빈 캐시를 만들지 않게 has 로 먼저 본다 */
export async function readSaved(): Promise<SavedShelters | null> {
  if (!(await caches.has(SAVED_CACHE))) return null;
  const cache = await caches.open(SAVED_CACHE);
  const [key] = await cache.keys();
  const res = key && (await cache.match(key));
  return res ? parseSaved(await res.json()) : null;
}

/** 저장본 지우기 */
export const clearSaved = (): Promise<boolean> => caches.delete(SAVED_CACHE);
