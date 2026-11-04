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

## Notes

- **Area** is measured from the boundary map, which is clipped to the coastline and simplified, so it is close to but not exactly the official area.
- **Population change over 10 years** and **population growth** are worked out on this site from the mid-year estimates.
- **Barnsley and Sheffield** were given new codes in 2025 (E08000038 and E08000039) after a small change to the boundary between them. Most published figures still use the old codes (E08000016 and E08000019), so the site keeps those. The map shows the 2025 boundary.
- **Orkney and Shetland** are drawn together in a box in the North Sea, and **London** is drawn a second time, enlarged, in a box to the west (see `MAP_INSETS` and `MAP_POPOUT` in filters.js). Their shapes are unchanged.
- The 361 areas change on 1 April 2027, when Surrey's 11 districts become two unitary councils.

## Collected for later releases

- Deprivation for all four nations (England IoD 2025, Wales WIMD 2025, Scotland SIMD 2020v2, Northern Ireland NIMDM 2017), from the IMD package: https://github.com/humaniverse/IMD, to be checked against the official files.
- Small-area boundaries for England, Wales and Northern Ireland, and a postcode to small area lookup (February 2025), from geographr.
