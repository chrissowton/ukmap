#!/usr/bin/env python3
"""
Adds the local measures for Which Places? (release 1.1): money and work, housing, health, wellbeing,
education, getting connected, services, environment and deprivation.

Run after build_uk.py (it adds to the areas.json and timeseries.json that build_uk.py writes):

    pip install pyreadr
    python3 scripts/build_measures.py --els ../explore-local-statistics-data --imd ../IMD

Inputs (not kept in this repository; see DATA-SOURCES.md):
  --els  a copy of https://github.com/ONSdigital/explore-local-statistics-data (ONS, Open Government Licence)
  --imd  a copy of https://github.com/humaniverse/IMD (the four nations' deprivation indices, Open Government Licence)

Writes, into the site folder:
  areas.json       each area gets the latest value of every measure, and the year it is for (<key>_year)
  timeseries.json  measures with three or more years of data are added to "sparse" ([year, value, year, value, ...])
  measures.js      the filter definitions for these measures (labels, explanations, sources), read by the site
"""
import argparse, csv, json, os, re
from collections import defaultdict, Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CODE_ALIASES = {"E08000038": "E08000016", "E08000039": "E08000019"}
LA = ("E06", "E07", "E08", "E09", "W06", "S12", "N09")
ALL = "EWSN"

# ---------------------------------------------------------------------------------------------------------
# The measures. Each takes its figures from one or more ONS Explore Local Statistics datasets:
#   src      [(dataset folder, indicator name), ...]  several when each nation is published separately
#   nations  which nations have figures (E, W, S, N)
#   compare  "uk": comparable across the UK; "nation": compare only within a nation (see note)
# ---------------------------------------------------------------------------------------------------------
M = [
    # ---------------- Money and work ----------------
    dict(key="gdhi_pc", group="Money and work", label="Household income per person", short="Household income",
         src=[("gross-disposable-household-income-per-head", "Gross disposable household income")], fmt="gbp", scale="log",
         phrase="household income per person", info="Gross disposable household income per head: the money each person has to spend or save after taxes and benefits, in pounds a year.",
         kw="income money gdhi wealth poor rich disposable", sid="gdhi"),
    dict(key="weekly_pay", group="Money and work", label="Median weekly pay", short="Weekly pay",
         src=[("gross-median-weekly-pay", "Gross median weekly pay")], fmt="gbpw",
         phrase="median weekly pay", info="Median gross weekly pay of employees who live in the area (full-time and part-time jobs), before tax.",
         kw="pay wages earnings salary income ashe", sid="ashe"),
    dict(key="child_pov_ahc", group="Money and work", label="Children in poverty (after housing costs)", short="Child poverty (AHC)",
         src=[("children-in-relative-poverty", "Children in relative poverty after housing costs")], fmt="pct", step=0.5,
         phrase="the share of children in relative poverty after housing costs", info="Share of children living in households below 60% of the UK median income, after housing costs are paid. Modelled estimates.",
         kw="child poverty children poor low income ahc", sid="childpov"),
    dict(key="child_pov_bhc", group="Money and work", label="Children in poverty (before housing costs)", short="Child poverty (BHC)",
         src=[("children-in-relative-poverty", "Children in relative poverty before housing costs")], fmt="pct", step=0.5,
         phrase="the share of children in relative poverty before housing costs", info="Share of children living in households below 60% of the UK median income, before housing costs.",
         kw="child poverty children poor low income bhc", sid="childpov"),
    dict(key="claimant_rate", group="Money and work", label="Claimant count", short="Claimants",
         src=[("claimant-count", "Claimant Count")], fmt="pct", step=0.1,
         phrase="the claimant count", info="People claiming unemployment-related benefits (Jobseeker's Allowance, or Universal Credit while looking for work) as a share of residents aged 16 to 64. Yearly average.",
         kw="unemployment benefits jobseekers universal credit claimant jobs", sid="claimant"),
    dict(key="employment_rate", group="Money and work", label="Employment rate", short="Employment",
         src=[("employment-rate", "Employment rate"), ("employment-rate-ni", "Employment rate (Northern Ireland)")], fmt="pct", step=0.5,
         phrase="the employment rate", info="Share of people aged 16 to 64 who are in work.",
         note="Great Britain from the Annual Population Survey; Northern Ireland from NISRA's Labour Force Survey.",
         kw="employment jobs work employed labour", sid="aps"),
    dict(key="inactive", group="Money and work", label="Economically inactive", short="Inactive",
         src=[("employment-rate", "Economically inactive"), ("employment-rate-ni", "Economically inactive (Northern Ireland)")], fmt="pct", step=0.5,
         phrase="the share of people economically inactive", info="Share of people aged 16 to 64 who are neither in work nor looking for work: for example students, carers, and people who are long-term sick or retired.",
         note="Great Britain from the Annual Population Survey; Northern Ireland from NISRA's Labour Force Survey.",
         kw="inactive inactivity sick carers students labour work", sid="aps"),
    dict(key="unemployment", group="Money and work", label="Unemployment rate", short="Unemployment", nations="EWS",
         src=[("modelled-unemployment", "Modelled unemployment rate")], fmt="pct", step=0.1,
         phrase="the unemployment rate", info="Share of economically active people aged 16 and over who are out of work and looking for work (model-based estimate). Great Britain only.",
         kw="unemployment jobless work jobs", sid="unemp"),
    dict(key="job_density", group="Money and work", label="Job density", nations="EWS",
         src=[("job-density", "Job density")], fmt="dec2", step=0.05,
         phrase="job density", info="Jobs in the area for each resident aged 16 to 64. Above 1 means more jobs than working-age residents. Great Britain only.",
         kw="jobs work employment commuting", sid="jobdens"),
    dict(key="gva_hour", group="Money and work", label="Productivity (GVA per hour worked)", short="Productivity",
         src=[("gross-value-added", "Gross value added per hour worked")], fmt="gbp1",
         phrase="output per hour worked", info="Gross value added per hour worked, in pounds: a measure of how productive the local economy is.",
         kw="productivity gva economy output", sid="gva"),
    dict(key="business_births", group="Money and work", label="New businesses", short="Business births",
         src=[("business-demography", "Business births")], fmt="pct", step=0.5,
         phrase="new businesses", info="Businesses started in the year, as a share of all active businesses.",
         kw="business enterprise start-ups births economy", sid="busdem"),
    dict(key="fuel_poverty", group="Money and work", label="Fuel poverty", nations="E",
         src=[("fuel-poverty", "Fuel poverty")], fmt="pct", step=0.5,
         phrase="fuel poverty", info="Share of households in fuel poverty: on a low income and living in a home that is hard to heat (energy efficiency band D or below). England only; the other nations measure fuel poverty differently.",
         kw="fuel poverty energy heating bills cold homes", sid="fuelpov"),

    # ---------------- Housing ----------------
    dict(key="house_price", group="Housing", label="Average house price", short="House price",
         src=[("average-house-price", "Average house price")], fmt="gbp", scale="log", monthly=True,
         phrase="the average house price", info="Average price of a home sold, from the UK House Price Index (latest month). Yearly figures in charts are the average of the months.",
         kw="house prices housing homes property cost", sid="hpi"),
    dict(key="affordability", group="Housing", label="House prices compared with earnings", short="Affordability", nations="EW",
         src=[("housing-affordability-ratio", "Housing affordability ratio (residence-based)")], fmt="ratio", step=0.1, yt="2025",
         phrase="the house price to earnings ratio", info="Median house price divided by the median yearly earnings of people who live in the area. 8 means a typical home costs 8 years' pay. England and Wales only.",
         kw="affordability housing house prices earnings afford", sid="afford"),
    dict(key="ftb_mortgages", group="Housing", label="First-time buyers", short="First-time buyers",
         src=[("first-time-buyer-mortgage-sales", "First-time buyer mortgage sales")], fmt="per1000dw", step=0.5,
         phrase="first-time buyer mortgages", info="Mortgages taken out by first-time buyers in the year, for every 1,000 homes in the area.",
         kw="first time buyers mortgages housing young", sid="ftb"),
    dict(key="new_homes", group="Housing", label="New homes", nations="EWN", compare="nation",
         src=[("net-additions-to-the-housing-stock", "Net additions to the housing stock (England)"),
              ("net-additions-to-the-housing-stock-wales", "Net additions to the housing stock (Wales)"),
              ("net-additions-to-the-housing-stock-northern-ireland", "Net additions to the housing stock (Northern Ireland)")],
         fmt="per1000dw", step=0.5,
         phrase="new homes", info="Net additions to the housing stock in the financial year (new builds and conversions, less demolitions), for every 1,000 homes. Not available for Scotland.",
         note="Each nation counts new homes in its own way, so compare areas within the same nation.",
         kw="new homes housebuilding housing supply building", sid="netadd"),

    # ---------------- Health ----------------
    dict(key="life_exp_f", group="Health", label="Life expectancy (women)", short="Life exp. (women)",
         src=[("life-expectancy", "Female life expectancy")], fmt="years1", step=0.1,
         phrase="women's life expectancy", info="How long a baby girl born now would live on average if death rates stayed as they are. Three-year average.",
         kw="life expectancy health women female death mortality", sid="le"),
    dict(key="life_exp_m", group="Health", label="Life expectancy (men)", short="Life exp. (men)",
         src=[("life-expectancy", "Male life expectancy")], fmt="years1", step=0.1,
         phrase="men's life expectancy", info="How long a baby boy born now would live on average if death rates stayed as they are. Three-year average.",
         kw="life expectancy health men male death mortality", sid="le"),
    dict(key="hle_f", group="Health", label="Healthy life expectancy (women)", short="Healthy life (women)",
         src=[("healthy-life-expectancy", "Female healthy life expectancy")], fmt="years1", step=0.5,
         phrase="women's healthy life expectancy", info="Years a baby girl born now could expect to live in good health. Three-year average. In England, published for counties and unitary areas only, so most districts have no figure.",
         kw="healthy life expectancy health women", sid="hle"),
    dict(key="hle_m", group="Health", label="Healthy life expectancy (men)", short="Healthy life (men)",
         src=[("healthy-life-expectancy", "Male healthy life expectancy")], fmt="years1", step=0.5,
         phrase="men's healthy life expectancy", info="Years a baby boy born now could expect to live in good health. Three-year average. In England, published for counties and unitary areas only, so most districts have no figure.",
         kw="healthy life expectancy health men", sid="hle"),
    dict(key="smokers", group="Health", label="Smokers", short="Smokers",
         src=[("cigarette-smokers", "Cigarette smokers")], fmt="pct", step=0.5,
         phrase="the share of adults who smoke", info="Share of adults (18 and over) who smoke cigarettes (not e-cigarettes). Five-year average.",
         kw="smoking smokers cigarettes tobacco health", sid="smoke"),
    dict(key="obesity", group="Health", label="Adult obesity", nations="E",
         src=[("adult-obesity-prevalence", "Adult obesity prevalence")], fmt="pct", step=0.5,
         phrase="adult obesity", info="Share of adults (18 and over) living with obesity. England only.",
         kw="obesity overweight weight health diet", sid="obes"),
    dict(key="child_obese", group="Health", label="Obesity at age 10 to 11", short="Child obesity", nations="E",
         src=[("child-weight", "Aged 10 to 11 years obese")], fmt="pct", step=0.5,
         phrase="obesity among children aged 10 to 11", info="Share of children in Year 6 (age 10 to 11) living with obesity, from the National Child Measurement Programme. England only.",
         kw="child obesity children weight health ncmp year 6", sid="ncmp"),
    dict(key="cvd_deaths", group="Health", label="Preventable heart and circulatory deaths", short="Preventable CVD deaths", nations="EN", compare="nation",
         src=[("preventable-cardiovascular-mortality-england", "Preventable cardiovascular mortality (England)"),
              ("preventable-cardiovascular-mortality-ni", "Preventable circulatory mortality (Northern Ireland)")],
         fmt="per100kpop", step=1,
         phrase="preventable heart and circulatory deaths", info="Deaths under 75 from heart and circulatory diseases that are thought preventable, per 100,000 people (age-standardised). Three-year average. England and Northern Ireland.",
         note="England and Northern Ireland publish this separately, with slightly different definitions.",
         kw="heart disease stroke cardiovascular deaths mortality health", sid="cvd"),

    # ---------------- Wellbeing ----------------
    dict(key="happiness", group="Wellbeing", label="Happiness", src=[("personal-wellbeing-estimates", "Happiness")], fmt="score10", step=0.05,
         phrase="average happiness", info="Average answer to “Overall, how happy did you feel yesterday?”, from 0 (not at all) to 10 (completely).",
         kw="happiness wellbeing happy mental health", sid="wellbeing"),
    dict(key="satisfaction", group="Wellbeing", label="Life satisfaction", src=[("personal-wellbeing-estimates", "Satisfaction")], fmt="score10", step=0.05,
         phrase="average life satisfaction", info="Average answer to “Overall, how satisfied are you with your life nowadays?”, from 0 (not at all) to 10 (completely).",
         kw="life satisfaction wellbeing happy", sid="wellbeing"),
    dict(key="worthwhile", group="Wellbeing", label="Feeling life is worthwhile", short="Worthwhile", src=[("personal-wellbeing-estimates", "Worthwhile")], fmt="score10", step=0.05,
         phrase="the average feeling that life is worthwhile", info="Average answer to “Overall, to what extent do you feel the things you do in your life are worthwhile?”, from 0 to 10.",
         kw="worthwhile wellbeing purpose", sid="wellbeing"),
    dict(key="anxiety", group="Wellbeing", label="Anxiety", src=[("personal-wellbeing-estimates", "Anxiety")], fmt="score10", step=0.05,
         phrase="average anxiety", info="Average answer to “Overall, how anxious did you feel yesterday?”, from 0 (not at all) to 10 (completely). Lower is better.",
         kw="anxiety wellbeing mental health worry stress", sid="wellbeing"),

    # ---------------- Education and skills ----------------
    dict(key="level3", group="Education and skills", label="Qualified to A level or above", short="Level 3+",
         src=[("qualifications-level-3-or-above", "Level 3 or above qualifications (Great Britain)"),
              ("qualifications-level-3-or-above-ni", "Level 3 or above qualifications (Northern Ireland)")], fmt="pct", step=0.5,
         phrase="the share qualified to level 3 or above", info="Share of people aged 16 to 64 with a level 3 qualification or higher (A levels, Highers, a degree, or equivalent).",
         note="Great Britain from the Annual Population Survey; Northern Ireland from NISRA.",
         kw="qualifications skills education a level degree level 3", sid="quals"),
    dict(key="no_quals", group="Education and skills", label="No qualifications", nations="EWS",
         src=[("qualifications-none-gb", "No qualifications")], fmt="pct", step=0.5,
         phrase="the share with no qualifications", info="Share of people aged 16 to 64 with no qualifications. Great Britain only; some smaller areas have no figure.",
         kw="no qualifications skills education", sid="quals"),
    dict(key="gcse_em", group="Education and skills", label="English and maths GCSEs by 19", short="GCSE English & maths", nations="E",
         src=[("gcses-in-english-and-maths", "GCSEs in English and Maths")], fmt="pct", step=0.5,
         phrase="the share with English and maths GCSEs by 19", info="Share of 19-year-olds who have passed GCSEs (or equivalent) in English and maths. England only.",
         kw="gcse english maths school results education", sid="dfe_l2"),
    dict(key="ks2_rwm", group="Education and skills", label="Primary pupils at the expected standard", short="KS2 expected standard", nations="E",
         src=[("pupils-at-expected-standards-by-end-of-primary-school", "Pupils meeting the expected standard in reading, writing and maths")], fmt="pct", step=0.5,
         phrase="the share of pupils at the expected standard at the end of primary school", info="Share of pupils at the end of primary school (key stage 2) meeting the expected standard in reading, writing and maths. England only.",
         kw="primary school sats key stage 2 reading writing maths education", sid="dfe_ks2"),
    dict(key="early_years", group="Education and skills", label="Early years: communication and language", short="Early years", nations="E",
         src=[("early-years", "Communication and language")], fmt="pct", step=0.5,
         phrase="the share of 5-year-olds at the expected level in communication and language", info="Share of children at the end of reception (age 5) at the expected level in communication and language. England only.",
         kw="early years reception children nursery development", sid="dfe_eyfs"),
    dict(key="apprentices", group="Education and skills", label="Apprenticeship starts", short="Apprenticeships", compare="nation",
         src=[("apprenticeships", "Apprenticeship starts (England)"), ("apprenticeships-wales", "Apprenticeship starts (Wales)"),
              ("apprenticeships-scotland", "Apprenticeship starts (Scotland)"), ("apprenticeships-ni", "Apprenticeship starts (Northern Ireland)")],
         fmt="per100kpop", step=10,
         phrase="apprenticeship starts", info="Apprenticeships started in the year, per 100,000 people.",
         note="Each nation runs its own apprenticeship programme and counts starts differently, so compare areas within the same nation.",
         kw="apprenticeships skills training jobs young people", sid="apprent"),

    # ---------------- Getting connected ----------------
    dict(key="full_fibre", group="Getting connected", label="Full fibre broadband", short="Full fibre",
         src=[("broadband-coverage", "Premises with access to full fibre")], fmt="pct", step=1,
         phrase="full fibre coverage", info="Share of homes and businesses that can get full fibre broadband.",
         kw="broadband internet fibre digital connectivity", sid="ofcom_bb"),
    dict(key="slow_bb", group="Getting connected", label="Slow broadband (below 30 Mbit/s)", short="Slow broadband",
         src=[("broadband-coverage", "Premises below 30Mbps")], fmt="pct", step=0.5,
         phrase="the share of premises without 30 Mbit/s broadband", info="Share of homes and businesses that cannot get broadband of at least 30 Mbit/s (superfast).",
         kw="broadband slow internet digital exclusion rural", sid="ofcom_bb"),
    dict(key="cover_4g", group="Getting connected", label="4G mobile coverage", short="4G",
         src=[("network-coverage-4g", "4G coverage")], fmt="pct", step=1,
         phrase="4G coverage", info="Share of the land area with an outdoor 4G signal from at least one mobile network.",
         kw="mobile phone signal 4g coverage rural", sid="ofcom_mob"),
    dict(key="cover_5g", group="Getting connected", label="5G mobile coverage", short="5G",
         src=[("network-coverage-5g", "5G coverage")], fmt="pct", step=1,
         phrase="5G coverage", info="Share of the land area with an outdoor 5G signal from at least one mobile network.",
         kw="mobile phone signal 5g coverage", sid="ofcom_mob"),
    dict(key="ev_chargers", group="Getting connected", label="Public electric car chargers", short="EV chargers",
         src=[("public-electric-vehicle-chargers", "Public electric vehicle chargers")], fmt="per100kpop", step=5, scale="log",
         phrase="public electric car chargers", info="Public charging points for electric vehicles, per 100,000 people.",
         kw="electric vehicles ev chargers cars transport net zero", sid="evcp"),
    dict(key="station_walk", group="Getting connected", label="Near a railway station", short="Station walk", nations="EW",
         src=[("railway-station-walk", "Residents within a 30 minute walk of their nearest railway station")], fmt="pct", step=1,
         phrase="the share of people within a 30-minute walk of a station", info="Share of residents who live within a 30-minute walk of a railway station. England and Wales only.",
         kw="railway station train transport walk access rural", sid="station"),

    # ---------------- Services and culture ----------------
    dict(key="library_walk", group="Services and culture", label="Near a library", short="Library walk", nations="EW",
         src=[("library-walk", "Residents within a 30 minute walk of their nearest library")], fmt="pct", step=1,
         phrase="the share of people within a 30-minute walk of a library", info="Share of residents who live within a 30-minute walk of a public library. England and Wales only.",
         kw="library libraries access services walk", sid="library"),
    dict(key="sports_fac", group="Services and culture", label="Sports facilities", short="Sports facilities", nations="E",
         src=[("sports-facilities", "Sports facilities")], fmt="per10k", step=0.5,
         phrase="sports facilities", info="Sports facilities (pitches, pools, sports halls, gyms and more) per 10,000 people. England only.",
         kw="sport sports facilities leisure centres pitches pools gyms", sid="sport"),
    dict(key="supermarkets", group="Services and culture", label="Supermarkets", src=[("supermarkets", "Supermarkets")], fmt="per10k", step=0.1,
         phrase="supermarkets", info="Chain supermarkets per 10,000 people.",
         kw="supermarkets shops food access groceries", sid="supermk"),
    dict(key="museums", group="Services and culture", label="Museums", src=[("museums", "museums")], fmt="per100kpop", step=1, scale="log",
         phrase="museums", info="Museums per 100,000 people (September 2021).",
         kw="museums culture heritage", sid="museums"),
    dict(key="arts", group="Services and culture", label="Took part in the arts", short="Arts", nations="E",
         src=[("engagement-with-culture-and-heritage", "Engaged with the arts")], fmt="pct", step=1,
         phrase="the share of adults who engaged with the arts", info="Share of adults who took part in or went to an arts event or activity in the last year (Participation Survey). England only.",
         kw="arts culture participation creative", sid="dcms"),
    dict(key="heritage", group="Services and culture", label="Visited a heritage site", short="Heritage", nations="E",
         src=[("engagement-with-culture-and-heritage", "Visited a heritage site")], fmt="pct", step=1,
         phrase="the share of adults who visited a heritage site", info="Share of adults who visited a heritage site in the last year (Participation Survey). England only.",
         kw="heritage history culture visits", sid="dcms"),

    # ---------------- Environment ----------------
    dict(key="ghg_pc", group="Environment", label="Greenhouse gas emissions per person", short="Emissions",
         src=[("greenhouse-gas-emissions", "Greenhouse gas emissions")], fmt="tonnes", step=0.1, scale="log",
         phrase="greenhouse gas emissions per person", info="Greenhouse gas emissions from the area (homes, transport, industry, farming and more) per person, in tonnes of CO₂ equivalent. Areas with heavy industry or big roads score high.",
         kw="emissions carbon co2 climate greenhouse gas net zero", sid="ghg"),
    dict(key="elec_kwh", group="Environment", label="Home electricity use", short="Electricity",
         src=[("domestic-electricity-consumption", "Electricity consumption")], fmt="kwhm", step=50, yt="2024",
         phrase="home electricity use", info="Median electricity used by a household meter in a year, in kWh.",
         kw="electricity energy use homes", sid="elec"),
    dict(key="gas_kwh", group="Environment", label="Home gas use", short="Gas", nations="EWS",
         src=[("domestic-gas-consumption", "Gas consumption")], fmt="kwhm", step=100,
         phrase="home gas use", info="Median gas used by a household meter in a year, in kWh. Great Britain only; Northern Ireland has few gas connections.",
         kw="gas heating energy use homes", sid="gas"),
]

