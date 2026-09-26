import React from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import { colors, TabBar } from "../ui";
import { useAuth } from "../context/AuthContext";
import { useCompany } from "../context/CompanyContext";
import SplashScreen from "../screens/SplashScreen";
import LoginScreen from "../screens/LoginScreen";
import CompanySetupScreen from "../screens/CompanySetupScreen";
import HomeScreen from "../screens/HomeScreen";
import EstimatesScreen from "../screens/EstimatesScreen";
import LibraryScreen from "../screens/LibraryScreen";
import SettingsScreen from "../screens/SettingsScreen";
import EstimateDetailScreen from "../screens/EstimateDetailScreen";
import NewEstimateScreen from "../screens/NewEstimateScreen";
import AddItemScreen from "../screens/AddItemScreen";
import PdfPreviewScreen from "../screens/PdfPreviewScreen";
import TeamScreen from "../screens/TeamScreen";

// Screen map:
//   signed out      → Splash → Login
//   no company yet  → CompanySetup
//   signed in       → Tabs (Home · Estimates · + · Library · Settings)
//                     + EstimateDetail, Team (pushed) and NewEstimate, AddItem, PdfPreview (modal sheets)

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.canvas, card: colors.surface, border: colors.border, primary: colors.action, text: colors.ink } };

function Tabs({ navigation }) {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} onFab={() => navigation.navigate("NewEstimate")} />}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Estimates" component={EstimatesScreen} />
      <Tab.Screen name="Library" component={LibraryScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

const sheet = { presentation: "transparentModal", animation: "slide_from_bottom", headerShown: false, contentStyle: { backgroundColor: "transparent" } };

export default function RootNavigator() {
  const { user, initializing } = useAuth();
  const { status: companyStatus } = useCompany();
  const needsCompany = !!user && (companyStatus === "loading" || companyStatus === "none");

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
        {initializing ? (
          <Stack.Screen name="Splash" component={SplashScreen} />
        ) : !user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : needsCompany ? (
          <Stack.Screen name="CompanySetup" component={CompanySetupScreen} />
        ) : (
          <>
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen name="EstimateDetail" component={EstimateDetailScreen} />
            <Stack.Screen name="Team" component={TeamScreen} />
            <Stack.Screen name="NewEstimate" component={NewEstimateScreen} options={sheet} />
            <Stack.Screen name="AddItem" component={AddItemScreen} options={sheet} />
            <Stack.Screen name="PdfPreview" component={PdfPreviewScreen} options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
