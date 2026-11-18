# 나라 상세 대상 표시: `countries.json`에 `low_mentions`

기준 코드: `5acdd59`(`main`, 2026-11-17)

## 배경

- **원칙:** 데이터가 적은 나라는 상세 페이지를 만들지 않는다. Q7 결정은 "최근 1년 하루 평균 언급이 1,000건 미만이면 제외"다.
- **지금 목록 기준:**
  - 지도 포함 기준은 "언급 1,000건 이상 또는 UCDP 무력 충돌"이다.
  - 그래서 언급이 적어도 교전이 있는 11개국이 목록에 있다(plan.md 사실 5).
- **필드가 필요한 이유:** 언급량은 `build_country_index.py` 안에서만 계산하고 응답에는 없다.
- **판정 위치:**
  - 지수를 만드는 곳(파이썬) 한 곳에서 판정한다.
  - 응답에는 결과만 bool로 싣는다. 기준값이 프론트에 중복되지 않는다.
- **운영 반영 시점:**
  - 운영 데이터에는 머지 뒤 첫 일별 재계산 때 열이 생긴다.
  - 그 전에는 값이 null이다. 프론트는 null인 나라의 페이지를 만들지 않는다(3-2).

## 범위

- **포함:**
  - `out/country_meta.csv`에 `low_mentions` 열
  - `/api/countries` 각 항목에 `low_mentions`
  - 프론트 `Country` 타입
  - 테스트
- **제외:**
  - 지도·홈 표시 변경
  - 기준값 변경(`MIN_AVG_MENTIONS = 1000` 그대로)
  - Worker 변경(`countries.json`을 그대로 전달하므로 필요 없다)

## 인수 조건

- [ ] `build_country_index`가 쓰는 `country_meta.csv`에 `low_mentions` 열이 있다. 최근 1년 하루 평균 언급이 `MIN_AVG_MENTIONS` 미만이면 true다. 경계값 999는 true, 1000은 false다. [테스트]
- [ ] `/api/countries` 각 항목에 `low_mentions`(true 또는 false)가 있다. 열이 없는 옛 `country_meta.csv`를 읽으면 null이다. [테스트]
- [ ] `publish.build()`의 `countries.json`이 API 응답과 같다(기존 대조 테스트 통과). [테스트]
- [ ] 로컬 데이터로 `build_country_index.main()`을 돌린 뒤, `low_mentions`가 true인 나라 수와 목록이 PR 본문에 있다. [명령]
  - 2026-11-10 데이터 기준 예상: 11개국(BEN, BFA, CAF, CMR, COD, HTI, MLI, MOZ, NER, SSD, TCD)
  - 다른 날 데이터로 돌렸으면 그날 값을 적는다.
- [ ] `worker/` 아래 파일이 바뀌지 않았다. [명령]
- [ ] 머지 뒤 첫 일별 재계산이 끝나면 운영 `/api/countries`에 `low_mentions`가 있다. [수동]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건. [명령]

## 영향 파일

- `build_country_index.py`(meta 열)
- `backend/app/main.py`(`list_countries`)
- `frontend/src/entities/country/model/types.ts`(`Country.low_mentions`)
- 테스트: 기존 `tests/test_m12_publish.py` 대조, 새 pytest(이름 제안 `tests/test_country_low_mentions.py`)
- 픽스처 `tests/fixtures/m12/`: 열을 더할지는 PR에서 정한다. 열이 없을 때 null인지 확인하는 데 지금 픽스처를 쓸 수 있다.

## 관련 시안

없음(데이터)

## 선행 이슈

없음(M1·M2와 병렬 가능)

## 라벨

`enhancement`
