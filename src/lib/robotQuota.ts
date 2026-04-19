import { supabase } from "@/integrations/supabase/client";

export const ROBOT_DAILY_LIMIT_CLIENT = 3;

/**
 * Returns count of robot uses today for given user.
 */
export async function getTodayRobotUsage(userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from("robot_usage")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("used_at", startOfDay.toISOString());
  if (error) {
    console.error("[robotQuota] getTodayRobotUsage error", error);
    return 0;
  }
  return count ?? 0;
}

/**
 * Records a robot use. Returns true on success.
 */
export async function recordRobotUsage(userId: string): Promise<boolean> {
  const { error } = await supabase.from("robot_usage").insert({ user_id: userId });
  if (error) {
    console.error("[robotQuota] recordRobotUsage error", error);
    return false;
  }
  return true;
}
