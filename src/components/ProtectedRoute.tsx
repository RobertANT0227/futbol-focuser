import { Navigate } from "react-router-dom";
import { useAuth, type AppRole } from "@/contexts/AuthContext";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  requireRole?: AppRole;
  requirePremium?: boolean;
}

export const ProtectedRoute = ({ children, requireRole, requirePremium }: Props) => {
  const { loading, session, role, isPremium } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Se încarcă...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  if (requireRole && role !== requireRole) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-3 border border-destructive/40 bg-destructive/5 rounded-xl p-6">
          <span className="text-3xl">🚫</span>
          <h2 className="text-lg font-bold">Acces interzis</h2>
          <p className="text-sm text-muted-foreground">
            Această pagină este disponibilă doar pentru rolul <strong>{requireRole}</strong>.
          </p>
        </div>
      </div>
    );
  }

  if (requirePremium && !isPremium) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-3 border border-amber-500/40 bg-amber-500/5 rounded-xl p-6">
          <span className="text-3xl">💎</span>
          <h2 className="text-lg font-bold">Funcție Premium</h2>
          <p className="text-sm text-muted-foreground">
            Această secțiune este disponibilă doar pentru conturile <strong>Premium</strong>.
            Contactează administratorul pentru upgrade.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
