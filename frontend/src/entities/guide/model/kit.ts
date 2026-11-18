// 비상 가방(3일)·가정 비축(7일 이상) 목록과 물·식량 계산. node --test 로 바로 돌리므로 별칭(@/) import 없이 단일 파일로 둔다.
// 문구는 KIT_SOURCES 의 공식 안내를 바탕으로 자체 작성했다(공식 문장 인용 아님). 항목마다 근거가 된 출처 키를 단다.

export type KitSourceKey = "mois-emergency" | "mcf" | "bbk" | "maff" | "maff-water" | "maff-carry";

export interface KitItem {
  id: string; // 문장이 바뀌어도 유지되는 고정 값. 체크 상태 저장 키라 바꾸면 기존 체크가 풀린다
  text: string;
  sources: KitSourceKey[];
}

// 들고 나가는 3일 가방(1인 1개). id 접두사 bag-
export const GO_BAG_ITEMS: KitItem[] = [
  { id: "bag-water-food", text: "마실 물, 조리하지 않고 바로 먹는 식량", sources: ["mois-emergency"] },
  { id: "bag-medicine", text: "상비약과 복용 중인 처방약, 최근 처방전", sources: ["mois-emergency"] },
  { id: "bag-radio-light", text: "휴대용 라디오와 여분 건전지, 손전등", sources: ["mois-emergency"] },
  { id: "bag-documents", text: "신분증과 통장·보험증서·계약서 같은 중요 서류", sources: ["mois-emergency"] },
  { id: "bag-contact-card", text: "가족 연락처와 만날 장소를 적은 비상연락카드", sources: ["mois-emergency"] },
  { id: "bag-cbr", text: "화생방 대비용품(방독면이나 마스크, 비옷, 고무장갑, 테이프)", sources: ["mois-emergency"] },
  { id: "bag-clothes-hygiene", text: "갈아입을 옷과 신발, 화장지·물티슈 같은 위생용품", sources: ["mois-emergency"] },
];

// 집에 두는 7일 이상 비축. id 접두사 stock-
export const STOCK_ITEMS: KitItem[] = [
  { id: "stock-water", text: "마실 물과 조리에 쓸 물", sources: ["mois-emergency", "mcf", "bbk"] },
  { id: "stock-food", text: "오래 보관되고 조리가 간편한 식량(통조림·시리얼 등)", sources: ["mois-emergency", "bbk"] },
  { id: "stock-stove", text: "휴대용 가스레인지와 여분 부탄가스", sources: ["mois-emergency", "bbk"] },
  { id: "stock-power-out", text: "정전 대비 손전등·양초·라이터, 라디오와 건전지", sources: ["mois-emergency"] },
  { id: "stock-medicine-hygiene", text: "가족에게 맞는 상비약, 세면도구·화장지 같은 위생용품", sources: ["mois-emergency"] },
  { id: "stock-tap-water", text: "단수에 대비해 욕조·양동이에 생활용수 받아 두기", sources: ["mois-emergency"] },
  { id: "stock-cbr", text: "화생방 대체 물자: 문틈·환기구를 막을 대형 비닐과 알루미늄 테이프", sources: ["mois-emergency"] },
  { id: "stock-expiry", text: "유통기한을 정기적으로 확인하고, 먼저 끝나는 것부터 쓰고 다시 채우기", sources: ["mois-emergency", "mcf", "bbk"] },
];

// 참고 출처. checkedAt 은 사이트를 확인한 날짜(YYYY-MM-DD)
export const KIT_SOURCES: Record<KitSourceKey, { name: string; url: string; checkedAt: string }> = {
  "mois-emergency": {
    name: "국민안전24 국민행동요령 비상대비 (행정안전부)",
    url: "https://safekorea.go.kr/safekorea-kor/acts/nacts/action-guide.do?category=stateOfEmergency&actsHeaderTitle=%EB%B9%84%EC%83%81%EB%8C%80%EB%B9%84&menuSn=4",
    checkedAt: "2026-11-18",
  },
  mcf: {
    name: "스웨덴 MCF 가정 대비",
    url: "https://www.mcf.se/sv/rad-till-privatpersoner/hemberedskap---preppa-for-en-vecka/vatten/tillgang-till-vatten-i-kris/",
    checkedAt: "2026-11-18",
  },
  bbk: {
    name: "독일 BBK 비축",
    url: "https://www.bbk.bund.de/DE/Warnung-Vorsorge/Vorsorge/So-koennen-Sie-sich-vorbereiten/Bevorraten/bevorraten_node.html",
    checkedAt: "2026-11-18",
  },
  // 장보기 환산(shopping.ts) 근거. 목록 항목은 가리키지 않는다
  maff: {
    name: "일본 농림수산성 가정 비축 예(aff 2026년 3월호)",
    url: "https://www.maff.go.jp/j/pr/aff/2603/spe1_01.html",
    checkedAt: "2026-11-18",
  },
  "maff-water": {
    name: "일본 농림수산성 식품 비축 가이드: 물",
    url: "https://www.maff.go.jp/j/zyukyu/foodstock/chapter05.html",
    checkedAt: "2026-11-18",
  },
  "maff-carry": {
    name: "일본 농림수산성 식품 비축 가이드: 재해 발생 당일",
    url: "https://www.maff.go.jp/j/zyukyu/foodstock/chapter06.html",
    checkedAt: "2026-11-18",
  },
};

// 3일: 국민안전24 생존배낭 2~3일분, 7일: 스웨덴 MCF 가정 대비 1주, 14일: 국민안전24 핵 폭발 이후 2주. 30일은 넣지 않는다(Q2)
export const KIT_PERIODS = [
  { id: "bag", days: 3, label: "3일 가방" },
  { id: "stock7", days: 7, label: "7일 비축" },
  { id: "stock14", days: 14, label: "14일 비축" },
];

export const WATER_L_PER_PERSON_DAY = 3; // 마실 물+조리용. 스웨덴 MCF 성인 1일 3~5L 의 하한(Q3)
export const MEALS_PER_PERSON_DAY = 3;
export const MAX_PEOPLE = 20; // 화면 가구원 수 입력 상한

export const KIT_STORAGE_KEY = "war-risk:kit:v1"; // 두 목록의 체크 상태를 같이 둔다(CHECKLIST_STORAGE_KEY 와 따로)

/** 가구원 수·기간(일) → 물(L)·식량(끼니). 가구원이 1~MAX_PEOPLE 정수가 아니거나 기간이 KIT_PERIODS 에 없으면 null */
export function supplies(people: number, days: number): { waterL: number; meals: number } | null {
  if (!Number.isInteger(people) || people < 1 || people > MAX_PEOPLE) return null;
  if (!KIT_PERIODS.some((p) => p.days === days)) return null;
  const personDays = people * days;
  return { waterL: personDays * WATER_L_PER_PERSON_DAY, meals: personDays * MEALS_PER_PERSON_DAY };
}
