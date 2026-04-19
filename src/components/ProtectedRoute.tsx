import { Navigate } from "react-router-dom";
import { useAuth, type AppRole } from "@/contexts/AuthContext";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  requireRole?: AppRole;
}

export const ProtectedRoute = ({ children, requireRole }: Props) => {
  const { loading, session, role } = useAuth();

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

  return <>{children}</>;
};
