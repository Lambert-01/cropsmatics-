module.exports = function (api) {
  api.cache(true);
  return {
    // expo-router's Babel plugin is included by babel-preset-expo in SDK 50+.
    // unstable_transformImportMeta: Hermes has no import.meta - zustand's ESM build needs the polyfill.
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
  };
};
