# 경보 상세 페이지 `/emergency/[alert]`

기준 코드: `023aa29`(`main`, 2026-11-18)

## 배경

- **방식(plan.md Q2 결정):** 경보마다 별도 주소를 둔다. 공유 링크가 경보별 미리보기를 갖고, 휴대폰 뒤로 가기가 그대로 동작하고, 모두 서버 컴포넌트라 정적으로 만든다.
- **주소:** 기존 `CIVIL_ALERTS` id 그대로다: `/emergency/alert`, `/emergency/air-raid`, `/emergency/cbr`, `/emergency/nuclear`, `/emergency/all-clear`.
- **Next 16 제약(plan.md 사실 2):**
  - Cache Components에서는 `dynamicParams`를 쓸 수 없다. 목록 밖 id는 `notFound()`로 404를 낸다.
  - `generateStaticParams`가 경보 id 5개를 돌려주면 5개가 빌드 때 만들어진다.
- **내용:**
  - 첫 화면은 핵심 행동 3가지(1-2)를 큰 번호 카드로 보인다.
  - 공습·핵은 "가까운 대피소 찾기"로 홈 대피소 영역(1-4)에 간다.
  - 나머지(알리는 방법, 행동요령 전체, 출처)는 "더 보기"에 접는다. 지금 경보 카드의 문장과 출처를 하나도 빼지 않는다.
- **배포 순서:** 이 이슈가 먼저 운영에 나가도 첫 화면은 기존 화면 그대로다. 상세는 sitemap과 직접 주소로만 들어온다. 첫 화면 타일은 1-9에서 건다.

## 범위

- **포함:**
  - `frontend/app/emergency/[alert]/page.tsx`
    - `generateStaticParams`: `CIVIL_ALERTS` id 5개
    - 없는 id면 `notFound()`
    - `generateMetadata(props, parent)`: #98과 같은 방식(루트 og·twitter를 이어 받고 주소·제목·설명만 바꾼다)
  - `frontend/src/views/emergency/ui/AlertDetailPage.tsx`(서버 컴포넌트)
    - 머리말: "← 비상 대비"(`/emergency`), h1(경보 아이콘 + 이름, 경보 색), 사이렌 경보면 "사이렌" 표시, `when` 한 줄, 고지 한 줄
    - "지금 할 일 3가지": `ol` 하나, 항목 3개(번호·아이콘·문장)
    - 공습·핵만 "가까운 대피소 찾기" 링크(`/#shelters`)
    - "더 보기": `details`(처음엔 닫힘). 안에 어떻게 알리나(`signal`), 행동요령 전체(`actions` 전부, 번호 목록), 출처(새 탭, 확인일)
    - 푸터(`SiteFooter`)
  - 핵심 행동 아이콘 대응표(`KeyActionIcon` → 그림, 1-1 틀 사용)
  - 경보 색 클래스 대응표를 첫 화면과 함께 쓰도록 `views/emergency` 안 한 곳에 둔다(`text-alert-*` 글자 그대로)
  - `frontend/app/sitemap.ts`에 상세 주소 5개
  - `frontend/public/llms.txt` "## 비상 대비" 절에 상세 주소 5개
  - e2e(이름 제안 `frontend/e2e/emergency-detail.spec.ts`), 대비 상태
- **제외:**
  - 첫 화면 타일(1-9)
  - 오프라인 저장·안내(M14)
  - 상세별 OG 이미지(루트 이미지를 쓴다)
  - 경보 문구 변경

## 화면 (plan.md 7-2, 7-7)

- **메타데이터(예: 공습):** `<title>` "공습경보 행동요령 | 전쟁 가능성 지수", og·twitter 제목 "공습경보 행동요령", 설명은 `when`과 핵심 행동 3가지를 이은 글, canonical·og:url `/emergency/air-raid`
- **핵심 행동 카드:** 번호 글자 24px 이상, 문장 글자 18px 이상. 폭 360·768은 1열, 1080·1440은 3열
- **대피소 링크:** 높이 44px 이상, 지도 핀 아이콘(aria-hidden)
- **색:** 1-1·#71 토큰만. 카드 바탕은 `bg-surface` 또는 경보 토큰 투명도
- **렌더링:** 서버 컴포넌트. 현재 시각·쿠키·헤더를 읽지 않는다.

## 인수 조건

- [ ] `npm run build` 경로 표에서 `/emergency/[alert]`가 동적(ƒ)이 아니고, 사전 렌더 경로가 `/emergency/alert`, `/emergency/air-raid`, `/emergency/cbr`, `/emergency/nuclear`, `/emergency/all-clear` 5개다. [명령]
- [ ] `/emergency/unknown`과 `/emergency/AIR-RAID`는 404다. [테스트]
- [ ] 자바스크립트 실행 전 HTML(`<script>` 밖 `body`)에 경보 이름, 핵심 행동 3문장, `actions` 문장 전부, `href="https://safekorea.go.kr/` 출처 링크가 있다(5개 경보 모두). [테스트]
- [ ] 머리말: [테스트]
  - "← 비상 대비" 링크 하나, `href="/emergency"`
  - h1(페이지에 하나)의 접근 이름이 경보 이름 그대로
  - 고지 문구 "개인이 만든 참고용 안내입니다. 정부·민방위의 공식 경보와 안내가 항상 우선합니다."
  - `siren`이 true인 공습·핵만 "사이렌" 글자가 h1 옆에 있다.
