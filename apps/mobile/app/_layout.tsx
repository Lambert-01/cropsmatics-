import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";

import { colors } from "../src/theme";

export default function RootLayout() {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.brandGreen },
          headerTintColor: colors.white,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Cropmatics" }} />
        <Stack.Screen name="register-harvest" options={{ title: "Register Harvest" }} />
        <Stack.Screen name="sync" options={{ title: "Sync Status" }} />
      </Stack>
    </QueryClientProvider>
  );
}
