# 홈 대피소 영역 바로가기 `/#shelters`

기준 코드: `023aa29`(`main`, 2026-11-18)

## 배경

- **왜 필요한가:** 공습·핵 상세(1-5)의 "가까운 대피소 찾기"는 홈의 대피소 찾기로 간다. 지금은 바로 갈 주소가 없다.
- **지금 상태(plan.md 사실 1):**
  - `NearbyShelters`의 `section`에 `id`가 없다(`aria-labelledby="nearby-shelters-title"`만 있다).
  - 홈은 국가 목록 API가 온 뒤, 대상이 한국일 때만 대피소 영역을 그린다. 그래서 주소에 `#…`를 붙여도 처음 스크롤할 때 대상이 없어 움직이지 않는다.
- **원칙(plan.md Q10):** 위치는 자동으로 묻지 않는다. 영역으로 스크롤하고 "내 주변 대피소 찾기" 버튼에 포커스만 준다. 위치는 그 버튼을 눌러야 묻는다.

## 범위

- **포함:**
  - `NearbyShelters`의 `section`에 `id="shelters"`
  - 그 영역이 처음 그려질 때 `location.hash`가 `#shelters`면, 영역을 화면 위쪽으로 스크롤하고 "내 주변 대피소 찾기" 버튼에 포커스
  - e2e
- **제외:**
  - 위치 자동 요청
  - 대피소 영역이 없을 때의 대체 안내(데이터 꺼짐·API 실패, plan.md 제안 4)
  - 홈의 다른 영역, 색 토큰 전환(#89)

## 인수 조건

- [ ] 홈 대피소 영역 `section`에 `id="shelters"`가 하나 있다. [테스트]
- [ ] `/#shelters`로 열면, "내 주변 대피소" 제목이 보인 때부터 1초 안에 다음이 된다(폭 360·1440). [테스트]
  - 영역 윗변이 화면 안에 있다.
  - 포커스(`document.activeElement`)가 "내 주변 대피소 찾기" 버튼이다.
- [ ] `/#shelters`로 열고 아무것도 누르지 않으면 위치 요청이 0건이다(`getCurrentPosition`·`watchPosition` 호출 수, 기존 `shelters.spec.ts`의 계측 방식). [테스트]
- [ ] `/`(해시 없음)로 열면 데이터가 다 그려진 뒤에도 `window.scrollY`가 0이고, 포커스가 `body`에 있다. [테스트]
- [ ] 기존 `shelters.spec.ts`와 `tests/test_m4_frontend.py`(저장소 미사용·고정 문구·위치 요청 시간 초과)가 바꾸지 않고 통과한다. [테스트]
- [ ] 4폭에서 가로 스크롤이 0이고 콘솔 오류가 0건이다. [테스트]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과, `npm run e2e` 통과. [명령]

## 알아 둘 점

- 대피소 데이터가 꺼져 있거나(`available: false`) 국가 목록 API가 실패하면 영역이 없어 홈 맨 위에 머문다. 이 경우는 이 이슈에서 다루지 않는다(plan.md Q10 남는 위험).
- 홈에서 다른 나라를 골랐다가 한국으로 돌아오면 영역이 다시 그려진다. 이때 주소에 `#shelters`가 남아 있으면 다시 스크롤될 수 있다. 처음 한 번만 하도록 막는 방법은 구현에서 정하고 PR에 적는다.

## 영향 파일

- `frontend/src/widgets/nearby-shelters/ui/NearbyShelters.tsx`
- `frontend/e2e/shelters.spec.ts`(또는 새 spec, 이름 제안 `frontend/e2e/shelter-anchor.spec.ts`)

## 관련 시안

없음. plan.md 7-6(홈 대피소 바로가기)

## 선행 이슈

- 없음(1-1·1-2·1-3과 병렬 가능)
- M16 #89(위젯 토큰 전환)보다 먼저 머지한다(같은 `NearbyShelters.tsx`).

## 라벨

`enhancement`
