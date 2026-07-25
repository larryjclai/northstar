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
    host: tauriDevHost || "127.0.0.1",
    strictPort: true,
    // PORT override lets a second dev server (e.g. another worktree) coexist
    // with the default 5173 that Tauri expects.
    port: Number(process.env.PORT) || 5173,
    hmr: tauriDevHost
      ? { protocol: "ws", host: tauriDevHost, port: 5174 }
      : undefined,
  },
  build: {
    // Main chunk is ~580 kB: the four eager tab routes + repositories/domain.
    // Acceptable for Tauri (chunks load from disk); vendors are split below.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split heavy third-party libraries out of the main entry so the
        // initial load isn't a single multi-MB chunk. Low-frequency routes
        // are additionally code-split via lazyRouteComponent (see router.tsx).
        //
        // Plan 267: this used to be `manualChunks(id) => string`. In this project's
        // bundler — Vite 8 is rolldown-vite, i.e. the actual bundler is `rolldown`,
        // not classic Rollup — `manualChunks` is a deprecated Rollup-compat shim that
        // gets internally rewritten into a single `codeSplitting.groups` entry with no
        // `priority`. `codeSplitting.includeDependenciesRecursively` defaults to `true`,
        // so a group also recursively captures its matched modules' *dependencies* —
        // meaning `clsx` (a transitive dependency of recharts, in addition to backing
        // our own `cn()` in src/lib/utils.ts) got swallowed into the `charts` group
        // even though the (deprecated) manualChunks function explicitly returned a
        // different name for it. Use the real `codeSplitting` API directly, with
        // `priority`, so contested modules resolve deterministically instead of by
        // "whichever group's recursive capture got there first".
        codeSplitting: {
          groups: [
            // clsx / tailwind-merge / cva back `cn()` (src/lib/utils.ts), which every
            // shared UI component calls. clsx is ALSO a recharts dependency, and
            // codeSplitting captures each group's dependencies recursively — so
            // without a higher priority here, the charts group swallows clsx and the
            // eager UI chunk ends up statically importing all 388 kB of recharts
            // (plan 267). Priority is what breaks that tie. Do not lower it.
            { name: "classutils", test: /node_modules\/(clsx|tailwind-merge|class-variance-authority)\//, priority: 100 },
            { name: "react", test: /node_modules\/(react|react-dom|scheduler)\//, priority: 50 },
            { name: "tanstack", test: /node_modules\/@tanstack\//, priority: 50 },
            { name: "icons", test: /node_modules\/@phosphor-icons\//, priority: 50 },
            { name: "i18n", test: /node_modules\/(i18next|react-i18next)\//, priority: 50 },
            { name: "baseui", test: /node_modules\/@base-ui\//, priority: 50 },
            { name: "charts", test: /node_modules\/(recharts|d3-|victory-)/, priority: 10 },
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
          // Connect strips the mount path, leaving request.url = "/?url=...";
          // parse via URL so the leading slash doesn't corrupt the first key.
          const params = new URL(request.url ?? "/", "http://localhost").searchParams;
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
  if (url.hostname === "openapi.twse.com.tw") return url.pathname.startsWith("/v1/opendata/t187ap03_L") || url.pathname === "/v1/exchangeReport/STOCK_DAY_ALL";
  if (url.hostname === "www.tpex.org.tw") return url.pathname.startsWith("/openapi/v1/mopsfin_t187ap03_O");
  if (url.hostname === "mopsfin.twse.com.tw") return url.pathname === "/opendata/t187ap03_L.csv" || url.pathname === "/opendata/t187ap03_O.csv";
  if (url.hostname === "www.sitca.org.tw") return url.pathname === "/MemberK0000/F/03/nav.csv";
  // Plan 071: public ETF sector feed on GitHub Pages (one host + fixed path, no query).
  if (url.hostname === "larryjclai.github.io") return url.pathname === "/northstar/etf-sector-feed.json" && url.search === "";
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
