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
// Islands drawn in a box nearer the mainland so the UK fits the screen better (as on Ordnance Survey maps).
// dx, dy: how far to move them, in degrees of longitude and latitude. contains(): which points belong to them.
window.MAP_INSETS = [
  { codes: ["S12000023"], label: "Orkney & Shetland", dx: 3.0, dy: -1.7,
    contains: (lon, lat) => lat > 58.7 && lon > -3.5 && lon < -2.3 },
  { codes: ["S12000027"], label: "Orkney & Shetland", dx: 2.6, dy: -2.5,
    contains: (lon, lat) => lat > 59.4 && lon > -2.3 && lon < -0.6 },
];
// Insets with the same label share one box.
// One area group drawn again, enlarged, in a box of its own (London's 33 boroughs are too small to see otherwise).
// box: [[west, north], [east, south]] in degrees: where the box sits on the map (here, the sea west of Wales).
window.MAP_POPOUT = { region: "London", label: "London", box: [[-9.1, 53.85], [-5.75, 51.55]] };
window.NATION_CODES = { E: "England", W: "Wales", S: "Scotland", N: "Northern Ireland" };

// Not used on the UK site (kept so shared code finds them)
window.SDGS = [];
window.SDG_STATUS = [];

window.FILTER_GROUPS = ["Places", "Population", "Age", "Money and work", "Housing", "Deprivation", "Health", "Wellbeing",
  "Education and skills", "Getting connected", "Services and culture", "Environment",
  "Census: people", "Census: health and care", "Census: homes and households", "Census: work and learning", "Charities and schools"];
