# 민방위 경보 5종 행동요령 콘텐츠와 출처

기준 코드: `5acdd59`(`main`, 2026-11-17)

## 배경

- **공식 경보 체계:** 행정안전부 국민안전24의 민방공 경보는 경계·공습·화생방·핵·경보해제 5종이다(plan.md 사실 1).
  - 사용자 요청 목록에는 핵경보가 없다. Q1 결정은 "넣는다"이다.
- **만들 것:**
  - 경보마다 언제 울리는지, 어떻게 알리는지, 무엇을 해야 하는지를 자체 문구로 정리한다.
  - 출처와 확인일을 단다.
  - 화면(1-4)과 테스트가 함께 쓰는 순수 데이터 모듈을 먼저 만든다.
- **문구 원칙:** 기존 체크리스트(`checklist.ts`)처럼 자체 작성하고, 출처는 링크로만 단다.

## 범위

- **포함:** 경보 콘텐츠 모듈, 출처 상수, `node --test` 인수 테스트, PR 대조표
- **제외:**
  - 화면(1-4)
  - 재난경보(자연재난 사이렌)
  - 실시간 경보 수신·알림

## 형식 (제안)

파일은 `frontend/src/entities/guide/model/alerts.ts`다. 기존 `checklist.ts`처럼 별칭 import 없는 단일 파일이라 `node --test`로 바로 돈다.

- **`CIVIL_ALERTS`:** `{ id, name, when, signal, siren, actions, sources }[]`
  - id와 순서는 고정한다:
    1. `alert`(경계경보)
    2. `air-raid`(공습경보)
    3. `cbr`(화생방경보)
    4. `nuclear`(핵경보)
    5. `all-clear`(경보해제)
  - `siren`: 사이렌을 울리는 경보인지(boolean)
  - `actions`: `{ id, text }`를 3~8개 둔다. 밤에 할 일은 "밤에는 …"으로 시작하는 항목으로 넣는다.
  - `sources`: 아래 출처 키 목록
- **`ALERT_SOURCES`:** `Record<키, { name, url, checkedAt }>`

| 출처 키 | 이름 | URL | 쓰는 곳 |
|---|---|---|---|
| `mois-alarm` | 국민안전24 민방위 경보(행정안전부) | https://safekorea.go.kr/safekorea-kor/edtr/clns/cdal/civilDefenseAlarm.do?menuSn=57 | 경보 종류, 발령 상황, 알리는 방법 |
| `mois-actions` | 국민안전24 국민행동요령 민방공경보 | https://safekorea.go.kr/safekorea-kor/acts/nacts/action-guide.do?category=civlAirDefenseWarning&actsHeaderTitle=%EB%AF%BC%EB%B0%A9%EA%B3%B5%EA%B2%BD%EB%B3%B4&menuSn=4 | 경계·공습(주간·야간), 화생방, 핵 행동 |
| `mois-emergency` | 국민안전24 국민행동요령 비상대비 | https://safekorea.go.kr/safekorea-kor/acts/nacts/action-guide.do?category=stateOfEmergency&actsHeaderTitle=%EB%B9%84%EC%83%81%EB%8C%80%EB%B9%84&menuSn=4 | 경보해제 행동 |

## 할 일

1. **출처 확인과 작성:**
   - 세 출처를 열어 경보별 발령 상황, 신호, 행동을 확인한다.
   - 자체 문구로 쓴다. 공식 문장을 그대로 옮기지 않는다.
2. **사이렌 표기:**
   - 국민안전24 '민방위 경보' 쪽을 기준으로 한다: 공습·핵만 사이렌, 1분 동안 5초 오르고 3초 내린다.
   - 다르게 적힌 출처(공습 3분, 경계 평탄음 등)는 PR에 기록만 한다.
3. **PR 기록:**
   - 경보별 대조표(공식 요지, 자체 문구, 출처 키)와 확인일을 적는다.
   - 이용 조건(공공누리 유형)을 확인해 적는다. 확인하지 못하면 "확인 못 함"으로 적는다.

## 인수 조건

- [ ] `CIVIL_ALERTS`의 id가 `alert`, `air-raid`, `cbr`, `nuclear`, `all-clear` 순서로 정확히 5개다. [테스트]
- [ ] 각 경보의 `name`·`when`·`signal`이 비어 있지 않고, `actions`가 3~8개다. [테스트]
- [ ] 모든 경보의 행동 항목 id가 전체에서 유일하고, 기존 `CHECKLIST`의 id와도 겹치지 않는다. [테스트]
- [ ] `siren`은 `air-raid`·`nuclear`만 true다. `signal`에 "사이렌"이 들어 있는 경보는 `siren`이 true인 경보뿐이다. [테스트]
- [ ] 출처 확인: [테스트]
  - 출처마다 `url`이 `https://`로 시작한다.
  - 도메인은 `safekorea.go.kr` 또는 `law.go.kr`이다.
  - `checkedAt`이 `YYYY-MM-DD` 형식이다.
  - 모든 경보가 출처를 1개 이상 가리킨다.
- [ ] `alerts.ts`가 별칭(`@/`) import 없이 `node --test`로 바로 돈다. [테스트]
- [ ] PR 본문에 경보별 대조표, 확인일, 출처 간 차이와 처리 방법, 이용 조건이 있다. [수동]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과. [명령]

## 영향 파일

- `frontend/src/entities/guide/model/alerts.ts`(신규)
- `frontend/src/entities/guide/model/alerts.test.ts`(신규)
- `frontend/src/entities/guide/index.ts`(내보내기)

## 관련 시안

없음(plan.md 7-1)

## 선행 이슈

없음

## 라벨

`enhancement`, `documentation`
