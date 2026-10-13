"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { QUERY_DEFAULTS } from "@/lib/queryClient";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: QUERY_DEFAULTS }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
