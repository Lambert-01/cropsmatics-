import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { flushOutbox } from "../src/sync/queue";

export default function RootLayout() {
  const [client] = useState(() => new QueryClient());
  useEffect(() => {
    void flushOutbox();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void flushOutbox();
    });
    return () => subscription.remove();
  }, []);
  return (
    <QueryClientProvider client={client}>
      <Stack
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="register-harvest" />
        <Stack.Screen name="harvest-risk" />
        <Stack.Screen name="storage-options" />
        <Stack.Screen name="harvests" />
        <Stack.Screen name="insights" />
        <Stack.Screen name="alerts" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="share" />
        <Stack.Screen name="sync" />
      </Stack>
    </QueryClientProvider>
  );
}
