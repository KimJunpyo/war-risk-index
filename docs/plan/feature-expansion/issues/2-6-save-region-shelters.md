# 지역으로 찾은 대피소를 이 기기에 저장

기준 코드: `5acdd59`(`main`, 2026-11-17)

## 배경

- **충돌:** "마지막으로 찾은 대피소를 오프라인에서 보기"는 위치 개인정보 원칙과 충돌할 수 있다(plan.md Q4).
- **Q4 결정(B):**
  - 지역(시·도, 시·군·구)으로 찾은 결과만 저장한다.
  - 사용자가 저장을 누를 때만 저장한다.
  - 위치(내 주변) 결과는 저장하지 않는다.
- **기존 결과 모양:**
  - 지역 결과는 이미 한 번에 받아 브라우저에서 검색하고 쪽을 나눈다.
  - 그래서 저장본으로도 같은 검색을 할 수 있다(경상남도 창원시 527곳, 응답 약 149KB).

## 범위

- **포함:**
  - 지역 결과 아래 "이 기기에 저장" 버튼
  - Cache Storage 저장: 지역 1개만, 다시 저장하면 덮어쓴다.
  - `/emergency`의 "저장한 대피소" 영역
    - 지역 이름, 저장 시각, 결과 검색과 쪽 이동
    - 기존 `filterShelters`·`paginate`를 다시 쓴다.
  - "지우기"
  - 안내 문구 수정, 계약과 e2e 보강
- **제외:** 위치 결과 저장, 여러 지역 저장, 지도

## 인수 조건

- [ ] 지역으로 찾은 결과에는 "이 기기에 저장" 버튼이 있고, 위치로 찾은 결과에는 없다. [테스트]
- [ ] 저장 뒤 오프라인에서 `/emergency`를 열면 "저장한 대피소" 영역에 다음이 보인다. [테스트]
  - 저장한 지역 이름과 저장 시각
  - 저장할 때와 같은 건수(`total`)
  - 결과 검색(예: "초등학교")이 동작한다.
- [ ] "지우기"를 누르면 그 Cache Storage 항목이 없어지고 `/emergency`의 영역이 사라진다. [테스트]
- [ ] 위치로 찾은 뒤 `localStorage`, `sessionStorage`, 쿠키, Cache Storage 어디에도 좌표 문자열이 0건이다. [테스트]
- [ ] 저장 항목의 키(주소)에 좌표나 `lat=`가 없고 지역 이름만 들어 있다. [테스트]
- [ ] 대피소 영역의 안내 문구를 바꾸고, 계약 테스트도 맞춘다. 명세 변경 이유는 PR에 적는다. [테스트]
  - 문구 제안: "위치(내 주변 찾기)는 저장하지 않습니다. 지역 결과는 '이 기기에 저장'을 누를 때만 이 기기에 남습니다."
  - `tests/test_m4_frontend.py`의 고정 문구와 저장소 계약을 이 문구에 맞춘다.
- [ ] 경상남도 창원시(로컬 데이터 527곳)를 저장했을 때의 저장 크기가 PR 본문에 있다. [수동]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과, `npm run e2e` 통과. [명령]

## 영향 파일

- `frontend/src/widgets/nearby-shelters/ui/NearbyShelters.tsx`, `frontend/src/widgets/nearby-shelters/model/results.ts`
- `frontend/src/views/emergency/`("저장한 대피소" 영역)
- `tests/test_m4_frontend.py`(계약 변경)
- `frontend/e2e/shelters.spec.ts`(저장소 검사), `frontend/e2e/offline.spec.ts`(2-5가 있으면)

## 관련 시안

없음(plan.md 7-1, Q4)

## 선행 이슈

- 2-3: 서비스 워커

## 라벨

`enhancement`
