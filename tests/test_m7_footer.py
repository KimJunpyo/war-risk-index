"""M7 이슈 #26(3-3 푸터 개편: 개인 작업물 고지·데이터 출처·만든 사람 링크) 프론트 소스 인수 테스트.

실측(푸터 위치·고지 문구·링크 속성, 폭별 배치, 터치 대상 간격, Tab 이동·포커스 표시, 가로 넘침·콘솔 오류)은
frontend/e2e/footer.spec.ts. 여기서는 문구·상수·출처 목록이 소스에 있는지만 본다.

계약 (구현은 이 계약을 따른다, 이슈 3-3 "푸터 구성")
- 푸터 위젯: frontend/src/widgets/site-footer/ (안의 파일 구성은 자유). HomePage 가 @/widgets/site-footer 를 쓴다.
- 출처 배열: 위젯 안 .ts/.tsx 의 배열 리터럴(`= [ ... ]`), 항목마다 이름은 `name: "..."` 문자열.
  이름이 SOURCE_KEYWORDS(이슈 표 12개 출처)와 일대일로 맞는다(빠진 출처·겹친 이름·다른 출처 없음, 카카오맵 제외 Q9).
  항목마다 주소는 `url: "https://…"` 문자열이고 이슈 표 주소(SOURCE_URLS)와 같다(리뷰 반영).
- 만든 사람: GitHub·LinkedIn URL 은 문자열 리터럴 그대로(상수), 표시 이름 "KimJunpyo" 는 URL 밖에도 있다.
  비공개 저장소 링크(github.com/KimJunpyo/…)는 없다.
- 고지 문구(Q8 확정)는 두 문장을 이 순서로 이어서 그대로(소스 줄바꿈·들여쓰기는 공백 하나로 봄).
- frontend/src·app·public 어느 파일에도 "FORMULA" 없음(주석 포함, grep 기준).
- frontend/public/llms.txt "## 출처": 맨 앞 "- " 항목마다 "- 이름: https://…" 또는 "- [이름](https://…)",
  (이름, 주소) 쌍 집합 = 출처 배열의 (이름, 주소) 쌍 집합. (tests/test_m4_public_data.py 가 llms.txt 에 "여행경보:…외교부" 줄을 요구하므로
  그 줄은 "## 출처" 밖에 둔다.)
"""

import re
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
SRC = FRONTEND / "src"
HOME = SRC / "views" / "home" / "ui" / "HomePage.tsx"
FOOTER = SRC / "widgets" / "site-footer"
LLMS = FRONTEND / "public" / "llms.txt"
FORMULA_DIRS = [SRC, FRONTEND / "app", FRONTEND / "public"]
GITHUB_URL = "https://github.com/KimJunpyo"
LINKEDIN_URL = "https://www.linkedin.com/in/%EC%A4%80%ED%91%9C-%EA%B9%80-0bab72265/"
AUTHOR = "KimJunpyo"
NOTICE = [
    "개인이 만든 비영리 실험 프로젝트입니다.",
    "정부·공공기관·언론사와 관련이 없으며, 정부·민방위·외교부의 공식 경보와 안내가 항상 우선합니다.",
]
# 이슈 표 12개 출처의 이름 키워드(이름 하나에 하나씩 맞음). frontend/e2e/footer.spec.ts SOURCE_KEYWORDS 와 같은 목록
SOURCE_KEYWORDS = [
    r"GDELT 1\.0", r"GDELT 2\.0", r"UCDP", r"국무부", r"FCDO", r"외교부.*여행경보",
    r"재외공관", r"영사콜센터", r"대피시설", r"Google News", r"국민재난안전포털", r"world-atlas",
]
# 이슈 표의 출처별 링크 주소(SOURCE_KEYWORDS 와 같은 순서)
SOURCE_URLS = [
    "https://www.gdeltproject.org/", "https://www.gdeltproject.org/", "https://ucdp.uu.se/", "https://travel.state.gov/",
    "https://www.gov.uk/foreign-travel-advice", "https://www.data.go.kr/", "https://www.data.go.kr/",
    "https://www.0404.go.kr/", "https://www.data.go.kr/", "https://news.google.com/", "https://www.safekorea.go.kr/",
    "https://github.com/topojson/world-atlas",
]
LLMS_ITEM = re.compile(r"-\s+(?:\[(?P<link>[^\]]+)\]\((?P<link_url>https://[^)\s]+)\)|(?P<name>.+?):\s+(?P<url>https://\S+))")
QUOTED = r"([\"'`])(.*?)\1"
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"(?<![:\"'`])//.*")


def _code(path: Path) -> str:
    """주석을 뺀 소스."""
    assert path.exists(), f"없음: {path.relative_to(FRONTEND)}"
    return LINE_COMMENT.sub("", BLOCK_COMMENT.sub("", path.read_text(encoding="utf-8")))


def _dir_code(path: Path) -> str:
    """디렉터리 아래 .ts/.tsx(테스트 제외) 소스를 이어 붙임."""
    assert path.is_dir(), f"없음: {path.relative_to(FRONTEND)}"
    files = [p for p in sorted(path.rglob("*.ts*")) if ".test." not in p.name]
    assert files, f"소스 없음: {path.relative_to(FRONTEND)}"
    return "\n".join(_code(p) for p in files)


