import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import path from "node:path";

// When running `tauri ios dev` / `android dev`, Tauri sets TAURI_DEV_HOST to the
// machine's LAN IP so a physical device can reach the dev server. Bind Vite (and
// its HMR websocket) to that host on mobile; on desktop it stays on localhost.
const tauriDevHost = process.env.TAURI_DEV_HOST;

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), marketDataProxy()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
    // Ensure a single React instance. COSS UI pulls in @base-ui/react, which
    // Vite pre-bundles separately; without dedupe that can resolve a second
    // React copy and trigger "Invalid hook call" in the COSS components.
    dedupe: ["react", "react-dom"],
  },
  clearScreen: false,
  server: {
    host: tauriDevHost || false,
    strictPort: true,
    port: 5173,
    hmr: tauriDevHost
      ? { protocol: "ws", host: tauriDevHost, port: 5174 }
      : undefined,
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

function marketDataProxy(): Plugin {
  return {
    name: "northstar-market-data-proxy",
    configureServer(server) {
      server.middlewares.use("/api/yahoo", async (request, response) => {
        const pathAndQuery = request.url ?? "";
        if (!isAllowedYahooPath(pathAndQuery)) {
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

      server.middlewares.use("/api/market-data", async (request, response) => {
        try {
          const params = new URLSearchParams(request.url?.replace(/^\?/, "") ?? "");
          const rawUrl = params.get("url") ?? "";
          const target = new URL(rawUrl);
          if (!isAllowedMarketDataUrl(target)) {
            response.statusCode = 403;
            response.end("Unsupported market data endpoint.");
            return;
          }

          const upstream = await fetch(target, {
            headers: {
              accept: "application/json,text/csv,text/plain,*/*",
              "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
              "user-agent": "Mozilla/5.0 Northstar/0.1",
            },
          });
          const body = await upstream.text();
          response.statusCode = upstream.status;
          response.setHeader("content-type", upstream.headers.get("content-type") ?? "text/plain; charset=utf-8");
          response.end(body);
        } catch (error) {
          response.statusCode = 502;
          response.setHeader("content-type", "text/plain; charset=utf-8");
          response.end(error instanceof Error ? error.message : "Market data request failed.");
        }
      });
    },
  };
}

function isAllowedYahooPath(pathAndQuery: string) {
  return pathAndQuery.startsWith("/v8/finance/chart/")
    || pathAndQuery.startsWith("/v1/finance/search")
    || pathAndQuery.startsWith("/v10/finance/quoteSummary/");
}

function isAllowedMarketDataUrl(url: URL) {
  if (url.protocol !== "https:") return false;
  if (url.hostname === "openapi.twse.com.tw") return url.pathname.startsWith("/v1/opendata/t187ap03_L");
  if (url.hostname === "www.tpex.org.tw") return url.pathname.startsWith("/openapi/v1/mopsfin_t187ap03_O");
  if (url.hostname === "mopsfin.twse.com.tw") return url.pathname === "/opendata/t187ap03_L.csv" || url.pathname === "/opendata/t187ap03_O.csv";
  return false;
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
