# 비상 가방·비축 목록과 물·식량 계산 함수

기준 코드: `5acdd59`(`main`, 2026-11-17)

## 배경

- **두 가지 목록:** 비상 가방을 둘로 나눈다. 근거는 plan.md 사실 2에 있다.
  - 들고 나가는 3일치 가방(1인 1개)
  - 집에 두는 7일 이상 비축
- **계산:** 가구원 수와 기간으로 물·식량 양을 계산한다. 계산 기준은 Q2·Q3 결정을 따른다.
  - 비축 기간: 7일, 14일
  - 물: 1인 1일 3L
  - 식량: 1인 1일 3끼
- **30일치:** 넣지 않는다.
  - 가방이 아니다. 물만 1인 약 90L다.
  - 현행 공식 근거를 확인하지 못했다.
- **위치와 저장:** 목록, 출처, 계산을 화면(1-5)과 분리한 순수 모듈로 둔다.
  - 기존 체크 저장 함수(`readChecked`·`toggleChecked`)를 다시 쓰려고 같은 `entities/guide` 안에 둔다. 다른 엔티티를 import하지 않는다.

## 범위

- **포함:** 목록·출처·계산 함수 모듈, `node --test`, PR 출처 대조표
- **제외:**
  - 화면(1-5)
  - 어린이·영유아·반려동물별 양
  - 열량(kcal)
  - 30일 비축

## 형식 (제안)

파일은 `frontend/src/entities/guide/model/kit.ts`다(별칭 import 없음).

- **목록:** `GO_BAG_ITEMS`, `STOCK_ITEMS`는 `{ id, text, sources }[]`
- **기간:** `KIT_PERIODS = [{ id: "bag", days: 3 }, { id: "stock7", days: 7 }, { id: "stock14", days: 14 }]`(Q2)
- **상수:** `WATER_L_PER_PERSON_DAY = 3`, `MEALS_PER_PERSON_DAY = 3`, `MAX_PEOPLE = 20`
- **계산 함수:** `supplies(people: number, days: number): { waterL: number; meals: number } | null`
  - `people`가 1~`MAX_PEOPLE` 정수가 아니거나 `days`가 `KIT_PERIODS`에 없으면 null
- **저장 키:** `KIT_STORAGE_KEY = "war-risk:kit:v1"`. 체크 상태용이고 1-5에서 쓴다.
- **출처 `KIT_SOURCES`:**

| 키 | 이름 | URL | 근거 |
|---|---|---|---|
| `mois-emergency` | 국민안전24 국민행동요령 비상대비(행정안전부) | https://safekorea.go.kr/safekorea-kor/acts/nacts/action-guide.do?category=stateOfEmergency&actsHeaderTitle=%EB%B9%84%EC%83%81%EB%8C%80%EB%B9%84&menuSn=4 | 생존배낭 2~3일분·1인 1개, 품목, 핵 폭발 이후 2주 |
| `maff` | 일본 농림수산성 가정 비축 | https://www.maff.go.jp/j/zyukyu/foodstock/imadoki/imadoki02_10.html | 최소 3일·가능하면 1주, 물 1인 1일 약 3L |
| `mcf` | 스웨덴 MCF 가정 대비 | https://www.mcf.se/sv/rad-till-privatpersoner/hemberedskap---preppa-for-en-vecka/vatten/tillgang-till-vatten-i-kris/ | 1주, 성인 1일 3~5L |
| `bbk` | 독일 BBK 비축 | https://www.bbk.bund.de/DE/Warnung-Vorsorge/Vorsorge/So-koennen-Sie-sich-vorbereiten/Bevorraten/bevorraten_node.html | 가능하면 10일, 1.5L + 조리용 0.5L |

## 목록 초안 (최종은 PR, 문구는 자체 작성)

- **3일 가방:**
  - 물, 조리 없이 먹는 식량
  - 상비약, 복용 중인 약, 처방전 사본
  - 휴대용 라디오와 여분 건전지, 손전등, 보조배터리
  - 소액 현금, 신분증·중요 서류 사본(방수 봉투)
  - 가족 연락처와 만날 곳을 적은 카드
  - 화생방 대비용품(마스크, 우비, 장갑, 테이프)
  - 갈아입을 옷과 신발, 위생용품
- **7일 비축:**
  - 물(마실 물, 조리용)
  - 식량(조리가 간편하고 오래 두는 것)
  - 휴대용 가스레인지와 부탄가스
  - 손전등, 양초, 라이터, 라디오와 건전지
  - 상비약, 위생용품
  - 단수 대비 생활용수(욕조·양동이에 받아 두기)
  - 화생방 대체 물자(비닐, 테이프)
  - 유통기한 점검

## 인수 조건

- [ ] `supplies`가 다음 값을 돌려준다. [테스트]
  - `supplies(1, 3)` → `{ waterL: 9, meals: 9 }`
  - `supplies(4, 7)` → `{ waterL: 84, meals: 84 }`
  - `supplies(4, 14)` → `{ waterL: 168, meals: 168 }`
- [ ] `supplies`는 사람 수가 0, -1, 1.5, 21, `NaN`이거나 기간이 30이면 null을 돌려준다. [테스트]
- [ ] `KIT_PERIODS`의 일수가 3, 7, 14뿐이다. [테스트]
- [ ] 목록 항목 확인: [테스트]
  - 두 목록의 항목 id가 전체에서 유일하다.
  - `CHECKLIST`의 id와 겹치지 않는다. 1-2가 먼저 머지됐으면 `CIVIL_ALERTS`의 id와도 겹치지 않는다.
  - 모든 항목이 `KIT_SOURCES`의 키를 1개 이상 가리킨다.
- [ ] 출처마다 url이 `https://`로 시작하고, `checkedAt`이 `YYYY-MM-DD` 형식이다. [테스트]
- [ ] `KIT_STORAGE_KEY`가 `war-risk:kit:v1`이고, 기존 `CHECKLIST_STORAGE_KEY`와 다르다. [테스트]
- [ ] PR 본문에 항목별 출처 대조표와 각 출처를 연 날짜가 있다. [수동]
  - 일본 농림수산성 쪽은 원문에서 "1인 1일 약 3L"와 "최소 3일, 가능하면 1주"를 확인한 결과를 적는다.
  - 확인하지 못하면 그 출처를 빼고 Q3을 다시 연다.
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과. [명령]

## 영향 파일

- `frontend/src/entities/guide/model/kit.ts`(신규)
- `frontend/src/entities/guide/model/kit.test.ts`(신규)
- `frontend/src/entities/guide/index.ts`(내보내기)

## 관련 시안

없음(plan.md 7-1)

## 선행 이슈

없음(1-2와 병렬 가능)

## 라벨

`enhancement`, `documentation`
