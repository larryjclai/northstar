import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { RouteError } from "../components/RouteError";

// Keep route modules out of the entry chunk. Tauri loads chunks from disk, so
// the small async boundary is cheaper than shipping every primary screen in the
// initial bundle.
const DashboardRoute = lazyRouteComponent(() => import("./DashboardRoute"), "DashboardRoute");
const InvestmentsRoute = lazyRouteComponent(() => import("./InvestmentsRoute"), "InvestmentsRoute");
const TransactionsRoute = lazyRouteComponent(() => import("./TransactionsRoute"), "TransactionsRoute");
const CashFlowRoute = lazyRouteComponent(() => import("./CashFlowRoute"), "CashFlowRoute");
const AccountsRoute = lazyRouteComponent(() => import("./AccountsRoute"), "AccountsRoute");
const CategoriesRoute = lazyRouteComponent(() => import("./CategoriesRoute"), "CategoriesRoute");
const CategoryDetailRoute = lazyRouteComponent(() => import("./CategoryDetailRoute"), "CategoryDetailRoute");
const MerchantDetailRoute = lazyRouteComponent(() => import("./MerchantDetailRoute"), "MerchantDetailRoute");
const ReconcileRoute = lazyRouteComponent(() => import("./ReconcileRoute"), "ReconcileRoute");
const FIRECalculatorRoute = lazyRouteComponent(() => import("./FIRECalculatorRoute"), "FIRECalculatorRoute");
const GoalsRoute = lazyRouteComponent(() => import("./GoalsRoute"), "GoalsRoute");
const HoldingDetailRoute = lazyRouteComponent(() => import("./HoldingDetailRoute"), "HoldingDetailRoute");
const SettingsRoute = lazyRouteComponent(() => import("./SettingsRoute"), "SettingsRoute");
const AnnualReportRoute = lazyRouteComponent(() => import("./AnnualReportRoute"), "AnnualReportRoute");

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
  validateSearch: (search: Record<string, unknown>): { tab?: string; sector?: string } => {
    const tab = typeof search.tab === "string" ? search.tab : undefined;
    const sector = typeof search.sector === "string" ? search.sector : undefined;
    return { ...(tab ? { tab } : {}), ...(sector ? { sector } : {}) };
  },
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
  validateSearch: (search: Record<string, unknown>): { account?: string; tx?: string } => {
    const account = typeof search.account === "string" ? search.account : undefined;
    const tx = typeof search.tx === "string" ? search.tx : undefined;
    return { ...(account ? { account } : {}), ...(tx ? { tx } : {}) };
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

const annualReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports/annual",
  component: AnnualReportRoute,
});

const fireCalculatorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/goals/fire",
  component: FIRECalculatorRoute,
  validateSearch: (search: Record<string, unknown>): { id?: string } => {
    return typeof search.id === "string" && search.id ? { id: search.id } : {};
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  investmentsRoute,
  goalsRoute,
  fireCalculatorRoute,
  annualReportRoute,
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

export const router = createRouter({ routeTree, defaultErrorComponent: RouteError });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
