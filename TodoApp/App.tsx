import React, { useMemo, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
import { ServerConfig } from './src/services/ServerConfig';
import { ServerSetupScreen } from './src/screens/ServerSetupScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TodoStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="TodoDetail" component={TodoDetailScreen} />
      <Stack.Screen name="Debug" component={DebugScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

function RecipesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RecipesList" component={RecipesScreen} />
      <Stack.Screen
        name="RecipeDetail"
        component={RecipeDetailScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

// Muss vor dem ersten Render laufen, sonst blitzt die App ungestylt auf.
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // Bewusst `null` statt Spinner oder halbem Shell -- alles andere ist genau
  // der Flash of Unstyled Text, den der Splash verhindern soll. Bei einem
  // Font-Fehler faellt die App auf die Systemschrift zurueck, statt dauerhaft
  // im Splash zu haengen.
  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

function AppInner() {
  const { colors, isDark } = useTheme();
  const [serverReady, setServerReady] = useState<boolean | null>(null);
  useEffect(() => {
    ServerConfig.load()
      .then((url) => setServerReady(!!url))
      .catch(() => setServerReady(false));
  }, []);

  // Aus DefaultTheme/DarkTheme spreaden: React Navigation v7 verlangt einen
  // `fonts`-Key, den ein Literal nicht mitbraechte.
  const navTheme = useMemo(
    () => ({
      ...(isDark ? DarkTheme : DefaultTheme),
      colors: {
        ...(isDark ? DarkTheme : DefaultTheme).colors,
        primary: colors.accent,
        background: colors.bg,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.danger,
      },
    }),
    [isDark, colors],
  );

  if (serverReady === null) return null;
  if (!serverReady) return <ServerSetupScreen onComplete={() => setServerReady(true)} />;
  return (
    // Der Wrapper ist mit gesetztem navTheme.background streng genommen
    // redundant, faengt aber das weisse Aufblitzen ab, das react-native-screens
    // auf manchen Android-Geraeten beim Tab-Wechsel zeigt.
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <SafeAreaProvider>
    <StatusBar style={isDark ? 'light' : 'dark'} />
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        initialRouteName="ShoppingTab"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textMuted,
          // Bewusst KEINE feste Hoehe und kein eigenes Bottom-Padding:
          // React Navigation rechnet die Safe-Area-Inset selbst auf die
          // Leiste drauf. Ein hartcodierter Wert ueberschreibt genau diese
          // Rechnung -- mit edgeToEdgeEnabled zeichnet die App dann hinter
          // die Android-Navigationsleiste und die Tabs liegen darunter.
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.tabBorder,
            elevation: 0,
          },
          tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        }}
      >
        <Tab.Screen
          name="TodosTab"
          component={TodoStack}
          options={{
            tabBarLabel: 'Todos',
            tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-done" color={color} size={size} />,
          }}
        />
        <Tab.Screen
          name="ShoppingTab"
          component={ShoppingListScreen}
          options={{
            tabBarLabel: 'Einkaufen',
            tabBarIcon: ({ color, size }) => <Ionicons name="cart" color={color} size={size} />,
          }}
        />
        <Tab.Screen
          name="RecipesTab"
          component={RecipesStack}
          options={{
            tabBarLabel: 'Gerichte',
            tabBarIcon: ({ color, size }) => <Ionicons name="restaurant" color={color} size={size} />,
          }}
        />
        <Tab.Screen
          name="MealPlanTab"
          component={MealPlanScreen}
          options={{
            tabBarLabel: 'Planer',
            tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={color} size={size} />,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
    </SafeAreaProvider>
    </View>
  );
}
