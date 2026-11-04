#!/usr/bin/env python3
"""
Adds census measures for Which Places? (release 1.2), for all four nations, from the three censuses:
England and Wales (Census 2021, ONS), Scotland (Scotland's Census 2022, NRS) and Northern Ireland (Census 2021, NISRA).

    python3 scripts/build_census.py --ew ../census21/englandAndWales --scot Datazone2022.zip --sape "SAPE 2024.xlsx" --ni ../ni

Inputs (not kept in this repository; see DATA-SOURCES.md):
  --ew    the England and Wales census tables as Parquet, from the giCentre census21 repository
          (https://github.com/gicentre/data/tree/main/census21), which republishes ONS Census 2021 data
  --scot  Scotland's Census 2022 tables for 2022 data zones (the "Datazone2022" download from scotlandscensus.gov.uk)
  --sape  NRS small area population estimates, 2022 data zones (used only for its data zone -> council area lookup)
  --ni    NISRA Census 2021 main statistics tables (census-2021-ms-*.xlsx)

Each measure is a share: people (or households) in some categories, out of all people (or households) the question
applies to. The counts are kept in scripts/.cache/census_counts.json so groups of councils (city regions, regions)
can be worked out exactly by adding them up (build_groups.py).

Writes: areas.json (adds the measures), census.js (their labels, explanations and sources).
"""
import argparse, csv, io, json, os, re, zipfile
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "scripts", ".cache")

# Councils merged since 2021: their census figures are added together into the new council.
MERGED = {
    "E07000026": "E06000063", "E07000028": "E06000063", "E07000029": "E06000063",          # Cumberland
    "E07000027": "E06000064", "E07000030": "E06000064", "E07000031": "E06000064",          # Westmorland and Furness
    **{c: "E06000065" for c in ["E07000163", "E07000164", "E07000165", "E07000166", "E07000167", "E07000168", "E07000169"]},  # North Yorkshire
    **{c: "E06000066" for c in ["E07000187", "E07000188", "E07000189", "E07000246"]},     # Somerset
}
ALIAS = {"E08000038": "E08000016", "E08000039": "E08000019"}

