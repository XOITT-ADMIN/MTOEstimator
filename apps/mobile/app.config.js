// Lets you point the app at a server without editing app.json:
//   EXPO_PUBLIC_API_URL=https://mto-api.onrender.com npx expo start
// Otherwise expo.extra.apiUrl from app.json is used (empty = this-device-only mode).
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    apiUrl: process.env.EXPO_PUBLIC_API_URL || config.extra?.apiUrl || "",
  },
});
