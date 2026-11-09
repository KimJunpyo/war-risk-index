// 점수 구간별 비상 대비 체크리스트. node --test 로 바로 돌리므로 별칭(@/) import 없이 단일 파일로 둔다.
// 문구는 일반적인 비상 대비 권고를 바탕으로 자체 작성했다(공식 문장 인용 아님). 출처는 참고 링크로만 표시.

export interface ChecklistItem {
  id: string; // 문장이 바뀌어도 유지되는 고정 값. 체크 상태 저장 키라 바꾸면 기존 체크가 풀린다
  text: string;
}

export const CHECKLIST: Record<"calm" | "tension" | "high" | "extreme", ChecklistItem[]> = {
  extreme: [
    { id: "official-alerts", text: "정부·민방위 경보와 대피 지시를 최우선으로 따르기" },
    { id: "go-bag-ready", text: "비상 가방을 현관 가까이 두고 바로 대피할 수 있게 유지" },
    { id: "abroad-evacuate", text: "해당 국가 방문 취소, 체류 중이면 대사관의 철수·대피 안내 따르기" },
    { id: "family-recheck", text: "가족과 집결 장소·연락 방법 다시 확인" },
  ],
  high: [
    { id: "supplies-3days", text: "3일치 비상용품 실제로 준비: 물(1인 1일 약 3L), 조리 없이 먹을 식량, 상비약·처방약" },
    { id: "docs-power", text: "소액 현금, 신분증·여권·중요 서류 사본, 보조배터리, 손전등, 휴대용 라디오 챙기기" },
    { id: "fuel-route", text: "차량 연료 절반 이상 유지, 가까운 대피소와 대피 경로 직접 확인" },
    { id: "travel-postpone", text: "해당 지역 여행은 연기 검토, 해외 체류 중이면 영사 연락처·재외국민 등록 확인" },
  ],
  tension: [
    { id: "news-check", text: "정부 발표와 뉴스를 평소보다 자주 확인" },
    { id: "kit-check", text: "비상용품 목록 점검, 물·식량 1~2일치 확보" },
    { id: "advisory-check", text: "해당 국가 여행 계획이 있으면 여행경보 단계 확인" },
  ],
  calm: [
    { id: "shelter-location", text: "가까운 대피소 위치 알아두기 (예: 안전디딤돌 앱, 국민재난안전포털)" },
    { id: "family-plan", text: "가족 비상연락망과 집결 장소 정해두기" },
    { id: "kit-list", text: "비상용품 목록 만들어두기" },
  ],
};

// 참고 출처. checkedAt 은 사이트를 확인한 날짜(YYYY-MM-DD)
export const CHECKLIST_SOURCE = {
  name: "국민재난안전포털 (행정안전부)",
  url: "https://www.safekorea.go.kr",
  checkedAt: "2026-11-09",
};

export const CHECKLIST_STORAGE_KEY = "war-risk:checklist:v1";

/** localStorage 원문 → 체크된 id 배열. 없거나 깨진 값은 빈 배열 */
export function readChecked(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** id 체크를 뒤집은 새 배열 (원본 불변) */
export function toggleChecked(checked: string[], id: string): string[] {
  return checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id];
}
