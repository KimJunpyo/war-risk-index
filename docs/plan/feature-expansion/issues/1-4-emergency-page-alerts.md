# `/emergency` 페이지와 경보별 행동요령 화면

기준 코드: `5acdd59`(`main`, 2026-11-17)

## 배경

- **한 주소에 모은다:** 민방위 경보 행동요령, 비상 가방, 연락처를 `/emergency` 한 주소에 둔다(plan.md 7-1).
- **정적 페이지:**
  - 브라우저 API 요청이 없다.
  - 자바스크립트 없이도 HTML만으로 읽힌다.
  - 오프라인 저장(M2)의 대상이다.
- **이 이슈의 범위:** 페이지 골격, 경보 5종 화면, 홈 진입 링크, sitemap까지다.
  - 가방과 계산기는 1-5, 공관은 2-2에서 한다.
  - 경보 영역만으로도 완성된 화면이므로 이 이슈에서 링크를 연다.

## 범위

- **포함:**
  - `frontend/app/emergency/page.tsx`
  - `frontend/src/views/emergency/`(서버 컴포넌트): 머리말, 고지, 목차, 경보 카드
  - 메타데이터(title, description, canonical)
  - `sitemap.ts`에 `/emergency` 추가
  - 홈 헤더 "비상 대비" 링크
  - e2e와 대비 검사 상태 추가
- **제외:**
  - 가방·계산기(1-5), 공관(2-2)
  - 서비스 워커(2-3)
  - 테마 전환(4-5)

## 화면 (plan.md 7-1, 7-4)

- **머리말:**
  - "← 전체 지도" 홈 링크
  - h1 "비상 대비 안내"와 한 줄 설명
  - 고지: "개인이 만든 참고용 안내입니다. 정부·민방위의 공식 경보와 안내가 항상 우선합니다."
- **목차:** 지금 있는 영역만 앵커로 건다. 이 이슈에서는 경보 5종이다.
- **경보 카드:**
  - 이름: 1-1의 경보별 토큰 색
  - "언제", "어떻게 알리나"
  - "할 일": 번호 목록
  - 출처 이름, 링크(새 탭), 확인일
- **폭:** 360·768px은 카드 1열, 1080·1440px은 2열
- **색:** 1-1 토큰만 쓴다.
- **렌더링:** 서버 컴포넌트로 만든다. 현재 시각을 읽지 않는다.

## 인수 조건

- [ ] `npm run build` 경로 표에서 `/emergency`가 동적(ƒ)이 아니다(정적 또는 부분 사전 렌더). [명령]
- [ ] `npm run start` 뒤 `curl.exe -s http://localhost:3000/emergency`로 받은 본문(자바스크립트 실행 전 HTML)에 경보 이름 5개와 출처 링크(`safekorea.go.kr`)가 있다. [명령]
- [ ] `/emergency`를 열 때 브라우저가 API 주소(`NEXT_PUBLIC_API_BASE_URL`)로 보내는 요청이 0건이다. [테스트]
- [ ] 경보 카드가 `CIVIL_ALERTS` 순서대로 있고, 카드마다 "할 일" 목록 항목 수가 모델의 `actions` 수와 같다. [테스트]
- [ ] 목차 링크를 누르면 주소에 `#<경보 id>`가 붙고, 그 카드 제목이 화면 안에 보인다. [테스트]
- [ ] 홈 헤더 링크: [테스트]
  - 홈 헤더에 "비상 대비" 링크가 있고, 누르면 `/emergency`로 간다.
  - 폭 360px에서 헤더가 가로 스크롤 없이 한 줄이다.
  - 링크 대상의 높이가 24px 이상이다.
- [ ] 메타데이터: [명령]
  - `/sitemap.xml`에 `<SITE_URL>/emergency`가 있다.
  - `/emergency` HTML의 canonical이 `/emergency`다.
  - `<title>`에 "비상 대비"가 들어 있다.
- [ ] 출처 링크가 `target="_blank"`이고 `rel`에 `noreferrer`가 있다. [테스트]
- [ ] `e2e/contrast.spec.ts`에 `/emergency` 기본 상태를 넣었고, 폭 360·768·1080·1440에서 통과한다. [테스트]
- [ ] 새로 만든 파일에 팔레트 색 클래스와 hex가 0건이다(1-1 토큰만). [테스트]
- [ ] 4폭에서 `document.documentElement.scrollWidth <= window.innerWidth`가 true이고, 콘솔 오류(하이드레이션 포함)가 0건이다. [수동]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과, `npm run e2e` 통과. [명령]

## 영향 파일

- `frontend/app/emergency/page.tsx`(신규)
- `frontend/src/views/emergency/`(신규)
- `frontend/app/sitemap.ts`
- `frontend/src/views/home/ui/HomePage.tsx`(헤더 링크)
- `frontend/e2e/emergency.spec.ts`(신규, 이름 제안), `frontend/e2e/contrast.spec.ts`
- 헤더 배치가 바뀌면 `frontend/e2e/top-sections.spec.ts`와 `tests/test_m6_top_sections.py`를 확인한다. 바꾸면 명세 변경 이유를 PR에 적는다.

## 관련 시안

없음(plan.md 7-1, 7-4)

## 선행 이슈

- 1-1: 토큰
- 1-2: 경보 모델

## 라벨

`enhancement`
