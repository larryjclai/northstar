import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { AccountsRoute } from "./AccountsRoute";
import { CashFlowRoute } from "./CashFlowRoute";
import { DashboardRoute } from "./DashboardRoute";
import { HoldingsRoute } from "./HoldingsRoute";
import { InvestmentsRoute } from "./InvestmentsRoute";
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

const investmentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/investments",
  component: InvestmentsRoute,
});

// Old routes kept so existing bookmarks / links keep working, but the new
// /investments view is the canonical destination. Wrap each one with a thin
// redirect-like notice instead of removing them outright so power users who
// rely on the deeper edit UIs (CSV import, full transaction list) can still
// reach them.
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
  investmentsRoute,
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
