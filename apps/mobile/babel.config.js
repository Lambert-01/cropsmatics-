module.exports = function (api) {
  api.cache(true);
  return {
    // expo-router's Babel plugin is included by babel-preset-expo in SDK 50+.
    presets: ["babel-preset-expo"],
  };
};
