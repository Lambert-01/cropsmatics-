import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AnimatedSplash } from "../src/components/AnimatedSplash";
import { useAppStore } from "../src/store/useAppStore";
import { colors } from "../src/theme";
import { ThemeProvider, useTheme } from "../src/theme/theme-context";

/** Status-bar content follows the active scheme (light text on a dark surface). */
function ThemedStatusBar() {
  const { mode } = useTheme();
  return <StatusBar style={mode === "dark" ? "light" : "dark"} />;
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
          <ThemedStatusBar />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
          {!splashDone ? (
            <AnimatedSplash reducedMotion={settings.reducedMotion} onDone={handleSplashDone} />
          ) : null}
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
