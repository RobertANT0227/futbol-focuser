import { BarChart3, FlaskConical, Home, Flame } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "Analiză Meciuri", url: "/", icon: FlaskConical, hash: "#analiza" },
  { title: "Bankroll Manager", url: "/bankroll", icon: BarChart3 },
  { title: "Top Bets", url: "/bankroll", icon: Flame, hash: "#top-bets" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  // Dedupe by url+hash for active matching
  const navItems = items.map((it, idx) => ({ ...it, key: `${it.url}-${it.hash ?? ''}-${idx}` }));

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 py-3">
            {!collapsed ? (
              <span className="flex items-center gap-2 text-sm font-bold tracking-tight">
                <span className="text-base">⚽</span>
                <span className="text-foreground">BetAnalyzer</span>
                <span className="text-primary">AI</span>
              </span>
            ) : (
              <span className="text-base">⚽</span>
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent className="mt-2">
            <SidebarMenu className="space-y-1">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton asChild className="h-10">
                    <NavLink
                      to={`${item.url}${item.hash ?? ''}`}
                      end={!item.hash}
                      className="flex items-center gap-3 px-3 rounded-md hover:bg-muted/50 transition-colors"
                      activeClassName="bg-primary/10 text-primary font-semibold border-l-2 border-primary"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
