import "./instrument";
import { StrictMode } from "react";
import { reactErrorHandler } from "@sentry/react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App";
import { preloadTheme } from "./themes/registry";
import { rememberedThemeForPath } from "./themes/rememberedTheme";
import { installClientErrorListeners } from "./core/logging/reportClientError";
import { installChunkReload } from "./core/chunkReload";
import { ApiError } from "./api/client";

// Start fetching this bingo's theme now rather than after its shell request returns.
preloadTheme(rememberedThemeForPath(window.location.pathname));
installClientErrorListeners();
installChunkReload();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      // A 404 won't turn up on a second try (a deleted bingo, a removed Team), and a 429 (the server's write limit) asks
      // for less, not more: fail at once, the rest up to 3 times.
      retry: (failureCount, error) => !(error instanceof ApiError && (error.status === 404 || error.status === 429)) && failureCount < 3,
    },
    // Writes are never retried by themselves: a refused one (a 429) is shown, not sent again.
    mutations: { retry: false },
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
