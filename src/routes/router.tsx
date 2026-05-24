import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { AccountsRoute } from "./AccountsRoute";
import { CashFlowRoute } from "./CashFlowRoute";
import { DashboardRoute } from "./DashboardRoute";
import { HoldingsRoute } from "./HoldingsRoute";
import { SettingsRoute } from "./SettingsRoute";
import { TransactionsRoute } from "./TransactionsRoute";

const rootRoute = createRootRoute({
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardRoute,
});

const holdingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/holdings",
  component: HoldingsRoute,
});

const transactionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/transactions",
  component: TransactionsRoute,
});

const cashFlowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cash-flow",
  component: CashFlowRoute,
});

const accountsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/accounts",
  component: AccountsRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsRoute,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  holdingsRoute,
  transactionsRoute,
  cashFlowRoute,
  accountsRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

