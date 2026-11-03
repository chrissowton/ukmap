/*
 * Measure definitions for Which Places?
 *
 * Each entry describes one measure. The interface is generated from this list, so adding a measure is:
 * add a field to areas.json (see scripts/build_uk.py), then add an entry here.
 *
 *   key       field name in areas.json
 *   type      "range" (numbers), "multi" (lists), "cat" (one value per area), "bool" (yes / no)
 *   group     heading in the "Add a filter" menu
 *   label     name shown in menus and chips
 *   short     shorter chip label (optional)
 *   say       how the filter reads in the sentence "Showing N areas where …"
 *   source    key into SOURCES (bottom of file)
 *   year      field holding the data year, or a fixed year
 *   info      one or two plain sentences explaining what it measures
 *   keywords  extra words people might type to find it
 *   nations   which nations the measure covers: any of "E", "W", "S", "N" (default: all four)
 *   compare   "uk"      the same measure everywhere, so areas can be compared across the UK (default)
 *             "harmonised" made comparable across nations (census topics); see `note`
 *             "nation"  only comparable within a nation (deprivation indices, school results, crime)
 *   note      a sentence for About this data on how the nations differ
 *
 * Range filters also take: scale ("linear" | "log"), step, format, bounds, clip, initial (as on the world site).
 */

window.SITE = {
  name: "Which Places?",
  noun: ["area", "areas"],          // what one map area is called
  scope: "the UK",                  // the whole map
  github: "",
  donate: "",
  url: "https://chrissowton.github.io/ukmap/",
};

// The 12 ITL1 regions: 9 English regions and the three other nations. They take the place of the world site's continents.
window.REGIONS = ["North East", "North West", "Yorkshire and The Humber", "East Midlands", "West Midlands",
  "East of England", "London", "South East", "South West", "Wales", "Scotland", "Northern Ireland"];
window.REGION_COLOURS = {
  "North East": "#1f77b4", "North West": "#17becf", "Yorkshire and The Humber": "#8c564b", "East Midlands": "#bcbd22",
  "West Midlands": "#ff7f0e", "East of England": "#e377c2", "London": "#7f3fbf", "South East": "#2ca02c",
  "South West": "#9edae5", "Wales": "#d62728", "Scotland": "#3949ab", "Northern Ireland": "#00897b",
};
window.NATIONS = ["England", "Wales", "Scotland", "Northern Ireland"];
window.NATION_CODES = { E: "England", W: "Wales", S: "Scotland", N: "Northern Ireland" };

// Not used on the UK site (kept so shared code finds them)
window.SDGS = [];
window.SDG_STATUS = [];

window.FILTER_GROUPS = ["Places", "Population", "Age"];

const num = (key, group, label, o) => ({ key, group, label, type: "range", scale: "linear", step: 1, source: "onsmye", year: key + "_year", ...o });

window.FILTERS = [
  // ---------------- Places ----------------
  {
    key: "nation", type: "cat", group: "Places",
    label: "Nation", short: "Nation",
    order: ["England", "Wales", "Scotland", "Northern Ireland"],
    say: (v) => `the area is in ${v}`,
    source: "onsgeo", info: "The four nations of the UK.",
    keywords: "england wales scotland northern ireland country nation",
  },
  {
    key: "region", type: "cat", group: "Places",
    label: "Region", short: "Region",
    order: window.REGIONS,
    say: (v) => `the area is in ${["Wales", "Scotland", "Northern Ireland", "London"].includes(v) ? v : "the " + v}`,
    source: "onsgeo", info: "The 12 regions used for official statistics (ITL1): the nine English regions, Wales, Scotland and Northern Ireland.",
    keywords: "region north south east west midlands london yorkshire itl",
  },
  num("area_km2", "Places", "Area", {
    short: "Area", scale: "log", format: "km2", source: "onsgeo", year: 2024,
    say: (b) => `the area covers ${b}`,
    info: "Land area in square kilometres, measured from the boundary map (clipped to the coastline).",
    keywords: "size big small area large km",
  }),

  // ---------------- Population ----------------
  num("population", "Population", "Population", {
    scale: "log", format: "people",
    say: (b) => `the population is ${b}`,
    info: "Number of people living in the area at the middle of the year (mid-year population estimate).",
    keywords: "people size big small residents inhabitants",
  }),
  num("density", "Population", "Population density", {
    short: "Density", scale: "log", format: "density",
    say: (b) => `population density is ${b}`,
    info: "People per square kilometre.",
    keywords: "density crowded sparse rural urban people per km",
  }),
  num("pop_growth", "Population", "Population growth", {
    short: "Growth", step: 0.1, format: "pct", clip: true, year: null,
    say: (b) => `the population grew by ${b} in the year`,
    info: "Change in population over one year, as a percentage. Negative means it shrank.",
    keywords: "growth increase shrinking decline change",
  }),
  num("pop_change_10y", "Population", "Population change over 10 years", {
    short: "10-year change", step: 0.5, format: "pct", clip: true,
    say: (b) => `the population changed by ${b} between 2015 and 2025`,
    info: "Change in population between mid-2015 and mid-2025, as a percentage.",
    keywords: "growth change decade shrinking growing ten years",
  }),

  // ---------------- Age ----------------
  num("median_age", "Age", "Median age", {
    short: "Median age", format: "years", step: 0.5,
    say: (b) => `the median age is ${b}`,
    info: "Half the people are younger than this age and half are older.",
    keywords: "age old young ageing median pyramid",
  }),
  num("pct_0_15", "Age", "Children (0 to 15)", {
    short: "Aged 0–15", format: "pct", step: 0.5,
    say: (b) => `${b} of people are aged 0 to 15`,
    info: "Share of the population aged 0 to 15.",
    keywords: "children young youth kids age structure",
  }),
  num("pct_16_64", "Age", "Working age (16 to 64)", {
    short: "Aged 16–64", format: "pct", step: 0.5,
    say: (b) => `${b} of people are aged 16 to 64`,
    info: "Share of the population aged 16 to 64.",
    keywords: "working age adults age structure",
  }),
  num("pct_65plus", "Age", "Older people (65 and over)", {
    short: "Aged 65+", format: "pct", step: 0.5,
    say: (b) => `${b} of people are 65 or older`,
    info: "Share of the population aged 65 and over.",
    keywords: "elderly old ageing retired pension older people",
  }),
];

