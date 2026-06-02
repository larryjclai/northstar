import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { CashFlowRoute } from "./CashFlowRoute";
import { DashboardRoute } from "./DashboardRoute";
import { InvestmentsRoute } from "./InvestmentsRoute";
// TransactionsRoute is statically imported by InvestmentsRoute (used as a tab),
// so it can't be split into its own chunk — keep it eager here too.
import { TransactionsRoute } from "./TransactionsRoute";

// High-frequency routes (Dashboard / Cash Flow / Investments / Accounts) are
// imported eagerly so the common navigation paths render instantly. Lower-
// frequency routes are code-split into their own chunks and loaded on demand.
const AccountsRoute = lazyRouteComponent(() => import("./AccountsRoute"), "AccountsRoute");
const CategoriesRoute = lazyRouteComponent(() => import("./CategoriesRoute"), "CategoriesRoute");
const CategoryDetailRoute = lazyRouteComponent(() => import("./CategoryDetailRoute"), "CategoryDetailRoute");
const MerchantDetailRoute = lazyRouteComponent(() => import("./MerchantDetailRoute"), "MerchantDetailRoute");
const ReconcileRoute = lazyRouteComponent(() => import("./ReconcileRoute"), "ReconcileRoute");
const FIRECalculatorRoute = lazyRouteComponent(() => import("./FIRECalculatorRoute"), "FIRECalculatorRoute");
const GoalsRoute = lazyRouteComponent(() => import("./GoalsRoute"), "GoalsRoute");
const HoldingDetailRoute = lazyRouteComponent(() => import("./HoldingDetailRoute"), "HoldingDetailRoute");
const SettingsRoute = lazyRouteComponent(() => import("./SettingsRoute"), "SettingsRoute");

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

const holdingDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/holdings/$ticker",
  component: HoldingDetailRoute,
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
  // Optional `?account=<id>` deep-link from the Accounts page: opens the ledger
  // pre-filtered to that account's transactions.
  validateSearch: (search: Record<string, unknown>): { account?: string } => {
    const account = typeof search.account === "string" ? search.account : undefined;
    return account ? { account } : {};
  },
});

const categoriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cash-flow/categories",
  component: CategoriesRoute,
});

const categoryDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cash-flow/categories/$categoryName",
  component: CategoryDetailRoute,
});

const merchantDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cash-flow/merchants/$merchantName",
  component: MerchantDetailRoute,
});

const reconcileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cash-flow/reconcile/$accountId",
  component: ReconcileRoute,
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

const goalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/goals",
  component: GoalsRoute,
});

const fireCalculatorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/goals/fire",
  component: FIRECalculatorRoute,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  investmentsRoute,
  goalsRoute,
  fireCalculatorRoute,
  holdingDetailRoute,
  transactionsRoute,
  cashFlowRoute,
  categoriesRoute,
  categoryDetailRoute,
  merchantDetailRoute,
  reconcileRoute,
  accountsRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
