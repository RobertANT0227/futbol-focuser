import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import BankrollManager from "./pages/BankrollManager.tsx";
import Auth from "./pages/Auth.tsx";
import Settings from "./pages/Settings.tsx";
import CentoPower from "./pages/CentoPower.tsx";

const queryClient = new QueryClient();

const HeaderUserChip = () => {
  const { username, role, signOut, session } = useAuth();
  if (!session) return null;
  return (
    <div className="ml-auto mr-3 flex items-center gap-2 text-xs">
      <span className="font-mono text-foreground">{username}</span>
      <span
        className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${
          role === "owner"
            ? "bg-primary/15 text-primary border-primary/30"
            : "bg-accent/15 text-accent border-accent/30"
        }`}
      >
        {role?.toUpperCase()}
      </span>
      <button
        onClick={signOut}
        className="text-muted-foreground hover:text-destructive transition-colors"
      >
        Logout
      </button>
    </div>
  );
};

const ShellLayout = ({ children }: { children: React.ReactNode }) => (
  <SidebarProvider>
    <div className="min-h-screen flex w-full">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 flex items-center border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <SidebarTrigger className="ml-2" />
          <HeaderUserChip />
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  </SidebarProvider>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <ShellLayout>
                    <Index />
                  </ShellLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/bankroll"
              element={
                <ProtectedRoute requirePremium>
                  <ShellLayout>
                    <BankrollManager />
                  </ShellLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/cento-power"
              element={
                <ProtectedRoute requirePremium>
                  <ShellLayout>
                    <CentoPower />
                  </ShellLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute requireRole="owner">
                  <ShellLayout>
                    <Settings />
                  </ShellLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="*"
              element={
                <ShellLayout>
                  <NotFound />
                </ShellLayout>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
