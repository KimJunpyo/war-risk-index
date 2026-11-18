# 경보별 핵심 행동 3가지 콘텐츠

기준 코드: `023aa29`(`main`, 2026-11-18)

## 배경

- **왜 필요한가:** 경보 상세(1-5)의 첫 화면에는 핵심 행동 3가지만 큰 번호 카드로 보인다. 지금 `actions`는 경보마다 3~8개이고 문장이 길다.
- **원칙:**
  - 기존 `when`·`signal`·`actions`·출처는 바꾸지 않는다. 이 문장들은 상세의 "더 보기"에 그대로 남는다.
  - 핵심 행동은 기존 `actions`에서 골라 짧게 고쳐 쓴 새 필드다. 어느 행동에서 왔는지(`from`)를 남겨 출처를 따라갈 수 있게 한다.
  - 시안 문구는 임시다. 국민안전24 원문과 대조해 정한다(plan.md Q3).
- **아이콘:** 모델은 `node --test`로 바로 돌아야 하므로 React 아이콘을 import하지 않는다. 그림 이름만 문자열로 두고, 그림은 1-5가 대응표로 그린다.

## 범위

- **포함:** `CIVIL_ALERTS`의 `keyActions` 필드, `node --test` 인수 테스트, PR 대조표
- **제외:**
  - 화면(1-5)
  - 기존 필드 문구 변경
  - 아이콘 그림(1-5)

## 형식 (제안)

파일은 기존 `frontend/src/entities/guide/model/alerts.ts`다(별칭 import 없음).

- **`keyActions`:** `{ from: string; text: string; icon: KeyActionIcon }[]`, 경보마다 정확히 3개
  - `from`: 같은 경보 `actions`의 id
  - `text`: 자체 문구, 공백 포함 30자 이하
  - `icon`: 문자열 유니온 `KeyActionIcon`(예: `"go-down"`, `"building"`, `"walk"`, `"radio"`, `"bag"`, `"gas-off"`, `"cover-face"`, `"wind"`, `"seal"`, `"get-down"`, `"stay"`, `"rescue"`). 목록은 PR에서 정한다.
- **후보(plan.md Q3 결정. 문구는 원문 대조 전 임시):**

  | 경보 | 1 | 2 | 3 |
  |---|---|---|---|
  | 경계경보 | 라디오·TV를 켜고 정부 안내 따르기(`alert-listen`) | 바로 떠날 수 있게 대피 준비하기(`alert-ready`) | 가스 밸브 잠그고 전열기 플러그 뽑기(`alert-fire`) |
  | 공습경보 | 가장 가까운 지하로 바로 대피하기(`air-raid-shelter`) | 지하가 없으면 창 없는 콘크리트 건물 안으로(`air-raid-indoor`) | 엘리베이터 말고 계단으로 내려가기(`air-raid-stairs`) |
  | 화생방경보 | 방독면, 없으면 마스크·젖은 수건으로 코와 입 가리기(`cbr-breath`) | 바람이 흘러가는 쪽을 피해 높은 곳으로(`cbr-escape`) | 실내에서는 문·창 닫고 틈 막기(`cbr-seal`) |
  | 핵경보 | 지하 깊은 곳으로 서둘러 대피하기(`nuclear-underground`) | 섬광이 보이면 바로 엎드려 눈·귀 막기(`nuclear-flash`) | 대피한 곳에 머물며 정부 방송 듣기(`nuclear-stay`) |
  | 경보해제 | 다친 사람이 있으면 구조 돕기(`all-clear-rescue`) | 다시 대피할 준비는 그대로 두기(`all-clear-ready`) | 정부 방송을 듣고 소문은 믿지 않기(`all-clear-listen`) |

## 할 일

1. **출처 확인:** `ALERT_SOURCES`의 세 쪽(민방위 경보, 민방공경보 행동요령, 비상대비)을 다시 열어, 후보 행동이 경보별 우선 행동으로 적혀 있는지 확인한다. 순서가 다르면 원문 순서를 따른다.
2. **문구 작성:** 자체 문구로 30자 안에 쓴다. 공식 문장을 그대로 옮기지 않는다. 뜻을 바꾸지 않는다(예: "바람이 흘러가는 쪽을 피해"를 "바람 반대쪽으로"로 줄이지 않는다).
3. **PR 기록:** 경보별 대조표(핵심 행동 문구, `from` 행동 문장, 공식 요지, 출처 키, 확인일)를 적는다. 후보에서 바꾼 것은 이유를 적는다.

## 인수 조건

- [ ] 경보 5개 모두 `keyActions`가 정확히 3개다. [테스트]
- [ ] 모든 `from`이 같은 경보 `actions`의 id 중 하나이고, 한 경보 안에서 3개가 서로 다르다. [테스트]
- [ ] 모든 `text`가 비어 있지 않고 공백 포함 30자 이하다. [테스트]
- [ ] 모든 `icon`이 `KeyActionIcon` 목록 안에 있다(`npx tsc --noEmit` 통과). [명령]
- [ ] 기존 필드 보존: `git diff main -- frontend/src/entities/guide/model/alerts.ts`에서 바뀐 줄이 `keyActions`와 그 타입 정의·주석뿐이다(`when`·`signal`·`siren`·`actions`·`sources`·`ALERT_SOURCES` 줄 변경 0건). [명령]
- [ ] 기존 `alerts.test.ts`·`guide-ids.test.ts`가 바꾸지 않고 통과한다. 계약 주석에 새 필드를 더한다. [테스트]
- [ ] `alerts.ts`가 여전히 별칭(`@/`) import 없이 `node --test`로 돈다. [테스트]
- [ ] PR 본문에 경보별 대조표와 확인일이 있다. 후보에서 바꾼 문구는 이유가 있다. [수동]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과. [명령]

## 영향 파일

- `frontend/src/entities/guide/model/alerts.ts`
- `frontend/src/entities/guide/model/alerts.test.ts`
- `frontend/src/entities/guide/index.ts`(타입 내보내기가 필요하면)

## 관련 시안

없음. plan.md 7-2(상세 "지금 할 일 3가지"), Q3 후보 표

## 선행 이슈

- 없음(1-1·1-3·1-4와 병렬 가능)
- 기존: #72(경보 콘텐츠)

## 라벨

`enhancement`, `documentation`