ALL = None   # "every category the question applies to"
# ew:   (table, numerator categories, denominator categories or ALL)
# scot: (file name start, numerator labels, denominator label) ; a numerator label starting "-" is subtracted from the denominator
# ni:   (table, numerator columns, denominator column)   column names with spaces and notes tidied (see norm)
C = [
    # ---------------- Census: people ----------------
    dict(key="c_minority", group="Census: people", label="Asian, Black, mixed or other ethnic groups", short="Not White",
         ew=("ethnicGroup", list(range(1, 13)) + [18, 19], ALL),
         scot=("UV201 ", ["Mixed or multiple ethnic group", "Asian, Asian Scottish or Asian British: Total", "African: Total", "Caribbean or Black: Total", "Other ethnic groups: Total"], "All People"),
         ni=("b01", ["Indian", "Chinese", "Filipino", "Pakistani", "Arab", "Other Asian", "Black African", "Black Other", "Mixed", "Other ethnicities"], "All usual residents"),
         info="Share of people who describe their ethnic group as Asian, Black, mixed or multiple, or another group that is not White.",
         note="Each census lists slightly different groups (for example, Scotland lists African and Caribbean or Black separately).",
         kw="ethnicity ethnic groups minority diversity bame race", phrase="the share of people from Asian, Black, mixed or other ethnic groups"),
    dict(key="c_asian", group="Census: people", label="Asian ethnic groups", short="Asian",
         ew=("ethnicGroup", [1, 2, 3, 4, 5], ALL),
         scot=("UV201 ", ["Asian, Asian Scottish or Asian British: Total"], "All People"),
         ni=("b01", ["Indian", "Chinese", "Filipino", "Pakistani", "Other Asian"], "All usual residents"),
         info="Share of people who describe their ethnic group as Asian (for example Indian, Pakistani, Bangladeshi, Chinese).",
         kw="asian indian pakistani bangladeshi chinese ethnicity", phrase="the share of people from Asian ethnic groups"),
    dict(key="c_black", group="Census: people", label="Black ethnic groups", short="Black",
         ew=("ethnicGroup", [6, 7, 8], ALL),
         scot=("UV201 ", ["African: Total", "Caribbean or Black: Total"], "All People"),
         ni=("b01", ["Black African", "Black Other"], "All usual residents"),
         info="Share of people who describe their ethnic group as Black, African or Caribbean.",
         kw="black african caribbean ethnicity", phrase="the share of people from Black ethnic groups"),
    dict(key="c_born_abroad", group="Census: people", label="Born outside the UK", short="Born abroad",
         ew=("countryOfBirth", list(range(7, 60)), ALL),
         scot=("UV204b ", ["-Europe: United Kingdom: Total"], "All people"),
         ni=("a16", ["-Europe: United Kingdom: Northern Ireland", "-Europe: United Kingdom: England", "-Europe: United Kingdom: Scotland", "-Europe: United Kingdom: Wales"], "All usual residents"),
         info="Share of people born outside the United Kingdom.",
         kw="born abroad migrants migration immigrants country of birth", phrase="the share of people born outside the UK"),
    dict(key="c_no_religion", group="Census: people", label="No religion",
         ew=("religion", [1], ALL), scot=("UV205 ", ["No religion"], "All people"), ni=("b19", ["No religion"], "All usual residents"),
         info="Share of people who said they have no religion (out of everyone, including those who did not answer this voluntary question).",
         kw="religion no religion faith secular", phrase="the share of people with no religion"),
    dict(key="c_muslim", group="Census: people", label="Muslim", nations="EWS",
         ew=("religion", [6], ALL), scot=("UV205 ", ["Muslim"], "All people"),
         info="Share of people who said their religion is Muslim. England, Wales and Scotland (Northern Ireland's main tables group smaller religions together).",
         kw="muslim islam religion faith", phrase="the share of people who are Muslim"),
    dict(key="c_poor_english", group="Census: people", label="Cannot speak English well", short="Poor English", nations="EWN",
         ew=("ukLanguage", [4, 5], ALL),
         ni=("b14", ["Main language is not English: Cannot speak English well", "Main language is not English: Cannot speak English"], "All usual residents aged 3 and over"),
         info="Share of people aged 3 and over whose main language is not English and who cannot speak English well, or at all. England, Wales and Northern Ireland (Scotland asked a different question).",
         kw="english language esol speak interpreter", phrase="the share of people who cannot speak English well"),
    dict(key="c_lgb", group="Census: people", label="Gay, lesbian, bisexual or another minority sexual orientation", short="LGB+", nations="EWN",
         ew=("sexualOrientation", [2, 3, 4, 5, 6, 7], ALL),
         ni=("c01", ["Gay or lesbian", "Bisexual", "Other sexual orientation"], "All usual residents aged 16 and over"),
         info="Share of people aged 16 and over who described their sexual orientation as gay or lesbian, bisexual, or another minority orientation (out of everyone, including those who did not answer this voluntary question). England, Wales and Northern Ireland.",
         kw="lgb lgbt gay lesbian bisexual sexual orientation", phrase="the share of people who are gay, lesbian, bisexual or another minority orientation"),
    dict(key="c_veterans", group="Census: people", label="Armed forces veterans", short="Veterans", nations="EWS",
         ew=("forcesServed", [1, 2, 3], ALL), scot=("UV901 ", ["UK Armed Forces veteran"], "All people aged 16 and over"),
         info="Share of people aged 16 and over who have served in the UK armed forces (regular or reserve). Not asked in Northern Ireland.",
         kw="veterans armed forces military army navy raf", phrase="the share of adults who are armed forces veterans"),

    # ---------------- Census: health and care ----------------
    dict(key="c_bad_health", group="Census: health and care", label="Bad or very bad health", short="Bad health",
         ew=("health", [4, 5], ALL), scot=("UV302 ", ["Bad", "Very bad"], "All people"),
         ni=("d01", ["All usual residents: Bad health", "All usual residents: Very bad health"], "All usual residents"),
         info="Share of people who described their general health as bad or very bad.",
         kw="health bad health poor health illness", phrase="the share of people in bad or very bad health"),
    dict(key="c_disabled", group="Census: health and care", label="Disabled: day-to-day activities limited", short="Disabled",
         ew=("disability", [1, 2], ALL), scot=("UV303 ", ["Day-to-day activities limited a lot", "Day-to-day activities limited a little"], "All people"),
         ni=("d02", ["All usual residents: Day-to-day activities limited a lot", "All usual residents: Day-to-day activities limited a little"], "All usual residents"),
         info="Share of people whose day-to-day activities are limited, a lot or a little, by a long-term physical or mental health condition or illness.",
         kw="disability disabled long-term health condition", phrase="the share of people who are disabled"),
    dict(key="c_carers", group="Census: health and care", label="Unpaid carers", short="Carers",
         ew=("care", [2, 3, 4, 5, 6], ALL), scot=("UV301 ", ["All unpaid carers"], "All people aged 3 and over"),
         ni=("d17", ["All usual residents aged 5 and over: Provides 1-19 hours unpaid care per week", "All usual residents aged 5 and over: Provides 20-34 hours unpaid care per week",
                     "All usual residents aged 5 and over: Provides 35-49 hours unpaid care per week", "All usual residents aged 5 and over: Provides 50+ hours unpaid care per week"], "All usual residents aged 5 and over"),
         info="Share of people (aged 5 and over; 3 and over in Scotland) who look after or support someone because of long-term illness, disability or old age, without pay.",
         kw="carers unpaid care caring young carers", phrase="the share of people who are unpaid carers"),
    dict(key="c_carers50", group="Census: health and care", label="Caring for 50 hours or more a week", short="Carers 50h+",
         ew=("care", [6], ALL), scot=("UV301 ", ["Yes, 50 or more hours a week"], "All people aged 3 and over"),
         ni=("d17", ["All usual residents aged 5 and over: Provides 50+ hours unpaid care per week"], "All usual residents aged 5 and over"),
         info="Share of people (aged 5 and over; 3 and over in Scotland) who give 50 or more hours of unpaid care a week.",
         kw="carers unpaid care intensive caring", phrase="the share of people giving 50 or more hours of unpaid care a week"),

    # ---------------- Census: homes and households ----------------
    dict(key="c_no_car", group="Census: homes and households", label="Households without a car", short="No car",
         ew=("vehicle", [0], ALL), scot=("UV405 ", ["Number of cars or vans in household: No cars or vans"], "All occupied households"),
         ni=("e10", ["No cars or vans available"], "All households"),
         info="Share of households with no car or van.",
         kw="car van transport no car access rural isolation", phrase="the share of households without a car"),
    dict(key="c_social_rent", group="Census: homes and households", label="Social renting", short="Social rent",
         ew=("tenure", [3, 4], ALL), scot=("UV404 ", ["Social Rented: Council (LA) or Housing Association/ Registered Social Landlord"], "All occupied households"),
         ni=("e15", ["Social rented: Northern Ireland Housing Executive", "Social rented: Housing association or charitable trust"], "All households"),
         info="Share of households renting from a council or housing association.",
         kw="social housing council housing association tenure renting", phrase="the share of households renting from a council or housing association"),
    dict(key="c_private_rent", group="Census: homes and households", label="Private renting", short="Private rent",
         ew=("tenure", [5, 6], ALL), scot=("UV404 ", ["Private rented: Total"], "All occupied households"),
         ni=("e15", ["Private rented: Private landlord", "Private rented: Letting agency", "Private rented: Employer of a household member", "Private rented: Relative or friend of a household member", "Private rented: Other"], "All households"),
         info="Share of households renting privately.",
         kw="private rented renting landlord tenure", phrase="the share of households renting privately"),
    dict(key="c_owner", group="Census: homes and households", label="Home owners", short="Owners",
         ew=("tenure", [0, 1, 2], ALL), scot=("UV404 ", ["Owned: Total"], "All occupied households"),
         ni=("e15", ["Owner occupied: Owns outright", "Owner occupied: Owns with a mortgage or loan", "Shared ownership: Part-owns and part-rents"], "All households"),
         info="Share of households that own their home, outright, with a mortgage, or in shared ownership.",
         kw="home ownership owners mortgage tenure", phrase="the share of households who own their home"),
    dict(key="c_overcrowded", group="Census: homes and households", label="Overcrowded homes", short="Overcrowded", nations="EWS",
         ew=("bedroomOccupancy", [4, 5], ALL), scot=("UV415 ", ["Occupancy rating of bedrooms: -1 or less"], "All occupied households"),
         info="Share of households with fewer bedrooms than they need (bedroom occupancy rating of -1 or less). England, Wales and Scotland.",
         kw="overcrowding overcrowded housing bedrooms", phrase="the share of households that are overcrowded"),
    dict(key="c_alone66", group="Census: homes and households", label="Older people living alone", short="Living alone 66+",
         ew=("householdComposition", [1], ALL), scot=("UV113 ", ["One person household: Aged 66 and over"], "All households"),
         ni=("a26", ["One person household: Aged 66 and over"], "All households"),
         info="Share of households that are one person aged 66 or over living alone.",
         kw="older people living alone isolation loneliness elderly", phrase="the share of households that are one person aged 66 or over"),
    dict(key="c_lone_parent", group="Census: homes and households", label="Lone parents with dependent children", short="Lone parents",
         ew=("householdComposition", [10], ALL),
         scot=("UV113 ", ["One family household: Lone parent family: One dependent child", "One family household: Lone parent family: Two or more dependent children"], "All households"),
         ni=("a26", ["Single family household: Lone parent family (female): One dependent child", "Single family household: Lone parent family (female): Two or more dependent children",
                     "Single family household: Lone parent family (male): One dependent child", "Single family household: Lone parent family (male): Two or more dependent children"], "All households"),
         info="Share of households that are a lone parent with dependent children.",
         kw="lone parents single parents families children", phrase="the share of households that are lone parents with dependent children"),
    dict(key="c_hh_deprived", group="Census: homes and households", label="Households deprived in two or more ways", short="Household deprivation", nations="EW",
         ew=("deprivation", [3, 4, 5], ALL),
         info="Share of households deprived in two or more of four ways: employment, education, health and disability, and housing. England and Wales only.",
         kw="deprivation household deprivation poverty disadvantage", phrase="the share of households deprived in two or more ways"),

    # ---------------- Census: work and learning ----------------
    dict(key="c_no_quals", group="Census: work and learning", label="No qualifications (census)", short="No quals (census)",
         ew=("qualification", [0], ALL), scot=("UV501 ", ["No qualifications"], "All people aged 16 and over"),
         ni=("g01", ["No qualifications"], "All usual residents aged 16 and over"),
         info="Share of people aged 16 and over with no qualifications.",
         kw="no qualifications education skills", phrase="the share of adults with no qualifications"),
    dict(key="c_degree", group="Census: work and learning", label="Degree level or above", short="Degree",
         ew=("qualification", [5], ALL), scot=("UV501 ", ["Degree level qualifications or above"], "All people aged 16 and over"),
         ni=("g01", ["Level 4 qualifications and above"], "All usual residents aged 16 and over"),
         info="Share of people aged 16 and over with a degree or equivalent. In England, Wales and Northern Ireland this is level 4 and above, which also counts some sub-degree qualifications such as HNCs; Scotland counts degrees only, so its figures are a little lower.",
         kw="degree graduates university higher education qualifications", phrase="the share of adults with a degree or equivalent"),
    dict(key="c_ltsick", group="Census: work and learning", label="Long-term sick or disabled, not working", short="Long-term sick",
         ew=("econActivity", [18], ALL), scot=("UV601 ", ["Economically inactive - Long term sick or disabled"], "All people aged 16 and over"),
         ni=("h02", ["Usual residents aged 16 and over: Economically inactive: Long-term sick or disabled"], "All usual residents aged 16 and over"),
         info="Share of people aged 16 and over who are not working or looking for work because they are long-term sick or disabled.",
         kw="long-term sick disabled economic inactivity benefits work", phrase="the share of adults who are long-term sick or disabled"),
    dict(key="c_retired", group="Census: work and learning", label="Retired", short="Retired",
         ew=("econActivity", [15], ALL), scot=("UV601 ", ["Economically inactive - Retired"], "All people aged 16 and over"),
         ni=("h02", ["Usual residents aged 16 and over: Economically inactive: Retired"], "All usual residents aged 16 and over"),
         info="Share of people aged 16 and over who are retired.",
         kw="retired retirement pensioners older people", phrase="the share of adults who are retired"),
]

