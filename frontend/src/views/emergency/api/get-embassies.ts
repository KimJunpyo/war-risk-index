import { cacheLife } from "next/cache";
import { getJson } from "@/shared/api";
import type { EmbassyBundle } from "@/widgets/embassy-contacts";

/** 재외공관 묶음(GET /api/embassies)을 서버에서 받는다(#77, /emergency 정적 렌더). 공관 정보는 하루 한 번 바뀌어 하루 단위로 다시 만든다.
 *  못 받으면 그대로 던져 빌드를 멈춘다: 연락처가 빠진 페이지를 배포하지 않는다(Vercel 은 이전 배포를 그대로 둠) */
export async function getEmbassies(): Promise<EmbassyBundle> {
  "use cache";
  cacheLife("days");
  try {
    return await getJson<EmbassyBundle>("/api/embassies");
  } catch (e) {
    throw new Error(`재외공관 묶음 응답(/api/embassies) 실패: ${e instanceof Error ? e.message : e}`, { cause: e });
  }
}
