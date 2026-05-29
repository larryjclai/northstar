import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { AccountsRoute } from "./AccountsRoute";
import { CashFlowRoute } from "./CashFlowRoute";
import { CategoriesRoute } from "./CategoriesRoute";
import { DashboardRoute } from "./DashboardRoute";
import { CategoryDetailRoute } from "./CategoryDetailRoute";
import { MerchantDetailRoute } from "./MerchantDetailRoute";
import { FIRECalculatorRoute } from "./FIRECalculatorRoute";
import { GoalsRoute } from "./GoalsRoute";
import { HoldingDetailRoute } from "./HoldingDetailRoute";
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
  accountsRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
