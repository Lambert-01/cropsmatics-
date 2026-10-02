import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as NavigationBar from "expo-navigation-bar";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AnimatedSplash } from "../src/components/AnimatedSplash";
import { useAppStore } from "../src/store/useAppStore";
import { ThemeProvider, useTheme } from "../src/theme/theme-context";

/**
 * Push the resolved theme onto the native system surfaces.
 *
 * The Android theme built by `plugins/with-analytical-theme.js` already covers
 * the System case on its own: `expo-system-ui` puts AppCompatDelegate in
 * MODE_NIGHT_FOLLOW_SYSTEM, so `res/values-night/` resolves without any help
 * from JS. What the native theme *cannot* do is honour an explicit Light/Dark
 * choice that disagrees with the device — AppCompatDelegate only ever follows
 * the OS here. That is what this component is for, and it is why both bars are
 * asserted rather than just the status bar.
 *
 * On iOS and web the native theme owns this and both calls are no-ops.
 */
function ThemedSystemBars() {
  const { colors, mode } = useTheme();
  // "light" here means light *content*: white icons on a dark bar.
  const content = mode === "dark" ? "light" : "dark";

  useEffect(() => {
    // Root view behind the React tree. Removes the frame of app.json's light
    // background between the native splash being hidden and the first themed
    // screen painting in dark mode.
    if (Platform.OS !== "android") return;
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {
      // Older Android without the API, or no native module: not fatal.
    });
  }, [colors.background]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    void NavigationBar.setBackgroundColorAsync(colors.surface).catch(() => {
      // Immersive/edge-to-edge modes reject this; the theme colour stands.
    });
    void NavigationBar.setButtonStyleAsync(content).catch(() => {
      // Bar not present (gesture navigation): nothing to tint.
    });
  }, [colors.surface, content]);

  return <StatusBar style={content} backgroundColor={colors.surface} />;
}

/**
 * Navigation shell.
 *
 * Lives below `ThemeProvider` so the per-screen fallback background is read
 * from the active palette. If the Stack were rendered in `RootLayout` itself
 * it would sit above the provider and always paint the light background.
 */
function ThemedStack() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    />
  );
}

/**
 * Hold the native launch window until the local store has hydrated.
 *
 * Called at module scope, before the first frame, which is the only point at
 * which the call takes effect. The splash is then hidden the moment hydration
 * resolves - there is no timer and no artificial delay. `hydrate()` always
 * settles, including on storage failure, so the splash can never be stranded.
 */
void SplashScreen.preventAutoHideAsync().catch(() => {
  // No native splash on this platform (e.g. web); nothing to hold.
});

export default function RootLayout() {
  const { colors } = useTheme();
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Public intelligence changes slowly; cache aggressively and keep
            // the last good data visible while refetching.
            staleTime: 5 * 60 * 1000,
            gcTime: 24 * 60 * 60 * 1000,
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const router = useRouter();
  const segments = useSegments();
  const { hydrated, onboardingComplete, hydrate, settings } = useAppStore();
  // The native splash hands over to this animated overlay once the local store
  // has hydrated, so the branded launch is continuous rather than a hard cut.
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashDone = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    void SplashScreen.hideAsync().catch(() => {
      // Already hidden, or no native splash: hiding twice is harmless.
    });
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const inOnboarding = segments[0] === "onboarding";
    if (!onboardingComplete && !inOnboarding) {
      router.replace("/onboarding");
    }
  }, [hydrated, onboardingComplete, segments, router]);

  if (!hydrated) {
    // Only reachable before hydration resolves. The view matches the native
    // splash background (#032D23) so the handover is invisible on the rare
    // frame where the native window has already gone.
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.forestDeep,
        }}
      >
        <ActivityIndicator color={colors.white} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <ThemedSystemBars />
          <ThemedStack />
          {!splashDone ? (
            <AnimatedSplash reducedMotion={settings.reducedMotion} onDone={handleSplashDone} />
          ) : null}
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
