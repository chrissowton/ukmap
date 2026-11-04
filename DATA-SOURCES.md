# Data sources

Every figure on Which Places? comes from an official, openly licensed source. The site's "About this data" box gives the source, licence, years and citation for each measure.

## Releases 1.0.1 and 1.0.2

| Data | Original publisher | How we got it | Licence |
| --- | --- | --- | --- |
| Population, density, age groups, median age, 1991–2025 (mid-year estimates; Northern Ireland from 2001) | ONS (England and Wales), National Records of Scotland, NISRA | ONS's own data for Explore Local Statistics, published on GitHub: https://github.com/ONSdigital/explore-local-statistics-data (copy of 29 October 2026) | Open Government Licence v3.0 |
| Population by five-year age band and sex (pyramids) | as above | as above | Open Government Licence v3.0 |
| Local Authority Districts (May 2025) Boundaries UK BGC (V2): generalised to 20 m and clipped to the coastline | ONS Open Geography Portal | Downloaded from the portal (4 November 2026), simplified for the web with mapshaper | Open Government Licence v3.0; source: Office for National Statistics licensed under the Open Government Licence v.3.0; contains OS data © Crown copyright and database right |
| Local authority to region lookup (2024) | ONS Open Geography Portal | geographr, as above | Open Government Licence v3.0 |

## Notes

- **Area** is measured from the boundary map, which is clipped to the coastline and simplified, so it is close to but not exactly the official area.
- **Population change over 10 years** and **population growth** are worked out on this site from the mid-year estimates.
- **Barnsley and Sheffield** were given new codes in 2025 (E08000038 and E08000039) after a small change to the boundary between them. Most published figures still use the old codes (E08000016 and E08000019), so the site keeps those. The map shows the 2025 boundary.
- **Shetland** is drawn in a box closer to the mainland (see `MAP_INSETS` in filters.js). Its shape and size are unchanged.
- The 361 areas change on 1 April 2027, when Surrey's 11 districts become two unitary councils.

## Collected for later releases

- Deprivation for all four nations (England IoD 2025, Wales WIMD 2025, Scotland SIMD 2020v2, Northern Ireland NIMDM 2017), from the IMD package: https://github.com/humaniverse/IMD, to be checked against the official files.
- 66 further local measures from ONS Explore Local Statistics (income, pay, jobs, house prices, health, wellbeing, emissions, broadband and more).
- Small-area boundaries for England, Wales and Northern Ireland, and a postcode to small area lookup (February 2025), from geographr.
