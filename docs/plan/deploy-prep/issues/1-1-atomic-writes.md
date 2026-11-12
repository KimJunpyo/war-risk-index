# 지수·UCDP·가중치 파일 원자적 쓰기(임시 파일→교체)

인용 줄 번호는 `466b1a9`(M9 시작 전 main) 기준이다.

## 배경

백엔드 갱신 스레드는 하루 한 번 지수와 UCDP 집계를 다시 계산한다(`backend/app/main.py:180-185`). 그런데 결과 파일 7곳을 대상 파일에 바로 쓴다(아래 표).

**쓰는 도중에 요청이 들어올 때**
- API는 파일 mtime이 바뀌면 다시 읽는다(`main.py:109-118` `_csv`).
- 그래서 쓰는 중에 들어온 요청은 잘린 파일을 읽는다.
- 빈 파일이면 `EmptyDataError`로 500이 나고, 일부만 읽히면 국가 목록이 빠지거나 404가 난다.

**쓰는 도중에 프로세스가 끝날 때(재배포, 메모리 부족) — 더 큰 문제**
- `out/country_meta.csv`는 일별 재계산 여부를 정할 때도 쓰인다(`main.py:176-178`).
  - 잘린 파일의 최신 날짜가 그대로면 다음 날까지 재계산하지 않는다.
  - 따옴표 안에서 잘려 파싱 오류가 나면 매 주기 실패해서, 사람이 고칠 때까지 그대로 남는다.
- UCDP 집계는 UCDP 새 버전(월 1회)이 나올 때만 다시 쓴다(`ucdp.py:116-118`). 그래서 잘린 파일을 최대 한 달 동안 쓴다.

이미 4곳(`live.py:103-105`, `shelters.py:86-89`, `embassies.py:71-74`, `travel_advisory.py:209-212`)은 같은 폴더의 임시 파일에 쓰고 `Path.replace`로 교체한다. 나머지 7곳도 같은 방식으로 맞춘다.

| 위치 | 파일 | 읽는 곳 |
|---|---|---|
| `build_index.py:46` | `out/index_v1.csv` | `/api/pairs`, `/api/pairs/{id}/index`, `/api/cases` |
| `build_country_index.py:209` | `out/country_index.csv` | `/api/countries`(`week_ago`), `/api/countries/{code}/index` |
| `build_country_index.py:216` | `out/country_meta.csv` | 국가 엔드포인트 전부, 일별 재계산 판단 |
| `blend.py:65` | `out/blend_weights.json` | `/api/blend`, `build_index.main()` |
| `ucdp.py:126` | `data/ucdp_country_monthly.csv` | `build_country_index.main()` |
| `ucdp.py:127` | `data/ucdp_opponents_monthly.csv` | `build_country_index.main()` |
| `ucdp.py:128` | `data/ucdp_country_monthly.csv.asof` | `build_country_index.main()` |

## 범위

- **포함:** 위 7곳의 쓰기 방식, 공용 함수, 테스트
- **제외:**
  - append 방식 수집 파일 3곳(`gdelt_collect.py`, `country_collect.py`, `live.backfill`). 이유는 `plan.md` 10절에 있다.
  - 기존 4곳을 공용 함수로 옮기는 일(관련 없는 리팩터링, `plan.md` 12절 제안)
  - 쓰는 순서와 내용 변경

## 할 일

