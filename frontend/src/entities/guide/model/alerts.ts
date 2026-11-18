// 민방위(민방공) 경보 5종과 경보별 행동. node --test 로 바로 돌리므로 별칭(@/) import 없이 단일 파일로 둔다.
// 문구는 국민안전24 안내의 요지를 바탕으로 자체 작성했다(공식 문장 인용 아님). 출처는 링크로만 표시.

type AlertSourceKey = "mois-alarm" | "mois-actions" | "mois-emergency";

export interface CivilAlert {
  id: "alert" | "air-raid" | "cbr" | "nuclear" | "all-clear";
  name: string;
  when: string; // 발령 상황
  signal: string; // 알리는 방법. 사이렌이 없는 경보는 '사이렌'이라는 말을 쓰지 않는다
  siren: boolean; // 국민안전24 '민방위 경보' 기준 공습·핵만 사이렌
  actions: { id: string; text: string }[]; // id 는 경보 id 를 접두사로(체크리스트·비상 가방 id 와 겹치지 않게)
  sources: AlertSourceKey[];
}

// 신호 문구. 사이렌 패턴은 국민안전24 '민방위 경보'의 경보단말 기준, 문자는 자연재난 재난문자와 구분해 '민방공 경보문자'
const SIREN_SIGNAL = "사이렌이 1분 동안 5초 오르고 3초 내리며 울리고, 음성방송과 민방공 경보문자·TV 자막으로도 알린다";
const VOICE_SIGNAL = "라디오·확성기 음성방송과 휴대전화 민방공 경보문자·TV 자막으로 알린다";

