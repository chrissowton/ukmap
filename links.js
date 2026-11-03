/* Which Countries? — "Find out more": links to explanations beyond the numbers.
 * Most links are built from names, using addresses that always work (Wikipedia's "go" search jumps straight to the
 * article when the title matches, and lists the closest articles when it doesn't; Our World in Data and YouTube searches).
 * CURATED holds hand-picked extras: add your own by measure key, country code (ISO3) or SDG number. */
(function () {
  "use strict";
  const enc = encodeURIComponent;
  const wiki = (title) => `https://en.wikipedia.org/wiki/Special:Search?go=Go&search=${enc(title)}`;
  const owid = (q) => `https://ourworldindata.org/search?q=${enc(q)}`;
  const yt = (q) => `https://www.youtube.com/results?search_query=${enc(q)}`;
  const bbc = (q) => `https://www.bbc.co.uk/search?q=${enc(q)}`;

  // Hand-picked links. Each: [label, url, kind]. kind: "read" | "video" | "data"
  const CURATED = {
    measure: {
      gdp_per_capita: [["Hans Rosling: The best stats you've ever seen (TED)", "https://www.ted.com/talks/hans_rosling_the_best_stats_you_ve_ever_seen", "video"], ["Dollar Street: how families live at every income", "https://www.gapminder.org/dollar-street", "data"]],
      life_expectancy: [["Hans Rosling: 200 areas, 200 years, 4 minutes (BBC)", "https://www.youtube.com/results?search_query=Hans+Rosling+200+Areas+200+Years+4+Minutes", "video"]],
      fertility: [["Gapminder: Don't Panic, the truth about population", "https://www.gapminder.org/videos/dont-panic-the-facts-about-population/", "video"]],
      hdi: [["UNDP Human Development Reports", "https://hdr.undp.org/", "read"]],
      regime: [["V-Dem: Democracy Report", "https://v-dem.net/publications/", "read"]],
      libdem: [["V-Dem: Democracy Report", "https://v-dem.net/publications/", "read"]],
      refugees_hosted: [["UNHCR: Global Trends report", "https://www.unhcr.org/global-trends", "read"]],
      refugees_from: [["UNHCR: Global Trends report", "https://www.unhcr.org/global-trends", "read"]],
      sdg_on_track: [["UN: the 17 goals", "https://sdgs.un.org/goals", "read"], ["Sustainable Development Report (SDSN)", "https://dashboards.sdgindex.org/", "data"]],
    },
    country: {},
  };
  // Wikipedia's articles about a country by topic, e.g. "Demographics of Brazil"
  const TOPIC = {
    Population: "Demographics of", Health: "Health in", Gender: "Women in", Development: "Economy of", "Work & money": "Economy of",
    Trade: "Economy of", "Global links": "Foreign relations of", Refugees: "Immigration to", Cities: "List of cities in", Culture: "Culture of",
    Tourism: "Tourism in", Technology: "Internet in", Politics: "Politics of", "UN & treaties": "Foreign relations of", Military: "Military of",
    Sport: "Sport in", Geography: "Geography of", Climate: "Climate of", "Energy & resources": "Energy in", Environment: "Environment of",
    SDGs: "Economy of", "Happiness & trust": "Culture of", "Religion & morals": "Religion in", "Gender roles": "Women in",
    "Politics & institutions": "Politics of", "Tolerance & priorities": "Culture of", "Science & health": "Health in", "Risk & safety": "Crime in", "Afrobarometer (Africa)": "Politics of", "Pew global views": "Foreign relations of",
  };
  const TOPIC_KEY = { largest_religion: "Religion in", official_languages: "Languages of", spoken_languages: "Languages of", pct_muslim: "Religion in", pct_christian: "Religion in",
    renewables_elec_pct: "Renewable energy in", co2_per_capita: "Climate change in", co2_mt: "Climate change in", gini: "Income inequality in", extreme_poverty: "Poverty in",
    literacy: "Education in", mean_schooling: "Education in", expected_schooling: "Education in", primary_completion: "Education in", lower_secondary_completion: "Education in",
    women_parliament: "Women in", regime: "Politics of", democracy: "Politics of", libdem: "Politics of", homicides: "Crime in", unemployment: "Economy of",
    urban_pct: "Urbanization in", tourists: "Tourism in", currencies: "Economy of", driving_side: "Transport in", dtm_stage: "Demographics of" };
  // "the United Kingdom", "the Philippines": articles use the article
  const THE = new Set(["USA", "GBR", "NLD", "PHL", "BHS", "GMB", "CAF", "DOM", "ARE", "SLB", "MHL", "MDV", "COM", "SYC", "COD", "COG", "CZE"]);
  const cn = (r) => (THE.has(r.iso3) && !/^the /i.test(r.name) ? "the " + r.name : r.name);

  function country(r) {
    const n = r.name;
    return [
      [`${n} on Wikipedia`, wiki(n), "read"], [`Geography of ${cn(r)}`, wiki(`Geography of ${cn(r)}`), "read"],
      [`${n}: area profile (BBC News)`, bbc(`${n} area profile`), "read"],
      [`${n} on the ONS website`, `https://www.ons.gov.uk/search?q=${enc(n)}`, "data"],
      [`Dollar Street: photos of how families live, at every income (find ${n} on the map)`, "https://www.gapminder.org/dollar-street/map", "photo"],
      [`Videos about ${n} (Geography Now and others)`, yt(`${n} geography explained`), "video"],
      ...(CURATED.country[r.iso3] || []),
    ];
  }
  function measure(f) {
    const plain = f.label.replace(/\s*\([^)]*\)\s*/g, " ").trim();
    return [
      ...(CURATED.measure[f.key] || []),
      ...(f.source === "wgm" ? [["Wellcome Global Monitor: reports and data", "https://wellcome.org/reports/wellcome-global-monitor", "data"]] : []),
      ...(f.source === "wrp" ? [["World Risk Poll: reports and data explorer", "https://www.lrfoundation.org.uk/world-risk-poll-data", "data"]] : []),
      ...(f.source === "afro" ? [["Afrobarometer: findings and online data analysis", "https://www.afrobarometer.org/online-data-analysis/", "data"]] : []),
      ...(f.source === "pew25" ? [["Pew Research Center: Global Attitudes", "https://www.pewresearch.org/global/", "read"]] : []),
      ...(f.source === "whr" ? [["World Happiness Report", "https://worldhappiness.report/", "read"]] : []),
      ...(f.source === "wvs" ? [["World Values Survey: findings and online analysis", "https://www.worldvaluessurvey.org/WVSOnline.jsp", "data"],
        ["The Inglehart–Welzel cultural map of the UK", wiki("Inglehart–Welzel cultural map of the UK"), "read"]] : []),
      [`${plain} on Wikipedia`, wiki(plain), "read"], [`${plain} on the ONS website`, `https://www.ons.gov.uk/search?q=${enc(plain)}`, "data"], [`Videos explaining ${plain.toLowerCase()}`, yt(`${plain} explained geography`), "video"],
    ];
  }
  // why does this country look like this on this measure?
  function countryMeasure(r, f) {
    const pre = TOPIC_KEY[f.key] || TOPIC[f.group] || "Geography of";
    const plain = f.label.replace(/\s*\([^)]*\)\s*/g, " ").trim();
    return [[`${pre} ${cn(r)}`, wiki(`${pre} ${cn(r)}`), "read"], [`${plain} in ${r.name}: news and analysis`, bbc(`${r.name} ${plain}`), "read"]];
  }
  function feature(name, kind) {
    const clean = String(name).replace(/\s*\([^)]*\)\s*/g, " ").trim();
    return [[`${clean} on Wikipedia`, wiki(clean), "read"], [`Videos about ${clean}`, yt(`${clean} ${kind || ""}`.trim()), "video"]];
  }
  function sdg(n, name) {
    return [[`Goal ${n}: ${name} (UN)`, `https://sdgs.un.org/goals/goal${n}`, "read"], [`Goal ${n} on Our World in Data's SDG tracker`, owid(`SDG ${n} ${name}`), "data"]];
  }
  const ICON = { read: "📖", video: "▶", data: "📊", photo: "📷" };
  function html(list, title = "Find out more") {
    if (!list || !list.length) return "";
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    return `<div class="morelinks"><h5>${esc(title)}</h5><ul>${list.map(([l, u, k]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener"><span class="mk mk-${k}" aria-hidden="true">${ICON[k] || "↗"}</span>${esc(l)}</a></li>`).join("")}</ul></div>`;
  }
  const hasTopic = (key) => key in TOPIC_KEY;
  window.WL = { hasTopic, country, measure, countryMeasure, feature, sdg, html, CURATED };
})();
