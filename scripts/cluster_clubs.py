"""협회 팀 목록(data/kff_teams_raw.json)을 '같은 클럽'끼리 묶는 알고리즘.

같은 클럽이 부별/구분(전문·동호인)마다, 또 표기만 조금 다르게("베스트 펜싱 클럽" / "베스트펜싱클럽") 여러 번 등록되어 있다.
단, 전화번호만 같다고 같은 클럽은 아니다(한 운영자가 여러 클럽을 운영: 목동펜싱클럽 vs 하이브 펜싱클럽).
그래서 '이름 유사도'를 반드시 요구하고, 시/도와 전화번호는 보조 근거로 쓴다. (Union-Find 로 묶음)

[1] 이름 정규화(core): 소문자화 → 괄호 안 내용 제거 → 공백/특수문자 제거 → 부별 단어(초등부 등) 제거
[2] 묶는 규칙 (1단계: 시/도가 있는 팀끼리 — 시/도는 반드시 같아야 함)
    A. core 가 완전히 같음 (전화번호가 달라도 같은 시/도의 같은 이름이면 동일 클럽으로 본다.
       단 번호가 하나도 겹치지 않으면 confidence='medium' 으로 표시해 사람이 확인할 수 있게 함)
       예: 베스트 펜싱 클럽 = 베스트펜싱클럽, 고려대학교펜싱부(번호 2개)
    B. 전화번호가 같고 core 가 서로 포함/매우 유사(Dice>=0.8)              (예: 하이브 펜싱클럽 ⊂ 하이브 펜싱클럽 목동)
    ※ 전화번호만 같고 이름이 다르면 묶지 않는다 (목동펜싱클럽 ≠ 하이브 펜싱클럽)
    ※ 이름 괄호 속 지역("윤남진펜싱클럽(서울)")처럼 시/도가 다르면 같은 이름이어도 다른 클럽
[3] 2단계: 시/도가 비어 있는 팀(동호인 등록 다수)은 같은 이름(또는 같은 번호+유사 이름)의 클럽이
    '딱 하나'일 때만 그 클럽에 흡수한다. 후보가 여러 개면(서로 다른 시/도의 동명 클럽) 임의로 고르지 않고
    번호가 일치하는 클럽이 있으면 그쪽, 없으면 독립 클럽으로 남긴다. (시/도 다른 클럽끼리 다리 놓는 병합 방지)
출력: data/clubs.json (클럽 + 소속 팀 코드), data/clubs_review.json (사람이 확인할 후보)
사용: python scripts/cluster_clubs.py
"""
import collections, json, re, sys

PARTS = ["초등부", "중등부", "고등부", "대학부", "일반부", "실업"]


def core_name(name: str) -> str:
    s = name.lower()
    s = re.sub(r"\([^)]*\)|\[[^\]]*\]", "", s)      # 괄호 안(영문명 등) 제거
    for p in PARTS:
        s = s.replace(p, "")
    return re.sub(r"[^0-9a-z가-힣]", "", s)          # 공백·특수문자 제거


def digits(p: str) -> str:
    return re.sub(r"\D", "", p)


def bigrams(s: str):
    return collections.Counter(s[i:i + 2] for i in range(len(s) - 1))


def dice(a: str, b: str) -> float:
    A, B = bigrams(a), bigrams(b)
    if not A or not B:
        return 0.0
    return 2 * sum((A & B).values()) / (sum(A.values()) + sum(B.values()))


def similar(a: str, b: str) -> bool:
    if a == b:
        return True
    short, long_ = sorted((a, b), key=len)
    if len(short) >= 4 and short in long_:
        return True
    return dice(a, b) >= 0.8


def sido_ok(a: str, b: str) -> bool:
    return not a or not b or a == b


class UF:
    def __init__(self, n): self.p = list(range(n))
    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]; x = self.p[x]
        return x
    def union(self, a, b): self.p[self.find(a)] = self.find(b)


