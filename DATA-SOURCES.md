# Data sources

Every figure on Which Places? comes from an official, openly licensed source. The site's "About this data" box gives the source, licence, years and citation for each measure.

## Releases 1.0.1 and 1.0.2

| Data | Original publisher | How we got it | Licence |
| --- | --- | --- | --- |
| Population, density, age groups, median age, 1991–2025 (mid-year estimates; Northern Ireland from 2001) | ONS (England and Wales), National Records of Scotland, NISRA | ONS's own data for Explore Local Statistics, published on GitHub: https://github.com/ONSdigital/explore-local-statistics-data (copy of 29 October 2026) | Open Government Licence v3.0 |
| Population by five-year age band and sex (pyramids) | as above | as above | Open Government Licence v3.0 |
| Local Authority Districts (May 2025) Boundaries UK BGC (V2): generalised to 20 m and clipped to the coastline | ONS Open Geography Portal | Downloaded from the portal (4 November 2026), simplified for the web with mapshaper | Open Government Licence v3.0; source: Office for National Statistics licensed under the Open Government Licence v.3.0; contains OS data © Crown copyright and database right |
| Local authority to region lookup (2024) | ONS Open Geography Portal | geographr, as above | Open Government Licence v3.0 |

## Release 1.1: local measures

54 more measures for every local authority, mostly taken from ONS's own data for Explore Local Statistics (https://github.com/ONSdigital/explore-local-statistics-data, copy of 29 October 2026), which gathers official figures from many publishers. All are under the Open Government Licence v3.0. Built by `scripts/build_measures.py`, which also writes `measures.js` (the labels, explanations and sources shown on the site).

| Topic | Measures | Original publishers | Covers |
| --- | --- | --- | --- |
| Money and work | household income per person (GDHI), median weekly pay, child poverty (after and before housing costs), claimant count, employment rate, economically inactive, unemployment, job density, productivity (GVA per hour), new businesses, fuel poverty | ONS, NISRA, DWP and HMRC, DESNZ | UK (unemployment and job density: Great Britain; fuel poverty: England) |
| Housing | average house price, house prices compared with earnings, first-time buyers, new homes | HM Land Registry, Registers of Scotland, LPS NI, ONS, MHCLG, Welsh Government, NI Department of Finance | UK (affordability: England and Wales; new homes: not Scotland) |
| Health | life expectancy and healthy life expectancy (women, men), smokers, adult obesity, obesity at age 10 to 11, preventable heart and circulatory deaths | ONS, OHID, NHS England, NI Department of Health | UK (obesity: England; healthy life expectancy: counties and unitary areas in England) |
| Wellbeing | life satisfaction, happiness, feeling life is worthwhile, anxiety | ONS Annual Population Survey | UK |
| Education and skills | qualified to level 3 or above, no qualifications, GCSE English and maths by 19, key stage 2 expected standard, early years communication and language, apprenticeship starts | ONS, NISRA, Department for Education, Medr, Skills Development Scotland, Department for the Economy NI | mixed: see each measure |
| Getting connected | full fibre, broadband below 30 Mbit/s, 4G and 5G coverage, public electric car chargers, near a railway station | Ofcom, Department for Transport (data from Zapmap), ONS | UK (station walk: England and Wales) |
| Services and culture | near a library, sports facilities, supermarkets, museums, took part in the arts, visited a heritage site | ONS, DCMS Participation Survey | mixed: see each measure |
| Environment | greenhouse gas emissions per person, home electricity use, home gas use | DESNZ | UK (gas: Great Britain) |

### Deprivation

The share of each area's small areas (LSOAs in England and Wales, data zones in Scotland, SOAs in Northern Ireland) that are among the most deprived 10% of their own nation, overall and for the income, employment, health and education domains. Local authority summaries from the IMD package (https://github.com/humaniverse/IMD), which republishes:

- English Indices of Deprivation 2025 (MHCLG)
- Welsh Index of Multiple Deprivation 2025 (Welsh Government)
- Scottish Index of Multiple Deprivation 2020v2 (Scottish Government)
- Northern Ireland Multiple Deprivation Measure 2017 (NISRA)

All four are under the Open Government Licence v3.0. **Each nation's index is built differently and at a different time, so the site compares deprivation only within a nation** (the area page shows the region and nation medians, not a UK figure).

### Measures published separately for each nation

Employment, economic inactivity and level 3 qualifications come from the Annual Population Survey in Great Britain and from NISRA in Northern Ireland; they use the same definitions and are shown together. New homes, apprenticeship starts and preventable heart and circulatory deaths are counted differently in each nation, so, like deprivation, they are compared only within a nation.

## Release 1.2: census and city regions

### Census (25 measures)

Shares of people or households from the three censuses, worked out on this site from the published counts (`scripts/build_census.py`):