def _array_literals(code: str) -> list[str]:
    """`= [` 로 여는 배열 리터럴 본문들(괄호 짝 맞춤, 따옴표 안 괄호는 건너뜀)."""
    out = []
    for m in re.finditer(r"=\s*\[", code):
        depth, i, quote = 1, m.end(), ""
        while depth and i < len(code):
            c = code[i]
            if quote:
                if c == "\\":
                    i += 1
                elif c == quote:
                    quote = ""
            elif c in "\"'`":
                quote = c
            else:
                depth += {"[": 1, "]": -1}.get(c, 0)
            i += 1
        out.append(code[m.end():i - 1])
    return out


def _matches(name: str) -> int:
    return sum(bool(re.search(k, name)) for k in SOURCE_KEYWORDS)


def _source_array() -> str:
    """출처 배열 본문 = 위젯 안 배열 리터럴 중 키워드에 맞는 name 이 가장 많은 것."""
    arrays = _array_literals(_dir_code(FOOTER))
    best = max(arrays, key=lambda a: sum(_matches(n) > 0 for _, n in re.findall(rf"\bname\s*:\s*{QUOTED}", a)), default="")
    assert re.search(r"\bname\s*:", best), "출처 배열(name 문자열이 있는 배열 리터럴) 없음"
    return best


def _source_names() -> list[str]:
    """출처 배열 항목의 name."""
    return [n for _, n in re.findall(rf"\bname\s*:\s*{QUOTED}", _source_array())]


def _source_entries() -> list[tuple[str, str]]:
    """출처 배열 항목(객체 리터럴)마다 (name, url). url 이 문자열이 아니면 빈 문자열."""
    entries = []
    for obj in re.findall(r"\{[^{}]*\}", _source_array()):
        name = re.search(rf"\bname\s*:\s*{QUOTED}", obj)
        url = re.search(rf"\burl\s*:\s*{QUOTED}", obj)
        if name:
            entries.append((name.group(2), url.group(2) if url else ""))
    return entries


def _llms_source_entries() -> list[tuple[str, str]]:
    """llms.txt "## 출처" 항목마다 (이름, 주소)."""
    text = LLMS.read_text(encoding="utf-8")
    section = re.search(r"^## 출처[ \t]*\n(.*?)(?=^## |\Z)", text, re.M | re.S)
    assert section, "llms.txt 에 '## 출처' 없음"
    items = [line for line in section.group(1).splitlines() if line.startswith("- ")]
    hits = [LLMS_ITEM.match(line) for line in items]
    assert [line for line, h in zip(items, hits) if not h] == [], "'- 이름: https://…' 형식이 아닌 항목"
    return [((h.group("name") or h.group("link")).strip(), h.group("url") or h.group("link_url")) for h in hits if h]


def test_home_uses_site_footer() -> None:
    assert re.search(r"[\"']@/widgets/site-footer[\"']", _code(HOME))


def test_footer_author_links() -> None:
    code = _dir_code(FOOTER)
    for url in (GITHUB_URL, LINKEDIN_URL):
        assert re.search(rf"([\"'`]){re.escape(url)}\1", code), f"URL 문자열 그대로: {url}"
    # 표시 이름: URL 안(…/KimJunpyo)만으로는 통과하지 않게 "/" 바로 뒤는 뺀다
    assert re.search(rf"(?<!/)\b{AUTHOR}\b", code), "표시 이름"
    assert not re.search(r"github\.com/KimJunpyo/[\w.-]", code), "비공개 저장소 링크"


def test_footer_notice_text() -> None:
    code = " ".join(_dir_code(FOOTER).split())
    assert " ".join(NOTICE) in code, "고지 두 문장을 이 순서로 이어서"


def test_footer_sources_match_issue_table() -> None:
    names = _source_names()
    missing = [k for k in SOURCE_KEYWORDS if sum(bool(re.search(k, n)) for n in names) != 1]
    unmatched = [n for n in names if _matches(n) != 1]
    assert (missing, unmatched) == ([], []), "키워드마다 이름 하나, 이름마다 키워드 하나"
    assert len(names) == len(SOURCE_KEYWORDS)


def test_footer_source_urls_match_issue_table() -> None:
    assert len(SOURCE_URLS) == len(SOURCE_KEYWORDS)
    entries = _source_entries()
    got = {k: [u for n, u in entries if re.search(k, n)] for k in SOURCE_KEYWORDS}
    assert got == {k: [u] for k, u in zip(SOURCE_KEYWORDS, SOURCE_URLS)}, "출처마다 이슈 표 주소 하나"


def test_no_formula_in_frontend() -> None:
    hits = [p.relative_to(FRONTEND).as_posix() for d in FORMULA_DIRS for p in sorted(d.rglob("*"))
            if p.is_file() and b"FORMULA" in p.read_bytes()]
    assert hits == []


def test_llms_sources_match_footer() -> None:
    entries = _llms_source_entries()
    names = [n for n, _ in entries]
    assert len(names) == len(set(names)), "llms.txt 출처 이름 중복"
    assert sorted(entries) == sorted(set(_source_entries())), "llms.txt 이름·주소 = 푸터 이름·주소"
