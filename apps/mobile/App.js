import React from "react";
import { View } from "react-native";
import { useFonts } from "expo-font";
// Only the four weights the design uses (importing the package root bundles all 18).
import { Poppins_400Regular } from "@expo-google-fonts/poppins/400Regular";
import { Poppins_500Medium } from "@expo-google-fonts/poppins/500Medium";
import { Poppins_600SemiBold } from "@expo-google-fonts/poppins/600SemiBold";
import { Poppins_700Bold } from "@expo-google-fonts/poppins/700Bold";
import { StatusBar } from "expo-status-bar";
import { enableScreens } from "react-native-screens";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "./src/context/AuthContext";
import { EstimatesProvider } from "./src/context/EstimatesContext";
import { CompanyProvider } from "./src/context/CompanyContext";
import { RatesProvider } from "./src/pricing/RatesContext";
import { CatalogProvider } from "./src/library/CatalogContext";
import { InventoryProvider } from "./src/inventory/InventoryContext";
import RootNavigator from "./src/navigation/RootNavigator";
import SyncBanner from "./src/components/SyncBanner";
import LockScreen from "./src/components/LockScreen";
import { AppLockProvider } from "./src/context/AppLockContext";

enableScreens();

export default function App() {
  // Poppins is the XMTO typeface (see src/ui/theme.js → fonts). Render nothing until it's ready
  // so no screen flashes in the system font.
  const [fontsLoaded] = useFonts({ Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold });
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: "#1F2150" }} />;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppLockProvider>
          <CompanyProvider>
            <CatalogProvider>
              <RatesProvider>
                <EstimatesProvider>
                  <InventoryProvider>
                    <StatusBar style="dark" />
                    <RootNavigator />
                    <SyncBanner />
                    <LockScreen />
                  </InventoryProvider>
                </EstimatesProvider>
              </RatesProvider>
            </CatalogProvider>
          </CompanyProvider>
        </AppLockProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
