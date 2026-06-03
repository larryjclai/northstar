import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import path from "node:path";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), yahooFinanceProxy()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    strictPort: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy third-party libraries out of the main entry so the
        // initial load isn't a single multi-MB chunk. Low-frequency routes
        // are additionally code-split via lazyRouteComponent (see router.tsx).
        manualChunks: {
          charts: ["recharts"],
          tanstack: [
            "@tanstack/react-router",
            "@tanstack/react-query",
            "@tanstack/react-table",
          ],
        },
      },
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
});

function yahooFinanceProxy(): Plugin {
  return {
    name: "northstar-yahoo-finance-proxy",
    configureServer(server) {
      server.middlewares.use("/api/yahoo", async (request, response) => {
        const pathAndQuery = request.url ?? "";
        if (!pathAndQuery.startsWith("/v8/finance/chart/") && !pathAndQuery.startsWith("/v1/finance/search")) {
          sendYahooError(response, "Unsupported Yahoo Finance endpoint.");
          return;
        }

        try {
          const yahooResponse = await fetchYahoo(pathAndQuery);
          const body = await yahooResponse.response.text();

          if (!yahooResponse.response.ok) {
            sendYahooError(response, `Yahoo Finance returned HTTP ${yahooResponse.response.status} from ${yahooResponse.host}.`);
            return;
          }

          response.statusCode = 200;
          response.setHeader("content-type", yahooResponse.response.headers.get("content-type") ?? "application/json");
          response.end(body);
        } catch (error) {
          sendYahooError(response, error instanceof Error ? error.message : "Yahoo Finance request failed.");
        }
      });
    },
  };
}

async function fetchYahoo(pathAndQuery: string) {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  let lastResponse: { host: string; response: Response } | null = null;
  for (const host of hosts) {
    const response = await fetch(new URL(`https://${host}${pathAndQuery}`), {
      headers: {
        accept: "application/json,text/plain,*/*",
        "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
        "user-agent": "Mozilla/5.0 Northstar/0.1",
      },
    });
    lastResponse = { host, response };
    if (response.ok || response.status !== 429) return lastResponse;
  }
  return lastResponse!;
}

function sendYahooError(response: { statusCode: number; setHeader(name: string, value: string): void; end(body: string): void }, message: string) {
  response.statusCode = 200;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({
    northstarError: message,
    chart: { result: null, error: { description: message } },
    quotes: [],
  }));
}