1. **공용 함수:** 같은 폴더의 임시 파일(기존 관례대로 `.part` 접미사)에 쓰고 `Path.replace`로 교체한다.
   - 7곳에 같은 동작이 필요하므로 공용 함수 하나로 두고 7곳에서 부른다. 한 번의 테스트로 확인할 수 있다.
   - 위치는 루트의 공용 모듈로 한다. 예: `atomic_write.py`의 `write_csv`·`write_text`(이름은 제안). `data_go_kr.py`와 같은 방식이다. 구현은 `atomic_write.py`의 `write`·`write_csv`·`write_text`다(PR #45).
   - 실패하면 예외를 그대로 올린다. 남은 `.part`는 다음 실행에서 덮어쓴다.
   - 임시 파일 이름이 `<대상>.part`로 고정이라, 같은 파일을 쓰는 프로세스가 하나뿐이라고 전제한다. 그래서 런북(2-2)에 "워커 1개 고정, 손으로 재계산할 때 서비스 먼저 중지"를 적는다(M9 리뷰).
   - Windows 개발 환경에서는 API가 파일을 읽는 순간 교체가 `PermissionError`로 실패할 수 있다. 대상 파일은 옛 내용 그대로이고, 갱신 스레드가 다음 주기에 다시 쓴다(UCDP 집계는 예외: 1-2). 배포 대상 Linux는 해당 없다(M9 리뷰 실측).
2. **호출 지점 교체:** 7곳을 공용 함수 호출로 바꾼다. `to_csv` 옵션(`index=False`, `encoding="utf-8"`)은 그대로 넘긴다.
3. **테스트:** `tests/test_deploy_atomic_write.py`(이름은 제안)
   - **공용 함수 실패:** 가짜 쓰기가 받은 경로에 절반만 쓰고 예외를 낸다. 그래도 대상 파일 내용이 바뀌지 않는다.
   - **공용 함수 성공:** `.part`가 남지 않고, 결과가 바로 쓴 것과 같다.
   - **정적 검사:** 네 모듈에서 대상 상수(`INDEX_FILE`, `COUNTRY_INDEX_FILE`, `COUNTRY_META_FILE`, `BLEND_FILE`, `MONTHLY_FILE`, `OPPONENT_FILE`, `.asof` 경로)에 바로 `to_csv`·`write_text`하는 호출이 없다.
4. **결과 비교:** 바꾸기 전과 후의 결과가 같은지 확인한다(인수 조건 4번째 항목).
   - 이 확인의 실행 순서는 `build_country_index.main()` → `build_index.main()`이다. 가중치 파일을 먼저 만들어서 두 실행이 같은 가중치를 쓰게 하려는 순서다.
   - 실제 일별 재계산(`backend/app/main.py`의 `_daily_refresh`)은 반대로 `build_index.main()`을 먼저 돌린다(M9 리뷰에서 확인). 리뷰 결론은 다음과 같다.
     - 순서는 유지한다. `out/country_meta.csv`가 마지막에 써져야 중간 단계가 실패했을 때 다음 주기가 다시 시도하고, 헬스 체크(1-3)도 지수 날짜로 실패를 드러낸다.
     - 대신 쌍 지수(`out/index_v1.csv`)는 직전 주기 가중치를 써서 가중치 반영이 1일 늦다. 평상시 영향은 표시값 0.1 수준이다.
     - 가중치 파일(`out/blend_weights.json`) 없이 처음 띄우면 기본 가중치로 계산돼 첫날 쌍 지수가 최대 약 34점 틀린다(리뷰어 계산). 그래서 백엔드를 멈춘 상태에서 `build_country_index` → `build_index` 순서로 손으로 한 번 돌린다(`out/` 폴더부터 만든다, 2-3, 3-1).
   - 해시 값은 PR 본문에만 적는다. 저장소 파일에 넣으면 `test_no_key_like_strings_in_repo`에 걸린다.

## 인수 조건

### 로컬에서 확인

- [x] 표의 7곳이 모두 같은 폴더의 임시 파일(`*.part`)에 쓴 뒤 `Path.replace`로 교체한다. 네 모듈에서 대상 파일에 바로 `to_csv`·`write_text`하는 호출이 0건이다. [테스트]
- [x] 공용 함수가 쓰는 도중 예외가 나도 대상 파일 내용이 그대로이고, 예외는 호출한 쪽으로 전달된다. 테스트의 가짜 쓰기는 절반만 쓰고 예외를 낸다. [테스트]
- [x] 정상으로 끝나면 대상 폴더에 `*.part` 파일이 남지 않는다. 결과 내용은 `to_csv`·`write_text`로 바로 쓴 것과 같다. [테스트]
- [x] 백엔드를 멈춘 상태에서, 바꾸기 전과 후에 각각 `.venv\Scripts\python.exe -c "import build_country_index, build_index; build_country_index.main(); build_index.main()"`을 실행한다. 다음 4개 파일의 `Get-FileHash`(SHA-256) 값이 같다. 다르면 원인을 PR에 보고한다. [명령]
  - `out/index_v1.csv`
  - `out/country_index.csv`
  - `out/country_meta.csv`
  - `out/blend_weights.json`
- [x] `.venv\Scripts\python.exe ucdp.py`를 실행한 뒤 확인한다. UCDP 새 버전이 없을 때 기준이다. [명령]
  - UCDP CSV 2개를 `pandas.read_csv`로 읽을 수 있다.
  - `.asof` 날짜가 실행 전과 같다.
  - `data/`에 `*.part` 파일이 없다.
- [x] `.venv\Scripts\python.exe -m pytest tests`가 전부 통과한다. [테스트]

### 서버에서 확인(M3)

- 3-2: 첫 일별 재계산 뒤 `find /srv/war-risk-index/data /srv/war-risk-index/out -name '*.part'` 결과가 0건이다.

## 영향 파일

- `atomic_write.py`(신규, 이름은 제안)
- `build_index.py`, `build_country_index.py`, `blend.py`, `ucdp.py`
- `tests/test_deploy_atomic_write.py`(신규, 이름은 제안)

## 관련 시안

없음(`plan.md` 4절 사실 1)

## 선행 이슈

없음

## 라벨

`bug`
