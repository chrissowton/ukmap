#!/usr/bin/env python3
"""
Neighbourhoods for Which Places? (release 1.3): every small area in the UK, with its population, deprivation and census figures,
one map file per council (loaded only when you zoom in), and a postcode finder.

  England and Wales: Lower layer Super Output Areas (LSOAs, 2021)   35,672
  Scotland:          data zones (2022)                               7,392
  Northern Ireland:  data zones (2021)                               3,780

    python3 scripts/build_small.py --lsoa lsoa21_bgc.geojson --dz22 SG_DataZone_Bdry_2022.shp --dz21 DZ2021.geojson \
        --sape-ew sapelsoasyoa20222024.xlsx --sape-s "SAPE 2024.xlsx" --imd ../IMD --geographr ../geographr \
        --ew ../census21/englandAndWales --scot Datazone2022.zip

Inputs (not kept in this repository; see DATA-SOURCES.md):
  --lsoa       LSOA (December 2021) Boundaries EW BGC, GeoJSON (ONS Open Geography Portal)
  --dz22       Data Zone 2022 boundaries, shapefile (Scottish Government, spatialdata.gov.scot)
  --dz21       Data Zone 2021 boundaries, GeoJSON (NISRA)
  --sape-ew    LSOA population estimates by single year of age, mid-2022 to mid-2024 (ONS)
  --sape-s     Small area population estimates, 2022 data zones, mid-2024 (NRS)
  --mye-ni     Mid-year population estimates for data zones, mid-2024 (NISRA, MYE24_DZ.xlsx): totals only
  --imd        the IMD package (https://github.com/humaniverse/IMD): small-area deprivation for each nation
  --geographr  the geographr package (https://github.com/humaniverse/geographr): the ONS Postcode Directory (February 2025) and LSOA lookups
  --ew, --scot census tables, as for build_census.py

Writes:
  nb/<council code>.json   the council's neighbourhoods (TopoJSON), each with its figures
  nb/index.json            what the figures are, and how many neighbourhoods each nation has (for ranks)
  pc/<postcode district>.json   postcode -> neighbourhood code, one file per postcode district (for example pc/LS6.json)
"""
import argparse, csv, io, json, os, re, shutil, subprocess, sys, tempfile, zipfile
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import build_census as BC   # noqa: E402

ALIAS = {"E08000038": "E08000016", "E08000039": "E08000019"}
DOMAINS = [("d", "IMD"), ("di", "Income"), ("de", "Employment"), ("dh", "Health"), ("dd", "Education")]
INDEX = {"E": "English Indices of Deprivation 2025", "W": "Welsh Index of Multiple Deprivation 2025",
         "S": "Scottish Index of Multiple Deprivation 2020v2", "N": "Northern Ireland Multiple Deprivation Measure 2017"}


def rda(path, name):
    import pyreadr
    return next(iter(pyreadr.read_r(os.path.join(path, "data", name + ".rda")).values()))


def ages(row_vals):
    """Single years 0..90 -> (total, % 0-15, % 65+, median age)."""
    t = sum(row_vals)
    if not t:
        return 0, None, None, None
    c, med = 0, None
    for a, v in enumerate(row_vals):
        c += v
        if med is None and c >= t / 2:
            med = a
    return t, round(100 * sum(row_vals[:16]) / t, 1), round(100 * sum(row_vals[65:]) / t, 1), med


