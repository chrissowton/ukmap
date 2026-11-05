#!/usr/bin/env python3
"""
Charities, schools and children's centres for Which Places? (release 1.4).

Each one is placed in the neighbourhood (small area) its postcode is in. The site never shows an exact address, a contact
person, an email or a phone number: only the name, what it does, its size, the neighbourhood, and a link to its entry on
the official register.

    python3 scripts/build_orgs.py --geographr ../geographr --ccew ../charities --oscr CharityExport.csv --ccni charitydetails.csv \
        --gias ../gias --wales address-list-schools-values.ods --scot schoolcontactlist.xlsx --ni-schools "School_level_*.xlsx"

Inputs (not kept in this repository; see DATA-SOURCES.md):
  --ccew        Charity Commission for England and Wales register extract (publicextract.charity.txt, .charity_classification.txt,
                .charity_area_of_operation.txt), https://register-of-charities.charitycommission.gov.uk/en/register/full-register-download
  --oscr        Scottish Charity Regulator register (CharityExport-*.csv), https://www.oscr.org.uk/about-charities/search-the-register/register-download
  --ccni        Charity Commission for Northern Ireland register (charitydetails_*.csv), https://www.charitycommissionni.org.uk/charity-search/
  --gias        Get Information about Schools downloads (edubasealldata*.csv, edubaseallchildrencentre*.csv), Department for Education
  --wales       Address list of schools (Welsh Government)
  --scot        School contact details (Scottish Government)
  --ni-schools  School level enrolment data 2025/26 (Department of Education, Northern Ireland): the five school-type files
  --geographr   for the ONS Postcode Directory (postcode -> small area)

Writes:
  org/<council code>.json   {"ch": charities based there, "sc": schools and children's centres, "wk": charities based elsewhere that work there}
  org/search.json           every charity's name, council, register and number (for searching by name)
  areas.json                adds ch_per1k, ch_inc_pc (charities based in the area per 1,000 people, and their income per person)
"""
import argparse, csv, glob, json, os, re, shutil, sys
csv.field_size_limit(10**8)
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALIAS = {"E08000038": "E08000016", "E08000039": "E08000019"}
PC = re.compile(r"([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b")

# What a charity does and who it helps, grouped the same way for all three registers (each describes them in its own words)
THEMES = [
    ("edu", "Education and training", r"educat|training|school|learning|literacy"),
    ("health", "Health", r"health|medical|sickness|saving of lives|hospital|mental|hospice"),
    ("disab", "Disability", r"disab"),
    ("poverty", "Poverty and hardship", r"poverty|hardship|financial|those in need|relief of need"),
    ("housing", "Housing and homelessness", r"housing|accommodation|homeless"),
    ("religion", "Religion", r"religio|church|faith|christian|muslim|jewish|islam|worship"),
    ("arts", "Arts, culture and heritage", r"\barts?\b|culture|heritage|science"),
    ("sport", "Sport and recreation", r"sport|recreation|leisure|amateur"),
    ("env", "Environment and animals", r"environment|conservation|animal"),
    ("community", "Community development", r"community|citizenship|economic|regeneration|employment"),
    ("rights", "Human rights and equality", r"human rights|equality|diversity|conflict resolution|reconciliation|racial harmony"),
    ("overseas", "Overseas aid", r"overseas|famine|international"),
]
WHO = [
    ("children", "Children and young people", r"children|young people|youth"),
    ("older", "Older people", r"elderly|old age|older"),
    ("disabled", "Disabled people", r"disab"),
    ("ethnic", "Ethnic or racial groups", r"ethnic|racial"),
    ("public", "The general public", r"general public|no specific group|the community|mankind"),
]


def tags(text, table):
    t = (text or "").lower()
    return [k for k, _, rx in table if re.search(rx, t)]