export const CIVIL_ALERTS: CivilAlert[] = [
  {
    id: "alert",
    name: "경계경보",
    when: "적이 항공기·미사일이나 지상·해상 병력으로 공격해 올 것으로 예상될 때",
    signal: VOICE_SIGNAL,
    siren: false,
    actions: [
      { id: "alert-listen", text: "정부 지시를 놓치지 않게 라디오나 TV를 계속 틀어 두고 그대로 따르기" },
      { id: "alert-ready", text: "바로 떠날 수 있게 대피 준비를 하고, 어린이·노약자는 미리 안전한 곳으로 보내기" },
      { id: "alert-aircraft", text: "항공기 공격이 예상돼 내린 경보라면 민방위 대피소 같은 지하시설로 미리 대피하기" },
      { id: "alert-fire", text: "바깥 가스 밸브를 잠그고 전열기 플러그를 뽑기, 기름·가스통은 불이 옮지 않을 곳으로 치우기" },
      { id: "alert-gear", text: "방독면(없으면 마스크·젖은 수건)을 꺼내 두고, 먹을 것과 물은 덮개를 씌워 두기" },
      { id: "alert-outdoor", text: "바깥 활동을 줄이고 떨어지는 물체를 조심하기" },
      { id: "alert-drive", text: "운전 중이면 속도를 줄이고 고가도로와 도심으로 들어가는 길은 피하기" },
      { id: "alert-night", text: "밤에는 집 안팎 조명을 다 끄고 창마다 커튼·블라인드를 쳐 두기, 운전 중이면 차 불빛을 낮추고 서행하기" },
    ],
    sources: ["mois-alarm", "mois-actions", "mois-emergency"],
  },
  {
    id: "air-raid",
    name: "공습경보",
    when: "적의 공격이 곧 닥치거나 이미 시작됐을 때",
    signal: SIREN_SIGNAL,
    siren: true,
    actions: [
      { id: "air-raid-shelter", text: "생존배낭을 챙겨 가장 가까운 지하(민방위 대피소, 지하철역, 지하주차장)로 바로 대피하기" },
      { id: "air-raid-indoor", text: "지하로 갈 수 없으면 콘크리트 건물 안 유리창 없는 곳으로 피하기" },
      { id: "air-raid-stairs", text: "높은 층에서는 엘리베이터 대신 계단으로 지하나 아래층까지 내려가기" },
      { id: "air-raid-gear", text: "화생방 공격이 함께 올 수 있으니 방독면이나 마스크를 쓰고 이동하기" },
      { id: "air-raid-car", text: "운전 중이면 빈터나 길 오른쪽 가장자리에 차를 대고, 열쇠는 차 안에 남긴 채 내려서 대피하기" },
      { id: "air-raid-flood", text: "큰비가 예상되는 철이면 침수되기 쉬운 저지대 지하는 피하기" },
      { id: "air-raid-listen", text: "대피한 곳에서는 질서를 지키고 정부 안내방송에 따라 움직이기" },
      { id: "air-raid-night", text: "밤에는 실내외 불을 모두 끈 뒤 대피하고, 차를 세웠으면 전조등·미등·실내등까지 끄기" },
    ],
    sources: ["mois-alarm", "mois-actions", "mois-emergency"],
  },
  {
    id: "cbr",
    name: "화생방경보",
    when: "적의 화학·생물·방사능 무기가 뿌려지거나 탐지됐을 때, 또는 그 공격으로 오염이 예상될 때",
    signal: VOICE_SIGNAL,
    siren: false,
    actions: [
      { id: "cbr-breath", text: "방독면을 쓰고, 없으면 마스크나 젖은 수건·옷으로 코와 입을 가리기" },
      { id: "cbr-skin", text: "비옷·고무장갑·긴 옷으로 맨살이 드러나지 않게 하기" },
      { id: "cbr-escape", text: "밖에서는 바람이 흘러가는 쪽을 피해 옆쪽이나 높은 곳으로 오염 지역을 벗어나기" },
      { id: "cbr-seal", text: "실내에서는 문과 창을 닫고 틈을 젖은 수건·테이프로 막은 뒤 에어컨·환풍기를 끄기" },
      { id: "cbr-upstairs", text: "지하에 대피해 있다가 화학 공격이 확인되면 곧바로 지하에서 올라와 오염되지 않은 곳이나 건물 높은 층 실내로 옮기기" },
      { id: "cbr-wash", text: "화학물질이 몸에 묻었으면 흐르는 물로 15분 이상 씻은 뒤 치료를 받고, 오염된 옷은 비닐에 밀봉하기" },
      { id: "cbr-avoid", text: "오염 지역의 물과 음식은 먹지 말고, 그곳 물건은 만지지 않기" },
      { id: "cbr-listen", text: "해제 방송이 나올 때까지 보호장비를 계속 쓰고 안내를 듣기" },
    ],
    sources: ["mois-alarm", "mois-actions", "mois-emergency"],
  },
  {
    id: "nuclear",
    name: "핵경보",
    when: "적의 핵 공격이 곧 닥치거나 이미 시작됐을 때",
    signal: SIREN_SIGNAL,
    siren: true,
    actions: [
      { id: "nuclear-underground", text: "생존배낭을 챙겨 바깥과 막힌 지하(민방위 대피소, 지하철역, 지하상가)로 서둘러 내려가기" },
      { id: "nuclear-cover", text: "지하로 갈 수 없으면 콘크리트 건물 안 유리창 없는 곳이나 도랑 같은 가림막 뒤로 피하기" },
      { id: "nuclear-flash", text: "섬광이 보이면 두세 걸음 넘게 움직이지 말고 바로 엎드려 두 손으로 눈과 귀를 막고, 입은 벌리고 배는 바닥에서 띄우기" },
      { id: "nuclear-wait", text: "폭풍과 떨어지는 파편이 멈출 때까지 엎드린 자세를 유지하기" },
      { id: "nuclear-seal", text: "낙진이 스며들지 않게 대피한 곳의 문틈·환기구를 비닐이나 테이프로 막기" },
      { id: "nuclear-decon", text: "낙진에 노출됐으면 겉옷을 벗어 비닐에 밀봉하고, 미지근한 물과 비누로 씻거나 젖은 수건으로 피부를 닦기" },
      { id: "nuclear-move", text: "불이 나는 등 옮겨야 하면 코·입을 가리고 손목·발목을 비닐이나 옷으로 감싼 채 가장 가까운 대피소로 가기" },
      { id: "nuclear-stay", text: "지하 깊은 곳이나 건물 안쪽에 머물며 정부 안내방송을 듣고, 2주 이상 버틸 물·식량을 챙기기" },
    ],
    sources: ["mois-alarm", "mois-actions", "mois-emergency"],
  },
  {
    id: "all-clear",
    name: "경보해제",
    when: "공격 징후가 사라지고 추가 공격도 없을 것으로 판단될 때",
    signal: VOICE_SIGNAL,
    siren: false,
    actions: [
      { id: "all-clear-rescue", text: "주변에 다친 사람이 있으면 구조를 돕기" },
      { id: "all-clear-ready", text: "공습이 다시 있을 수 있으니 대피할 준비는 그대로 두기" },
      { id: "all-clear-listen", text: "정부 안내방송을 계속 듣고, SNS로 도는 확인되지 않은 소문은 믿지 않기" },
    ],
    sources: ["mois-alarm", "mois-emergency"],
  },
];

// 출처. checkedAt 은 페이지를 열어 확인한 날짜(YYYY-MM-DD)
export const ALERT_SOURCES: Record<AlertSourceKey, { name: string; url: string; checkedAt: string }> = {
  "mois-alarm": {
    name: "국민안전24 민방위 경보(행정안전부)",
    url: "https://safekorea.go.kr/safekorea-kor/edtr/clns/cdal/civilDefenseAlarm.do?menuSn=57",
    checkedAt: "2026-11-18",
  },
  "mois-actions": {
    name: "국민안전24 국민행동요령 민방공경보",
    url: "https://safekorea.go.kr/safekorea-kor/acts/nacts/action-guide.do?category=civlAirDefenseWarning&actsHeaderTitle=%EB%AF%BC%EB%B0%A9%EA%B3%B5%EA%B2%BD%EB%B3%B4&menuSn=4",
    checkedAt: "2026-11-18",
  },
  "mois-emergency": {
    name: "국민안전24 국민행동요령 비상대비",
    url: "https://safekorea.go.kr/safekorea-kor/acts/nacts/action-guide.do?category=stateOfEmergency&actsHeaderTitle=%EB%B9%84%EC%83%81%EB%8C%80%EB%B9%84&menuSn=4",
    checkedAt: "2026-11-18",
  },
};
