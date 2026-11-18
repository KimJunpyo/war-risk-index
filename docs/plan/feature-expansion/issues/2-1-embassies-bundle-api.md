# 재외공관 묶음 응답 `/api/embassies`

기준 코드: `5acdd59`(`main`, 2026-11-17)

## 배경

- **왜 묶음이 필요한가:**
  - 오프라인 화면(2-2)과 나라 상세(3-2)는 여러 나라의 공관을 한꺼번에 써야 한다.
  - 지금은 나라별 `/api/countries/{code}/embassies`만 있어서, 모두 받으려면 92번 불러야 한다.
- **범위가 지수 대상보다 넓다:**
  - `data/embassies.csv`(로컬 181곳)는 지수 대상 92개국보다 넓다.
  - 오프라인 연락처는 지수 대상과 관계없이 공관이 있는 모든 나라를 담는다(Q5).
- **어디를 고치나:**
  - Worker는 R2 파일을 그대로 흘려보낸다. 그래서 `publish.py`가 파일을 만들고 Worker는 경로만 더한다.
  - FastAPI에도 같은 경로를 둔다. Worker 주석에 "경로·오류 문구는 main.py와 같다"는 규칙이 있다.
- **배치 가드:** `batch.GUARDED_API`가 공공데이터가 빠진 응답이 지난 응답을 덮지 못하게 막는다. 새 파일도 이 목록에 넣는다(plan.md 사실 6).

## 범위

- **포함:**
  - FastAPI `GET /api/embassies`
  - `publish.build()`에 `embassies.json` 추가
  - `batch.GUARDED_API`에 `embassies.json` 추가
  - Worker `FIXED_ROUTES`에 `/api/embassies` 추가(일별 캐시 3600초)
  - 테스트
- **제외:** 화면(2-2, 3-2), 나라별 경로 변경

## 응답 (제안)

```json
{"available": true, "as_of": "2026-11-12",
 "call_center": {"tel": "02-3210-0404", "tel_overseas": "+82-2-3210-0404", "source": "https://www.0404.go.kr"},
 "countries": [{"iso2": "JP", "embassies": [{"name": "…", "kind": "대사관", "address": "…", "tel": "…", "emergency_tel": "…"}]}]}
```

- **정렬:**
  - 나라는 iso2 오름차순이다. 화면이 한국어 이름순으로 다시 정렬한다.
  - 한 나라 안의 공관은 파일 순서(대사관 먼저)다.
- **필드:** 공관 필드는 나라별 경로와 같다(`name`, `kind`, `address`, `tel`, `emergency_tel`).
- **키가 없거나 파일이 없을 때:**
  - `available: false`, `countries: []`
  - `call_center`는 항상 넣는다.
  - 나라별 경로와 같은 규칙이다.

## 인수 조건

- [ ] 키가 있을 때 `/api/embassies`가 200이다. 각 나라의 `embassies`는 같은 나라의 `/api/countries/{code}/embassies` 응답 `embassies`와 같다(픽스처의 지수 대상 나라 전부). [테스트]
- [ ] 지수 대상이 아닌 나라(픽스처에 있는 것)도 `countries`에 들어 있다. [테스트]
- [ ] 키가 없으면 `available: false`, `countries: []`이고, `call_center`가 `embassies.CALL_CENTER`와 같다. [테스트]
- [ ] `publish.build()` 결과의 `embassies.json`이 API 응답과 같다(키 있음·없음 둘 다). [테스트]
- [ ] 배치 가드: [테스트]
  - 이미 쓴 `embassies.json`이 `available: true`인데 새 응답이 false면 `publish.write`가 아무것도 쓰지 않고 멈춘다(기존 가드와 같은 동작).
  - `batch.GUARDED_API`에 `embassies.json`이 있다.
- [ ] Worker(`worker`에서 `npm test`): [테스트]
  - `GET /api/embassies`가 R2 `api/embassies.json` 본문을 그대로 주고, `Cache-Control`이 `public, max-age=3600`이다.
  - 파일이 없으면 404 `{"detail":"Not Found"}`다.
  - `POST`는 405다.
- [ ] 로컬 데이터로 만든 `embassies.json`의 크기, gzip 크기, 나라 수가 PR 본문에 있다. [명령]
- [ ] 머지 뒤 다음 배치가 끝나면 운영 Worker `/api/embassies`가 200이고 `available: true`다. [수동]
- [ ] 공통 검증을 통과한다: pytest 전부, `worker`에서 `npm test` 통과. [명령]

## 영향 파일

- `backend/app/main.py`, `publish.py`, `batch.py`(`GUARDED_API`), `worker/src/index.ts`
- 테스트:
  - `tests/test_m12_publish.py`, `tests/test_m12_batch.py`(가드)
  - 새 pytest(이름 제안 `tests/test_embassies_bundle.py`)
  - `worker/test/index.spec.ts`
- `deploy/RUNBOOK.md`에 API 경로 목록이 있으면 갱신한다.

## 관련 시안

없음(API)

## 선행 이슈

없음(M1과 병렬 가능)

## 라벨

`enhancement`