SOURCES = {
    "gdhi": ("ONS, Regional gross disposable household income", "https://www.ons.gov.uk/economy/regionalaccounts/grossdisposablehouseholdincome"),
    "ashe": ("ONS and NISRA, Annual Survey of Hours and Earnings (resident-based)", "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours"),
    "childpov": ("DWP and HMRC, Children in low income families: local area statistics", "https://www.gov.uk/government/collections/children-in-low-income-families-local-area-statistics"),
    "claimant": ("ONS, Claimant Count (official statistics in development)", "https://www.ons.gov.uk/employmentandlabourmarket/peoplenotinwork/outofworkbenefits"),
    "aps": ("ONS Annual Population Survey (Great Britain); NISRA Labour Force Survey (Northern Ireland)", "https://www.nomisweb.co.uk/datasets/apsnew"),
    "unemp": ("ONS, Model-based unemployment estimates for local authorities", "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/datasets/li01regionallabourmarketlocalindicatorsforcountieslocalandunitaryauthorities"),
    "jobdens": ("ONS, Jobs density (Nomis)", "https://www.nomisweb.co.uk/datasets/jd"),
    "gva": ("ONS, Subregional productivity", "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/labourproductivity"),
    "busdem": ("ONS, Business demography", "https://www.ons.gov.uk/businessindustryandtrade/business/activitysizeandlocation/bulletins/businessdemography/previousReleases"),
    "fuelpov": ("Department for Energy Security and Net Zero, Sub-regional fuel poverty (England)", "https://www.gov.uk/government/collections/fuel-poverty-sub-regional-statistics"),
    "hpi": ("HM Land Registry, Registers of Scotland, LPS Northern Ireland and ONS: UK House Price Index", "https://www.gov.uk/government/collections/uk-house-price-index-reports"),
    "afford": ("ONS, Housing affordability in England and Wales", "https://www.ons.gov.uk/peoplepopulationandcommunity/housing/bulletins/housingaffordabilityinenglandandwales/previousreleases"),
    "ftb": ("ONS, First-time buyer mortgage sales by local authority", "https://www.ons.gov.uk/peoplepopulationandcommunity/housing/datasets/firsttimebuyermortgagesalesbylocalauthorityuk2006to2023"),
    "netadd": ("MHCLG (England), Welsh Government and NI Department of Finance: net additions to the housing stock", "https://www.gov.uk/government/statistical-data-sets/live-tables-on-dwelling-stock-including-vacants"),
    "le": ("ONS, Life expectancy for local areas of the UK", "https://www.ons.gov.uk/peoplepopulationandcommunity/healthandsocialcare/healthandlifeexpectancies/bulletins/lifeexpectancyforlocalareasoftheuk/previousreleases"),
    "hle": ("ONS, Health state life expectancies", "https://www.ons.gov.uk/peoplepopulationandcommunity/healthandsocialcare/healthandlifeexpectancies"),
    "smoke": ("ONS, Adult smoking habits in the UK", "https://www.ons.gov.uk/peoplepopulationandcommunity/healthandsocialcare/healthandlifeexpectancies/bulletins/adultsmokinghabitsingreatbritain/previousreleases"),
    "obes": ("Office for Health Improvement and Disparities, Fingertips (Active Lives Survey)", "https://fingertips.phe.org.uk/profile/obesity-physical-activity-nutrition"),
    "ncmp": ("NHS England, National Child Measurement Programme (via OHID Fingertips)", "https://fingertips.phe.org.uk/profile/national-child-measurement-programme"),
    "cvd": ("OHID Public Health Outcomes Framework (England); NI Department of Health (Northern Ireland)", "https://fingertips.phe.org.uk/profile/public-health-outcomes-framework"),
    "wellbeing": ("ONS, Personal well-being in the UK (Annual Population Survey)", "https://www.ons.gov.uk/peoplepopulationandcommunity/wellbeing/datasets/headlineestimatesofpersonalwellbeing"),
    "quals": ("ONS Annual Population Survey (Great Britain); NISRA (Northern Ireland)", "https://www.nomisweb.co.uk/datasets/apsnew"),
    "dfe_l2": ("Department for Education, Level 2 and 3 attainment age 16 to 25", "https://explore-education-statistics.service.gov.uk/find-statistics/level-2-and-3-attainment-by-young-people-aged-19"),
    "dfe_ks2": ("Department for Education, Key stage 2 attainment", "https://explore-education-statistics.service.gov.uk/find-statistics/key-stage-2-attainment"),
    "dfe_eyfs": ("Department for Education, Early years foundation stage profile results", "https://explore-education-statistics.service.gov.uk/find-statistics/early-years-foundation-stage-profile-results"),
    "apprent": ("Department for Education (England), Medr (Wales), Skills Development Scotland, Department for the Economy (Northern Ireland)", "https://explore-education-statistics.service.gov.uk/find-statistics/apprenticeships"),
    "ofcom_bb": ("Ofcom, Connected Nations (January 2026)", "https://www.ofcom.org.uk/phones-and-broadband/coverage-and-speeds/infrastructure-research"),
    "ofcom_mob": ("Ofcom, Connected Nations: mobile coverage (January 2026)", "https://www.ofcom.org.uk/phones-and-broadband/coverage-and-speeds/infrastructure-research"),
    "evcp": ("Department for Transport, Electric vehicle charging infrastructure statistics (data from Zapmap)", "https://www.gov.uk/government/collections/electric-vehicle-charging-infrastructure-statistics"),
    "station": ("ONS, Travel time to railway stations in local areas, England and Wales", "https://www.ons.gov.uk/peoplepopulationandcommunity/wellbeing/datasets/traveltimetorailwaystationsinlocalareasenglandandwales"),
    "library": ("ONS, Travel time to libraries in local areas, England and Wales", "https://www.ons.gov.uk/peoplepopulationandcommunity/wellbeing/datasets/traveltimetolibrariesinlocalareasenglandandwales"),
    "sport": ("ONS, Number of sports facilities across local authority districts (from Active Places)", "https://www.ons.gov.uk/peoplepopulationandcommunity/wellbeing/datasets/numberofsportsfacilitiesacrosslocalauthoritydistrictsladandmiddlelayersuperoutputareasmsoainenglandandwales"),
    "supermk": ("ONS, Number of chain supermarkets across local authority districts", "https://www.ons.gov.uk/peoplepopulationandcommunity/wellbeing/datasets/1numberofchainsupermarketsacrosslocalauthoritydistrictsladandsmallergeographicalareasintheuk"),
    "museums": ("ONS, Number of museums across local authority districts (from the Mapping Museums project)", "https://www.ons.gov.uk/peoplepopulationandcommunity/wellbeing/datasets/numberofmuseumsacrosslocalauthoritydistrictsladintheunitedkingdom"),
    "dcms": ("Department for Culture, Media and Sport, Participation Survey", "https://www.gov.uk/government/collections/participation-survey-statistical-releases"),
    "ghg": ("Department for Energy Security and Net Zero, UK local authority greenhouse gas emissions", "https://www.gov.uk/government/collections/uk-local-authority-and-regional-greenhouse-gas-emissions-national-statistics"),
    "elec": ("Department for Energy Security and Net Zero, Sub-national electricity consumption", "https://www.gov.uk/government/collections/sub-national-electricity-consumption-data"),
    "gas": ("Department for Energy Security and Net Zero, Sub-national gas consumption", "https://www.gov.uk/government/collections/sub-national-gas-consumption-data"),
    "dep": ("English Indices of Deprivation 2025 (MHCLG); Welsh Index of Multiple Deprivation 2025 (Welsh Government); Scottish Index of Multiple Deprivation 2020v2 (Scottish Government); Northern Ireland Multiple Deprivation Measure 2017 (NISRA). Local authority summaries via the IMD package (humaniverse)", "https://github.com/humaniverse/IMD"),
}

