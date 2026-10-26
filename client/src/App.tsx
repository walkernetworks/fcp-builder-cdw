import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import { AppShell } from "./components/vsa/AppShell";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import Admin from "./pages/Admin";
import AdminUserProfile from "./pages/AdminUserProfile";
import FcpPicker from "./pages/FcpPicker";
import FcpWorkspace from "./pages/FcpWorkspace";
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
        <Route path="/engagements/:id/fcp" component={FcpWorkspace} />
        {/* The six-step page (pages/Home.tsx) is kept unrouted for one release as the rollback; /fcp now picks an engagement. */}
        <Route path="/fcp" component={FcpPicker} />
        <Route path="/import" component={PipelineImport} />
        <Route path="/admin" component={Admin} />
        <Route path="/admin/users/:id" component={AdminUserProfile} />
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
