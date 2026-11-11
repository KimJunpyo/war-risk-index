# 마일스톤

기획안: `docs/plan/text-contrast/plan.md` · 이슈 본문: `docs/plan/text-contrast/issues/` · 이전 마일스톤 M1~M7(service-revamp, ui-polish)은 모두 완료. 아래 번호는 이번 기획 안에서의 순번이다(GitHub 마일스톤 이름: "M8. 보조 글자 명도 대비").

## 공통 검증 (모든 이슈의 인수 조건에 포함)

- `frontend`에서 `npx tsc --noEmit`, `npm run lint` 오류 0건
- 프로젝트 루트에서 `.venv\Scripts\python.exe -m pytest tests` 전부 통과
- 프로젝트 루트에서 `node --test frontend/src/**/*.test.ts` 전부 통과
- `frontend`에서 `npm run e2e` 전체(Firefox·WebKit) 통과. 다른 세션의 e2e와 동시에 돌리지 않는다(Playwright가 시작할 때 `frontend/test-results`를 지운다)
- 브라우저 확인: 백엔드(`http://localhost:8000`)와 `npm run dev`(`http://localhost:3000`)를 띄우고 개발자 도구 기기 모드에서 폭 360 / 768 / 1080 / 1440px(높이 800px)로 해당 영역을 확인. 각 폭에서 콘솔에 `document.documentElement.scrollWidth <= window.innerWidth`를 실행해 `true`, 콘솔 오류 0건
- PR 본문에 바뀐 색의 전·후 대비 표(파일·줄, 글자, 배경, 대비 전 → 후. 이슈 "바꿀 곳" 표 형식)
- 기존 테스트(`tests/test_m*.py`, `frontend/e2e/*.spec.ts`, `frontend/src/**/*.test.ts`)는 바꾸지 않는다. 기존 테스트가 실패하면 테스트를 고치지 말고 원인을 보고한다
- 새 라이브러리 없음(`frontend/package.json`·`package-lock.json` 변경 없음)
- 커밋은 Conventional Commits `fix:`. 한 브랜치 `feat/m8-text-contrast`에서 이슈별 커밋 하나씩(1-1 → 1-2), PR 하나가 두 이슈를 닫는다(`main` 직접 커밋 금지)

---

## M1. 보조 글자 명도 대비

GitHub 마일스톤 이름: "M8. 보조 글자 명도 대비"

홈과 가이드 모달의 보조 글자·SVG 글자·링크 밑줄 색을 WCAG 2.2 AA 기준(글자 4.5:1, 큰 글자 3:1, 밑줄 3:1) 위로 올리고, 소스 계약과 화면 실측 e2e로 다시 내려가지 않게 막는다. 색만 바꾸므로 이 마일스톤만으로 화면 전체에서 결과를 확인할 수 있다. 방향은 `plan.md` 11절 결정(2026-11-11, Q1~Q4 추천안 채택)을 따른다.

**완료 조건**
- `tests/test_m8_contrast.py`가 통과한다. 주석을 뺀 `frontend/src`·`frontend/app`의 `.ts`·`.tsx`에서 아래가 모두 0건이다.
  - `(text|fill)-(neutral|gray|zinc|slate|stone)-(500|600|700|800|900|950)` (`hover:`·`placeholder:` 같은 변형 포함)
  - `#6b7280`
  - `decoration-(neutral|gray|zinc|slate|stone)-(600|700|800|900|950)`
- `frontend/e2e/contrast.spec.ts`가 Firefox·WebKit에서 폭 360/768/1080/1440 × 상태 6개(기본 홈, 가이드 모달 열림, "주목 국가 기준" 펼침, 체크리스트 항목 하나 체크, 국가 쌍 탭 선택, 대피소 결과) 모두 통과한다.
  - 보이는 글자 중 4.5:1(큰 글자 3:1) 미달 0건
  - 밑줄이 있는 보이는 요소 중 밑줄 3:1 미달 0건
- 위계가 유지된다.
  - e2e: 체크한 항목 글자 대비 < 체크 안 한 항목 글자 대비, 밑줄 대비 ≤ 같은 요소 글자 대비
  - 코드: 위협·경고 사건 범례 `<b>`가 `text-neutral-300`, 지도 나라 이름 `fill`이 데이터 있음 `#e5e7eb` / 없음 `#9ca3af`
- 폭 1440px 앱 브라우저에서 지도 hover 툴팁의 상태 사유·"데이터 없음" 글자 색이 neutral-400이다(수동, 결과를 PR 본문에 적음).
- 폭 360·1440px 기본 홈 전·후 화면을 앱 브라우저로 찍어 사용자에게 보여 준다(위계 육안 확인. 이전 PR처럼 PR 본문에는 이미지를 넣지 않음).
- 수정 전 코드에서 새 pytest·e2e가 실패했다는 기록(실패 건수와 대표 항목)과 전·후 대비 표가 PR 본문에 있다.
- 기존 테스트 파일 수정 0건, 의존성 변경 0건.

**이슈**
- 1-1 보조 글자 명도 대비 4.5:1 (WCAG 1.4.3) (`issues/1-1-secondary-text-contrast.md`)
- 1-2 링크 밑줄 대비 3:1 (WCAG 1.4.11) (`issues/1-2-link-underline-contrast.md`)

---

## 이슈 의존 관계

```
1-1 → 1-2   (같은 파일 6개 수정: ActionGuide, HomePage, EmbassyContacts, NearbyShelters, GuideModal, SiteFooter.
             1-2의 hover 정리는 1-1로 바탕 글자가 400이 된 뒤에 의미가 있다.
             한 브랜치 feat/m8-text-contrast 에서 1-1 커밋 다음 1-2 커밋, PR 하나)
```

병렬 가능: 없음.

진행 순서(이슈마다): 테스트 먼저(수정 전 코드에서 실패 확인) → 구현 → 리뷰.
