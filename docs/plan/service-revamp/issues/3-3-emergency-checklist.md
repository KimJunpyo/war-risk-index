# 점수 구간별 비상 대비 체크리스트

## 배경

지금도 점수 구간 4개(평상시·점검·준비·행동)별 권고 문장이 있다(`frontend/src/entities/guide/model/guide.ts`의 `SCORE_BANDS`, `ActionGuide` 카드). 다만 "일반적인 민방위·재난 대비 권고를 참고한" 자체 문장이라 공식 출처가 없고, 읽기만 하는 목록이다. 행정안전부 비상대비 국민행동요령을 근거로 문장을 다듬고, 항목마다 체크할 수 있게 바꾼다. 고정 콘텐츠라 외부 API 호출은 없다.

## 범위

- 포함: 구간별 체크리스트 콘텐츠(출처 표기), `ActionGuide`의 체크박스화, 체크 상태 브라우저 저장, GuideModal·FAQ·`llms.txt`의 권고 문장 동기화
- 제외: 서버 저장, 알림, 인쇄용 화면, 구간 경계값 변경(50/100/150 유지)

## 할 일

1. **출처 확인(첫 할 일)**: 행정안전부 비상대비 국민행동요령의 정확한 게시처(예: 국민재난안전포털 — 확실하지 않음), URL, 최신 개정일, 이용 조건(공공누리 유형 등)을 확인해 PR 설명에 적는다. 인용·개작이 허용되지 않으면 항목 문장은 자체 작성하고 출처는 "참고" 링크로만 단다(plan.md Q11).
2. `guide.ts`에 구간별 체크리스트 항목을 `{ id, text }` 배열로 정리한다. `id`는 문장이 바뀌어도 유지되는 고정 문자열이다. 기존 `actions`를 대체하거나 확장한다.
3. `ActionGuide.tsx`를 체크박스 목록으로 바꾸고, 하단에 출처(이름·링크·확인일)를 표시한다.
4. 체크 상태를 `localStorage`(키 예: `war-risk:checklist:v1`, 값: 체크된 `id` 배열)에 저장한다. 마운트 후에 읽어 SSR 하이드레이션 불일치를 피한다(Q12).
5. GuideModal의 구간별 목록, `faq.ts`의 "점수가 높으면 무엇을 해야 하나요?" 답, `frontend/public/llms.txt`의 "점수별 행동 권고"를 새 콘텐츠와 같은 내용으로 맞춘다.

## 인수 조건

- [ ] PR 설명에 출처 이름, URL, 확인일, 이용 조건이 적혀 있다. 확인하지 못한 항목은 "확인 못 함"으로 적혀 있다.
- [ ] 점수 49.9 / 50 / 99.9 / 100 / 149.9 / 150, 상태 "전쟁 중"·"내전 중"인 대상에서 표시되는 구간이 기존 `bandFor()` 결과와 같다(구간 경계 변경 없음).
- [ ] 각 구간의 모든 항목이 체크박스(`<input type="checkbox">`와 연결된 `<label>`)로 표시되고 키보드(Tab, Space)로 체크할 수 있다.
- [ ] 항목을 체크하고 새로고침하면 체크 상태가 유지되고, `localStorage`에서 키를 지우면 모두 해제된 상태로 표시된다.
- [ ] 다른 나라로 바꿔도 같은 `id` 항목의 체크 상태는 유지된다.
- [ ] 체크리스트 하단에 출처가 표시되고 링크는 새 탭(`target="_blank" rel="noreferrer"`)으로 열린다.
- [ ] 체크리스트 표시·체크 시 개발자 도구 Network에 신규 요청이 0건이다.
- [ ] GuideModal, FAQ 답, `llms.txt`의 구간별 권고가 체크리스트와 같은 내용이다(PR에 세 곳 대조표 첨부).
- [ ] 첫 로딩 시 콘솔에 하이드레이션(hydration) 경고가 0건이다.
- [ ] `frontend`에서 `npx tsc --noEmit`, `npm run lint` 오류 0건이다.
- [ ] 브라우저(`http://localhost:3000`)에서 폭 375px·1280px로 확인했고 콘솔 오류 0건이다.

## 영향 파일

- `frontend/src/entities/guide/model/guide.ts`
- `frontend/src/entities/guide/ui/ActionGuide.tsx`
- `frontend/src/entities/guide/model/faq.ts`
- `frontend/src/widgets/guide-modal/ui/GuideModal.tsx`
- `frontend/public/llms.txt`

## 관련 시안

없음

## 선행 이슈

없음

## 라벨

`enhancement`, `documentation`
