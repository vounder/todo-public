import React, { useMemo, useEffect, useState } from 'react';
import { View, StyleSheet, AppState, Linking, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from './src/screens/HomeScreen';
import TodoDetailScreen from './src/screens/TodoDetailScreen';
import RecipesScreen from './src/screens/RecipesScreen';
import RecipeDetailScreen from './src/screens/RecipeDetailScreen';
import ShoppingListScreen from './src/screens/ShoppingListScreen';
import MealPlanScreen from './src/screens/MealPlanScreen';
import { DebugScreen } from './src/screens/DebugScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { fonts } from './src/theme/tokens';
import { ApiService } from './src/services/ApiService';
import { ServerConfig } from './src/services/ServerConfig';
import { ServerSetupScreen } from './src/screens/ServerSetupScreen';

const Root = createNativeStackNavigator();
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
function TodoStack() {
  return <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Home" component={HomeScreen} />
    <Stack.Screen name="TodoDetail" component={TodoDetailScreen} />
  </Stack.Navigator>;
}
function RecipesStack() {
  return <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="RecipesList" component={RecipesScreen} />
    <Stack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
  </Stack.Navigator>;
}

SplashScreen.preventAutoHideAsync();
export default function App() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  useEffect(() => { if (loaded || error) void SplashScreen.hideAsync(); }, [loaded, error]);
  if (!loaded && !error) return null;
  return <ThemeProvider><AppInner /></ThemeProvider>;
}

function MainTabs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const icon = (outline: keyof typeof Ionicons.glyphMap, filled: keyof typeof Ionicons.glyphMap) =>
    ({ color, focused }: { color: string; focused: boolean }) => (
      <View style={{ width: 48, height: 30, borderRadius: 15, backgroundColor: focused ? colors.accentSurface : 'transparent',
        alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={focused ? filled : outline} color={color} size={23} accessible={false} />
      </View>
    );
  return <Tab.Navigator initialRouteName="ShoppingTab" backBehavior="history" screenOptions={{
    headerShown: false, tabBarHideOnKeyboard: true,
    tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.textMuted,
    tabBarStyle: { height: 64 + Math.max(0, fontScale - 1) * 16 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(8, insets.bottom),
      backgroundColor: colors.tabBar, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.tabBorder, elevation: 0 },
    tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
  }}>
    <Tab.Screen name="TodosTab" component={TodoStack} options={{ tabBarLabel: 'Aufgaben', tabBarIcon: icon('checkmark-circle-outline', 'checkmark-circle') }} />
    <Tab.Screen name="ShoppingTab" component={ShoppingListScreen} options={{ tabBarLabel: 'Einkaufen', tabBarIcon: icon('cart-outline', 'cart') }} />
    <Tab.Screen name="RecipesTab" component={RecipesStack} options={{ tabBarLabel: 'Gerichte', tabBarIcon: icon('restaurant-outline', 'restaurant') }} />
    <Tab.Screen name="MealPlanTab" component={MealPlanScreen} options={{ tabBarLabel: 'Planer', tabBarIcon: icon('calendar-outline', 'calendar') }} />
  </Tab.Navigator>;
}

function AppInner() {
  const { colors, isDark } = useTheme();
  const [serverReady, setServerReady] = useState<boolean | null>(null);
  const [connectionLink, setConnectionLink] = useState<string>();
  useEffect(() => {
    ServerConfig.load().then(() => setServerReady(ServerConfig.isConfigured())).catch(() => setServerReady(false));
    const receive = (url: string | null) => { if (url?.startsWith('todopublic://connect')) setConnectionLink(url); };
    void Linking.getInitialURL().then(receive);
    const subscription = Linking.addEventListener('url', event => receive(event.url));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!serverReady) return;
    void ApiService.initialize().catch(() => {});
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void ApiService.initialize().catch(() => {});
    });
    return () => { subscription.remove(); ApiService.disconnectFromServer(); };
  }, [serverReady]);
  const theme = useMemo(() => ({
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: { ...(isDark ? DarkTheme : DefaultTheme).colors, primary: colors.accent,
      background: colors.bg, card: colors.surface, text: colors.text, border: colors.border, notification: colors.danger },
  }), [isDark, colors]);
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {serverReady === null ? null : (!serverReady || connectionLink) ? <ServerSetupScreen initialLink={connectionLink}
        onComplete={() => { setConnectionLink(undefined); setServerReady(true); }} onCancel={serverReady ? () => setConnectionLink(undefined) : undefined} /> :
      <NavigationContainer theme={theme}>
        <Root.Navigator screenOptions={{ headerShown: false }}>
          <Root.Screen name="MainTabs" component={MainTabs} />
          <Root.Screen name="Settings" component={SettingsScreen} />
          <Root.Screen name="Debug" component={DebugScreen} />
        </Root.Navigator>
      </NavigationContainer>}
    </SafeAreaProvider>
  </View>;
}