| Census | Publisher | How we got it | Geography |
| --- | --- | --- | --- |
| Census 2021, England and Wales | ONS | the giCentre census21 repository (https://github.com/gicentre/data/tree/main/census21), which republishes ONS's tables as Parquet | local authorities (2021). The councils merged since (Cumberland, Westmorland and Furness, North Yorkshire, Somerset) are made by adding up the old ones |
| Scotland's Census 2022 | National Records of Scotland | the 2022 data zone tables (download "Datazone2022" from scotlandscensus.gov.uk), added up to council areas with the lookup in NRS's small area population estimates | data zones (2022) to council areas |
| Census 2021, Northern Ireland | NISRA | main statistics tables (census-2021-ms-*.xlsx), Local Government District sheets | local government districts |

All three are under the Open Government Licence v3.0. Topics: ethnic group, born outside the UK, religion, English language, sexual orientation, armed forces veterans, general health, disability, unpaid care, cars, tenure, overcrowding, older people living alone, lone parents, household deprivation, qualifications, long-term sickness and retirement. Where a census did not ask a question, or asked it differently, that nation has no figure, and each measure's explanation says so (for example, English language skills in Scotland, sexual orientation in Scotland's data zone tables, veterans in Northern Ireland). Scotland's figures are for 2022, the others for 2021.

### City regions and other groups of councils

`groups.json` has figures for the UK, the four nations, the nine English regions and 23 city regions: England's combined authorities, Greater London, and the city regions of Wales, Scotland and Northern Ireland (members in `scripts/city_regions.json`). Built by `scripts/build_groups.py`. Each figure is either:

1. **official**: published by ONS for that group (ONS Explore Local Statistics covers the UK, nations, regions and combined authorities for many measures);
2. **added up**: totals, age shares and census shares, worked out exactly from the councils; or
3. **an estimate (≈)**: the average of its councils, weighted by the people the measure is about (children for child poverty, people aged 16 to 64 for work measures, everyone for the rest). Medians (pay, house prices, median age) and deprivation shares can only be estimated this way. Groups whose councils with figures hold less than 80% of the relevant people get no figure.

## Release 1.3: neighbourhoods

46,844 small areas, built by `scripts/build_small.py`: 33,755 LSOAs in England and 1,917 in Wales (2021), 7,392 data zones in Scotland (2022) and 3,780 data zones in Northern Ireland (2021). Each council's are in `nb/<council code>.json`, loaded only when the council is opened or the map is zoomed in.

| Data | Publisher | How we got it | Licence |
| --- | --- | --- | --- |
| LSOA (December 2021) boundaries, England and Wales, BGC | ONS Open Geography Portal | downloaded from the portal | Open Government Licence v3.0; contains OS data © Crown copyright and database right |
| Data Zone 2022 boundaries | Scottish Government | spatialdata.gov.scot (shapefile) | Open Government Licence v3.0 |
| Data Zone 2021 boundaries | NISRA | nisra.gov.uk (GeoJSON) | Open Government Licence v3.0 |
| LSOA population by single year of age, mid-2024 | ONS | ONS (sapelsoasyoa20222024.xlsx) | Open Government Licence v3.0 |
| Data zone population by single year of age, mid-2024 | National Records of Scotland | NRS small area population estimates | Open Government Licence v3.0 |
| Small-area deprivation: English IoD 2025, WIMD 2025, SIMD 2020v2, NIMDM 2017 | MHCLG, Welsh Government, Scottish Government, NISRA | the IMD package (https://github.com/humaniverse/IMD) | Open Government Licence v3.0 |
| ONS Postcode Directory (February 2025): postcode to small area | ONS | the geographr package (https://github.com/humaniverse/geographr) | Open Government Licence v3.0 (Northern Ireland postcodes: see the ONSPD licence notes on use of NI postcode data) |
| Census by small area | as for release 1.2 | England and Wales from the giCentre census21 LSOA tables; Scotland from the 2022 data zone tables | Open Government Licence v3.0 |

Notes:

- **Scotland's deprivation index (SIMD 2020v2) and Northern Ireland's (NIMDM 2017) use older small areas** (2011 data zones; 2001 Super Output Areas). Each new small area takes the figures of the old one most of its postcodes fall in, using the ONS Postcode Directory. Deciles still compare areas within one nation only.
- **Northern Ireland's small areas** have deprivation only in this release: NISRA's data zone population estimates and census tables are not among the files used.
- **England and Wales** small areas have no figures for country of birth, armed forces veterans or sexual orientation, which ONS publishes only for larger areas.
- Small-area population estimates are approximate; ONS asks that they are rounded to the nearest 100 when quoted.
- Map files are simplified for the web with mapshaper (15%, weighted, shapes kept).
- **Postcode finder:** `pc/<postcode district>.json` maps each postcode in the ONS Postcode Directory (including some no longer in use) to its small area and council.

## Notes

- **Area** is measured from the boundary map, which is clipped to the coastline and simplified, so it is close to but not exactly the official area.
- **Population change over 10 years** and **population growth** are worked out on this site from the mid-year estimates.
- **Barnsley and Sheffield** were given new codes in 2025 (E08000038 and E08000039) after a small change to the boundary between them. Most published figures still use the old codes (E08000016 and E08000019), so the site keeps those. The map shows the 2025 boundary.
- **Orkney and Shetland** are drawn together in a box in the North Sea, and **London** is drawn a second time, enlarged, in a box to the west (see `MAP_INSETS` and `MAP_POPOUT` in filters.js). Their shapes are unchanged.
- The 361 areas change on 1 April 2027, when Surrey's 11 districts become two unitary councils.

## Collected for later releases

- Deprivation for all four nations (England IoD 2025, Wales WIMD 2025, Scotland SIMD 2020v2, Northern Ireland NIMDM 2017), from the IMD package: https://github.com/humaniverse/IMD, to be checked against the official files.
- Small-area boundaries for England, Wales and Northern Ireland, and a postcode to small area lookup (February 2025), from geographr.
