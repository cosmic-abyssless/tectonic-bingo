import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App";
import { preloadTheme } from "./themes/registry";
import { rememberedThemeForPath } from "./themes/rememberedTheme";
import { installClientErrorListeners } from "./core/logging/reportClientError";

// Start fetching this bingo's theme now rather than after its shell request returns.
preloadTheme(rememberedThemeForPath(window.location.pathname));
installClientErrorListeners();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