def main():
    ap = argparse.ArgumentParser()
    for k in ("geographr", "ccew", "oscr", "ccni", "gias", "wales", "scot", "ni-schools"):
        ap.add_argument("--" + k, required=True)
    ap.add_argument("--out", default=ROOT)
    a = ap.parse_args()
    import pandas as pd, pyreadr

    rows = json.load(open(os.path.join(a.out, "areas.json")))
    by = {r["iso3"]: r for r in rows}
    # postcode -> [neighbourhood, council]
    pcd = next(iter(pyreadr.read_r(os.path.join(a.geographr, "data", "lookup_postcode_oa_lsoa_msoa_ltla_2025.rda")).values()))
    loc = {}
    for pc, l21, oa, la in zip(pcd.postcode, pcd.lsoa21_code, pcd.oa21_code, pcd.ltla24_code):
        code = oa if isinstance(oa, str) and oa.startswith("N20") else l21
        if isinstance(code, str) and isinstance(la, str):
            loc[pc.replace(" ", "").upper()] = (code, ALIAS.get(la, la))
    def where(postcode):
        m = PC.search(str(postcode or "").upper())
        return loc.get(m.group(1) + m.group(2)) if m else None

    ch = defaultdict(list)   # council -> charities based there
    unplaced = Counter()

    # ---------- Charity Commission for England and Wales ----------
    cls = defaultdict(lambda: {"What": [], "Who": [], "How": []})
    with open(os.path.join(a.ccew, "publicextract.charity_classification.txt"), encoding="utf-8-sig") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            if r["linked_charity_number"] == "0":
                cls[r["registered_charity_number"]][r["classification_type"]].append(r["classification_description"])
    ccew = {}
    with open(os.path.join(a.ccew, "publicextract.charity.txt"), encoding="utf-8-sig") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            if r["charity_registration_status"] != "Registered" or r["linked_charity_number"] != "0":
                continue
            num = r["registered_charity_number"]
            c = cls.get(num, {"What": [], "Who": [], "How": []})
            inc = float(r["latest_income"]) if r["latest_income"] else None
            rec = {"n": r["charity_name"].strip(), "r": "E", "id": num, "inc": round(inc) if inc is not None else None,
                   "t": tags(" ".join(c["What"]), THEMES), "w": tags(" ".join(c["Who"]), WHO),
                   "a": (r["charity_activities"] or "").strip()[:110]}
            ccew[num] = rec
            w = where(r["charity_contact_postcode"])
            if w:
                rec["nb"] = w[0]
                ch[w[1]].append(rec)
            else:
                unplaced["E"] += 1
    print("CCEW registered:", len(ccew))

    # ---------- OSCR (Scotland) ----------
    o = pd.read_csv(a.oscr, dtype=str, keep_default_na=False)
    for _, r in o.iterrows():
        if r["Charity Status"] != "Active":
            continue
        try:
            inc = round(float(r["Most recent year income"]))
        except ValueError:
            inc = None
        rec = {"n": r["Charity Name"].strip(), "r": "S", "id": r["Charity Number"], "inc": inc,
               "t": tags(r["Purposes"], THEMES), "w": tags(r["Beneficiaries"], WHO),
               "a": re.sub(r"\s+", " ", r["What the charity is set up to do and how it does this"]).strip()[:110]}
        w = where(r["Postcode"])
        if w:
            rec["nb"] = w[0]
            ch[w[1]].append(rec)
        else:
            unplaced["S"] += 1
    # ---------- CCNI (Northern Ireland) ----------
    ni = pd.read_csv(a.ccni, dtype=str, keep_default_na=False, encoding="utf-8-sig")
    for _, r in ni.iterrows():
        if r.get("Status", "").lower().startswith("removed"):
            continue
        try:
            inc = round(float(r["Total income"]))
        except ValueError:
            inc = None
        rec = {"n": r["Charity name"].strip(), "r": "N", "id": r["Reg charity number"], "inc": inc,
               "t": tags(r["What the charity does"], THEMES), "w": tags(r["Who the charity helps"], WHO),
               "a": re.sub(r"\s+", " ", r["Charitable purposes"]).strip()[:110]}
        w = where(r["Public address"])
        if w:
            rec["nb"] = w[0]
            ch[w[1]].append(rec)
        else:
            unplaced["N"] += 1
    print("charities placed:", sum(len(v) for v in ch.values()), "not placed (no or unknown postcode):", dict(unplaced))

    # ---------- charities working in an area (England and Wales register: area of operation) ----------
    lk = next(iter(pyreadr.read_r(os.path.join(a.geographr, "data", "lookup_ltla23_utla23.rda")).values()))
    norm = lambda s: re.sub(r"\b(city of|city|county of|the)\b", "", s.lower().replace("&", "and").replace(",", "")).replace("  ", " ").strip()
    names = defaultdict(set)
    for r in rows:
        if r["nation"] in ("England", "Wales"):
            names[norm(r["name"])].add(r["iso3"])
    for l, un in zip(lk.ltla23_code, lk.utla23_name):
        if l in by:
            names[norm(un)].add(l)
    extra = {"bournemouth": {"E06000058"}, "poole": {"E06000058"}, "cumbria": {"E06000063", "E06000064"}, "durham": {"E06000047"},
             "northamptonshire": {"E06000061", "E06000062"}, "rhondda cynon taff": {"W06000016"}, "swansea": {"W06000011"},
             "cheshire west and chester": {"E06000050"}, "st helens": {"E08000013"}, "somerset": {"E06000066"}, "north yorkshire": {"E06000065"}}
    for k, v in extra.items():
        names[k] |= v
    ops = defaultdict(set)
    nolink = Counter()
    with open(os.path.join(a.ccew, "publicextract.charity_area_of_operation.txt"), encoding="utf-8-sig") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            if r["geographic_area_type"] == "Local Authority" and r["linked_charity_number"] == "0":
                las = names.get(norm(r["geographic_area_description"]))
                if las:
                    ops[r["registered_charity_number"]] |= las
                else:
                    nolink[r["geographic_area_description"]] += 1
    if nolink:
        print("areas of operation not matched:", nolink.most_common(10))
    wk = defaultdict(list)
    for num, las in ops.items():
        rec = ccew.get(num)
        if not rec or len(las) > 3:       # only charities that work in a few councils; wider ones would swamp the local lists
            continue
        for la in las:
            if rec.get("nb") and any(x is rec for x in ch.get(la, [])):
                continue
            wk[la].append(rec)

    # ---------- schools ----------
    sc = defaultdict(list)
    sunplaced = Counter()
    g = pd.read_csv(glob.glob(os.path.join(a.gias, "edubasealldata*.csv"))[0], dtype=str, keep_default_na=False, encoding="latin-1")
    g = g[g["EstablishmentStatus (name)"].str.startswith("Open")]
    for _, r in g.iterrows():
        w = where(r["Postcode"])
        if not w or not w[0].startswith("E"):      # Welsh schools come from the Welsh Government's list
            if not w:
                sunplaced["E"] += 1
            continue
        rec = {"n": r["EstablishmentName"], "k": "school", "ty": r["TypeOfEstablishment (name)"], "gr": r["EstablishmentTypeGroup (name)"],
               "ph": r["PhaseOfEducation (name)"], "id": r["URN"], "src": "E", "nb": w[0]}
        if r["NumberOfPupils"]:
            rec["pu"] = int(float(r["NumberOfPupils"]))
        if r["PercentageFSM"]:
            try:
                rec["fsm"] = float(r["PercentageFSM"])
            except ValueError:
                pass
        if r["Trusts (name)"]:
            rec["tr"] = r["Trusts (name)"]
        sc[w[1]].append(rec)
    cc = pd.read_csv(glob.glob(os.path.join(a.gias, "edubaseallchildrencentre*.csv"))[0], dtype=str, keep_default_na=False, encoding="latin-1")
    cc = cc[cc["EstablishmentStatus (name)"].str.startswith("Open")]
    for _, r in cc.iterrows():
        w = where(r["Postcode"])
        if w:
            sc[w[1]].append({"n": r["EstablishmentName"], "k": "cc", "ty": r["TypeOfEstablishment (name)"], "id": r["URN"], "src": "E", "nb": w[0]})
    # Wales
    x = pd.ExcelFile(a.wales, engine="odf")
    for sheet, gr in (("Maintained", "Maintained"), ("Independent", "Independent"), ("PRU", "Pupil referral unit")):
        if sheet not in x.sheet_names:
            continue
        d = pd.read_excel(x, sheet, dtype=str)
        d.columns = [str(c).strip() for c in d.columns]
        for _, r in d.iterrows():
            w = where(r.get("Postcode"))
            if not w:
                sunplaced["W"] += 1
                continue
            rec = {"n": r.get("School Name"), "k": "school", "ty": r.get("School Type") or gr, "gr": gr, "ph": r.get("Sector") or "",
                   "id": r.get("School Number"), "src": "W", "nb": w[0]}
            try:
                rec["pu"] = int(float(r.get("Pupils - see notes")))
            except (TypeError, ValueError):
                pass
            sc[w[1]].append(rec)
    # Scotland
    d = pd.read_excel(a.scot, "Open Schools", header=None, dtype=str)
    h = d.index[d.iloc[:, 0].astype(str) == "Seed Code"][0]
    d.columns = [str(c).strip() for c in d.iloc[h]]
    for _, r in d.iloc[h + 1:].iterrows():
        w = where(r.get("Post Code"))
        if not w:
            sunplaced["S"] += 1
            continue
        phases = [p for p, col in (("Nursery", "Pre-school Department"), ("Primary", "Primary Department"), ("Secondary", "Secondary Department"), ("Special", "Special Department")) if str(r.get(col)).strip().lower() in ("yes", "y", "1", "true")]
        sc[w[1]].append({"n": r.get("School Name"), "k": "school", "ty": r.get("Centre Type"), "gr": r.get("Centre Type"), "ph": ", ".join(phases),
                         "id": r.get("Seed Code"), "src": "S", "nb": w[0]})
    # Northern Ireland: the files give each school's data zone directly
    nb_la = {}
    for f in glob.glob(os.path.join(ROOT, "nb", "N09*.json")):
        t = json.load(open(f))
        for gg in list(t["objects"].values())[0]["geometries"]:
            nb_la[gg["properties"]["c"]] = gg["properties"]["la"]
    for f in sorted(glob.glob(a.ni_schools)):
        kind = re.search(r"level_-_(.+?)_(?:schools_)?2025", os.path.basename(f)).group(1).replace("_", " ")
        x = pd.ExcelFile(f)
        ref = pd.read_excel(x, "Reference Data", header=None, dtype=str)
        h = ref.index[ref.iloc[:, 0].astype(str).str.strip() == "DENI ref"][0]
        ref.columns = [str(c).strip() for c in ref.iloc[h]]
        ref = ref.iloc[h + 1:]
        enr = {}
        if "Enrolments" in x.sheet_names:
            e = pd.read_excel(x, "Enrolments", header=None, dtype=str)
            he = e.index[e.iloc[:, 0].astype(str).str.strip() == "DENI ref"]
            if len(he):
                e.columns = [str(c).strip() for c in e.iloc[he[0]]]
                tot = next((c for c in e.columns if c.lower().startswith("total")), None)
                if tot:
                    for _, r in e.iloc[he[0] + 1:].iterrows():
                        enr[str(r["DENI ref"]).strip()] = r[tot]
        for _, r in ref.iterrows():
            dz = str(r.get("Datazone") or "").strip()
            la = nb_la.get(dz)
            if not la:
                w = where(r.get("Postcode"))
                dz, la = (w if w else (None, None))
            if not la:
                sunplaced["N"] += 1
                continue
            rec = {"n": r.get("School name"), "k": "school", "ty": r.get("School Type") or kind, "gr": r.get("Management Type"), "ph": kind.capitalize(),
                   "id": str(r.get("DENI ref")).strip(), "src": "N", "nb": dz}
            try:
                rec["pu"] = int(float(enr.get(rec["id"])))
            except (TypeError, ValueError):
                pass
            sc[la].append(rec)
    print("schools and centres placed:", sum(len(v) for v in sc.values()), "not placed:", dict(sunplaced))

    # ---------- write ----------
    out = os.path.join(a.out, "org")
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    for la in by:
        chs = sorted(ch.get(la, []), key=lambda c: -(c["inc"] or 0))
        # charities are stored as rows, to keep the files small:
        #   ch: [name, register (E/S/N), number, income, neighbourhood, what (codes joined by spaces), who, activities]
        #   wk: [name, number, income, what]   (England and Wales register; based in another council)
        row = lambda c: [c["n"], c["r"], c["id"], c["inc"], c.get("nb"), " ".join(c["t"]), " ".join(c["w"]), c.get("a", "")]
        wks = sorted(wk.get(la, []), key=lambda c: -(c["inc"] or 0))
        with open(os.path.join(out, la + ".json"), "w") as f:
            json.dump({"ch": [row(c) for c in chs], "sc": sc.get(la, []), "wk": [[c["n"], c["id"], c["inc"], " ".join(c["t"])] for c in wks]}, f, separators=(",", ":"), ensure_ascii=False)
        r = by[la]
        if r.get("population"):
            r["ch_per1k"] = round(1000 * len(chs) / r["population"], 2)
            r["ch_per1k_year"] = 2026
            r["ch_inc_pc"] = round(sum(c["inc"] or 0 for c in chs) / r["population"])
            r["ch_inc_pc_year"] = 2026
            r["sc_n"] = sum(1 for s in sc.get(la, []) if s["k"] == "school")
            r["sc_n_year"] = 2026
    with open(os.path.join(a.out, "areas.json"), "w") as f:
        json.dump(rows, f, separators=(",", ":"))
    # every charity's name, for the search box: [name, council, register, number], largest first
    allc = sorted(((c, la) for la, cs in ch.items() for c in cs), key=lambda x: -(x[0]["inc"] or 0))
    with open(os.path.join(out, "search.json"), "w") as f:
        las = sorted(by)
        ix = {la: i for i, la in enumerate(las)}
        json.dump({"la": las, "c": [[c["n"], ix[la], c["r"], c["id"]] for c, la in allc]}, f, separators=(",", ":"), ensure_ascii=False)
    with open(os.path.join(out, "index.json"), "w") as f:
        json.dump({"themes": [[k, l] for k, l, _ in THEMES], "who": [[k, l] for k, l, _ in WHO], "date": "November 2026"}, f)
    print("files:", len(os.listdir(out)))


if __name__ == "__main__":
    main()