window.SOURCES = {
  onsmye: {
    name: "ONS, NRS and NISRA mid-year population estimates (via ONS Explore Local Statistics)",
    url: "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates",
    licence: "Open Government Licence v3.0",
  },
  onsgeo: {
    name: "ONS Open Geography Portal: Local Authority Districts (May 2024) boundaries and lookups (via the geographr package). Contains OS data © Crown copyright and database right",
    url: "https://geoportal.statistics.gov.uk/",
    licence: "Open Government Licence v3.0",
  },
  myindex: { name: "Your own index, worked out on this site from the measures and weights you chose (each measure from its own source)", url: "#", licence: "—" },
};

/* Ready-made questions shown before any filter is set. */
window.STARTERS = [
  { title: "Shrinking populations", filters: [{ key: "pop_change_10y", max: 0 }] },
  { title: "More over-65s than children", filters: [{ key: "pct_65plus", min: 22 }, { key: "pct_0_15", max: 16 }] },
  { title: "Fast-growing places", filters: [{ key: "pop_change_10y", min: 10 }] },
  { title: "Youngest places", filters: [{ key: "median_age", max: 36 }] },
  { title: "Crowded places", filters: [{ key: "density", min: 5000 }] },
  { title: "Scotland's ageing areas", filters: [{ key: "nation", values: ["Scotland"] }, { key: "median_age", min: 46 }] },
];

/* Puzzles for "Question of the day". Only puzzles with 1–8 answers in the current data are shown. */
window.PUZZLES = [
  { q: "Which areas outside London have more than 5,000 people per km²?", filters: [{ key: "density", min: 5000 }, { key: "region", values: window.REGIONS.filter((r) => r !== "London") }] },
  { q: "Find a Welsh area where the population grew by more than 5% in 10 years.", filters: [{ key: "nation", values: ["Wales"] }, { key: "pop_change_10y", min: 5 }] },
  { q: "Which areas have a median age over 52?", filters: [{ key: "median_age", min: 52 }] },
  { q: "Where are more than a quarter of people aged 0 to 15?", filters: [{ key: "pct_0_15", min: 25 }] },
];

/* Families: related measures shown as ONE item in the filter menu, with a picker inside. */
window.FAMILIES = [
  { id: "age", label: "Age structure", short: "Age", info: "How old the population is: the median age and the share of children, working-age adults and older people.",
    variants: [["median_age", "Median age"], ["pct_0_15", "% aged 0–15"], ["pct_16_64", "% aged 16–64"], ["pct_65plus", "% aged 65+"]] },
  { id: "growth", label: "Population change", short: "Population change", info: "How the population is changing: over one year or over ten years.",
    variants: [["pop_change_10y", "Over 10 years"], ["pop_growth", "In one year"]] },
];

/* Themes along the top of the page; each opens a panel with these categories. */
window.THEMES = [
  { id: "people", label: "People", groups: ["Population", "Age"] },
  { id: "places", label: "Places", groups: ["Places"] },
];
window.PHYS_THEMES = [];

/* Shorter names for some filters on the menu chips (the full name shows on hover or tap). */
window.MENU_LABELS = {
  pop_growth: "Population growth", density: "Population density", area_km2: "Area",
};
