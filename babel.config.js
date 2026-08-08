module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // No react-native-reanimated/plugin here on purpose.
    plugins: [],
  };
};
