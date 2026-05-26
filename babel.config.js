module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module:react-native-dotenv',
      {
        moduleName: '@env',
        path: '.env',
      },
    ],
    'react-native-reanimated/plugin', // required by react-native-reanimated v2 https://docs.swmansion.com/react-native-reanimated/docs/installation/
  ],
};
