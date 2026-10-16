import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import { AppShell } from "./components/vsa/AppShell";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import PipelineImport from "./pages/PipelineImport";
import Board from "./pages/Board";
import Reports from "./pages/Reports";

function Router() {
  return (
    <Switch>
      <Route path="/">{() => (/[?&]engagement=/.test(window.location.search) ? <Redirect to={`/fcp${window.location.search}`} replace /> : <Board />)}</Route>
      <Route path="/reports" component={Reports} />
      <Route path="/expiry">{() => <Redirect to="/reports?preset=expiry" replace />}</Route>
      <Route path="/fcp">{() => <AppShell><Home /></AppShell>}</Route>
      <Route path="/import" component={PipelineImport} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <DashboardLayout><Router /></DashboardLayout>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