// the measures on the cards at the top of each area's page (and used to find similar areas)
window.HEADLINE = ["population", "median_age", "pct_65plus", "gdhi_pc", "child_pov_ahc", "claimant_rate", "life_exp_f", "dep_all"];

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
  {
    key: "city", type: "cat", group: "Places",
    label: "City region", short: "City region",
    order: ["Greater London", "Greater Manchester", "West Midlands (combined authority)", "West Yorkshire", "South Yorkshire", "Liverpool City Region", "North East (combined authority)", "Tees Valley", "West of England", "Cambridgeshire and Peterborough", "East Midlands (combined county authority)", "York and North Yorkshire", "Hull and East Yorkshire", "Greater Lincolnshire", "Lancashire", "Devon and Torbay", "Cardiff Capital Region", "Swansea Bay City Region", "North Wales", "Glasgow City Region", "Edinburgh and South East Scotland City Region", "Aberdeen City Region", "Belfast City Region"],
    say: (v) => `the area is in ${v}`,
    source: "cityreg", info: "City regions: England's combined authorities (groups of councils with an elected mayor), Greater London, and the city regions of Wales, Scotland and Northern Ireland. Areas outside a city region have no value.",
    keywords: "city region combined authority conurbation metro mayor greater manchester west midlands glasgow cardiff belfast",
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

// Charities (release 1.4): worked out on this site from the three charity registers
window.FILTERS.push(
  num("ch_per1k", "Charities and schools", "Charities based here per 1,000 people", {
    short: "Charities per 1,000", step: 0.1, format: "dec1", source: "charities", year: "ch_per1k_year", yearText: "Nov 2026", scale: "log",
    say: (b) => `charities based in the area per 1,000 people is ${b}`,
    info: "Registered charities whose registered postcode is in the area, per 1,000 residents. Charities are counted where they are registered, which for big national charities is often a head office, so London and city centres score high; local reach is wider than this shows.",
    keywords: "charities voluntary sector third sector civil society ngo",
  }),
  num("ch_inc_pc", "Charities and schools", "Charity income per person", {
    short: "Charity income per person", step: 10, format: "gbp", source: "charities", year: "ch_inc_pc_year", yearText: "Nov 2026", scale: "log",
    say: (b) => `the income of charities based in the area per resident is ${b}`,
    info: "The latest yearly income of all registered charities based in the area, divided by its population. Head offices of large national charities push some areas very high.",
    keywords: "charities income funding voluntary sector",
  }),
);
window.SOURCES = {
  onsmye: {
    name: "ONS, NRS and NISRA mid-year population estimates (via ONS Explore Local Statistics)",
    url: "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates",
    licence: "Open Government Licence v3.0",
  },
  onsgeo: {
    name: "ONS Open Geography Portal: Local Authority Districts (May 2025) Boundaries UK BGC, and the local authority to region lookup (via the geographr package). Contains OS data © Crown copyright and database right",
    url: "https://geoportal.statistics.gov.uk/",
    licence: "Open Government Licence v3.0",
  },
  cityreg: { name: "Combined authorities and city regions as used by ONS Explore Local Statistics (November 2026); members listed in scripts/city_regions.json", url: "https://www.gov.uk/guidance/combined-authorities", licence: "Open Government Licence v3.0" },
  charities: { name: "Charity Commission for England and Wales, Scottish Charity Regulator (OSCR) and Charity Commission for Northern Ireland registers (November 2026); counted on this site by registered postcode", url: "https://register-of-charities.charitycommission.gov.uk/", licence: "Open Government Licence v3.0" },
  myindex: { name: "Your own index, worked out on this site from the measures and weights you chose (each measure from its own source)", url: "#", licence: "—" },
};

/* Ready-made questions shown before any filter is set. */
window.STARTERS = [
  { title: "High child poverty", filters: [{ key: "child_pov_ahc", min: 35 }] },
  { title: "Low incomes, many children", filters: [{ key: "gdhi_pc", max: 19000 }, { key: "pct_0_15", min: 20 }] },
  { title: "Shorter lives", filters: [{ key: "life_exp_m", max: 77 }] },
  { title: "Ageing and rural", filters: [{ key: "pct_65plus", min: 27 }, { key: "density", max: 150 }] },
  { title: "Poor broadband", filters: [{ key: "slow_bb", min: 5 }] },
  { title: "Shrinking populations", filters: [{ key: "pop_change_10y", max: 0 }] },
  { title: "Fast-growing places", filters: [{ key: "pop_change_10y", min: 10 }] },
];

/* Puzzles for "Question of the day". Only puzzles with 1–8 answers in the current data are shown. */
window.PUZZLES = [
  { q: "Which areas have more than 40% of children in poverty after housing costs?", filters: [{ key: "child_pov_ahc", min: 40 }] },
  { q: "Where do women live longest on average: above 86 years?", filters: [{ key: "life_exp_f", min: 86 }] },
  { q: "Which areas outside London have more than 5,000 people per km²?", filters: [{ key: "density", min: 5000 }, { key: "region", values: window.REGIONS.filter((r) => r !== "London") }] },
  { q: "Find a Welsh area where the population grew by more than 5% in 10 years.", filters: [{ key: "nation", values: ["Wales"] }, { key: "pop_change_10y", min: 5 }] },
  { q: "Which areas have a median age over 52?", filters: [{ key: "median_age", min: 52 }] },
  { q: "Where are more than a quarter of people aged 0 to 15?", filters: [{ key: "pct_0_15", min: 25 }] },
];

/* Families: related measures shown as ONE item in the filter menu, with a picker inside. */
window.FAMILIES = [
  { id: "eth", label: "Ethnic group", short: "Ethnic group", info: "Share of people in Asian, Black, mixed or other ethnic groups (census).",
    variants: [["c_minority", "Not White (all)"], ["c_asian", "Asian"], ["c_black", "Black"]] },
  { id: "tenure", label: "Housing tenure", short: "Tenure", info: "Whether households own or rent their home (census).",
    variants: [["c_owner", "Home owners"], ["c_social_rent", "Social renting"], ["c_private_rent", "Private renting"]] },
  { id: "care", label: "Unpaid carers", short: "Carers", info: "People who give unpaid care to someone with a long-term illness, disability or old age (census).",
    variants: [["c_carers", "Any unpaid care"], ["c_carers50", "50 hours or more a week"]] },
  { id: "rel", label: "Religion", short: "Religion", info: "Religion (census; a voluntary question).",
    variants: [["c_no_religion", "No religion"], ["c_muslim", "Muslim"]] },
  { id: "le", label: "Life expectancy", short: "Life expectancy", info: "How long people can expect to live, and to live in good health.",
    variants: [["life_exp_f", "Women"], ["life_exp_m", "Men"], ["hle_f", "Healthy, women"], ["hle_m", "Healthy, men"]] },
  { id: "childpov", label: "Child poverty", short: "Child poverty", info: "Share of children in households below 60% of the median income, after or before housing costs.",
    variants: [["child_pov_ahc", "After housing costs"], ["child_pov_bhc", "Before housing costs"]] },
  { id: "wb", label: "Personal wellbeing", short: "Wellbeing", info: "How people rate their own lives, from 0 to 10 (ONS Annual Population Survey).",
    variants: [["satisfaction", "Life satisfaction"], ["happiness", "Happiness"], ["worthwhile", "Worthwhile"], ["anxiety", "Anxiety"]] },
  { id: "dep", label: "Deprivation", short: "Deprivation", info: "Share of an area's neighbourhoods among the most deprived 10% in its nation. Each nation has its own index, so compare within a nation.",
    variants: [["dep_all", "All domains"], ["dep_income", "Income"], ["dep_employment", "Employment"], ["dep_health", "Health"], ["dep_education", "Education"]] },
  { id: "work", label: "Work", short: "Work", info: "Who is in work, out of work, or not looking for work.",
    variants: [["employment_rate", "Employment rate"], ["inactive", "Economically inactive"], ["unemployment", "Unemployment rate"], ["claimant_rate", "Claimant count"]] },
  { id: "bb", label: "Broadband and mobile", short: "Connectivity", info: "Broadband and mobile phone coverage, from Ofcom.",
    variants: [["full_fibre", "Full fibre"], ["slow_bb", "Below 30 Mbit/s"], ["cover_4g", "4G"], ["cover_5g", "5G"]] },
  { id: "age", label: "Age structure", short: "Age", info: "How old the population is: the median age and the share of children, working-age adults and older people.",
    variants: [["median_age", "Median age"], ["pct_0_15", "% aged 0–15"], ["pct_16_64", "% aged 16–64"], ["pct_65plus", "% aged 65+"]] },
  { id: "growth", label: "Population change", short: "Population change", info: "How the population is changing: over one year or over ten years.",
    variants: [["pop_change_10y", "Over 10 years"], ["pop_growth", "In one year"]] },
];

/* Themes along the top of the page; each opens a panel with these categories. */
window.THEMES = [
  { id: "people", label: "People", groups: ["Population", "Age"] },
  { id: "money", label: "Money and work", groups: ["Money and work", "Housing"] },
  { id: "deprivation", label: "Deprivation", groups: ["Deprivation"] },
  { id: "health", label: "Health and wellbeing", groups: ["Health", "Wellbeing"] },
  { id: "learning", label: "Education", groups: ["Education and skills"] },
  { id: "services", label: "Services", groups: ["Getting connected", "Services and culture"] },
  { id: "environment", label: "Environment", groups: ["Environment"] },
  { id: "charities", label: "Charities", groups: ["Charities and schools"] },
  { id: "census", label: "Census", groups: ["Census: people", "Census: health and care", "Census: homes and households", "Census: work and learning"] },
  { id: "places", label: "Places", groups: ["Places"] },
];
window.PHYS_THEMES = [];

/* Shorter names for some filters on the menu chips (the full name shows on hover or tap). */
window.MENU_LABELS = {
  pop_growth: "Population growth", density: "Population density", area_km2: "Area",
};
