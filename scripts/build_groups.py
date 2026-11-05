#!/usr/bin/env python3
"""
Figures for groups of councils (release 1.2): the UK, the four nations, the nine English regions and the city regions
(England's combined authorities and the city regions of Wales, Scotland and Northern Ireland, in scripts/city_regions.json).

Run last, after build_uk.py, build_measures.py and build_census.py:

    python3 scripts/build_groups.py --els ../explore-local-statistics-data

For each group and measure, the figure is, in order of preference:
  1. the official figure published for that group (ONS Explore Local Statistics publishes many measures for the UK,
     nations, regions and combined authorities);
  2. worked out exactly from its councils: totals added up (population, area), census shares from the counts behind
     them, age shares from the people in each age group;
  3. otherwise an estimate: the average of its councils, weighted by the number of people the measure is about
     (children for child poverty, people aged 16 to 64 for work, everyone for the rest). Medians (pay, house prices)
     and deprivation shares can only be estimated this way. These are marked "est" and shown with ≈ on the site.

Writes groups.json, and adds "city" (the city region an area is in) to each row of areas.json.
"""
import argparse, csv, json, os, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import build_measures as BM   # noqa: E402
import build_census as BC     # noqa: E402

CHILD_W = {"child_pov_ahc", "child_pov_bhc", "child_obese", "ks2_rwm", "gcse_em", "early_years"}
# per-person measures counted from every council: the population-weighted average is the exact figure for the group
EXACT_PER_PERSON = {"ch_per1k", "ch_inc_pc"}
WORK_W = {"claimant_rate", "employment_rate", "inactive", "unemployment", "job_density", "level3", "no_quals", "weekly_pay", "apprentices"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--els", required=True)
    ap.add_argument("--out", default=ROOT)
    a = ap.parse_args()
    rows = json.load(open(os.path.join(a.out, "areas.json")))
    by = {r["iso3"]: r for r in rows}
    byname = {r["name"]: r for r in rows}
    ts = json.load(open(os.path.join(a.out, "timeseries.json")))
    counts = json.load(open(os.path.join(ROOT, "scripts", ".cache", "census_counts.json")))
    cdef = json.load(open(os.path.join(ROOT, "scripts", "city_regions.json")))["regions"]

    # ---------- the groups ----------
    groups = [{"id": "uk", "kind": "uk", "name": "United Kingdom", "code": "K02000001", "members": [r["iso3"] for r in rows]}]
    ncode = {"England": "E92000001", "Wales": "W92000004", "Scotland": "S92000003", "Northern Ireland": "N92000002"}
    for n, c in ncode.items():
        groups.append({"id": "n:" + n, "kind": "nation", "name": n, "code": c, "members": [r["iso3"] for r in rows if r["nation"] == n]})
    for reg in BM_REGIONS(rows):
        groups.append({"id": "r:" + reg, "kind": "region", "name": reg, "elsName": reg, "nation": "England", "members": [r["iso3"] for r in rows if r["region"] == reg]})
    for c in cdef:
        mem = []
        for m in c["members"]:
            if m.startswith("@region:"):
                mem += [r["iso3"] for r in rows if r["region"] == m[8:]]
            elif m in byname:
                mem.append(byname[m]["iso3"])
            else:
                raise SystemExit(f"{c['name']}: no council called {m!r}")
        groups.append({"id": "c:" + c["name"], "kind": "city", "name": c["name"], "elsName": c.get("els", c["name"]), "elsCode": c.get("elsCode"), "nation": c["nation"], "members": mem})
        for code in mem:
            by[code]["city"] = c["name"]

    # ---------- official figures from ONS Explore Local Statistics ----------
    want = {}   # (folder, indicator) -> key
    for m in BM.M:
        for folder, ind in m["src"]:
            want[(folder, ind)] = m["key"]
    for ind, key in {"Population count": "population", "Median age": "median_age"}.items():
        want[("population-indicators", ind)] = key
    gcode = {}   # ONS code -> group id
    for g in groups:
        if g.get("code"):
            gcode[g["code"]] = g["id"]
    official = defaultdict(dict)    # group id -> key -> (period, value)
    folders = sorted({f for f, _ in want})
    for folder in folders:
        with open(os.path.join(a.els, folder, folder + ".csv"), encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                key = want.get((folder, r["indicator"]))
                if not key or r.get("sex", "All") not in ("All", ""):
                    continue
                gid = gcode.get(r["areacd"])
                if not gid:
                    if r["geography"] == "Region":
                        gid = next((g["id"] for g in groups if g["kind"] == "region" and g["elsName"] == r["areanm"]), None)
                    elif r["geography"] == "Combined Authority or City Region":
                        gid = next((g["id"] for g in groups if g["kind"] == "city" and g["elsName"] == r["areanm"] and (not g["elsCode"] or g["elsCode"] == r["areacd"])), None)
                if not gid:
                    continue
                try:
                    v = float(r["observation"])
                except ValueError:
                    continue
                old = official[gid].get(key)
                if not old or r["period"] > old[0]:
                    official[gid][key] = (r["period"], v)

    # a city region that is exactly a region (Greater London) takes the region's official figures too
    for g in groups:
        if g["kind"] == "city":
            twin = next((x for x in groups if x["kind"] == "region" and set(x["members"]) == set(g["members"])), None)
            if twin:
                official[g["id"]] = {**official.get(twin["id"], {}), **official.get(g["id"], {})}

    # ---------- every measure, for every group ----------
    numeric = sorted({k for r in rows for k, v in r.items() if isinstance(v, (int, float)) and not k.endswith("_year") and k not in ("latlng", "sc_n")})
    years = ts["years"]
    pop_ts = ts["series"].get("population", {})

    def weight(key, r):
        p = r.get("population") or 0
        if key in CHILD_W:
            return p * (r.get("pct_0_15") or 0) / 100
        if key in WORK_W:
            return p * (r.get("pct_16_64") or 0) / 100
        return p

    out = []
    for g in groups:
        mem = [by[c] for c in g["members"] if c in by]
        v, est, src = {}, [], {}
        pop = sum(r.get("population") or 0 for r in mem)
        area = sum(r.get("area_km2") or 0 for r in mem)
        v["population"], v["area_km2"] = pop, round(area, 1)
        v["density"] = round(pop / area, 1) if area else None
        for k in ("pct_0_15", "pct_16_64", "pct_65plus"):
            v[k] = round(sum((r.get("population") or 0) * (r.get(k) or 0) for r in mem) / pop, 2) if pop else None
        # population change, from the yearly totals
        tot = [sum((pop_ts.get(r["iso3"]) or [None] * len(years))[i] or 0 for r in mem) for i in range(len(years))]
        i25, i15 = years.index(2025), years.index(2015)
        if tot[i15]:
            v["pop_change_10y"] = round((tot[i25] / tot[i15] - 1) * 100, 1)
        if tot[i25 - 1]:
            v["pop_growth"] = round((tot[i25] / tot[i25 - 1] - 1) * 100, 2)
        for k in numeric:
            if k in v or k in ("population", "area_km2"):
                continue
            if k in official.get(g["id"], {}):
                v[k] = BM.rnd(official[g["id"]][k][1])
                src[k] = "official"
            elif k in counts:
                cs = [counts[k][c] for c in g["members"] if c in counts[k]]
                if cs and len(cs) == len([c for c in g["members"] if by[c].get(k) is not None]):
                    v[k] = round(100 * sum(x[0] for x in cs) / sum(x[1] for x in cs), 1)
            else:
                ws = [(weight(k, r), r[k]) for r in mem if r.get(k) is not None]
                wsum = sum(w for w, _ in ws)
                # an estimate only if the councils with figures hold most of the group's people
                if ws and wsum and wsum >= 0.8 * sum(weight(k, r) for r in mem):
                    v[k] = BM.rnd(sum(w * x for w, x in ws) / wsum)
                    if k not in EXACT_PER_PERSON:
                        est.append(k)
        v = {k: x for k, x in v.items() if x is not None}
        out.append({**{x: g[x] for x in ("id", "kind", "name") if x in g}, "nation": g.get("nation"), "members": g["members"], "v": v, "est": sorted(est)})
        print(f"{g['id']:52} {len(g['members']):3} councils  {len(v):3} measures  {sum(1 for k in src):3} official  {len(est):3} estimated")

    with open(os.path.join(a.out, "groups.json"), "w") as f:
        json.dump({"groups": out}, f, separators=(",", ":"), ensure_ascii=False)
    with open(os.path.join(a.out, "areas.json"), "w") as f:
        json.dump(rows, f, separators=(",", ":"))


def BM_REGIONS(rows):
    order = ["North East", "North West", "Yorkshire and The Humber", "East Midlands", "West Midlands", "East of England", "London", "South East", "South West"]
    have = {r["region"] for r in rows}
    return [r for r in order if r in have]


if __name__ == "__main__":
    main()
