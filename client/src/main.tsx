import "./instrument";
import "./core/ui/agGrid"; // registers AG Grid's modules once for the whole app
import { StrictMode } from "react";
import { reactErrorHandler } from "@sentry/react";
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

// React reports render errors through these instead of the window, so they are sent to Sentry here (with the component
// stack). The ErrorBoundary still shows its fallback and the existing server-side error log still gets them.
createRoot(document.getElementById("root")!, {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
}).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
