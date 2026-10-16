import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import { AppShell } from "./components/vsa/AppShell";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./pages/Home";
import PipelineImport from "./pages/PipelineImport";
import Expiry from "./pages/Expiry";
import Overview from "./pages/Overview";
import Pipeline, { Records } from "./pages/Pipeline";
import Queue from "./pages/Queue";
import Reports from "./pages/Reports";

function Router() {
  return (
    <AppShell>
      <Switch>
        <Route path="/">{() => (/[?&]engagement=/.test(window.location.search) ? <Redirect to={`/fcp${window.location.search}`} replace /> : <Overview />)}</Route>
        <Route path="/pipeline" component={Pipeline} />
        <Route path="/expiry" component={Expiry} />
        <Route path="/queue" component={Queue} />
        <Route path="/records" component={Records} />
        <Route path="/reports" component={Reports} />
        <Route path="/fcp" component={Home} />
        <Route path="/import" component={PipelineImport} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <DashboardLayout><Router /></DashboardLayout>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
