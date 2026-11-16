// 배치 뉴스 단계(news_publish.py)가 나라 검색어에 넣는 이름 목록(ISO alpha-2 → 한국어)을 만든다(#54).
// 화면이 /api/countries/{code}/news?name= 에 넣던 이름과 같도록 화면의 countryName() 을 그대로 부른다(Python 에는 Intl 이 없다).
// 나라 목록(country_meta.csv)은 일별 재계산 때 바뀔 수 있어 ISO 3166 전체(iso-numeric.json = pycountry 목록)로 만든다.
// 실행(저장소 루트, Node 24): node frontend/scripts/country-names.mjs → 결과 JSON 은 커밋한다
import { readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const ISO_NUMERIC = new URL("../src/shared/lib/iso-numeric.json", import.meta.url);
const OUT_FILE = new URL("../../backend/app/country_names.json", import.meta.url);

// country.ts 의 JSON import 는 번들러용이라 import 속성이 없다. Node 가 요구하는 type: json 을 여기서만 붙인다
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    return result.url.endsWith(".json") ? { ...result, importAttributes: { type: "json" } } : result;
  },
});
// 정적 import 는 훅 등록보다 먼저 풀리므로 동적으로 불러온다
const { countryName } = await import("../src/shared/lib/country.ts");

const codes = [...new Set(Object.values(JSON.parse(readFileSync(ISO_NUMERIC, "utf8"))))].sort();
const names = Object.fromEntries(codes.map((iso2) => [iso2, countryName(iso2)]));
// 한국어 ICU 데이터 없이 빌드된 Node 면 영어 이름이 나온다
if (names.KR !== "대한민국") throw new Error(`한국어 이름이 아님: KR → ${names.KR}`);
writeFileSync(OUT_FILE, `${JSON.stringify(names, null, 2)}\n`);
console.log(`나라 이름 ${codes.length}개 → ${fileURLToPath(OUT_FILE)}`);
