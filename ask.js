/* Which Countries? — ask a question in plain English.
 * "How many democracies have between 45 and 55% women in parliament and are at stage 4 or 5 of the demographic transition?"
 * becomes filters (Democracy · Women MPs 45–55% · Stage 4 or 5), plus a view when the question asks for one
 * (a chart over time, a comparison, a ranking, a total). Everything runs here in the browser, with no AI service:
 * the question is matched against the names of every measure and value on the site, then numbers and words like
 * "over", "between" and "top 10" next to each measure become its limits. The interpretation is shown as chips
 * before it is applied, so it can be checked and changed. Loaded after app.js. */
(function () {
  "use strict";
  let W, F;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- Words ----------
  const STOP = new Set(("a an the of in on at to for and or with by from is are was were be been being has have had do does did which what how many much " +
    "countries country nations nation states state places place there their its it that this these those where who whose than as per show me list find " +
    "give tell all any some each every both whose whom get got can could would should will please also only just about around roughly approximately " +
    "people's percent per cent % $ s").split(" "));
  const NUMWORD = { half: 50, third: 33.3, quarter: 25, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100 };
  const MULT = { thousand: 1e3, k: 1e3, million: 1e6, millions: 1e6, m: 1e6, mn: 1e6, billion: 1e9, billions: 1e9, bn: 1e9, b: 1e9, trillion: 1e12, tn: 1e12 };

  function norm(s) {
    let t = " " + s.toLowerCase() + " ";
    t = t.replace(/[“”"?!¿]/g, " ").replace(/’/g, "'");
    for (let i = 0; i < 3; i++) t = t.replace(/(\d),(\d{3})/g, "$1$2");
    t = t.replace(/(\d)\s*[-–—]\s*(\d)/g, "$1 to $2");
    t = t.replace(/(\d)\s*(k|m|mn|bn|b|tn)\b/g, "$1 $2");
    t = t.replace(/%/g, " % ").replace(/\$/g, " $ ").replace(/[(),;:/]/g, " , ");
    t = t.replace(/(\w)-(\w)/g, "$1 $2").replace(/(\w)-(\w)/g, "$1 $2");
    t = t.replace(/\.(\s|$)/g, " ").replace(/'s\b/g, "");
    return t.split(/\s+/).filter(Boolean);
  }
  const phraseToks = (p) => norm(p.replace(/\([^)]*\)/g, " ").replace(/&/g, " and ").replace(/[·.]/g, " "));
  // "democracies" = "democracy", "countries" = "country", "women" = "woman"…
  function stem(w) {
    if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.length > 4 && /(ches|shes|xes|ses)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) return w.slice(0, -1);
    if (w === "women") return "woman";
    if (w === "people") return "person";
    return w;
  }
  const same = (a, b) => a === b || stem(a) === stem(b);

  // ---------- The lexicon: every phrase the parser knows ----------
  let LEX = null, COUNTRY = null;
  const SKIP_PHRASES = new Set(["member of", "has hosted", "coast on", "continent", "part of the world", "rivers", "lakes", "deserts", "mountain ranges",
    "landforms", "stage", "rank", "area", "trade", "language", "currency", "religion", "hazards"]);
  function build() {
    W = window.WC; F = W.F;
    LEX = [];
    const add = (phrase, e) => { const toks = phraseToks(phrase); if (toks.length && !SKIP_PHRASES.has(toks.join(" "))) LEX.push({ ...e, toks, phrase }); };
    for (const f of W.FILTERS) {
      if (f.type === "range") {
        add(f.label, { kind: "measure", key: f.key, w: 2 });
        if (f.short) add(f.short, { kind: "measure", key: f.key, w: 1 });
        const paren = f.label.match(/\(([^)]+)\)/);
        if (paren && /^[A-Z][A-Z0-9.]{1,7}$/.test(paren[1])) add(paren[1], { kind: "measure", key: f.key, w: 1 });
      } else if (f.type === "bool" && !f.hidden && !f.target) {
        add(f.label, { kind: "bool", key: f.key, value: true, w: 2 });
      }
    }
    for (const fam of window.FAMILIES || []) if (F[fam.variants[0][0]]?.type === "range") add(fam.label, { kind: "measure", key: fam.variants[0][0], w: 0 });
    // values of category filters that people name in questions
    const VALUE_FILTERS = ["region", "subregion", "income_group", "regime", "groups", "official_languages", "largest_religion", "main_climate",
      "main_biome", "events_hosted", "treaties_joined", "drains_to", "plates", "hazards", "seas", "security_council", "hdi_group"];
    for (const key of VALUE_FILTERS) {
      const f = F[key];
      if (!f?.options) continue;
      for (const o of f.options) {
        if (!o || (key === "hdi_group" && !/very high/i.test(o))) continue;
        add(o, { kind: "value", key, values: [o], w: key === "subregion" ? 3 : 2 });
      }
    }
    // other ways of saying things
    const A = [
      ["democracy", "bool", "democracy", true], ["democratic", "bool", "democracy", true], ["autocracy", "value", "regime", ["Closed autocracy", "Electoral autocracy"]],
      ["dictatorship", "value", "regime", ["Closed autocracy", "Electoral autocracy"]], ["authoritarian", "value", "regime", ["Closed autocracy", "Electoral autocracy"]],
      ["landlocked", "bool", "landlocked", true], ["island", "bool", "no_land_borders", true], ["island nation", "bool", "no_land_borders", true],
      ["nuclear weapons", "bool", "nuclear_armed", true], ["nuclear power", "measure", "nuclear_elec_pct"], ["nuclear armed", "bool", "nuclear_armed", true],
      ["un member", "bool", "un_member", true],
      ["women in parliament", "measure", "women_parliament"], ["female mp", "measure", "women_parliament"], ["women mp", "measure", "women_parliament"],
      ["seats held by women", "measure", "women_parliament"], ["female politician", "measure", "women_parliament"],
      ["person", "measure", "population", "unit"], ["inhabitant", "measure", "population", "unit"], ["resident", "measure", "population", "unit"],
      ["capital is the largest city", "bool", "capital_is_largest", true], ["capital is the biggest city", "bool", "capital_is_largest", true],
      ["capital is not the largest city", "bool", "capital_is_largest", false], ["capital isn't the largest city", "bool", "capital_is_largest", false],
      ["capital is not the biggest city", "bool", "capital_is_largest", false],
      ["gdp per capita", "measure", "gdp_per_capita"], ["income per person", "measure", "gni_ppp"], ["gni per capita", "measure", "gni_ppp"], ["rich", "measure", "gdp_per_capita"],
      ["life expectancy", "measure", "life_expectancy"], ["lifespan", "measure", "life_expectancy"], ["live in city", "measure", "urban_pct"], ["live in town", "measure", "urban_pct"],
      ["birth rate", "measure", "birth_rate"], ["death rate", "measure", "death_rate"], ["fertility", "measure", "fertility"], ["children per woman", "measure", "fertility"],
      ["babies per woman", "measure", "fertility"], ["infant mortality", "measure", "infant_mortality"], ["child mortality", "measure", "under5_mortality"],
      ["co2", "measure", "co2_per_capita"], ["carbon emission", "measure", "co2_per_capita"], ["emission", "measure", "co2_per_capita"], ["total co2", "measure", "co2_mt"],
      ["hdi", "measure", "hdi"], ["human development", "measure", "hdi"], ["gini", "measure", "gini"], ["inequality", "measure", "gini"],
      ["internet", "measure", "internet"], ["online", "measure", "internet"], ["literacy", "measure", "literacy"], ["literate", "measure", "literacy"],
      ["urban", "measure", "urban_pct"], ["city dweller", "measure", "urban_pct"], ["in city", "measure", "urban_pct"], ["median age", "measure", "median_age"],
      ["poverty", "measure", "extreme_poverty"], ["poor", "measure", "extreme_poverty"], ["refugee", "measure", "refugees_hosted"], ["host refugee", "measure", "refugees_hosted"],
      ["unemployment", "measure", "unemployment"], ["murder", "measure", "homicides"], ["homicide", "measure", "homicides"],
      ["renewable", "measure", "renewables_elec_pct"], ["renewable electricity", "measure", "renewables_elec_pct"], ["forest", "measure", "forest_pct"],
      ["tourist", "measure", "tourists"], ["visitor", "measure", "tourists"], ["military spending", "measure", "military_spend_pct"], ["army", "measure", "armed_forces"],
      ["coastline", "measure", "coastline_km"], ["neighbour", "measure", "borders"], ["neighbor", "measure", "borders"], ["border", "measure", "borders"],
      ["sdg", "measure", "sdg_on_track"], ["sustainable development goal", "measure", "sdg_on_track"], ["population density", "measure", "density"],
      ["dense", "measure", "density"], ["electricity access", "measure", "electricity"], ["access to electricity", "measure", "electricity"],
      ["safe water", "measure", "safe_water"], ["clean water", "measure", "basic_water"], ["hunger", "measure", "undernourishment"], ["air pollution", "measure", "pm25"],
      ["capital", "measure", "capital_pop"], ["capital city", "measure", "capital_pop"], ["capital population", "measure", "capital_pop"],
      ["largest city", "measure", "largest_city_pop"], ["biggest city", "measure", "largest_city_pop"], ["main city", "measure", "largest_city_pop"],
      ["a city", "measure", "largest_city_pop"], ["any city", "measure", "largest_city_pop"], ["million city", "measure", "cities_1m"],
      ["cities of over a million", "measure", "cities_1m"], ["cities over a million", "measure", "cities_1m"],
      ["desert", "value", "landforms", ["Desert"]], ["mountain range", "value", "landforms", ["Mountain range"]], ["plateau", "value", "landforms", ["Plateau"]],
      ["tundra", "value", "landforms", ["Tundra"]], ["wetland", "value", "landforms", ["Wetland"]], ["delta", "value", "landforms", ["Delta"]],
      ["glacier", "measure", "glacier_pct"], ["ice", "measure", "glacier_pct"], ["active volcano", "measure", "volcanoes_active"],
      ["magnitude", "measure", "quake_mag"], ["highest point", "measure", "highest_m"], ["mountain", "measure", "highest_m"], ["volcano", "measure", "volcanoes"], ["earthquake", "measure", "quakes"],
      ["low income", "value", "income_group", ["Low income"]], ["middle income", "value", "income_group", ["Lower-middle income", "Upper-middle income"]],
      ["high income", "value", "income_group", ["High income"]], ["poor countries", "value", "income_group", ["Low income"]], ["rich countries", "value", "income_group", ["High income"]],
      ["eu", "value", "groups", ["European Union"]], ["european union", "value", "groups", ["European Union"]], ["african union", "value", "groups", ["African Union"]],
      ["arab league", "value", "groups", ["Arab League"]],
      ["african", "value", "region", ["Africa"]], ["european", "value", "region", ["Europe"]], ["asian", "value", "region", ["Asia"]], ["america", "value", "region", ["Americas"]],
      ["american", "value", "region", ["Americas"]], ["latin america", "value", "subregion", ["South America", "Central America", "Caribbean"]],
      ["middle east", "value", "subregion", ["Western Asia"]], ["sub saharan africa", "value", "subregion", ["Western Africa", "Middle Africa", "Eastern Africa", "Southern Africa"]],
      ["south east asia", "value", "subregion", ["South-Eastern Asia"]], ["southeast asia", "value", "subregion", ["South-Eastern Asia"]],
      ["muslim", "value", "largest_religion", ["Islam"]], ["islamic", "value", "largest_religion", ["Islam"]], ["christian", "value", "largest_religion", ["Christianity"]],
      ["buddhist", "value", "largest_religion", ["Buddhism"]], ["hindu", "value", "largest_religion", ["Hinduism"]], ["secular", "value", "largest_religion", ["No religion"]],
      ["olympics", "value", "events_hosted", ["Summer Olympics", "Winter Olympics"]], ["world cup", "value", "events_hosted", ["Men's World Cup"]],
      ["paris agreement", "value", "treaties_joined", ["Paris Agreement"]], ["permanent member", "value", "security_council", ["Permanent member"]],
      ["drive on the left", "value", "driving_side", ["Left"]], ["drive on the right", "value", "driving_side", ["Right"]],
      ["left hand drive", "value", "driving_side", ["Right"]], ["right hand drive", "value", "driving_side", ["Left"]],
      // attitudes (World Values Survey)
      ["religion is very important", "measure", "att_religion_important"], ["religion very important", "measure", "att_religion_important"],
      ["religious", "measure", "att_religion_important"], ["religiosity", "measure", "att_religion_important"], ["atheist", "measure", "att_atheist"],
      ["not religious", "measure", "att_not_religious"], ["go to church", "measure", "att_attend_weekly"], ["attend religious services", "measure", "att_attend_weekly"],
      ["trust other", "measure", "att_trust"], ["people can be trusted", "measure", "att_trust"], ["social trust", "measure", "att_trust"],
      ["happy", "measure", "att_happy"], ["happiness", "measure", "happiness_score"], ["happiness score", "measure", "happiness_score"], ["happiness rank", "measure", "happiness_rank"],
      ["trust science", "measure", "wgm_trust_science"], ["trust scientists", "measure", "wgm_trust_scientists"], ["trust doctors", "measure", "wgm_trust_doctors"],
      ["vaccine", "measure", "wgm_vaccines_now"], ["anti vax", "measure", "wgm_no_vaccines"], ["artificial intelligence", "measure", "wgm_ai_benefit"],
      ["climate change is a serious threat", "measure", "wrp_climate_serious"], ["climate threat", "measure", "wrp_climate_serious"],
      ["worried about crime", "measure", "wrp_worry_crime"], ["worried about violent crime", "measure", "wrp_worry_crime"], ["feel safe", "measure", "safe_walking"],
      ["safe walking", "measure", "safe_walking"], ["resilience", "measure", "wrp_resilience"], ["discrimination", "measure", "wrp_discrim_skin"],
      ["racism", "measure", "wrp_discrim_skin"], ["disaster", "measure", "wrp_disaster_5y"], ["savings", "measure", "wrp_under_month"],
      ["favourable view of china", "measure", "pew_fav_china"], ["favorable view of china", "measure", "pew_fav_china"], ["like china", "measure", "pew_fav_china"],
      ["favourable view of the us", "measure", "pew_fav_us"], ["favorable view of the us", "measure", "pew_fav_us"], ["like the us", "measure", "pew_fav_us"],
      ["favourable view of the un", "measure", "pew_fav_un"], ["emigrate", "measure", "ab_emigrate"], ["emigration", "measure", "ab_emigrate"],
      ["went without food", "measure", "ab_no_food"], ["army rule in africa", "measure", "ab_military_approve"], ["life satisfaction", "measure", "att_life_satisfaction"], ["satisfied with life", "measure", "att_life_satisfaction"],
      ["proud", "measure", "att_very_proud"], ["patriotic", "measure", "att_very_proud"], ["fight for their country", "measure", "att_fight"], ["fight for country", "measure", "att_fight"],
      ["men make better leaders", "measure", "att_men_leaders"], ["men make better political leaders", "measure", "att_men_leaders"],
      ["support democracy", "measure", "att_democracy_good"], ["strong leader", "measure", "att_strong_leader_good"], ["army rule", "measure", "att_army_rule_good"],
      ["trust the government", "measure", "att_conf_government"], ["confidence in the government", "measure", "att_conf_government"], ["trust the police", "measure", "att_conf_police"],
      ["post materialist", "measure", "att_postmaterialist"], ["environment before economic growth", "measure", "att_environment_first"],
      ["homosexuality", "measure", "att_homosexuality_never"], ["gay neighbours", "measure", "att_nb_gay"], ["immigrants as neighbours", "measure", "att_nb_immigrants"],
    ];
    for (const [p, kind, key, v] of A) {
      if (!F[key]) continue;
      add(p, kind === "bool" ? { kind, key, value: v, w: 4 } : kind === "value" ? { kind, key, values: v, w: 4 } : { kind, key, w: 4, unit: v === "unit" });
    }
    // languages: "English-speaking", "speak French", "official language Arabic"
    if (F.official_languages?.options) for (const o of F.official_languages.options) if (/^[A-Z][a-z]+$/.test(o)) add(o, { kind: "value", key: "official_languages", values: [o], w: 1, lang: true });
    // countries, for questions about one place
    COUNTRY = [];
    const CA = { USA: ["usa", "us", "united states", "america"], GBR: ["uk", "britain", "great britain", "united kingdom"], RUS: ["russia"], KOR: ["south korea"], PRK: ["north korea"],
      COD: ["drc", "dr congo", "democratic republic of the congo"], CIV: ["ivory coast"], CZE: ["czech republic", "czechia"], ARE: ["uae"], TUR: ["turkey", "türkiye"] };
    for (const r of W.rows) {
      const names = [r.name, ...(CA[r.iso3] || [])];
      for (const n of names) COUNTRY.push({ toks: phraseToks(n), iso: r.iso3 });
    }
    LEX.sort((a, b) => b.toks.length - a.toks.length || b.w - a.w);
    COUNTRY.sort((a, b) => b.toks.length - a.toks.length);
  }

  // ---------- Numbers and conditions ----------
  function numAt(T, i) {
    // returns { v, end } for a number starting at i (with $ before, or million / % after)
    let j = i, neg = false;
    if (T[j] === "$") j++;
    if (T[j] === "minus") { neg = true; j++; }
    if (T[j] === "a" && ["half", "third", "quarter"].includes(T[j + 1])) j++;
    const word = T[j];
    let v = /^-?\d+(\.\d+)?$/.test(word) ? parseFloat(word) : NUMWORD[word];
    if (v == null) return null;
    let pct = ["half", "third", "quarter"].includes(word);
    if (pct && T[j + 1] === "of") j++;
    j++;
    // "5 m people" is millions, but "5,000 m" is metres
    if (T[j] && MULT[T[j]] && !(T[j] === "m" && v >= 100)) { v *= MULT[T[j]]; j++; }
    if (T[j] === "%" || T[j] === "percent" || (T[j] === "per" && T[j + 1] === "cent")) { j += T[j] === "per" ? 2 : 1; pct = true; }
    if (T[j] && /^(m|metres?|meters?|km|kilometres?|kilometers?|km2|sq|square|years?|tonnes?|tons?|t|mm|twh|kwh|degrees?|°c|c)$/.test(T[j]) && !(T[j] === "years" && T[j - 1] === "in")) { j++; if (["km", "kilometres", "kilometers"].includes(T[j])) j++; }
    return { v: neg ? -v : v, end: j, pct };
  }
  const GT = ["more than", "greater than", "higher than", "larger than", "bigger than", "longer than", "taller than", "deeper than", "stronger than", "older than", "wider than", "over", "above", "at least", "exceeding", "exceeds", "beyond", "minimum of", "no less than", "not less than", ">", ">="];
  const LT = ["less than", "fewer than", "lower than", "smaller than", "shorter than", "younger than", "shallower than", "weaker than", "under", "below", "at most", "up to", "no more than", "not more than", "maximum of", "<", "<="];
  const TOPW = ["top", "highest", "largest", "biggest", "most", "greatest"], BOTW = ["bottom", "lowest", "smallest", "least", "fewest"];
  function matchWords(T, i, list) {
    for (const p of list) { const ws = p.split(" "); if (ws.every((w, k) => T[i + k] === w)) return ws.length; }
    return 0;
  }
  // Find a limit in tokens[a..b) that are free. Returns { cond, used: [indexes] } or null.
  function findCond(T, free, a, b) {
    for (let i = a; i < b; i++) {
      if (!free[i]) continue;
      // between X and Y / from X to Y
      if ((T[i] === "between" || T[i] === "from") && i + 1 < b) {
        const x = numAt(T, i + 1);
        if (x && (T[x.end] === "and" || T[x.end] === "to")) { const y = numAt(T, x.end + 1); if (y) return { cond: { min: Math.min(x.v, y.v), max: Math.max(x.v, y.v), pct: x.pct || y.pct }, used: range(i, y.end) }; }
      }
      // X to Y
      const x0 = numAt(T, i);
      if (x0 && T[x0.end] === "to") { const y = numAt(T, x0.end + 1); if (y && !/^(19|20)\d\d$/.test(T[i])) return { cond: { min: Math.min(x0.v, y.v), max: Math.max(x0.v, y.v), pct: x0.pct || y.pct }, used: range(i, y.end) }; }
      let n = matchWords(T, i, GT);
      if (n) { const x = numAt(T, i + n); if (x) return { cond: { min: x.v, pct: x.pct }, used: range(i, x.end) }; }
      n = matchWords(T, i, LT);
      if (n) { const x = numAt(T, i + n); if (x) return { cond: { max: x.v, pct: x.pct }, used: range(i, x.end) }; }
      // top 10 / 10 highest / highest quarter / bottom fifth / top 20%
      for (const [words, k] of [[TOPW, "top"], [BOTW, "bottom"]]) {
        if (words.includes(T[i])) {
          if (["quarter", "quartile"].includes(T[i + 1])) return { cond: { slice: { k: "q", of: 4, g: [k === "top" ? 4 : 1] } }, used: range(i, i + 2) };
          if (["fifth", "quintile"].includes(T[i + 1])) return { cond: { slice: { k: "q", of: 5, g: [k === "top" ? 5 : 1] } }, used: range(i, i + 2) };
          const x = numAt(T, i + 1);
          if (x && (T[i + 2] === "%" || T[x.end - 1] === "%")) { const of = x.v <= 20 ? 5 : 4; return { cond: { slice: { k: "q", of, g: [k === "top" ? of : 1] } }, used: range(i, x.end) }; }
          if (x && x.v >= 1 && x.v <= 500 && Number.isInteger(x.v)) return { cond: { slice: { k, n: x.v } }, used: range(i, x.end) };
          if (["quarter", "quartile"].includes(T[i + 1])) return { cond: { slice: { k: "q", of: 4, g: [k === "top" ? 4 : 1] } }, used: range(i, i + 2) };
          if (["fifth", "quintile"].includes(T[i + 1])) return { cond: { slice: { k: "q", of: 5, g: [k === "top" ? 5 : 1] } }, used: range(i, i + 2) };
          if ((T[i] !== "most" && T[i] !== "least") || T[i - 1] === "the") return { cond: { slice: { k, n: 0 } }, used: [i] };  // "the highest": n decided later
        }
        if (x0 && words.includes(T[x0.end]) && Number.isInteger(x0.v) && x0.v <= 500) return { cond: { slice: { k, n: x0.v } }, used: range(i, x0.end + 1) };
      }
      if (x0 && i + 1 < b && T[x0.end] && ["or", "and"].includes(T[x0.end]) && ["more", "over", "above", "higher", "greater"].includes(T[x0.end + 1])) return { cond: { min: x0.v }, used: range(i, x0.end + 2) };
      if (x0 && T[x0.end] && ["or", "and"].includes(T[x0.end]) && ["less", "under", "below", "fewer", "lower"].includes(T[x0.end + 1])) return { cond: { max: x0.v }, used: range(i, x0.end + 2) };
      if (x0 && T[x0.end] === "plus") return { cond: { min: x0.v }, used: range(i, x0.end + 1) };
    }
    return null;
  }
  const range = (a, b) => Array.from({ length: b - a }, (_, k) => a + k);

  // ---------- Parse ----------
  function parse(text) {
    if (!LEX) build();
    const T = norm(text);
    const free = T.map(() => true);
    const use = (idx) => idx.forEach((i) => (free[i] = false));
    const out = { tokens: T, filters: [], view: null, year: null, notes: [], country: null };
    const joined = " " + T.join(" ") + " ";
    // years: "in 1990", "since 2000", "from 1990 to 2020"
    for (let i = 0; i < T.length; i++) {
      if (!/^(19[6-9]\d|20[0-3]\d)$/.test(T[i])) continue;
      const y = +T[i];
      if (["in", "during", "for"].includes(T[i - 1])) { out.year = y; use([i - 1, i]); }
      else if (["since", "after"].includes(T[i - 1])) { out.since = y; use([i - 1, i]); }
      else if (T[i - 1] === "from" && T[i + 1] === "to" && /^\d{4}$/.test(T[i + 2] || "")) { out.since = y; out.until = +T[i + 2]; use([i - 1, i, i + 1, i + 2]); }
      else if (T[i - 1] === "to" || T[i - 1] === "and") { /* part of a range of years */ }
      else { out.year = y; use([i]); }
    }
    // demographic transition stages: "stage 4 or 5", "stages 2 and 3"
    for (let i = 0; i < T.length; i++) {
      if (!free[i] || !/^stages?$/.test(T[i])) continue;
      const ns = [], idx = [i];
      let j = i + 1;
      while (j < T.length && (/^[1-5]$/.test(T[j]) || ["or", "and", "to", ","].includes(T[j]))) { if (/^[1-5]$/.test(T[j])) ns.push(+T[j]); idx.push(j); j++; }
      if (!ns.length || !F.dtm_stage) continue;
      if (T[idx[idx.length - 2]] === "to" && ns.length === 2) for (let k = ns[0] + 1; k < ns[1]; k++) ns.push(k);
      // swallow "of the demographic transition (model)"
      while (j < T.length && ["of", "the", "demographic", "transition", "model", "dtm"].includes(T[j])) { idx.push(j); j++; }
      use(idx);
      const vals = F.dtm_stage.options.filter((o) => ns.some((n) => o.startsWith(`Stage ${n}`)));
      out.filters.push({ key: "dtm_stage", values: vals, mode: "any" });
    }
    // physical features with a size: "volcanoes higher than 5,000 m", "rivers longer than 3,000 km"
    const hits = [];
    const FEAT = [[/^volcano(es)?$/, /^(higher|taller|high|tall|height|elevation)$/, "volcano_elev"], [/^(mountain|peak)s?$/, /^(higher|taller|high|tall|height)$/, "peak_elev"],
      [/^rivers?$/, /^(longer|long|length)$/, "river_km"], [/^lakes?$/, /^(bigger|larger|big|large|area)$/, "lake_km2"], [/^earthquakes?$/, /^(stronger|bigger|larger|magnitude|strong)$/, "quake_mag"],
      [/^waterfalls?$/, /^(higher|taller|high|tall)$/, "waterfall_m"], [/^trench(es)?$/, /^(deeper|deep|depth)$/, "trench_depth"], [/^deserts?$/, /^(bigger|larger|area)$/, "desert_area"]];
    for (let i = 0; i < T.length; i++) {
      for (const [noun, adj, key] of FEAT) {
        if (!F[key] || !free[i] || !noun.test(T[i])) continue;
        const j = [i + 1, i + 2, i + 3].find((k) => T[k] && adj.test(T[k]));
        if (j == null) continue;
        hits.push({ kind: "measure", key, i, end: i + 1 });
        use([i]);
        if (/^(height|elevation|length|area|depth|magnitude)$/.test(T[j])) use([j]);
      }
    }
    // lexicon matches, longest first
    for (const e of LEX) {
      const L = e.toks.length;
      for (let i = 0; i + L <= T.length; i++) {
        if (!free[i]) continue;
        let ok = true;
        for (let k = 0; k < L; k++) if (!free[i + k] || !same(T[i + k], e.toks[k])) { ok = false; break; }
        if (!ok) continue;
        if (e.lang && !/(speak|speaking|language|official|spoken)/.test(joined)) continue;
        hits.push({ ...e, i, end: i + L });
        use(range(i, i + L));
      }
    }
    // a country named on its own: "life expectancy in Japan"
    for (const c of COUNTRY) {
      const L = c.toks.length;
      for (let i = 0; i + L <= T.length; i++) {
        if (!free[i]) continue;
        let ok = true;
        for (let k = 0; k < L; k++) if (!free[i + k] || T[i + k] !== c.toks[k]) { ok = false; break; }
        if (ok && (L > 1 || c.toks[0].length > 2)) { out.country = out.country || c.iso; use(range(i, i + L)); }
      }
    }
    hits.sort((a, b) => a.i - b.i);
    for (let i = 0; i < T.length; i++) if (free[i] && /^(speak|speaking|spoken|language|languages|official|majority|mostly|predominantly|mainly|track)$/.test(T[i]) && hits.length) free[i] = false;
    // negation just before a value or a yes/no: "not in the EU", "non-NATO", "without a coastline"
    const negated = (h) => {
      for (let k = h.i - 1; k >= Math.max(0, h.i - 3); k--) {
        if (["not", "non", "outside", "without", "no", "excluding", "except", "isn't", "aren't", "never"].includes(T[k])) { free[k] = false; return true; }
        if (!free[k]) return false;  // another filter's words come first
      }
      return false;
    };
    const byKey = new Map();
    let measures = [];
    for (const h of hits) {
      if (h.kind === "value") {
        const neg = negated(h);
        const cur = byKey.get(h.key);
        if (cur && cur.mode === (neg ? "none" : "any")) h.values.forEach((v) => !cur.values.includes(v) && cur.values.push(v));
        else { const fl = { key: h.key, values: [...h.values], mode: neg ? "none" : "any" }; byKey.set(h.key, fl); out.filters.push(fl); }
      } else if (h.kind === "bool") {
        if (!byKey.has(h.key)) { const fl = { key: h.key, value: negated(h) ? !h.value : h.value }; byKey.set(h.key, fl); out.filters.push(fl); }
      } else measures.push(h);
    }
    // superlatives: "the poorest 20", "most populous", "richest countries"
    const SUPER = { richest: ["gdp_per_capita", "top"], wealthiest: ["gdp_per_capita", "top"], poorest: ["gdp_per_capita", "bottom"],
      "most populous": ["population", "top"], "least populous": ["population", "bottom"], "most densely populated": ["density", "top"], "most crowded": ["density", "top"],
      largest: ["area_km2", "top"], biggest: ["area_km2", "top"], smallest: ["area_km2", "bottom"], hottest: ["avg_temp", "top"], coldest: ["avg_temp", "bottom"],
      wettest: ["rainfall_mm", "top"], driest: ["rainfall_mm", "bottom"], oldest: ["median_age", "top"], youngest: ["median_age", "bottom"],
      "most unequal": ["gini", "top"], "most equal": ["gini", "bottom"], "most democratic": ["libdem", "top"], "most visited": ["tourists", "top"],
      "most dangerous": ["homicides", "top"], "safest": ["homicides", "bottom"], "healthiest": ["life_expectancy", "top"] };
    for (let i = 0; i < T.length; i++) {
      if (!free[i]) continue;
      for (const [p, [key, k]] of Object.entries(SUPER)) {
        const ws = p.split(" ");
        if (!F[key] || !ws.every((w, q) => T[i + q] === w && free[i + q])) continue;
        // only when no measure is named right after ("the largest population" is about population)
        const nextHit = hits.find((h) => h.i >= i + ws.length && h.i <= i + ws.length + 1 && h.kind === "measure");
        if (nextHit) continue;
        const idx = range(i, i + ws.length);
        let n = 0;
        const a = numAt(T, i + ws.length), b = i > 0 ? numAt(T, i - 1) : null;
        if (a && Number.isInteger(a.v) && a.v <= 500) { n = a.v; idx.push(...range(i + ws.length, a.end)); }
        else if (b && b.end === i && Number.isInteger(b.v) && b.v <= 500) { n = b.v; idx.push(i - 1); }
        use(idx);
        hits.push({ kind: "measure", key, i, end: i + ws.length, cond: { slice: { k, n } }, preset: true });
        break;
      }
    }
    hits.sort((a, b) => a.i - b.i);
    measures.length = 0;
    for (const h of hits) if (h.kind === "measure") measures.push(h);
    // limits for each measure. A percentage can't be a limit on a count, and the other way round.
    const fits = (h, c) => {
      const f = F[h.key];
      if (!c) return false;
      if (c.cond.slice) return true;
      const v = c.cond.min ?? c.cond.max;
      if (f.format === "pct") return !(v > 100 && !c.cond.pct) || f.dmax > 100;
      return !c.cond.pct;
    };
    const filler = /^(for|in|of|on|by|the|with|a|an|%|have|has|having|are|is|were)$/;
    // "the capital has more than 1 million inhabitants": "inhabitants" is the unit of the capital's population,
    // not a second measure, when another measure comes just before it
    measures = measures.filter((h, m) => {
      if (!h.unit || m === 0) return true;
      const prev = measures[m - 1];
      const between = T.slice(prev.end, h.i);
      return !(between.length <= 8 && findCond(T, free, prev.end, h.i) && between.every((t) => filler.test(t) || /^(where|that|which|whose|more|less|fewer|than|over|under|above|below|at|least|most|between|and|to|million|thousand|billion|m|k|bn|\d.*)$/.test(t)));
    });
    // 1. right before it: "over 40% women in parliament", "top quintile for GDP"
    for (let m = 0; m < measures.length; m++) {
      const h = measures[m];
      if (h.preset) continue;
      const prevEnd = m > 0 ? measures[m - 1].end : 0;
      const c = findCond(T, free, prevEnd, h.i);
      if (c && fits(h, c) && c.used[c.used.length - 1] >= h.i - 4 && T.slice(c.used[c.used.length - 1] + 1, h.i).every((t) => filler.test(t))) { use(c.used); h.cond = c.cond; }
    }
    // 2. after it, up to the next measure: "life expectancy over 80"
    for (let m = 0; m < measures.length; m++) {
      const h = measures[m];
      if (h.cond) continue;
      const nextStart = m + 1 < measures.length ? measures[m + 1].i : T.length;
      const c = findCond(T, free, h.end, nextStart);
      if (c && fits(h, c)) { use(c.used); h.cond = c.cond; }
    }
    // 3. anywhere before it, back past measures that have no limit: "more than half of people live in cities"
    for (let m = 0; m < measures.length; m++) {
      const h = measures[m];
      if (h.cond) continue;
      let k = m - 1;
      while (k >= 0 && !measures[k].cond) k--;
      const c = findCond(T, free, k >= 0 ? measures[k].end : 0, h.i);
      if (c && fits(h, c)) { use(c.used); h.cond = c.cond; }
    }
    const plural = /\b(countries|nations|places|ones)\b/.test(joined) || /\bhow many\b/.test(joined);
    for (const h of measures) {
      if (byKey.has(h.key)) continue;
      const f = F[h.key];
      if (!h.cond && ["count", "int"].includes(f.format) && /^(with|have|has|having|got)$/.test(T[h.i - 1] || "") ) h.cond = { min: 1 };
      if (!h.cond && h.key === "glacier_pct" && /^(with|have|has|having)$/.test(T[h.i - 1] || "")) h.cond = { min: 0.1 };
      if (!h.cond) { h.bare = true; continue; }
      const fl = { key: h.key, min: f.dmin, max: f.dmax };
      if (h.cond.slice) {
        fl.slice = { ...h.cond.slice, w: true };  // "the 10 most populous in Africa": ranked among the other matches
        if (!fl.slice.n && fl.slice.k !== "q") fl.slice.n = plural ? 10 : 1;
      } else {
        if (h.cond.min != null) fl.min = Math.max(f.dmin, Math.min(h.cond.min, f.dmax));
        if (h.cond.max != null) fl.max = Math.min(f.dmax, Math.max(h.cond.max, f.dmin));
      }
      byKey.set(h.key, fl); out.filters.push(fl);
    }
    // "with a coastline" means not landlocked
    if (measures.some((h) => h.bare && h.key === "coastline_km") && !byKey.has("landlocked") && F.landlocked) { out.filters.push({ key: "landlocked", value: false }); byKey.set("landlocked", 1); measures.forEach((h) => h.key === "coastline_km" && (h.key = "landlocked")); }
    out.bare = measures.filter((h) => h.bare && !byKey.has(h.key)).map((h) => h.key).filter((k, i, a) => a.indexOf(k) === i);
    // what kind of answer: a chart over time, a comparison, a ranking, a total, or the map
    const has = (re) => re.test(joined.replace(/\bclimate change\b/g, "climate"));
    const ranged = out.filters.filter((fl) => F[fl.key].type === "range");
    const measuresAll = [...ranged.map((fl) => fl.key), ...out.bare];
    if (measuresAll.length >= 2 && has(/\b(compare|comparing|against|versus|vs|relationship|correlat\w*|related|link between|plot)\b/)) {
      // "life expectancy against GDP": the first goes up the chart; "compare GDP and life expectancy": the first goes across
      const yFirst = has(/\b(against|versus|vs)\b/);
      out.view = { v: "compare", y: yFirst ? measuresAll[0] : measuresAll[1], x: yFirst ? measuresAll[1] : measuresAll[0] };
    }
    else if (measuresAll.length && has(/\b(over time|change[ds]?|changing|trend|grown|grow|growth in|risen|rise|fallen|fall|history|since)\b/) && TSkey(measuresAll[0])) out.view = { v: "trends", key: measuresAll[0], type: "line" };
    else if (measuresAll.length && has(/\b(total|altogether|combined|sum|in total)\b/)) out.view = { v: "trends", key: measuresAll[0], type: "bar", agg: "total" };
    else if (measuresAll.length && has(/\b(rank|ranking|ranked|order|league table)\b/)) out.view = { v: "rank", key: measuresAll[0] };
    else if (out.country && !ranged.length && !out.filters.length) out.view = { v: "country" };
    if (out.view && out.view.v === "trends") use(T.map((t, i) => i).filter((i) => /^(over|time|change|changed|changes|changing|trend|total|altogether|combined|sum|since|grown|risen|fallen|history)$/.test(T[i])));
    if (out.view && out.view.v === "compare") use(T.map((t, i) => i).filter((i) => /^(compare|comparing|against|versus|vs|relationship|correlation|correlate|related|plot|link)$/.test(T[i])));
    if (out.view && out.view.v === "rank") use(T.map((t, i) => i).filter((i) => /^(rank|ranking|ranked|order|league|table)$/.test(T[i])));
    // words we didn't understand
    out.unknown = T.filter((t, i) => free[i] && !STOP.has(t) && !/^\d/.test(t) && !["more", "less", "fewer", "over", "under", "than", "between", "highest", "lowest", "most", "least", "not", "no", "only", "same", "also", "is", "are", "have", "has", "had", "having", "with", "without", "where", "whose", "what", "which", "who", "a", "an", "do", "does", "did", "that", "it", "they", "them"].includes(t) && t.length > 1);
    out.question = /\bhow many\b/.test(joined) ? "count" : "list";
    return out;
  }
  const TSkey = (k) => !!W.TS[k] && !W.CAT_TS[k];

  // ---------- Preview and apply ----------
  const PHYS = () => new Set((window.PHYS_THEMES || []).flatMap((t) => t.groups));
  function modeFor(p) {
    const phys = PHYS();
    const keys = p.filters.map((fl) => fl.key).concat(p.bare || []);
    if (!keys.length) return W.state.mode;
    const n = keys.filter((k) => phys.has(F[k].group)).length;
    return n === keys.length ? "physical" : n === 0 ? "human" : W.state.mode;
  }
  // filters whose names or keywords contain a word we didn't understand
  function suggest(words) {
    const out = [], seen = new Set();
    for (const w of words) {
      if (w.length < 3) continue;
      const st = stem(w);
      const hits = W.FILTERS.filter((f) => !f.hidden && !f.target && !seen.has(f.key))
        .map((f) => { const lab = f.label.toLowerCase(), kw = (f.keywords || "").toLowerCase(); return { f, s: lab.includes(st) ? 2 : kw.split(/\s+/).some((k) => stem(k) === st) ? 1 : 0 }; })
        .filter((x) => x.s).sort((a, b) => b.s - a.s).slice(0, 3);
      hits.forEach((x) => { seen.add(x.f.key); out.push({ word: w, f: x.f }); });
      if (out.length >= 5) break;
    }
    return out.slice(0, 5);
  }
  function useful(p) { return p.filters.length || p.view || (p.bare.length && p.country); }
  function previewHTML(text) {
    const p = parse(text);
    if (!useful(p)) return { p, html: "" };
    const fs = p.filters.filter((fl) => !F[fl.key].target);
    let count = null;
    fs.forEach((fl) => { if (fl.slice) fl._others = fs; });
    if (fs.length) {
      const pool = W.rows.filter((r) => r.sovereign || W.state.territories);
      count = pool.filter((r) => fs.every((fl) => W.passes(r, fl))).length;
    }
    const sug = suggest(p.unknown);
    const chips = p.filters.map((fl) => `<span class="achip" data-g="${W.gslug(F[fl.key].group)}">${esc(W.chipLabel(fl))}</span>`).join("");
    const what = p.view?.v === "compare" ? `Compare ${esc(F[p.view.y].short || F[p.view.y].label)} with ${esc(F[p.view.x].short || F[p.view.x].label)}`
      : p.view?.v === "trends" ? (p.view.type === "line" ? `Chart of ${esc(F[p.view.key].label)} over time` : `Total ${esc(F[p.view.key].label)}`)
      : p.view?.v === "rank" ? `Ranking by ${esc(F[p.view.key].label)}`
      : p.view?.v === "country" ? `${esc(W.byIso.get(p.country).name)}'s profile`
      : count != null ? `<b>${count}</b> ${count === 1 ? "country matches" : "countries match"}` : "Show on the map";
    const html = `<div class="askprev">
      <div class="askhead"><span class="askq">Your question, as filters</span>${p.year ? `<span class="achip yr">${p.year}</span>` : ""}</div>
      <div class="achips">${chips || `<span class="hint">No filters</span>`}</div>
      <div class="askans"><span>${what}</span><span class="askgo">Press Enter ↵</span></div>
      ${p.unknown.length ? `<p class="askunk">Not understood: ${p.unknown.slice(0, 6).map((u) => `“${esc(u)}”`).join(", ")}.${sug.length ? " Did you mean one of these? Pick one to add it as well:" : " Check the chips: you can change them after."}</p>` : ""}
      ${sug.length ? `<div class="asksugs">${sug.map((x) => `<button type="button" class="asksug" data-k="${x.f.key}" data-g="${W.gslug(x.f.group)}">+ ${esc(x.f.label)}</button>`).join("")}</div>` : ""}
    </div>`;
    return { p, html };
  }
  function apply(p, addKey) {
    const s = W.state;
    const m = modeFor(p);
    if (m !== s.mode) W.setMode(m);
    s.filters = p.filters.map((fl) => { const c = { ...fl }; delete c._others; if (c.values) c.values = [...c.values]; else delete c.values; if (c.slice) c.slice = { ...c.slice }; return c; });
    s.open = null; s.selected = null; s.flow = null; s.tab = "countries"; s.feat = null; s.starterHidden = true;
    const firstRange = p.filters.find((fl) => F[fl.key].type === "range" && !F[fl.key].target);
    s.colourBy = firstRange ? firstRange.key : "";
    const featF = p.filters.find((fl) => F[fl.key].target && F[fl.key].target !== "city");
    if (featF) s.tab = "feat:" + F[featF.key].target;
    if (p.filters.some((fl) => F[fl.key].target === "city")) s.tab = "cities";
    const yearly = p.filters.some((fl) => F[fl.key].time);
    if (p.year && yearly && W.TS_YEARS.includes(p.year)) { s.year = p.year; W.applyYear(p.year); }
    else if (s.year) { s.year = null; W.applyYear(null); }
    const V = window.WV_H?.V;
    let view = "map";
    if (p.view?.v === "compare" && V) { V.cmp.x = p.view.x; V.cmp.y = p.view.y; V.cmp.year = null; view = "compare"; }
    else if (p.view?.v === "trends" && V) { Object.assign(V.trend, { key: p.view.key, type: p.view.type, agg: p.view.agg || null, year: p.year || null, from: p.since || null, log: null }); view = "trends"; }
    else if (p.view?.v === "rank" && V) { V.rank.key = p.view.key; V.rank.year = p.year || null; view = "rank"; }
    else if (p.view?.v === "country" || (p.country && !p.filters.length)) s.selected = p.country;
    s.view = view;
    // a filter picked from "Did you mean": add it and open it, so its limits can be set
    if (addKey && F[addKey] && !s.filters.some((fl) => fl.key === addKey)) {
      const f = F[addKey];
      s.filters.push(f.type === "range" ? { key: addKey, min: f.dmin, max: f.dmax } : f.type === "bool" ? { key: addKey, value: true } : { key: addKey, values: [], mode: "any" });
      s.open = addKey; s.view = "map";
    }
    W.render();
  }

  window.WA = { parse, previewHTML, apply, rebuild: () => (LEX = null) };
})();