# Deprivation: the share of an area's small areas in the most deprived 10% of its own nation
DEP = [
    ("dep_all", "Deprivation (all domains)", "Deprivation", "overall deprivation", ("imd", "WIMD", "", "")),
    ("dep_income", "Income deprivation", "Income deprivation", "income deprivation", ("income", "Income", "Income_", "Income_")),
    ("dep_employment", "Employment deprivation", "Employment deprivation", "employment deprivation", ("employment", "Employment", "Employment_", "Employment_")),
    ("dep_health", "Health deprivation", "Health deprivation", "health deprivation", ("health_deprivation_and_disability", "Health", "Health_", "Health_")),
    ("dep_education", "Education deprivation", "Education deprivation", "education deprivation", ("education_skills_and_training", "Education", "Education_", "Education_")),
]
DEP_NOTE = ("Each nation has its own index, made at a different time and in a different way (England 2025, Wales 2025, Scotland 2020, "
            "Northern Ireland 2017), so compare areas within the same nation, not across nations.")


def rnd(v):
    """Keep about four significant figures, so the files stay small."""
    a = abs(v)
    if a >= 10000:
        return int(round(v, -1))
    if a >= 1000:
        return int(round(v))
    return round(v, 1 if a >= 100 else 2 if a >= 1 else 3)


