export const PPC_ANALYSIS_COLUMNS = [
  { key: "performance-primary", label: "Performance reports", sections: [
    { slug: "campaigns", label: "Campaigns", path: "/Ads/Performance/Campaigns/Index" },
    { slug: "keyword-targeting", label: "Keyword Targeting", path: "/Ads/Performance/Keywords/Index" },
    { slug: "product-targeting", label: "Product Targeting", path: "/Ads/Performance/ProductAds/Index" },
    { slug: "search-terms", label: "Search Terms", path: "/Ads/SearchTerms/Index" },
  ] },
  { key: "performance-secondary", label: "Targeting reports", sections: [
    { slug: "ad-types", label: "Ad Types", path: "/Ads/Performance/AdTypes/Index" },
    { slug: "match-types", label: "Match Types", path: "/Ads/Performance/MatchTypes/Index" },
    { slug: "placements", label: "Placements", path: "/Ads/Performance/Placements/Index" },
    { slug: "main-keywords", label: "Main Keywords", path: "/Ads/MainKeywords/Index" },
  ] },
  { key: "trends", label: "Trend reports", sections: [
    { slug: "daily-performance-trend", label: "Daily Performance", path: "/Sales/SalesTrend", daysPerCycle: 1 },
    { slug: "weekly-performance-trend", label: "Weekly Performance", path: "/Sales/SalesTrend", daysPerCycle: 7 },
    { slug: "monthly-performance-trend", label: "Monthly Performance", path: "/Sales/SalesTrend", daysPerCycle: 30 },
    { slug: "day-parting", label: "Day Parting", path: "/Sales/DayParting" },
  ] },
] as const;

export const PPC_ANALYSIS_SECTIONS = [
  ...PPC_ANALYSIS_COLUMNS[0].sections,
  ...PPC_ANALYSIS_COLUMNS[1].sections,
  ...PPC_ANALYSIS_COLUMNS[2].sections,
] as const;

export type PpcAnalysisSlug = (typeof PPC_ANALYSIS_SECTIONS)[number]["slug"];

export function normalizeDashboardAsin(value: string) {
  const asin = value.trim().toUpperCase();
  return /^[A-Z0-9]{10}$/.test(asin) ? asin : "";
}

export function getScaleInsightsAnalysisHref(asinValue: string, section: PpcAnalysisSlug, from: string, to: string) {
  const asin = normalizeDashboardAsin(asinValue);
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const route = PPC_ANALYSIS_SECTIONS.find(candidate => candidate.slug === section);
  if (!asin || !route || !datePattern.test(from) || !datePattern.test(to)) return "https://portal.scaleinsights.com/Ads";

  const url = new URL(route.path, "https://portal.scaleinsights.com");
  if ("daysPerCycle" in route) {
    url.searchParams.set("cycles", "7");
    url.searchParams.set("daysPerCycle", String(route.daysPerCycle));
  } else if (section === "day-parting") {
    url.searchParams.set("weeks", "4");
  } else {
    url.searchParams.set("from", from);
  }
  url.searchParams.set("to", to);
  url.searchParams.set("asinList", asin);
  return url.toString();
}

export function getScaleInsightsSearchTermHref(asinValue: string, from: string, to: string) {
  return getScaleInsightsAnalysisHref(asinValue, "search-terms", from, to);
}

export function getScaleInsightsKeywordCampaignCreationHref(asinValue: string, keywordValue: string | readonly string[]) {
  const asin = normalizeDashboardAsin(asinValue);
  const keywordValues = typeof keywordValue === "string" ? [keywordValue] : keywordValue;
  const keywords = [...new Set(keywordValues.map(value => value.replace(/\r?\n/g, " ").trim()).filter(Boolean))];
  if (!asin || !keywords.length) return "https://portal.scaleinsights.com/MassCampaigns/KeywordCampaigns";

  const url = new URL("/MassCampaigns/KeywordCampaigns/Customize", "https://portal.scaleinsights.com");
  url.searchParams.set("asin", asin);
  url.searchParams.set("keyword", keywords.join("\n"));
  return url.toString();
}
