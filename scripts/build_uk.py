#!/usr/bin/env python3
"""
Builds the data for Which Places? (release 1.0: the 361 local authorities).

Inputs (none of them are kept in this repository; see DATA-SOURCES.md):
  --els        a copy of https://github.com/ONSdigital/explore-local-statistics-data
               (ONS, Open Government Licence)
  --geographr  a copy of https://github.com/humaniverse/geographr
               (boundaries and lookups from the ONS Open Geography Portal, Open Government Licence)

    pip install pyreadr rdata shapely
    python3 scripts/build_uk.py --els ../explore-local-statistics-data --geographr ../geographr

Writes, into the site folder:
  areas.geo.json   the map (local authority boundaries, turned into areas.topo.json by mapshaper, see below)
  areas.json       one row per local authority: code, name, nation, region, latest figures
  timeseries.json  every yearly measure, 1991 onwards (same format as the world site)
  pyramids.json    population pyramids every 5 years, 1991-2025

Then make the small map file:
    npx mapshaper areas.geo.json -rename-layers areas -o format=topojson id-field=code quantization=100000 areas.topo.json
"""
import argparse, csv, json, math, os, sys, warnings
from collections import defaultdict

warnings.filterwarnings("ignore")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

NATIONS = {"E": "England", "W": "Wales", "S": "Scotland", "N": "Northern Ireland"}
# ONS calls the East of England region "East of England"; ITL1 regions = 9 English regions + 3 nations
REGION_ORDER = ["North East", "North West", "Yorkshire and The Humber", "East Midlands", "West Midlands",
                "East of England", "London", "South East", "South West", "Wales", "Scotland", "Northern Ireland"]

# Measures taken from ONS's population indicators: ONS indicator name -> our key
POP_INDICATORS = {
    "Population count": "population",
    "Population density": "density",
    "Median age": "median_age",
    "Percentage of the population aged 0 to 15": "pct_0_15",
    "Percentage of the population aged 16 to 64": "pct_16_64",
    "Percentage of the population aged 65+": "pct_65plus",
}
LA_PREFIXES = ("E06", "E07", "E08", "E09", "W06", "S12", "N09")


def read_rda(path, name):
    """Read an R data file. Boundaries (sf objects) need the 'rdata' reader; plain tables use pyreadr."""
    import rdata
    parsed = rdata.parser.parse_file(path)
    return rdata.conversion.convert(parsed)[name]


