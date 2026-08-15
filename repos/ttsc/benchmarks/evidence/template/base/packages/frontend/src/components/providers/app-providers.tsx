import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";

/** Installs the shared routing, query, and notification providers. */
export function AppProviders(props: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 20_000,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        {props.children}
        <Toaster position="top-right" richColors />
      </QueryClientProvider>
    </BrowserRouter>
  );
}
