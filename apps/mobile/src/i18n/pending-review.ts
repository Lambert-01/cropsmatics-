/**
 * The known Kinyarwanda translation ledger.
 *
 * `rw.ts` carries a working translation, reviewed with a native speaker before
 * public release (see its header and docs/09_MOBILE_APPLICATION.md). A large
 * block of it is still English, and that was invisible: the existing i18n test
 * asserts that the two dictionaries have the *same key set*, which an
 * untranslated key satisfies perfectly. A screen could therefore ship with
 * English copy in the Kinyarwanda build and nothing would fail.
 *
 * This list is that gap, written down. `tests/i18n.test.ts` enforces it in both
 * directions:
 *
 *   - a key whose Kinyarwanda value still equals its English value must appear
 *     here, so a NEW untranslated string fails CI instead of shipping quietly;
 *   - an entry here whose value HAS been translated must be deleted, so the
 *     ledger cannot rot into a list of lies.
 *
 * Tooling must not translate these automatically. These are agricultural,
 * statistical and policy terms — "harvested area", "erosion protection",
 * "post-harvest loss", the limitation and method notes — where a plausible
 * machine rendering is worse than an honest English fallback, because it reads
 * as authoritative to the user. The fix is a native speaker working through the
 * list, not a guess.
 *
 * Brand and language names are not in here: `appName` and `tagline` are English
 * by design, and `english`/`kinyarwanda` name the languages themselves. They are
 * exempted explicitly in the test rather than mixed into this debt.
 */

/** Keys whose `rw` value is still identical to `en`. Alphabetical. */
export const PENDING_KINYARWANDA_REVIEW: readonly string[] = [
  "about", "aboutAIUsage", "aboutCropmatics", "aboutDescription",
  "aboutInterpretationPolicy", "aboutTitle", "aboutWhatDataItUses",
  "aboutWhatItDoesNotClaim", "aboutWhatItIs", "aboutWhoItIsFor", "accessibility",
  "agroforestry", "alertsNeedsAttention", "alertsUpcoming", "alertsUpdates",
  "allCategories", "appearance", "appearanceDark", "appearanceLight",
  "appearanceSystem", "ask", "askAnswerCoverage", "askAnswerLimitations",
  "askAnswerPeriod", "askAnswerSource", "askCropmatics", "askDeleteHistory", "askHistory",
  "askNoHistory", "askNotGrounded", "askOpenCrop", "askOpenDistrict", "askPlaceholder",
  "askSaveAnswer", "askSend", "askSubtitle", "askSuggestedQuestions", "askTitle",
  "askViewSource", "buildNumber", "cereals", "chooseLanguage", "clearCachedData",
  "compare", "compareAbsolutesOnlyNote", "compareDistrict", "compareGapBenchmarkNote",
  "comparePickTwoCropsMessage", "comparePickTwoDistrictsMessage", "compareSubtitle",
  "compareTitle", "continueButton", "coverage", "cropList", "cropListSubtitle", "crops",
  "dataSettings", "dataSources", "dataSourcesHowWeUseBody", "dataSourcesSubtitle",
  "dataSourcesTitle", "districtData", "districtDataAvailable", "districtList",
  "districtListSubtitle", "districts", "erosionProtection", "errorGeneric",
  "errorNoDistrictData", "errorViewNational", "explore", "exploreData", "exploreSubtitle",
  "exploreTitle", "factorObservations", "factorSmallSample", "factorsDistrictScope",
  "factorsSubtitle", "fieldOperationsDisabled", "fieldOperationsFooter", "fruits",
  "getStarted", "harvestedArea", "help", "helpAskBody", "helpCompareBody",
  "helpExploreBody", "helpInquiryBody", "helpMapsBody", "helpOfflineBody",
  "helpSourcesBody", "heroSubtitle", "heroTitle", "homeConsumption", "homeEyebrow",
  "homeHeadline", "homeHeroBody", "howToReadChart", "improvedSeed", "indicators",
  "indicatorsSubtitle", "indicatorsTitle", "inorganicFertilizer", "inputAdoptionNote",
  "inputAdoptionSubtitle", "inputs", "inquiryCrop", "inquiryDistrict", "inquiryEmail",
  "inquiryError", "inquiryHistory", "inquiryMessage", "inquiryName", "inquiryNoHistory",
  "inquiryOrganization", "inquiryPrivacyNote", "inquiryProvince", "inquiryReceiptNote",
  "inquiryStatusAnswered", "inquiryStatusClosed", "inquiryStatusReceived",
  "inquiryStatusReviewing", "inquirySubmit", "inquirySubmitting", "inquirySubtitle",
  "inquirySuccess", "inquiryTitle", "inquiryTopic", "insightAdoption",
  "insightLocalSummary", "insightLoss", "insightNoLocal", "insightNoMover",
  "insightProduceFalling", "insightProduceRising", "insightsFeedSubtitle", "irrigation",
  "largerText", "lastUpdate", "latestData", "latestDataPeriod",
  "legendHigherIsBetter", "legendHigherIsWorse", "limitations", "loading", "losses",
  "mapLegend", "maps", "mapsSubtitle", "mapsTitle", "methodologyAskBody",
  "methodologyCausationBody", "methodologyCleanBody", "methodologyGapBody",
  "methodologyIndicatorsBody", "methodologyNationalBody", "methodologyNoClaimNote", "more",
  "moreFooterNote", "moreGroupCropmatics", "moreTitle", "moversSubtitle", "myInquiries",
  "nationalContext", "nationalContextLabel", "nationalData", "nationalDataOnly",
  "noDataAvailable", "noFactorAssociation", "noResults", "notifications",
  "notificationsInfo", "notificationsInquiry", "offline", "offlineCache", "offlineCached",
  "onboardingDescription", "onboardingTitle", "organicFertilizer", "other", "overview",
  "period", "pesticide", "popularQuestions", "postHarvest", "postHarvestFacilityNote",
  "postHarvestLossNote", "postHarvestNationalWarning", "postHarvestNoDistrictNote",
  "postHarvestPickCropNote", "postHarvestSubtitle", "postHarvestTitle", "privacy",
  "privacyHonestyNote", "privacyPoint1", "privacyPoint2", "privacyPoint3", "privacyPoint4",
  "privacyPoint5", "production", "productivity", "programCoverage", "province", "pulses",
  "reducedMotion", "rootsTubers", "saveItem", "savedCrop", "savedDistrict", "savedEmpty",
  "savedIndicator", "savedItems", "savedQuestion", "savedTitle", "searchCrops",
  "searchDistricts", "searchPlaceholder", "seed", "selectCrop", "selectIndicator",
  "selectPeriod", "settings", "settingsTitle", "skip", "soilErosion", "sold", "source",
  "sources", "syncIdempotentNote", "tapDistrictHint", "topCrops", "trends",
  "tryAgain", "unsaveItem", "usage", "useOfProduction", "vegetables", "verifiedSource",
  "viewDataSource", "viewDetails", "viewDistrictDetails", "viewSource", "yieldKgHa",
  "yieldTrend",
];

/**
 * Keys allowed to hold the same value in both dictionaries, with the reason.
 *
 * Kept separate from the ledger above so the ledger stays a pure to-do list and
 * the test can assert each exemption is still genuinely shared — an exemption
 * that becomes a translated key is stale and must be removed.
 */
export const SHARED_BY_DESIGN: readonly string[] = [
  // Product name. Never translated.
  "appName",
  // The tagline is English brand copy in both builds.
  "tagline",
  // Endonyms: each label names its own language.
  "english",
  "kinyarwanda",
];
