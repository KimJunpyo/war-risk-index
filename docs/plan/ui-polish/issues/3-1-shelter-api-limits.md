# 대피소 조회 상한 조정과 전체 건수 응답

## 배경

`GET /api/shelters`는 위치 조회 시 5km 안 가까운 10곳(`SHELTER_NEARBY_LIMIT = 10`), 지역 조회 시 이름순 50곳(`SHELTER_REGION_LIMIT = 50`)만 돌려준다. 로컬 데이터(`data/shelters.csv`, 17,229건)로 측정한 결과:

- 시·군·구 230개 중 116개가 50곳을 넘는다. 최대 경상남도 창원시 527곳, 중앙값 52곳.
- 서울시청 좌표(37.57, 126.98) 5km 안 476곳, 부산(35.18, 129.08) 487곳.
- 창원시 전체를 JSON으로 보내면 약 149KB, gzip 압축 시 약 25KB.

지금 상한으로는 3-2의 검색·페이지네이션이 최대 10곳·50곳 안에서만 동작해 의미가 없다. `plan.md` Q4 확정안(클라이언트 방식)에 따라 상한을 실제 최대치보다 크게 올리고, 잘렸는지 알 수 있게 전체 건수를 응답에 넣는다.

## 범위

- 포함: `backend/app/main.py` 대피소 상한 상수, 응답에 `total` 추가, `GZipMiddleware`, 관련 테스트·프론트 타입
- 제외: 서버 측 검색·페이지 파라미터(Q4 확정: 클라이언트 방식), 정렬 기준 변경, 반경(5km) 변경, 좌표 정밀도·로그 필터 변경

## 할 일

1. 상한을 "안전 상한"으로 바꾼다(plan.md Q6 확정).
   - 위치 조회: 5km 안 전부, 안전 상한 `SHELTER_NEARBY_LIMIT = 1000`
   - 지역 조회: 안전 상한 `SHELTER_REGION_LIMIT = 1000`
   - 상수 이름·주석에 "안전 상한(실데이터 최대 약 530곳)"을 적는다.
2. 응답에 `total`(상한 적용 전 건수, 정수)을 추가한다. `available: false`이거나 대상 밖(한국 좌표 범위 밖)이면 `total: 0`. 기존 필드(`available`, `as_of`, `items`)와 항목 필드는 그대로.
3. GZip 압축을 켠다(Q5 확정): `app.add_middleware(GZipMiddleware, minimum_size=...)`. Starlette 내장이라 새 의존성이 아니다. `minimum_size`는 상수로 둔다.
4. 프론트 `entities/shelter/model/types.ts`의 `ShelterResult`에 `total: number`를 추가한다(표시는 3-2).
5. 테스트 수정·추가 (`tests/test_m4_public_data.py`). 아래 두 테스트는 계약이 바뀌므로 고치고, PR 본문에 "명세 변경(상한 10/50 → 안전 상한, total 추가)"이라고 적는다.
   - `test_nearby_limit`: 상한 10 → 5km 안 전부 반환(예: 15곳 입력 → 15곳)
   - `test_region_limit`: 상한 50 → 55곳 입력 → 55곳
   - 신규: `total`이 상한 적용 전 건수와 같은지, 반경 밖·대상 밖·키 없음에서 `total == 0`인지
   - 신규: `Accept-Encoding: gzip` 요청에 `Content-Encoding: gzip` 응답
6. 모듈 docstring·`list_shelters` docstring의 "10곳", "최대 50곳" 문구를 바꾼다. `tests/test_m4_public_data.py` 상단 계약 설명도 같이 바꾼다.

## 인수 조건

- [ ] `GET /api/shelters?region=경상남도 창원시` 응답의 `items` 길이와 `total`이 모두 로컬 `data/shelters.csv`의 창원시 행 수(2026-11-10 기준 527)와 같다.
- [ ] `GET /api/shelters?lat=37.57&lon=126.98` 응답의 `items`가 5km 안 전부(로컬 데이터 기준 476곳)이고 `distance_m` 오름차순이며 `total`과 길이가 같다.
- [ ] 한국 좌표 범위 밖(`lat=10&lon=10`) 요청과 키 없는 환경에서 `total`이 0이고 `items`가 빈 배열이다.
- [ ] 좌표 소수 3자리 요청(`lat=37.571`)은 기존처럼 422다.
- [ ] `curl.exe -s -D - -o NUL -H "Accept-Encoding: gzip" "http://localhost:8000/api/shelters?region=경상남도%20창원시"` 응답 헤더에 `content-encoding: gzip`이 있다.
- [ ] 로컬에서 창원시 지역 조회 응답 시간이 1초 이하다(개발자 도구 Network의 Waiting 값, 3회 평균).
- [ ] uvicorn 접근 로그에 `/api/shelters?` 요청이 기존처럼 남지 않는다(`tests/test_m4_log_filter.py` 통과).
- [ ] 위 테스트 수정·추가 후 `.venv\Scripts\python.exe -m pytest tests` 전부 통과한다.
- [ ] `frontend`에서 `npx tsc --noEmit`, `npm run lint` 오류 0건이다.
- [ ] `node --test frontend/src/**/*.test.ts` 전부 통과한다.
- [ ] 브라우저 폭 360 / 768 / 1080 / 1440px에서 한국 선택 → 지역 조회(창원시)·위치 조회(개발자 도구 Sensors로 서울 좌표)가 기존 화면에서 오류 없이 표시되고(목록이 길어지는 것은 3-2 전까지 허용), 각 폭에서 `document.documentElement.scrollWidth <= window.innerWidth`가 `true`, 콘솔 오류 0건이다.

## 영향 파일

- `backend/app/main.py`
- `frontend/src/entities/shelter/model/types.ts`
- `tests/test_m4_public_data.py`

## 관련 시안

없음

## 선행 이슈

없음(M2와 병렬 가능)

## 라벨

`enhancement`
