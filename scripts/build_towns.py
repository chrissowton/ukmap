#!/usr/bin/env python3
"""
Towns and cities for Which Places? (release 1.4): England and Wales's built-up areas (ONS, 2022), each made of the
neighbourhoods (LSOAs) that best fit it. Built-up areas are the physical towns and cities, so "Leeds" here is the city,
not Leeds City Council's whole area. (London is split into its boroughs' built-up areas, as ONS does.)

Run after build_small.py and build_orgs.py:

    python3 scripts/build_towns.py --lookup LSOA_2021_to_Built_Up_Area_..._v2.csv

  --lookup   LSOA (2021) to Built-up Area to LAD to Region (December 2022) Best Fit Lookup in England and Wales (V2),
             ONS Open Geography Portal (Open Government Licence)

Figures are worked out from the neighbourhoods: people are added up; age shares, census shares are averages weighted by
each neighbourhood's population (so they are close estimates, marked ≈ on the site); the deprivation figure is the share
of its neighbourhoods in the most deprived 10% of the nation. Only towns of 5,000 people or more are kept.

Writes towns.json.
"""
import argparse, csv, glob, json, os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIN_POP = 5000


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lookup", required=True)
    ap.add_argument("--out", default=ROOT)
    a = ap.parse_args()
    props = {}
    for f in glob.glob(os.path.join(a.out, "nb", "[EW]*.json")):
        t = json.load(open(f))
        for g in list(t["objects"].values())[0]["geometries"]:
            props[g["properties"]["c"]] = g["properties"]
    meta = json.load(open(os.path.join(a.out, "nb", "index.json")))
    # charities and schools in each neighbourhood
    nch, nsc = defaultdict(int), defaultdict(int)
    for f in glob.glob(os.path.join(a.out, "org", "[EW]*.json")):
        d = json.load(open(f))
        for c in d["ch"]:
            if c[4]:
                nch[c[4]] += 1
        for s in d["sc"]:
            if s.get("k") == "school":
                nsc[s["nb"]] += 1
    towns = defaultdict(lambda: {"l": []})
    with open(a.lookup, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r["LSOA21CD"] in props and r["BUA22CD"]:
                t = towns[r["BUA22CD"]]
                t["n"] = r["BUA22NM"]
                t["l"].append(r["LSOA21CD"])
    out = []
    for code, t in towns.items():
        ps = [props[c] for c in t["l"]]
        pop = sum(p.get("p") or 0 for p in ps)
        if pop < MIN_POP:
            continue
        v = {"population": pop}
        w = lambda k: round(sum((p.get("p") or 0) * p[k] for p in ps if p.get(k) is not None) / max(1, sum(p.get("p") or 0 for p in ps if p.get(k) is not None)), 1)
        v["pct_0_15"], v["pct_65plus"] = w("a0"), w("a65")
        withd = [p for p in ps if p.get("d")]
        if withd:
            v["dep10"] = round(100 * sum(1 for p in withd if p["d"] == 1) / len(withd), 1)
            v["dep20"] = round(100 * sum(1 for p in withd if p["d"] <= 2) / len(withd), 1)
        for k in meta["census"]:
            if any(p.get(k) is not None for p in ps):
                v[k] = w(k)
        n = sum(nch[c] for c in t["l"])
        v["ch_n"], v["ch_per1k"] = n, round(1000 * n / pop, 2)
        v["sc_n"] = sum(nsc[c] for c in t["l"])
        las = sorted({p["la"] for p in ps})
        out.append({"c": code, "n": t["n"], "la": las, "l": sorted(t["l"]), "v": v})
    out.sort(key=lambda t: -t["v"]["population"])
    with open(os.path.join(a.out, "towns.json"), "w") as f:
        json.dump({"towns": out, "est": ["pct_0_15", "pct_65plus"] + meta["census"]}, f, separators=(",", ":"), ensure_ascii=False)
    print("towns and cities of 5,000+ people:", len(out), "largest:", [(t["n"], t["v"]["population"]) for t in out[:5]])


if __name__ == "__main__":
    main()