def main():
    teams = json.load(open("data/kff_teams_raw.json", encoding="utf-8"))
    for t in teams:
        t["phone"] = t["phone"].replace("|", "").strip()   # 원본에 '|' 가 섞인 번호가 있음
        t["core"], t["tel"] = core_name(t["name"]), digits(t["phone"])
    n, uf = len(teams), UF(len(teams))
    review = set()

    strict = [i for i, t in enumerate(teams) if t["sido"]]
    blank = [i for i, t in enumerate(teams) if not t["sido"]]

    # ---- 1단계: 시/도가 있는 팀끼리 ----
    by_sido_core = collections.defaultdict(list)
    by_sido_tel = collections.defaultdict(list)
    for i in strict:
        t = teams[i]
        by_sido_core[(t["sido"], t["core"])].append(i)
        if t["tel"]:
            by_sido_tel[(t["sido"], t["tel"])].append(i)
    for idxs in by_sido_core.values():          # 규칙 A
        for i in idxs[1:]:
            uf.union(idxs[0], i)
    for (_, _), idxs in by_sido_tel.items():    # 규칙 B
        cores = sorted({teams[i]["core"] for i in idxs})
        for x in range(len(cores)):
            for y in range(x + 1, len(cores)):
                if similar(cores[x], cores[y]):
                    ia = next(i for i in idxs if teams[i]["core"] == cores[x])
                    ib = next(i for i in idxs if teams[i]["core"] == cores[y])
                    uf.union(ia, ib)

    # ---- 2단계: 시/도 빈 팀 흡수 ----
    core_roots = collections.defaultdict(set)    # core -> 그 이름을 쓰는 클럽(root) 집합
    tel_roots = collections.defaultdict(set)
    for i in strict:
        core_roots[teams[i]["core"]].add(uf.find(i))
        if teams[i]["tel"]:
            tel_roots[teams[i]["tel"]].add(uf.find(i))
    leftovers = []
    for i in blank:
        t = teams[i]
        cands = set(core_roots.get(t["core"], ()))
        if not cands and t["tel"]:   # 이름이 완전히 같지 않으면 같은 번호 + 유사한 이름
            cands = {r for r in tel_roots.get(t["tel"], ()) if any(
                similar(t["core"], teams[k]["core"]) for k in strict if uf.find(k) == r)}
        if len(cands) > 1 and t["tel"]:
            same_tel = {r for r in cands if any(teams[k]["tel"] == t["tel"] for k in strict if uf.find(k) == r)}
            if len(same_tel) == 1:
                cands = same_tel
        if len(cands) == 1:
            uf.union(i, next(iter(cands)))
        else:
            leftovers.append(i)
            if len(cands) > 1:
                review.add((t["core"], "(시/도 없음)"))
    # 남은 시/도 빈 팀끼리: 이름이 같으면 한 클럽
    first = {}
    for i in leftovers:
        c = teams[i]["core"]
        if c in first:
            uf.union(first[c], i)
        else:
            first[c] = i

    groups = collections.defaultdict(list)
    for i in range(n):
        groups[uf.find(i)].append(i)

    clubs = []
    for cid, idxs in enumerate(sorted(groups.values(), key=lambda g: min(teams[i]["no"] for i in g)), start=1):
        ts = [teams[i] for i in idxs]
        # 대표 이름: 가장 많이 쓰인 표기(동률이면 짧은 것). 시/도·전화는 비어 있지 않은 값 중 최빈값
        name = sorted(collections.Counter(t["name"] for t in ts).items(), key=lambda kv: (-kv[1], len(kv[0])))[0][0]
        pick = lambda key: (collections.Counter(t[key] for t in ts if t[key]).most_common(1) or [("", 0)])[0][0]
        tels = sorted({t["tel"] for t in ts if t["tel"]})
        # 같은 클럽으로 묶였지만 번호가 서로 겹치지 않는 팀이 섞여 있으면 사람이 확인하도록 medium
        by_tel = collections.defaultdict(set)
        for t in ts:
            by_tel[t["tel"]].add(t["core"])
        medium = len({t["core"] for t in ts}) == 1 and len(tels) > 1
        clubs.append({
            "id": cid, "name": name, "sido": pick("sido"), "phone": pick("phone"),
            "phones": tels, "confidence": "medium" if medium else "high",
            "aliases": sorted({t["name"] for t in ts} - {name}),
            "teams": [{k: t[k] for k in ("kff_code", "no", "kind", "part", "name", "sido", "phone", "members")} for t in ts],
        })

    json.dump(clubs, open("data/clubs.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    rv = [{"club_id": c["id"], "name": c["name"], "sido": c["sido"], "phones": c["phones"]} for c in clubs if c["confidence"] == "medium"]
    rv += [{"core": core, "note": "시/도 없는 팀이 여러 클럽 후보와 일치 — 독립 클럽으로 남김"} for core, tag in sorted(review) if tag == "(시/도 없음)"]
    json.dump(rv, open("data/clubs_review.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"팀 {n}개 → 클럽 {len(clubs)}개 / 확인 필요 후보 {len(rv)}건")


if __name__ == "__main__":
    main()
