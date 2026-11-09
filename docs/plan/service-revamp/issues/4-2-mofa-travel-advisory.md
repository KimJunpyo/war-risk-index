# 외교부 국가·지역별 여행경보 연동

## 배경

여행경보는 지금 미 국무부와 영국 FCDO만 보여준다(`travel_advisory.py`). 파일 docstring과 `FORMULA_v1.md`에 "한국 외교부 여행경보(공공데이터포털)는 serviceKey가 필요해 제외했다"고 적혀 있다. 국내 일반인에게는 외교부 경보가 가장 직접적인 공식 판단이므로 4-1의 키 설정 위에 추가한다.

## 범위

- 포함: `travel_advisory.py`에 외교부 출처 추가, `/api/countries`의 `advisory` 배열에 포함, 요약 영역·GuideModal 표시
- 제외: 점수 반영(기존 원칙대로 미반영), 지역(시·도) 단위 지도 표시, 과거 이력

## 할 일

1. **API 확인(첫 할 일)**: 공공데이터포털에서 외교부 여행경보 API의 정확한 이름, 요청 주소, 응답 필드(국가 코드 형식, 단계, 지역, 발표일), 호출 한도, 라이선스·출처 표기 의무를 확인해 PR 설명에 적는다. 확인하지 못한 항목은 단정하지 않고 "확인 못 함"으로 적는다(plan.md Q13).
2. 외교부 단계 체계(단계 수, 이름, 특별여행주의보 같은 별도 등급 유무)를 공식 문서로 확인하고 `max_level`과 `label`을 정한다.
3. `travel_advisory.py`에 `source: "kr_mofa"`를 추가한다. 기존처럼 하루 1회(`REFRESH_SECONDS`) 받고, 한 나라에 여러 지역 경보가 있으면 가장 높은 단계 하나를 쓴다. 키가 없거나 호출이 실패하면 외교부만 건너뛰고 미·영 경보는 그대로 갱신한다.
4. 국가 코드를 ISO alpha-3로 맞춘다. 92개국 중 외교부 데이터와 연결되지 않는 나라 목록을 PR에 적는다.
5. 프론트 `Advisory.source` 타입에 `"kr_mofa"`를 추가하고, 요약 영역에서 외교부를 맨 앞에 표시한다. GuideModal 여행경보 단계 표(`ADVISORY_LEVELS`)에 외교부 단계를 추가한다.
6. footer 데이터 출처, `FORMULA_v1.md` 여행경보 절, `llms.txt` 출처에 외교부를 추가하고 "제외했다" 문장을 고친다.

## 인수 조건

- [ ] PR 설명에 API 이름, 요청 주소, 응답 필드, 호출 한도, 라이선스·출처 표기 의무가 적혀 있다(확인 못 한 항목은 그렇게 표시).
- [ ] 키가 있을 때 `GET /api/countries`에서 외교부 데이터가 있는 나라의 `advisory`에 `source: "kr_mofa"` 항목이 있고, `level`·`label`·`date`가 외교부 원문과 같다(3개국 표본을 PR에 대조).
- [ ] 키가 없을 때 백엔드가 정상 기동되고, `advisory`에 `kr_mofa`가 없으며 `us_state`·`uk_fcdo` 항목은 키가 있을 때와 같다.
- [ ] 외교부 API가 실패해도(잘못된 키로 재현) `data/travel_advisory.csv`의 미·영 행이 갱신된다.
- [ ] 요약 영역 여행경보 줄에서 외교부가 첫 번째로 표시되고, 출처 링크는 새 탭으로 열린다.
- [ ] GuideModal에 외교부 단계 설명이 있고 단계 이름이 공식 문서 표기와 같다.
- [ ] 외교부 연결이 안 되는 나라 목록이 PR에 있다.
- [ ] `travel_advisory.py`의 기존 자체 점검(있다면 `self_check`)과 신규 매핑 점검이 통과한다.
- [ ] `.\.venv\Scripts\python -m compileall -q backend travel_advisory.py` 오류 0건, uvicorn 기동 후 30초 동안 Traceback 0건이다.
- [ ] `frontend`에서 `npx tsc --noEmit`, `npm run lint` 오류 0건이다.
- [ ] 브라우저(`http://localhost:3000`)에서 우크라이나, 일본, 외교부 데이터와 연결되지 않는 나라 1곳을 선택해 확인했고(마지막 나라는 외교부 항목 없이 미·영만 표시) 콘솔 오류 0건이다.

## 영향 파일

- `travel_advisory.py`
- `backend/app/main.py` (필요 시)
- `frontend/src/entities/country/model/types.ts`
- `frontend/src/views/home/ui/HomePage.tsx`
- `frontend/src/entities/guide/model/guide.ts`, `frontend/src/widgets/guide-modal/ui/GuideModal.tsx`
- `FORMULA_v1.md`, `frontend/public/llms.txt`
- `.env.example` (키 이름을 나눌 경우)

## 관련 시안

없음

## 선행 이슈

4-1

## 라벨

`enhancement`