def ring_area_lonlat(ring):
    """Area of a lon/lat ring in km² (spherical approximation, good to well under 1%)."""
    R = 6371.0088
    a = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        a += math.radians(x2 - x1) * (2 + math.sin(math.radians(y1)) + math.sin(math.radians(y2)))
    return abs(a * R * R / 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--els", required=True)
    ap.add_argument("--geographr", required=True)
    ap.add_argument("--out", default=ROOT)
    a = ap.parse_args()

    from shapely.geometry import shape

    # ---------- Boundaries ----------
    b = read_rda(os.path.join(a.geographr, "data", "boundaries_ltla24.rda"), "boundaries_ltla24")
    feats, info = [], {}
    for _, r in b.iterrows():
        polys = []
        for poly in r["geometry"]:
            rings = []
            for ring in poly:
                pts = [[round(float(x), 5), round(float(y), 5)] for x, y in ring]
                rings.append(pts)
            polys.append(rings)
        geom = {"type": "MultiPolygon", "coordinates": polys}
        code, name = str(r["ltla24_code"]), str(r["ltla24_name"])
        shp = shape(geom)
        c = shp.representative_point()
        area = sum(ring_area_lonlat(p[0]) - sum(ring_area_lonlat(h) for h in p[1:]) for p in polys)
        info[code] = {"name": name, "lat": round(c.y, 3), "lon": round(c.x, 3), "area": area}
        feats.append({"type": "Feature", "properties": {"code": code, "name": name}, "geometry": geom})
    with open(os.path.join(a.out, "areas.geo.json"), "w") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f)
    print("boundaries:", len(feats))

    # ---------- Regions ----------
    import pyreadr
    lk = pyreadr.read_r(os.path.join(a.geographr, "data", "lookup_ltla24_region24.rda"))
    lk = next(iter(lk.values()))
    region = {}
    for _, r in lk.iterrows():
        nm = str(r["region24_name"])
        region[str(r["ltla24_code"])] = "East of England" if nm in ("East", "East of England") else nm

    # ---------- Population indicators (ONS Explore Local Statistics) ----------
    path = os.path.join(a.els, "population-indicators", "population-indicators.csv")
    series = defaultdict(lambda: defaultdict(dict))   # key -> code -> year -> value
    bench = defaultdict(lambda: defaultdict(dict))    # key -> region/nation/UK code -> year -> value
    bench_names = {}
    with open(path, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            k = POP_INDICATORS.get(r["indicator"])
            if not k or r.get("sex", "All") not in ("All", ""):
                continue
            try:
                v = float(r["observation"])
            except ValueError:
                continue
            y = int(r["period"][:4])
            cd = r["areacd"]
            if cd.startswith(LA_PREFIXES):
                series[k][cd][y] = v
            elif r["geography"] in ("Region", "Nation", "Country"):
                bench[k][cd][y] = v
                bench_names[cd] = r["areanm"]

    years = list(range(1991, 2026))
    rows = []
    for code, inf in sorted(info.items()):
        nation = NATIONS[code[0]]
        row = {
            "iso3": code,          # the area's ONS code (the field keeps the world site's name)
            "code": code,
            "name": inf["name"],
            "nation": nation,
            "region": region.get(code, nation),
            "subregion": nation,
            "sovereign": True,
            "flag": "",
            "latlng": [inf["lat"], inf["lon"]],
            "area_km2": round(inf["area"], 1),
        }
        for k in POP_INDICATORS.values():
            s = series[k].get(code, {})
            if s:
                y = max(s)
                row[k] = int(round(s[y])) if k == "population" else round(s[y], 2)
                row[k + "_year"] = y
        # population change over 10 years, %
        p = series["population"].get(code, {})
        if 2025 in p and 2015 in p and p[2015]:
            row["pop_change_10y"] = round((p[2025] / p[2015] - 1) * 100, 1)
            row["pop_change_10y_year"] = 2025
        rows.append(row)

    missing = [r["code"] for r in rows if "population" not in r]
    if missing:
        print("WARNING: no population for", missing)
    with open(os.path.join(a.out, "areas.json"), "w") as f:
        json.dump(rows, f, separators=(",", ":"))
    print("areas:", len(rows), "nations:", {n: sum(r["nation"] == n for r in rows) for n in NATIONS.values()})

    # ---------- Time series ----------
    ts = {"years": years, "series": {}, "sparse": {}}
    for k in POP_INDICATORS.values():
        ts["series"][k] = {code: [series[k][code].get(y) for y in years] for code in info if code in series[k]}
    # yearly population growth, %
    pg = {}
    for code, s in series["population"].items():
        pg[code] = [round((s[y] / s[y - 1] - 1) * 100, 2) if s.get(y) and s.get(y - 1) else None for y in years]
    ts["series"]["pop_growth"] = pg
    with open(os.path.join(a.out, "timeseries.json"), "w") as f:
        json.dump(ts, f, separators=(",", ":"))

    # Benchmarks (regions, nations, UK) for later releases
    with open(os.path.join(a.out, "benchmarks.json"), "w") as f:
        json.dump({"names": bench_names, "years": years,
                   "series": {k: {cd: [s.get(y) for y in years] for cd, s in v.items()} for k, v in bench.items()}},
                  f, separators=(",", ":"))

    # ---------- Population pyramids ----------
    path = os.path.join(a.els, "population-by-age-and-sex", "population-by-age-and-sex.csv")
    bands = ["0 to 4", "5 to 9", "10 to 14", "15 to 19", "20 to 24", "25 to 29", "30 to 34", "35 to 39", "40 to 44",
             "45 to 49", "50 to 54", "55 to 59", "60 to 64", "65 to 69", "70 to 74", "75 to 79", "80 to 84", "85+"]
    keep_years = set(range(1991, 2026, 5)) | {2025}
    pyr = defaultdict(lambda: defaultdict(lambda: [None] * (2 * len(bands))))
    bi = {b: i for i, b in enumerate(bands)}
    with open(path, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            cd = r["areacd"]
            if not cd.startswith(LA_PREFIXES) or r["sex"] not in ("Male", "Female"):
                continue
            y = int(r["period"][:4])
            if y not in keep_years or r["age_band"] not in bi:
                continue
            try:
                v = round(float(r["observation"]), 2)
            except ValueError:
                continue
            pyr[cd][str(y)][bi[r["age_band"]] + (0 if r["sex"] == "Male" else len(bands))] = v
    ages = [b.replace(" to ", "–") for b in bands]
    with open(os.path.join(a.out, "pyramids.json"), "w") as f:
        json.dump({"ages": ages, "data": pyr}, f, separators=(",", ":"))
    print("pyramids:", len(pyr))


if __name__ == "__main__":
    main()
