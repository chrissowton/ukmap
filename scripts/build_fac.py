#!/usr/bin/env python3
"""
Services and facilities for Which Places? (release 1.7): GP practices, pharmacies and food banks, plus (when given)
places from OpenStreetMap such as leisure centres, community centres and libraries. Each is placed in the neighbourhood
its postcode (or map point) is in; no contact details are kept.

    python3 scripts/build_fac.py --geographr ../geographr --gp epraccur.csv --pharmacy edispensary.csv --givefood ../givefood \
        [--osm leisure.geojson community.geojson ...] [--crime police-data.zip]

Inputs (not kept in this repository; see DATA-SOURCES.md):
  --gp         NHS England Organisation Data Service: GP and other prescribing practices (epraccur.csv). Only GP practices
               (codes of a letter and five digits, not "Y" codes) that are active are kept; this includes Welsh practices.
  --pharmacy   NHS England Organisation Data Service: dispensaries (edispensary.csv), active only (England)
  --givefood   a copy of https://github.com/givefood/data (Give Food, CC BY 4.0): food banks and their locations (UK)
  --osm        GeoJSON (or raw Overpass JSON) exported from Overpass Turbo (© OpenStreetMap contributors, ODbL). Each place is
               put in the neighbourhood its map point falls in. Doctors and pharmacies from OpenStreetMap are used only where
               the NHS lists are missing (doctors in Scotland and Northern Ireland; pharmacies outside England)
  --crime      data.police.uk street-level crime downloads (one or more zips of monthly CSVs), England and Wales
  --geographr  for the ONS Postcode Directory (postcode -> neighbourhood)

Writes fac/<council code>.json ([kind, name, neighbourhood, link] rows) and adds measures to areas.json.
"""
import argparse, csv, glob, io, json, os, re, shutil, zipfile
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALIAS = {"E08000038": "E08000016", "E08000039": "E08000019"}
PC = re.compile(r"([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b")
# OpenStreetMap tags -> the kinds of place shown on the site
OSM_KINDS = [
    ("leisure", lambda t: t.get("leisure") in ("sports_centre", "swimming_pool", "leisure_centre")),
    ("community", lambda t: t.get("amenity") == "community_centre"),
    ("library", lambda t: t.get("amenity") == "library"),
    ("social", lambda t: t.get("amenity") == "social_facility"),
    ("gp", lambda t: t.get("amenity") == "doctors"),
    ("pharmacy", lambda t: t.get("amenity") == "pharmacy"),
    ("bank", lambda t: t.get("amenity") in ("bank", "post_office")),
    ("playground", lambda t: t.get("leisure") == "playground"),
    ("worship", lambda t: t.get("amenity") == "place_of_worship"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--geographr", required=True)
    ap.add_argument("--gp", required=True)
    ap.add_argument("--pharmacy", required=True)
    ap.add_argument("--givefood", required=True)
    ap.add_argument("--osm", nargs="*", default=[])
    ap.add_argument("--crime", nargs="*", default=[])
    ap.add_argument("--out", default=ROOT)
    a = ap.parse_args()
    import pyreadr
    rows = json.load(open(os.path.join(a.out, "areas.json")))
    by = {r["iso3"]: r for r in rows}
    pcd = next(iter(pyreadr.read_r(os.path.join(a.geographr, "data", "lookup_postcode_oa_lsoa_msoa_ltla_2025.rda")).values()))
    loc = {}
    for pc, l21, oa, la in zip(pcd.postcode, pcd.lsoa21_code, pcd.oa21_code, pcd.ltla24_code):
        code = oa if isinstance(oa, str) and oa.startswith("N20") else l21
        if isinstance(code, str) and isinstance(la, str):
            loc[pc.replace(" ", "").upper()] = (code, ALIAS.get(la, la))
    def where(text):
        m = PC.search(str(text or "").upper())
        return loc.get(m.group(1) + m.group(2)) if m else None

    fac = defaultdict(list)
    miss = Counter()
    def add(kind, name, w, link=""):
        if w:
            fac[w[1]].append([kind, name, w[0], link])
        else:
            miss[kind] += 1

    # GP practices (England, and Welsh practices listed by NHS England)
    for r in csv.reader(open(a.gp, encoding="latin-1")):
        # GP practices have codes of a letter and five digits; the "99" series and specialist or inpatient services
        # listed alongside them are left out
        if (r[12] == "ACTIVE" and re.fullmatch(r"[A-XZ]\d{5}", r[0]) and r[0][1:3] != "99"
                and not re.search(r"INPATIENT|\bWARD\b|HOSPITAL|AUDIOLOGY|MUSCULO|GPWSI|DTTO|NEUROLOGY|\bHMP\b|PRISON|\bYOI\b", r[1])):
            add("gp", r[1].title(), where(r[9]), r[0])
    # pharmacies (England)
    for r in csv.reader(open(a.pharmacy, encoding="latin-1")):
        if r[12] == "ACTIVE":
            add("pharmacy", r[1].title(), where(r[9]), r[0])
    # food banks (Give Food): each food bank's main address, and its other distribution points
    seen = set()
    fb = os.path.join(a.givefood, "foodbanks.csv")
    with open(fb, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if str(r.get("closed", "")).lower() in ("true", "1", "yes"):
                continue
            w = where(r["postcode"])
            key = (r["name"], w)
            if key in seen:
                continue
            seen.add(key)
            add("foodbank", r["name"], w, f"https://www.givefood.org.uk/needs/at/{r['slug']}/")
    for ft in json.load(open(os.path.join(a.givefood, "locations.geojson")))["features"]:
        p = ft["properties"]
        w = where(p.get("address"))
        key = (p["name"], w)
        if key in seen:
            continue
        seen.add(key)
        add("foodbank", p["name"], w, p.get("url", ""))
    print("placed:", Counter(x[0] for v in fac.values() for x in v), "not placed:", dict(miss))

    # neighbourhood shapes, for placing map points and for crime by neighbourhood
    nbf = {}   # council -> (topology, geometries)
    for f in glob.glob(os.path.join(a.out, "nb", "[EWSN]*.json")):
        t = json.load(open(f))
        nbf[os.path.basename(f)[:-5]] = t
    nb_la = {g["properties"]["c"]: la for la, t in nbf.items() for g in list(t["objects"].values())[0]["geometries"]}

    # OpenStreetMap places: each map point is put in the neighbourhood it falls in
    if a.osm:
        from shapely import STRtree
        from shapely.geometry import Point
        polys, codes = [], []
        for la, t in nbf.items():
            for code, shp in topo_shapes(t):
                polys.append(shp); codes.append(code)
        tree = STRtree(polys)
        nhs_gp, nhs_ph = {"E", "W"}, {"E"}   # nations the NHS lists already cover
        seen_osm, osm_n, osm_miss = set(), Counter(), 0
        for fn in a.osm:
            for oid, lon, lat, tags in osm_points(fn):
                kind = next((k for k, test in OSM_KINDS if test(tags)), None)
                if not kind or oid in seen_osm:
                    continue
                seen_osm.add(oid)
                name = (tags.get("name") or "").strip()
                if not name:
                    if kind in ("playground", "leisure"):
                        name = {"playground": "Playground", "leisure": "Sports centre"}[kind]
                    else:
                        continue
                if tags.get("access") in ("private", "no"):
                    continue
                pt = Point(lon, lat)
                hit = [i for i in tree.query(pt) if polys[i].covers(pt)]
                if not hit:
                    i = tree.nearest(pt)
                    if polys[i].distance(pt) > 0.01:   # about 1 km: off the map (at sea, or outside the UK)
                        osm_miss += 1
                        continue
                    hit = [i]
                code = codes[hit[0]]
                if kind == "gp" and code[0] in nhs_gp or kind == "pharmacy" and code[0] in nhs_ph:
                    continue
                fac[nb_la[code]].append([kind, name, code, "osm:" + oid])
                osm_n[kind] += 1
        print("OpenStreetMap places:", dict(osm_n), "off the map:", osm_miss)

    # crime (data.police.uk): crimes recorded in each council and neighbourhood, per 1,000 people a year
    if a.crime:
        by_m = defaultdict(Counter)           # council -> month -> crimes
        nbc = defaultdict(lambda: [0, 0, 0])  # neighbourhood -> [all, violence, anti-social behaviour]
        nbm = defaultdict(Counter)            # neighbourhood -> month -> crimes
        months, forces = set(), set()
        for zf in a.crime:
            z = zipfile.ZipFile(zf)
            for name in z.namelist():
                if not name.endswith("-street.csv"):
                    continue
                forces.add(re.sub(r"^\d{4}-\d{2}-|-street\.csv$", "", os.path.basename(name)))
                with z.open(name) as fh:
                    for r in csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8")):
                        code = r["LSOA code"]
                        la = nb_la.get(code)
                        if not la or la[0] not in "EW":
                            continue
                        mo = r["Month"]
                        months.add(mo)
                        by_m[la][mo] += 1
                        c = nbc[code]
                        c[0] += 1
                        if r["Crime type"] == "Violence and sexual offences":
                            c[1] += 1
                        elif r["Crime type"] == "Anti-social behaviour":
                            c[2] += 1
        months = sorted(months)
        print("crime: months", months[0], "to", months[-1], f"({len(months)})", "forces", len(forces))
        # a force can be missing for some months (Gloucestershire stops after January 2026): a council's months with
        # hardly any crimes (a quarter of its busiest month or less) are left out, and the rest scaled to a year
        good = {}
        for la, mc in by_m.items():
            top = max(mc.values())
            good[la] = {m for m in months if mc.get(m, 0) > top / 4}
        yr = int(months[-1][:4])
        lac = defaultdict(lambda: [0, 0, 0])
        for code, c in nbc.items():
            for i in range(3):
                lac[nb_la[code]][i] += c[i]
        for la, r in by.items():
            if la not in by_m or not r.get("population"):
                continue
            mc, g = by_m[la], good[la]
            share = sum(mc[m] for m in g) / max(1, sum(mc.values()))   # crimes in the good months
            scale = 12 / len(g) * share
            rate = 1000 * lac[la][0] * scale / r["population"]
            # councils whose force does not publish (Greater Manchester since 2019) show only a few crimes recorded by
            # other forces (such as British Transport Police): leave them out rather than show a false low
            if rate < 20:
                continue
            r["crime_rate"], r["crime_viol"], r["crime_asb"] = (round(1000 * lac[la][i] * scale / r["population"], 1) for i in range(3))
            for k in ("crime_rate", "crime_viol", "crime_asb"):
                r[k + "_year"] = yr
            r["crime_months"] = len(g)
        # neighbourhoods: written into nb/<council>.json as crime_rate, crime_viol, crime_asb (per 1,000 residents a year)
        nn = 0
        for la, t in nbf.items():
            if la[0] not in "EW":
                continue
            ok = "crime_rate" in by[la] if la in by else False
            changed = False
            for gm in list(t["objects"].values())[0]["geometries"]:
                p = gm["properties"]
                for k in ("crime_rate", "crime_viol", "crime_asb"):
                    p.pop(k, None)
                c = nbc.get(p["c"])
                if ok and p.get("p"):
                    sc = 12 / len(good[la]) * sum(by_m[la][m] for m in good[la]) / max(1, sum(by_m[la].values()))
                    c = c or [0, 0, 0]
                    p["crime_rate"], p["crime_viol"], p["crime_asb"] = (round(1000 * c[i] * sc / p["p"], 1) for i in range(3))
                    nn += 1
                changed = True
            if changed:
                with open(os.path.join(a.out, "nb", la + ".json"), "w") as f:
                    json.dump(t, f, separators=(",", ":"), ensure_ascii=False)
        meta = json.load(open(os.path.join(a.out, "nb", "index.json")))
        meta["extra"] = ["crime_rate", "crime_viol", "crime_asb"]
        meta["crimeMonths"] = [months[0], months[-1]]
        json.dump(meta, open(os.path.join(a.out, "nb", "index.json"), "w"), separators=(",", ":"), ensure_ascii=False)
        print("crime figures for", sum(1 for r in by.values() if "crime_rate" in r), "councils and", nn, "neighbourhoods")
        json.dump({"months": months, "forces": sorted(forces)}, open(os.path.join(ROOT, "scripts", ".cache", "crime_meta.json"), "w"))

    out = os.path.join(a.out, "fac")
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    for la in by:
        with open(os.path.join(out, la + ".json"), "w") as f:
            json.dump(fac.get(la, []), f, separators=(",", ":"), ensure_ascii=False)
        r = by[la]
        if r.get("population"):
            n = Counter(x[0] for x in fac.get(la, []))
            if r["nation"] in ("England", "Wales"):
                r["gp_per10k"] = round(10000 * n["gp"] / r["population"], 2); r["gp_per10k_year"] = 2026
            if r["nation"] == "England":
                r["pharm_per10k"] = round(10000 * n["pharmacy"] / r["population"], 2); r["pharm_per10k_year"] = 2026
            r["foodbank_per100k"] = round(100000 * n["foodbank"] / r["population"], 1); r["foodbank_per100k_year"] = 2026
    with open(os.path.join(a.out, "areas.json"), "w") as f:
        json.dump(rows, f, separators=(",", ":"))
    kinds = Counter(x[0] for v in fac.values() for x in v)
    with open(os.path.join(out, "index.json"), "w") as f:
        json.dump({"kinds": kinds, "osm": bool(a.osm)}, f, separators=(",", ":"))
    print("files:", len(os.listdir(out)), dict(kinds))


def topo_shapes(t):
    """(code, shapely shape) for each neighbourhood in a TopoJSON file"""
    from shapely.geometry import Polygon, MultiPolygon
    from shapely.validation import make_valid
    sx, sy = t["transform"]["scale"]; tx, ty = t["transform"]["translate"]
    arcs = []
    for arc in t["arcs"]:
        x = y = 0; pts = []
        for dx, dy in arc:
            x += dx; y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)
    def ring(ix):
        out = []
        for i in ix:
            pts = arcs[i] if i >= 0 else arcs[~i][::-1]
            out += pts if not out else pts[1:]
        return out
    for g in list(t["objects"].values())[0]["geometries"]:
        polys = [g["arcs"]] if g["type"] == "Polygon" else g["arcs"] if g["type"] == "MultiPolygon" else []
        ps = [Polygon(ring(p[0]), [ring(h) for h in p[1:]]) for p in polys if len(ring(p[0])) >= 4]
        if ps:
            shp = MultiPolygon(ps) if len(ps) > 1 else ps[0]
            yield g["properties"]["c"], (shp if shp.is_valid else make_valid(shp))


def osm_points(fn):
    """(id, lon, lat, tags) from a GeoJSON export of Overpass Turbo, or raw Overpass JSON"""
    d = json.load(open(fn, encoding="utf-8"))
    if "features" in d:
        for ft in d["features"]:
            g, p = ft.get("geometry") or {}, ft.get("properties") or {}
            if g.get("type") == "Point":
                lon, lat = g["coordinates"][:2]
            elif g.get("coordinates"):
                from shapely.geometry import shape
                c = shape(g).representative_point(); lon, lat = c.x, c.y
            else:
                continue
            yield str(p.get("@id") or ft.get("id")), lon, lat, p
    else:
        for e in d.get("elements", []):
            c = e if "lat" in e else e.get("center")
            if c:
                yield f"{e['type']}/{e['id']}", c["lon"], c["lat"], e.get("tags", {})


if __name__ == "__main__":
    main()