def main():
    ap = argparse.ArgumentParser()
    for k in ("lsoa", "dz22", "dz21", "sape-ew", "sape-s", "imd", "geographr", "ew", "scot"):
        ap.add_argument("--" + k, required=True)
    ap.add_argument("--mye-ni", help="NISRA mid-year estimates for data zones (MYE24_DZ.xlsx): population totals")
    ap.add_argument("--out", default=ROOT)
    a = ap.parse_args()
    import pandas as pd

    areas = {r["iso3"]: r for r in json.load(open(os.path.join(a.out, "areas.json")))}
    tmp = tempfile.mkdtemp()
    feats, props = [], {}

    # ---------- boundaries, and the council each neighbourhood is in ----------
    lk = rda(a.geographr, "lookup_lsoa21_ward24_ltla24")
    lsoa_la = {c: ALIAS.get(l, l) for c, l in zip(lk.lsoa21_code, lk.ltla24_code)}
    for f in json.load(open(a.lsoa))["features"]:
        p = f["properties"]
        props[p["LSOA21CD"]] = {"c": p["LSOA21CD"], "n": p["LSOA21NM"], "la": lsoa_la.get(p["LSOA21CD"])}
        feats.append({"type": "Feature", "properties": {"c": p["LSOA21CD"]}, "geometry": f["geometry"]})
    print("LSOAs", len(feats))
    # Scotland: British National Grid -> longitude and latitude (mapshaper reads the .prj)
    sg = os.path.join(tmp, "dz22.json")
    subprocess.run(["npx", "--no-install", "mapshaper", "-i", a.dz22, "-proj", "wgs84", "-o", sg, "format=geojson"], check=True, capture_output=True)
    sape = pd.read_excel(a.sape_s, sheet_name=-1, header=None)
    hr = sape.index[sape.iloc[:, 0].astype(str) == "Data zone code"][0]
    sape.columns = [str(c) for c in sape.iloc[hr]]
    sape = sape.iloc[hr + 1:]
    dz_la = dict(zip(sape["Data zone code"], sape["Council area code"]))
    n0 = len(feats)
    for f in json.load(open(sg))["features"]:
        p = f["properties"]
        props[p["dzcode"]] = {"c": p["dzcode"], "n": p["dzname"], "la": dz_la.get(p["dzcode"])}
        feats.append({"type": "Feature", "properties": {"c": p["dzcode"]}, "geometry": f["geometry"]})
    print("Scottish data zones", len(feats) - n0)
    n0 = len(feats)
    for f in json.load(open(a.dz21))["features"]:
        p = f["properties"]
        props[p["DZ2021_cd"]] = {"c": p["DZ2021_cd"], "n": p["DZ2021_nm"].replace("_", " "), "la": p["LGD2014_cd"]}
        feats.append({"type": "Feature", "properties": {"c": p["DZ2021_cd"]}, "geometry": f["geometry"]})
    print("NI data zones", len(feats) - n0)
    bad = [c for c, p in props.items() if p["la"] not in areas]
    if bad:
        raise SystemExit(f"{len(bad)} neighbourhoods with no council, e.g. {bad[:5]}")

    # ---------- population and age ----------
    x = pd.ExcelFile(a.sape_ew)
    sh = [s for s in x.sheet_names if s.startswith("Mid-")][-1]
    d = pd.read_excel(x, sh, header=None)
    h = d.index[d.iloc[:, 2].astype(str) == "LSOA 2021 Code"][0]
    d.columns = [str(c) for c in d.iloc[h]]
    d = d.iloc[h + 1:]
    fcols, mcols = [f"F{i}" for i in range(91)], [f"M{i}" for i in range(91)]
    for code, *vals in zip(d["LSOA 2021 Code"], *[d[c] for c in fcols + mcols]):
        if code in props:
            sy = [float(vals[i]) + float(vals[i + 91]) for i in range(91)]
            t, a0, a65, med = ages(sy)
            props[code].update(p=int(round(t)), a0=a0, a65=a65, ma=med)
    pop_year_ew = int(re.search(r"\d{4}", sh).group())
    s2 = sape[sape["Sex"] == "Persons"]
    acols = [f"Age {i}" for i in range(90)] + ["Age 90 and over"]
    for code, *vals in zip(s2["Data zone code"], *[s2[c] for c in acols]):
        if code in props:
            t, a0, a65, med = ages([float(v) for v in vals])
            props[code].update(p=int(round(t)), a0=a0, a65=a65, ma=med)
    if a.mye_ni:
        d = pd.read_excel(a.mye_ni, "Flat")
        d = d[d["Year"] == d["Year"].max()]
        for code, v in zip(d["Area_Code"], d["MYE"]):
            if code in props:
                props[code]["p"] = int(v)
        print("Northern Ireland data zones: population mid-%d" % d["Year"].max())
    print("population: E&W mid-%d, Scotland mid-2024" % pop_year_ew)

    # ---------- deprivation ----------
    for name, col in (("imd2025_england_lsoa21", "lsoa21_code"), ("imd2025_wales_lsoa21", "lsoa21_code")):
        t = rda(a.imd, name)
        for r in t.to_dict("records"):
            c = r[col]
            if c in props:
                for k, dom in DOMAINS:
                    if r.get(dom + "_decile") == r.get(dom + "_decile"):
                        props[c][k] = int(r[dom + "_decile"])
                props[c]["dr"] = int(r["IMD_rank"])
    # Scotland and Northern Ireland: the indices use older small areas, so each new one takes the deprivation of the old one
    # that most of its postcodes were in (from the ONS Postcode Directory).
    pcd = rda(a.geographr, "lookup_postcode_oa_lsoa_msoa_ltla_2025")
    pairs_s, pairs_n = Counter(), Counter()
    for new, old, oa in zip(pcd.lsoa21_code, pcd.lsoa11_code, pcd.oa21_code):
        if isinstance(new, str) and new.startswith("S01") and isinstance(old, str):
            pairs_s[(new, old)] += 1
        elif isinstance(oa, str) and oa.startswith("N20") and isinstance(old, str):
            pairs_n[(oa, old)] += 1
    best = {}
    for (new, old), n in list(pairs_s.items()) + list(pairs_n.items()):
        if new not in best or n > best[new][1]:
            best[new] = (old, n)
    for name, col in (("imd2020_scotland_dz11", "dz11_code"), ("imd2017_northern_ireland_soa01", "soa01_code")):
        t = {r[col]: r for r in rda(a.imd, name).to_dict("records")}
        for c, p in props.items():
            if c[0] in ("S", "N") and c in best and best[c][0] in t:
                r = t[best[c][0]]
                for k, dom in DOMAINS:
                    if r.get(dom + "_decile") == r.get(dom + "_decile"):
                        p[k] = int(r[dom + "_decile"])
                p["dr"] = int(r["IMD_rank"])
    print("deprivation:", Counter(c[0] for c, p in props.items() if "d" in p))

    # ---------- census ----------
    import pandas as pd  # noqa: F811
    z = zipfile.ZipFile(a.scot)
    ew_cache, s_cache = {}, {}
    ckeys = []
    for m in BC.C:
        n = 0
        if "ew" in m:
            t, num, den = m["ew"]
            if t not in ew_cache:
                dd = pd.read_parquet(os.path.join(a.ew, t + ".parquet"))
                dd = dd[dd.geography == "LSOA"]
                cc = defaultdict(dict)
                for code, cat, v in zip(dd.code, dd.category, dd.value):
                    try:
                        cc[code][int(cat)] = int(v)
                    except (TypeError, ValueError):
                        pass
                ew_cache[t] = cc
            for code, cats in ew_cache[t].items():
                if code in props:
                    dn = sum(v for c, v in cats.items() if c not in (-8, -9) and (den is BC.ALL or c in den))
                    if dn:
                        props[code][m["key"]] = round(100 * sum(cats.get(c, 0) for c in num) / dn, 1)
                        n += 1
        if "scot" in m:
            t, num, den = m["scot"]
            if t not in s_cache:
                s_cache[t] = BC.read_scot(z, t, {c: c for c in props if c.startswith("S01")})
            for code, cats in s_cache[t].items():
                if code in props and cats.get(BC.norm(den)):
                    dn = cats[BC.norm(den)]
                    nm = sum(-cats[BC.norm(l[1:])] if l.startswith("-") else cats[BC.norm(l)] for l in num)
                    if any(l.startswith("-") for l in num):
                        nm += dn
                    props[code][m["key"]] = round(100 * nm / dn, 1)
                    n += 1
        if n:
            ckeys.append(m["key"])
        print(f"census {m['key']:16} {n:6} neighbourhoods")

    # ---------- map files, one per council ----------
    for f in feats:
        p = props[f["properties"]["c"]]
        f["properties"] = {k: v for k, v in p.items() if v is not None}
    allp = os.path.join(tmp, "all.json")
    with open(allp, "w") as fh:
        json.dump({"type": "FeatureCollection", "features": feats}, fh)
    outdir = os.path.join(a.out, "nb")
    shutil.rmtree(outdir, ignore_errors=True)
    os.makedirs(outdir)
    split = os.path.join(tmp, "split")
    os.makedirs(split)
    subprocess.run(["npx", "--no-install", "mapshaper", "-i", allp, "-rename-layers", "nb",
                    "-simplify", "15%", "weighted", "keep-shapes", "-split", "la", "-o", split + "/", "format=topojson", "quantization=100000", "singles"],
                   check=True, env={**os.environ, "NODE_OPTIONS": "--max-old-space-size=8000"})
    for fn in os.listdir(split):
        code = re.search(r"([ENSW]\d{8})", fn).group(1)
        shutil.move(os.path.join(split, fn), os.path.join(outdir, code + ".json"))
    print("map files:", len(os.listdir(outdir)))

    nat = Counter(c[0] for c in props)
    deps = Counter(c[0] for c, p in props.items() if "dr" in p)
    # how many small areas each index ranks (the rank's "out of")
    ranked = {"E": 33755, "W": 1917, "S": 6976, "N": 890}
    meta = {
        "count": dict(nat), "withDeprivation": dict(deps), "popYear": {"E": pop_year_ew, "W": pop_year_ew, "S": 2024, "N": 2024},
        "index": INDEX, "ranked": ranked, "census": ckeys,
        "names": {"E": "LSOA", "W": "LSOA", "S": "data zone", "N": "data zone"},
    }
    with open(os.path.join(outdir, "index.json"), "w") as fh:
        json.dump(meta, fh)

    # ---------- postcodes: one file per postcode district ----------
    pdir = os.path.join(a.out, "pc")
    shutil.rmtree(pdir, ignore_errors=True)
    os.makedirs(pdir)
    by = defaultdict(dict)
    for pc, l21, oa in zip(pcd.postcode, pcd.lsoa21_code, pcd.oa21_code):
        code = oa if isinstance(oa, str) and oa.startswith("N20") else l21
        if not isinstance(code, str) or code not in props:
            continue
        pc = pc.replace(" ", "").upper()
        by[pc[:-3]][pc[-3:]] = code
    for dist, units in by.items():
        codes = sorted(set(units.values()))
        ix = {c: i for i, c in enumerate(codes)}
        # c: [neighbourhood code, council code]; u: the last three characters of each postcode -> its place in c
        with open(os.path.join(pdir, dist + ".json"), "w") as fh:
            json.dump({"c": [[c, props[c]["la"]] for c in codes], "u": {u: ix[c] for u, c in units.items()}}, fh, separators=(",", ":"))
    print("postcode districts:", len(by), "postcodes:", sum(len(u) for u in by.values()))
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
