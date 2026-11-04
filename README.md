# Which Places?

Free, open maps and data for every local authority in the UK, for charities, community groups, schools and anyone planning for a place. Stack filters to find places, compare them, rank them and watch change over time.

**Site:** https://chrissowton.github.io/ukmap/

Which Places? is built from [Which Countries?](https://github.com/chrissowton/worldmap), the open-source world map for geography, and shares its code.

## What's in release 1.3

- The 361 local authorities of England, Wales, Scotland and Northern Ireland (detailed May 2025 boundaries), grouped into the 12 UK regions and the four nations, with Shetland in an inset and a Go to menu for every nation and region.
- A layout made for a tall country: the map on the left at full height; on the right, a trail (United Kingdom › nation › region › area) with previous and next, the filters as chips, a sortable results table, and area profiles comparing each place with its region, nation and the UK.
- 54 local measures on money and work, housing, health, wellbeing, education, connectivity, services, environment and deprivation (all four nations' indices), from ONS Explore Local Statistics and the IMD package; see DATA-SOURCES.md.
- Neighbourhoods: all 46,844 small areas in the UK, with deprivation, population, age and census figures, loaded one council at a time (`nb/`), and a postcode finder (`pc/`).
- 25 census measures for all four nations (England, Wales and Northern Ireland 2021; Scotland 2022).
- 23 city regions, and a page for every nation, region and city region with its own figures (official where published, otherwise worked out from its councils).
- Population, density, growth, median age and age groups, every year from 1991 (2001 in Northern Ireland) to 2025, with a population pyramid for every area.
- Filters, Compare, Rankings, Charts, Insights, the statistics toolkit, About this data, downloads (PNG, SVG, CSV), share links, embedding, and a page for every measure (`m/`).

## How it works

Plain JavaScript with D3 7.9.0 and topojson 3.0.2, no build step. The browser loads:

| File | What it holds |
| --- | --- |
| `areas.json` | One row per local authority: its ONS code, name, nation, region and latest figures |
| `areas.topo.json` | The map (local authority boundaries) |
| `timeseries.json` | Every yearly measure, 1991–2025 |
| `census.js` | Labels, explanations and sources for the census measures (written by `scripts/build_census.py`) |
| `groups.json` | Figures for the UK, nations, regions and city regions (written by `scripts/build_groups.py`) |
| `measures.js` | Labels, explanations and sources for the release 1.1 measures (written by `scripts/build_measures.py`) |
| `pyramids.json` | Population pyramids every five years |
| `benchmarks.json` | The same measures for regions, nations and the UK (used from release 1.5) |
| `filters.js` | Every measure: its name, explanation, source and which nations it covers |

Each area's ONS code (for example E08000035 for Leeds) is kept in the field `iso3`, the name the world site uses for its country codes, so the shared code works unchanged.

## Rebuilding the data

See `scripts/build_uk.py` for the commands, and `DATA-SOURCES.md` for where every figure comes from.

## Licence

Code: MIT (see `LICENSE`). Data: as published by each source, mostly under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right.

## Rebuilding the data

Run these in order (each adds to the files the one before wrote; inputs are listed at the top of each script):

1. `scripts/build_uk.py`: boundaries, population and age
2. `scripts/build_measures.py`: the local measures and deprivation
3. `scripts/build_census.py`: the census measures
4. `scripts/build_groups.py`: figures for nations, regions and city regions
5. `scripts/build_small.py`: neighbourhoods and postcodes
6. `node make_pages.cjs`: a page for every measure