SOURCE = {
    "x_census": {"name": "Census 2021 (England and Wales: ONS, via the giCentre census21 repository; Northern Ireland: NISRA) and Scotland's Census 2022 (National Records of Scotland). Contains public sector information licensed under the Open Government Licence v3.0",
                 "url": "https://www.ons.gov.uk/census", "licence": "Open Government Licence v3.0"},
}


def norm(s):
    s = re.sub(r"\[note[^\]]*\]", "", str(s))
    return re.sub(r"\s+", " ", s).strip()


def read_ew(dirpath, table, codes):
    import pandas as pd
    d = pd.read_parquet(os.path.join(dirpath, table + ".parquet"))
    d = d[d.geography == "LA"]
    out = defaultdict(dict)   # code -> category -> count
    for code, cat, v in zip(d.code, d.category, d.value):
        code = ALIAS.get(MERGED.get(code, code), MERGED.get(code, code))
        try:
            v = int(v)
        except (TypeError, ValueError):   # "[c]": a count held back to protect confidentiality
            continue
        out[code][int(cat)] = out[code].get(int(cat), 0) + v
    return out


def scot_tables(zpath):
    return zipfile.ZipFile(zpath)


def read_scot(z, prefix, dz2ca):
    name = next(n for n in z.namelist() if n.startswith("Table " + prefix))
    out = defaultdict(lambda: defaultdict(float))
    with z.open(name) as f:
        for r in csv.reader(io.TextIOWrapper(f, encoding="utf-8-sig")):
            if not r or not r[0].startswith("S01"):
                continue
            if len(r) == 3:
                label, v = r[1], r[2]
            elif len(r) == 5:
                if r[1] != "All people" or r[2] != "Total":
                    continue
                label, v = r[3], r[4]
            else:
                continue
            ca = dz2ca.get(r[0])
            try:
                out[ca][norm(label)] += float(v)
            except ValueError:
                pass
    return out