- [ ] "지금 할 일 3가지": [테스트]
  - 제목 heading 다음에 `ol` 하나, 바로 아래 `li` 3개
  - `li` 글자가 `keyActions`의 `text` 순서 그대로
  - `li`마다 `svg[aria-hidden="true"]` 하나
  - 번호 1·2·3이 보인다(목록 표시 또는 번호 요소). 번호 글자 크기 24px 이상, 문장 글자 크기 18px 이상
  - 열 수: 360·768 1열, 1080·1440 3열(카드 left 위치 수)
- [ ] 대피소 링크: [테스트]
  - 공습·핵 페이지에만 접근 이름 "가까운 대피소 찾기"인 링크가 하나 있고, `href="/#shelters"`, 높이 44px 이상이다.
  - 경계·화생방·해제 페이지에는 0개다.
  - 누르면 홈으로 가고, "내 주변 대피소" 제목이 보인 때부터 1초 안에 대피소 영역이 화면 안에 있다. 그동안 위치 요청은 0건이다(1-4 계약).
- [ ] "더 보기": [테스트]
  - `details` 하나, 처음엔 닫혀 있고, `summary` 글자에 "더 보기"가 있다.
  - Tab으로 `summary`에 포커스를 옮기고 Enter를 누르면 열린다.
  - 열면 `signal` 글자, 행동요령 `ol` 하나(바로 아래 `li` 수 = `actions` 수, 순서·글자 그대로, 번호 표시가 보임), 출처가 있다.
  - 출처는 `sources`의 키마다 `a[href=url]` 하나, `target="_blank"`, `rel`에 `noreferrer`, 이름과 확인일(`checkedAt` 그대로)이 있다.
- [ ] 메타데이터(5개 경보): `<title>`에 "{경보 이름} 행동요령", canonical·og:url 경로가 `/emergency/{id}`, og·twitter 제목이 "{경보 이름} 행동요령", og·twitter 설명이 `description`과 같고, og:image가 루트 `/opengraph-image`다. [테스트]
- [ ] `/sitemap.xml`에 `<SITE_URL>/emergency/{id}` 5개가 있다. [테스트]
- [ ] `frontend/public/llms.txt` "## 비상 대비" 절에 `/emergency/{id}` 5개가 있다(`tests/test_m13_llms.py`에 더하거나 새 pytest). [테스트]
- [ ] 상세를 열 때 브라우저가 API 주소로 보내는 요청이 0건이다. [테스트]
- [ ] `tests/test_m13_emergency.py`가 바꾸지 않고 통과한다(새 파일도 서버 컴포넌트, 토큰 색만, `text-alert-*` 글자 그대로). [테스트]
- [ ] `e2e/contrast.spec.ts`에 "경보 상세 기본(공습경보)"과 "경보 상세 더 보기 펼침(핵경보)" 상태를 넣었고, 4폭에서 통과한다. [테스트]
- [ ] 4폭에서 가로 스크롤이 0이고 콘솔 오류(하이드레이션 포함)가 0건이다. [테스트]
- [ ] PR 본문에 상세 5개의 360px 스크린숏이 있다. [수동]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과, `npm run e2e` 통과. [명령]

## 영향 파일

- `frontend/app/emergency/[alert]/page.tsx`(신규)
- `frontend/src/views/emergency/ui/AlertDetailPage.tsx`(신규), `frontend/src/views/emergency/index.ts`
- 경보 색·핵심 행동 아이콘 대응표(`frontend/src/views/emergency/ui/` 안, 파일 이름은 구현에서 정함)
- `frontend/src/views/emergency/ui/EmergencyPage.tsx`(경보 색 대응표를 옮기면)
- `frontend/app/sitemap.ts`, `frontend/public/llms.txt`
- `frontend/e2e/emergency-detail.spec.ts`(신규), `frontend/e2e/contrast.spec.ts`
- `tests/test_m13_llms.py` 또는 새 pytest

## 관련 시안

없음. plan.md 7-2(상세 배치도), 7-7(폭별 배치), 7-8(접근성 기준)

## 선행 이슈

- 1-1: 아이콘 틀·경보 아이콘
- 1-2: 핵심 행동 모델
- 1-4: 대피소 앵커
- 기존: #74(경보 카드 내용), #98(메타데이터 방식)
- M15 #85와 같은 `sitemap.ts`를 고친다. 먼저 머지한 쪽 위에 맞춘다.

## 라벨

`enhancement`
