/**
 * Local reference lists so the harvest form works fully offline.
 * These mirror data/dictionaries/{crops,districts}.csv (names only, no statistics).
 * The server re-validates them on sync.
 */
export const CROPS = [
  "Maize", "Sorghum", "Paddy rice", "Wheat", "Other cereals",
  "Cassava", "Sweet potato", "Irish potato", "Yams & Taro",
  "Beans", "Groundnut", "Soybean", "Banana",
  "Vegetables", "Fruits", "Fodder crops", "Other crops",
];

export const DISTRICTS = [
  "Bugesera", "Burera", "Gakenke", "Gasabo", "Gatsibo", "Gicumbi", "Gisagara",
  "Huye", "Kamonyi", "Karongi", "Kayonza", "Kicukiro", "Kirehe", "Muhanga",
  "Musanze", "Ngoma", "Ngororero", "Nyabihu", "Nyagatare", "Nyamagabe",
  "Nyamasheke", "Nyanza", "Nyarugenge", "Nyaruguru", "Rubavu", "Ruhango",
  "Rulindo", "Rusizi", "Rutsiro", "Rwamagana",
];
