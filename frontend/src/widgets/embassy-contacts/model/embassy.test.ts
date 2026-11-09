// 이슈 #13 (4-5) 공관 전화 tel: 링크 변환. 실행(저장소 루트): node --test frontend/src/**/*.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { telHref } from "./embassy.ts";

test("외교부 원문 전화 표기 → tel: 링크", () => {
  assert.equal(telHref("+81-3-3452-7611"), "tel:+81334527611");
  assert.equal(telHref("(81) 92-771-0461"), "tel:+81927710461");
  assert.equal(telHref("+53) 7204-0977, 0988"), "tel:+5372040977");
  assert.equal(telHref("+591-2-211-0361~3"), "tel:+59122110361");
  assert.equal(telHref("+7-727-291-0490/291-0449"), "tel:+77272910490");
  assert.equal(telHref("+95(국가번호)-1(지역번호)-7527142"), "tel:+9517527142");
  assert.equal(telHref("（86） 158-4085-1230"), "tel:+8615840851230");
  assert.equal(telHref("+32 (0)2 675 5777"), "tel:+3226755777");
  assert.equal(telHref("+41-(0)79-897-4086"), "tel:+41798974086");
});

test("국가번호로 시작하지 않으면 링크 없음", () => {
  assert.equal(telHref("1-416-920-3809"), null);
  assert.equal(telHref("31-70-740-0200"), null);
  assert.equal(telHref("02-3210-0404"), null);
});
