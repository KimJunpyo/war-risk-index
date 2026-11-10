/** 서비스 화면에 실제로 쓰는 데이터 출처(이슈 #26 표, 링크 확인일 2026-11-10). 화면 순서 그대로.
 *  frontend/public/llms.txt "## 출처"와 이름·주소를 같게 둔다(tests/test_m7_footer.py 가 이름을 확인).
 *  url 은 겹칠 수 있어(공공데이터포털 3곳 등) 목록 key 는 name */
export const DATA_SOURCES = [
  { name: "GDELT 1.0 일별 이벤트 파일", use: "일별 뉴스 집계·과거 추이", url: "https://www.gdeltproject.org/" },
  { name: "GDELT 2.0 15분 이벤트 파일", use: "15분 뉴스 집계·실시간 24시간", url: "https://www.gdeltproject.org/" },
  { name: "UCDP GED (웁살라 분쟁 데이터)", use: "전쟁·내전·무력 충돌 상태(약 1개월 지연)", url: "https://ucdp.uu.se/" },
  // 수집은 API(cadataapi.state.gov)지만 링크는 사용자용 사이트
  { name: "미 국무부 여행경보", use: "여행경보", url: "https://travel.state.gov/" },
  { name: "영국 FCDO 해외여행 안내", use: "여행경보(자체 환산)", url: "https://www.gov.uk/foreign-travel-advice" },
  { name: "외교부 국가·지역별 여행경보(공공데이터포털)", use: "여행경보", url: "https://www.data.go.kr/" },
  { name: "외교부 재외공관 정보(공공데이터포털)", use: "현지 긴급 연락처", url: "https://www.data.go.kr/" },
  { name: "외교부 영사콜센터", use: "영사콜센터 번호", url: "https://www.0404.go.kr/" },
  { name: "행정안전부 민방위 대피시설(공공데이터포털)", use: "내 주변 대피소", url: "https://www.data.go.kr/" },
  { name: "Google News RSS", use: "국방 뉴스", url: "https://news.google.com/" },
  { name: "국민재난안전포털(행정안전부)", use: "행동 권고 참고", url: "https://www.safekorea.go.kr/" },
  // Natural Earth 기반: 패키지 README("redistribution of Natural Earth's vector data")로 확인
  { name: "world-atlas", use: "세계 지도 경계(Natural Earth 기반)", url: "https://github.com/topojson/world-atlas" },
];
