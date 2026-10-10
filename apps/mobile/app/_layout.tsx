import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as NavigationBar from "expo-navigation-bar";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { hydrateOfflineCache, startPersisting } from "../src/cache/offline";
import { clearPersistedCache, writeCacheMeta } from "../src/cache/persister";
import { AnimatedSplash } from "../src/components/AnimatedSplash";
import { useAppStore } from "../src/store/useAppStore";
import { ThemeProvider, useTheme } from "../src/theme/theme-context";
import { resolveOnboardingRoute } from "../src/utils/onboarding";

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
 * Connect the persisted analytical cache to the live React Query client.
 *
 * Renders nothing. It hydrates the cache once, on the first frame after the local
 * store has loaded (so the stored Offline cache preference is respected), then
 * keeps the payload on disk in step with the client while the setting is on.
 * Turning the setting off removes the payload already written — the honest
 * reading of "off" — while leaving the in-memory results in place for the rest
 * of the session. Mutations and the field-operations store are never involved.
 */
function OfflineAnalyticsCache({ client }: { client: QueryClient }) {
  const hydrated = useAppStore((s) => s.hydrated);
  const enabled = useAppStore((s) => s.settings.offlineCacheEnabled);
  const attempted = useRef(false);

  useEffect(() => {
    if (!hydrated || attempted.current) return;
    attempted.current = true;
    if (!enabled) return;
    void hydrateOfflineCache(client)
      .then((meta) => writeCacheMeta(meta))
      .catch(() => {
        // A failed restore is not fatal: the app simply has no cached data.
      });
  }, [hydrated, enabled, client]);

  useEffect(() => {
    if (!hydrated || !enabled) return;
    return startPersisting(client);
  }, [hydrated, enabled, client]);

  useEffect(() => {
    if (!hydrated || enabled) return;
    // Disabling must not leave a stale payload behind for a future launch.
    void clearPersistedCache();
  }, [hydrated, enabled]);

  return null;
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

/**
 * Inner shell — rendered inside ThemeProvider so every hook here can safely
 * call useTheme(). RootLayout itself must NOT call useTheme() because it mounts
 * ThemeProvider; calling the hook above its own provider crashes the app.
 */
function AppShell({ client }: { client: QueryClient }) {
  const router = useRouter();
  const segments = useSegments();
  const { hydrated, onboardingComplete, hydrate, settings } = useAppStore();
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashDone = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    void SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);

  useEffect(() => {
    // Pure decision (see src/utils/onboarding): wait for hydration, then force
    // onboarding only for a session that has not completed it. A session that
    // finished — by Continue *or* Skip — is never bounced back in.
    const next = resolveOnboardingRoute({ hydrated, onboardingComplete }, segments);
    if (next) router.replace(next as never);
  }, [hydrated, onboardingComplete, segments, router]);

  if (!hydrated) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#032D23",
        }}
      >
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={client}>
      <OfflineAnalyticsCache client={client} />
      <ThemedSystemBars />
      <ThemedStack />
      {!splashDone ? (
        <AnimatedSplash reducedMotion={settings.reducedMotion} onDone={handleSplashDone} />
      ) : null}
    </QueryClientProvider>
  );
}

export default function RootLayout() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 24 * 60 * 60 * 1000,
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppShell client={client} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
