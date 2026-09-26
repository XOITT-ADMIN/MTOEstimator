import { registerRootComponent } from "expo";

import App from "./App";

// registerRootComponent calls AppRegistry.registerComponent("main", () => App) and sets up the
// environment for Expo Go and native builds alike. Needed in a monorepo, where `expo` is hoisted
// to the root node_modules and "node_modules/expo/AppEntry.js" no longer resolves from here.
registerRootComponent(App);
