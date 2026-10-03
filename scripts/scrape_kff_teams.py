"""대한펜싱협회 팀 조회(https://fencing.sports.or.kr/team/teamSearchList) 목록을 전부 긁어 JSON으로 저장.

- 목록 페이지는 POST(pageNum=N)로 10개씩 내려온다. 빈 페이지가 나올 때까지 반복.
- 서버 부담을 줄이기 위해 요청 사이에 0.5초 쉰다.
- 출력: data/kff_teams_raw.json  (번호/구분/부별/팀명/시도/전화/인원/협회 팀코드)
사용: python scripts/scrape_kff_teams.py
"""
import html, json, re, sys, time, urllib.parse, urllib.request

URL = "https://fencing.sports.or.kr/team/teamSearchList"
ROW = re.compile(r"<tr>\s*<td>(\d+)</td>\s*<td>(.*?)</td>\s*<td>(.*?)</td>\s*<td>(.*?)</td>\s*<td>(.*?)</td>\s*<td>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*</tr>", re.S)
CODE = re.compile(r"(?:proOpenLayer|amaOpenLayer)\('([A-Z0-9]+)'\)")
TAG = re.compile(r"<[^>]+>")


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(TAG.sub("", s))).strip()


def fetch(page: int) -> str:
    data = urllib.parse.urlencode({"pageNum": page}).encode()
    req = urllib.request.Request(URL, data=data, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


def parse(page_html: str):
    out = []
    for m in ROW.finditer(page_html):
        no, kind, part, name_cell, sido, phone, members = m.groups()
        code = CODE.search(name_cell)
        out.append({
            "no": int(no), "kind": clean(kind), "part": clean(part), "name": clean(name_cell),
            "sido": clean(sido), "phone": clean(phone),
            "members": int(re.sub(r"\D", "", members) or 0),
            "kff_code": code.group(1) if code else None,
        })
    return out


def main():
    rows, page, seen = [], 1, set()
    while True:
        got = parse(fetch(page))
        new = [r for r in got if r["no"] not in seen]
        if not new:
            break
        for r in new:
            seen.add(r["no"])
        rows += new
        print(f"page {page}: +{len(new)} (total {len(rows)})", file=sys.stderr)
        page += 1
        time.sleep(0.5)
    rows.sort(key=lambda r: r["no"])
    with open("data/kff_teams_raw.json", "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    print(f"saved {len(rows)} teams")


if __name__ == "__main__":
    main()