def read_ni(dirpath, table):
    import pandas as pd
    path = os.path.join(dirpath, f"census-2021-ms-{table}.xlsx")
    x = pd.ExcelFile(path)
    sheet = "LGD" if "LGD" in x.sheet_names else x.sheet_names[1]
    d = pd.read_excel(x, sheet, header=None)
    h = d.index[d.apply(lambda r: r.astype(str).str.contains("Geography code").any(), axis=1)][0]
    cols = [norm(c) for c in d.iloc[h]]
    out = {}
    for _, r in d.iloc[h + 1:].iterrows():
        row = dict(zip(cols, r.tolist()))
        code = str(row.get("Geography code", ""))
        if not code.startswith("N09"):
            if out:          # the first table on the sheet has ended (MS-C01 has a percentages table below)
                break
            continue
        out[code] = row
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ew", required=True)
    ap.add_argument("--scot", required=True)
    ap.add_argument("--sape", required=True)
    ap.add_argument("--ni", required=True)
    ap.add_argument("--out", default=ROOT)
    a = ap.parse_args()
    import pandas as pd

    rows = json.load(open(os.path.join(a.out, "areas.json")))
    by = {r["iso3"]: r for r in rows}
    sape = pd.read_excel(a.sape, sheet_name=-1, header=None)
    hr = sape.index[sape.iloc[:, 0].astype(str) == "Data zone code"][0]
    dz2ca = {str(d): str(c) for d, c in zip(sape.iloc[hr + 1:, 0], sape.iloc[hr + 1:, 2]) if str(d).startswith("S01")}
    z = scot_tables(a.scot)
    cache_ew, cache_s, cache_n = {}, {}, {}
    counts = {}      # key -> code -> [numerator, denominator]
    defs = []
    for m in C:
        got = {}
        if "ew" in m:
            t, num, den = m["ew"]
            if t not in cache_ew:
                cache_ew[t] = read_ew(a.ew, t, by)
            for code, cats in cache_ew[t].items():
                if code in by:
                    dn = sum(v for c, v in cats.items() if c != -8 and c != -9 and (den is ALL or c in den))
                    nm = sum(cats.get(c, 0) for c in num)
                    if dn:
                        got[code] = [nm, dn]
        if "scot" in m:
            t, num, den = m["scot"]
            if t not in cache_s:
                cache_s[t] = read_scot(z, t, dz2ca)
            for code, cats in cache_s[t].items():
                if code in by and cats.get(norm(den)):
                    dn = cats[norm(den)]
                    nm = sum(-cats[norm(l[1:])] if l.startswith("-") else cats[norm(l)] for l in num)
                    if any(l.startswith("-") for l in num):
                        nm += dn
                    got[code] = [nm, dn]
            missing = [l for l in num if norm(l.lstrip("-")) not in next(iter(cache_s[t].values()))]
            if missing:
                raise SystemExit(f"{m['key']}: Scottish labels not found {missing}")
        if "ni" in m:
            t, num, den = m["ni"]
            if t not in cache_n:
                cache_n[t] = read_ni(a.ni, t)
            for code, row in cache_n[t].items():
                miss = [l for l in num + [den] if norm(l.lstrip("-")) not in row]
                if miss:
                    raise SystemExit(f"{m['key']}: NI columns not found {miss}; have {list(row)[:40]}")
                dn = float(row[norm(den)])
                nm = sum(-float(row[norm(l[1:])]) if l.startswith("-") else float(row[norm(l)]) for l in num)
                if any(l.startswith("-") for l in num):
                    nm += dn
                got[code] = [nm, dn]
        for code, (nm, dn) in got.items():
            by[code][m["key"]] = round(100 * nm / dn, 1 if 100 * nm / dn >= 1 else 2)
            by[code][m["key"] + "_year"] = 2022 if code.startswith("S") else 2021
        counts[m["key"]] = got
        nat = {c[0] for c in got}
        print(f"{m['key']:16} {len(got):3} areas  nations={''.join(sorted(nat))}")
        defs.append({"key": m["key"], "group": m["group"], "label": m["label"], "short": m.get("short"), "format": "pct", "scale": "linear",
                     "step": 0.5, "source": "x_census", "yearText": "2021 (Scotland 2022)", "areaYear": True, "nations": m.get("nations", "EWSN"),
                     "compare": "uk", "info": m["info"] + (" " + m["note"] if m.get("note") else "") + " Census 2021 in England, Wales and Northern Ireland; Scotland's census was in 2022.",
                     "phrase": m["phrase"], "keywords": "census " + m["kw"]})

    with open(os.path.join(a.out, "areas.json"), "w") as f:
        json.dump(rows, f, separators=(",", ":"))
    os.makedirs(CACHE, exist_ok=True)
    with open(os.path.join(CACHE, "census_counts.json"), "w") as f:
        json.dump(counts, f)

    js = lambda d: json.dumps(d, ensure_ascii=False)
    lines = ["/* Generated by scripts/build_census.py: the census measures added in release 1.2. Edit the script, not this file. */",
             "(function () {", "  const add = [];"]
    for d in defs:
        phrase = d.pop("phrase")
        lines.append(f"  add.push(Object.assign({js({k: v for k, v in d.items() if v is not None})}, {{ type: \"range\", year: {js(d['key'] + '_year')}, say: (b) => {js(phrase)} + \" is \" + b }}));")
    lines += ["  window.FILTERS.push(...add);", f"  Object.assign(window.SOURCES, {js(SOURCE)});", "})();", ""]
    with open(os.path.join(a.out, "census.js"), "w") as f:
        f.write("\n".join(lines))
    print("census measures:", len(defs))


if __name__ == "__main__":
    main()