def period_info(p):
    """'2024-04-01/P1Y' -> (year used on the slider, label)."""
    d, _, dur = p.partition("/")
    y, mo = int(d[:4]), int(d[5:7]) if len(d) >= 7 else 1
    months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
    if dur in ("P3Y", "P5Y"):
        n = int(dur[1])
        return y + n - 1, f"{y}–{str(y + n - 1)[2:]}"
    if dur == "P1Y":
        return (y, f"{y}/{str(y + 1)[2:]}") if mo != 1 else (y, str(y))
    if dur == "P1M":
        return y, f"{months[mo - 1]} {y}"
    return y, (f"{months[mo - 1]} {y}" if mo != 1 or len(d) > 7 else str(y))


def read_els(root, folder, indicator, codes):
    """Return {code: {period: value}} for one indicator, local authorities only."""
    out = defaultdict(dict)
    with open(os.path.join(root, folder, folder + ".csv"), encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r["indicator"] != indicator:
                continue
            c = CODE_ALIASES.get(r["areacd"], r["areacd"])
            if c not in codes:
                continue
            try:
                v = float(r["observation"])
            except ValueError:
                continue
            out[c][r["period"]] = v
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--els", required=True)
    ap.add_argument("--imd", required=True)
    ap.add_argument("--out", default=ROOT)
    a = ap.parse_args()

    rows = json.load(open(os.path.join(a.out, "areas.json")))
    by = {r["iso3"]: r for r in rows}
    codes = set(by)
    ts = json.load(open(os.path.join(a.out, "timeseries.json")))
    ts.setdefault("sparse", {})
    ts["runs"] = {}
    ts["carry"] = []          # yearly gaps are left as gaps (the world site carried survey values forward)
    defs = []

    for m in M:
        vals = {}               # code -> {year: value}
        latest = {}             # code -> (period, value)
        for folder, ind in m["src"]:
            d = read_els(a.els, folder, ind, codes)
            for c, per in d.items():
                if m.get("monthly"):
                    byy = defaultdict(list)
                    for p, v in per.items():
                        byy[int(p[:4])].append(v)
                    vals[c] = {y: sum(v) / len(v) for y, v in byy.items()}
                else:
                    vals[c] = {period_info(p)[0]: v for p, v in per.items()}
                p = max(per)
                latest[c] = (p, per[p])
        if not latest:
            raise SystemExit("no data for " + m["key"])
        labels = Counter(period_info(p)[1] for p, _ in latest.values())
        for c, (p, v) in latest.items():
            by[c][m["key"]] = rnd(v)
            by[c][m["key"] + "_year"] = period_info(p)[0]
        nyears = Counter(len(v) for v in vals.values()).most_common(1)[0][0]
        if nyears >= 3:
            # stored as runs: [first year, value, value, ...] with null for a missing year
            runs = {}
            for c, v in vals.items():
                ys = [y for y in sorted(v) if 1991 <= y <= 2025]
                if ys:
                    runs[c] = [ys[0]] + [rnd(v[y]) if y in v else None for y in range(ys[0], ys[-1] + 1)]
            ts["runs"][m["key"]] = runs
        main_label = m.get("yt") or labels.most_common(1)[0][0]
        nat = m.get("nations", ALL)
        print(f"{m['key']:16} {len(latest):3} areas  {main_label:9} years={nyears:2}  nations={dict(Counter(c[0] for c in latest))}")
        defs.append({**{k: m[k] for k in ("key", "group", "label") }, "short": m.get("short"), "format": m["fmt"], "scale": m.get("scale", "linear"),
                     "step": m.get("step", 1), "source": "x_" + m["sid"], "yearText": main_label, "nations": nat, "compare": m.get("compare", "uk"),
                     "info": m["info"] + (" " + m["note"] if m.get("note") else "") + (" Compare areas within the same nation." if m.get("compare") == "nation" and "within the same nation" not in m.get("note", "") else ""),
                     "phrase": m["phrase"], "keywords": m["kw"]})

    # ---------- Deprivation ----------
    import pyreadr
    rd = lambda n: next(iter(pyreadr.read_r(os.path.join(a.imd, "data", n + ".rda")).values()))
    eng, wal, sco, ni = rd("imd2025_england_ltla24"), rd("imd2025_wales_ltla24"), rd("imd2020_scotland_ltla24"), rd("imd2017_northern_ireland_lgd14")
    wal_tot = {(r.ltla24_code, r.domain): r.data_values for r in wal.itertuples() if r.deprivation_group == "Total LSOAs" and r.data_description == "Number"}
    wal_10 = {(r.ltla24_code, r.domain): r.data_values for r in wal.itertuples() if r.deprivation_group.startswith("Most deprived 10%") and r.data_description == "Number"}
    for key, label, short, phrase, (ec, wd, sc, nc) in DEP:
        got = {}
        for r in eng.to_dict("records"):
            got[r["ltla24_code"]] = (r[f"{ec}_proportion_of_lso_as_in_most_deprived_10_percent_nationally"], 2025)
        for (c, dom), tot in wal_tot.items():
            if dom == wd and tot:
                got[c] = (wal_10.get((c, dom), 0) / tot, 2025)
        for r in sco.to_dict("records"):
            got[r["ltla24_code"]] = (r[sc + "Proportion"], 2020)
        for r in ni.to_dict("records"):
            got[r["lgd14_code"]] = (r[nc + "Proportion"], 2017)
        n = 0
        for c, (v, y) in got.items():
            c = CODE_ALIASES.get(c, c)
            if c in by and v == v:
                by[c][key] = round(float(v) * 100, 1)
                by[c][key + "_year"] = y
                n += 1
        print(f"{key:16} {n:3} areas")
        defs.append({"key": key, "group": "Deprivation", "label": label + ": share of small areas in the most deprived 10%", "short": short,
                     "format": "pct", "scale": "linear", "step": 1, "source": "x_dep", "yearText": "2017–2025", "nations": ALL, "compare": "nation",
                     "info": f"Share of the area's neighbourhoods (small areas of about 1,500 people) that are among the most deprived 10% in their nation, on {phrase}. 0% means none are. {DEP_NOTE}",
                     "phrase": f"the share of neighbourhoods in their nation's most deprived 10% for {phrase}", "keywords": "deprivation imd simd wimd nimdm poverty disadvantage deprived " + phrase})

    with open(os.path.join(a.out, "areas.json"), "w") as f:
        json.dump(rows, f, separators=(",", ":"))
    with open(os.path.join(a.out, "timeseries.json"), "w") as f:
        json.dump(ts, f, separators=(",", ":"))

    # ---------- measures.js ----------
    def js(d):
        return json.dumps(d, ensure_ascii=False)
    lines = ["/* Generated by scripts/build_measures.py: the local measures added in release 1.1. Edit the script, not this file. */",
             "(function () {",
             "  const add = [];"]
    for d in defs:
        phrase = d.pop("phrase")
        say = f"(b) => {js(phrase[0].upper() + phrase[1:] if False else phrase)} + \" is \" + b"
        lines.append(f"  add.push(Object.assign({js({k: v for k, v in d.items() if v is not None})}, {{ type: \"range\", year: {js(d['key'] + '_year')}, say: {say} }}));")
    lines += ["  window.FILTERS.push(...add);",
              "  const src = " + js({"x_" + k: {"name": n, "url": u, "licence": "Open Government Licence v3.0"} for k, (n, u) in SOURCES.items()}) + ";",
              "  Object.assign(window.SOURCES, src);",
              "})();", ""]
    with open(os.path.join(a.out, "measures.js"), "w") as f:
        f.write("\n".join(lines))
    print("measures:", len(defs))


if __name__ == "__main__":
    main()
