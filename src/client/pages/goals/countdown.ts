import type { GoalStatus } from "../../../shared/goals";

/**
 * Formats a deadline timestamp into a countdown/status string.
 * Rules:
 *   - 'COMPLETED' when status='completed'
 *   - 'ABANDONED' when status='abandoned'
 *   - null when deadline is null and status='active'
 *   - 'X weeks left' when ≥14 days
 *   - 'X days left' when 1–13 days
 *   - 'TODAY' when 0 days
 *   - 'OVERDUE' when negative and status='active'
 */
export function formatCountdown(
  deadline: number | null,
  status: GoalStatus,
): { text: string; variant: "normal" | "overdue" | "completed" | "abandoned" | "none" } {
  if (status === "completed") return { text: "COMPLETED", variant: "completed" };
  if (status === "abandoned") return { text: "ABANDONED", variant: "abandoned" };
  if (deadline == null) return { text: "", variant: "none" };

  const now = Date.now();
  const diffMs = deadline - now;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { text: "OVERDUE", variant: "overdue" };
  if (diffDays === 0) return { text: "TODAY", variant: "normal" };
  if (diffDays < 14) return { text: `${diffDays} days left`, variant: "normal" };
  const weeks = Math.floor(diffDays / 7);
  return { text: `${weeks} weeks left`, variant: "normal" };
}

/**
 * Formats a timestamp to 'Mon DD' (e.g. 'Jun 1').
 */
export function formatMonDD(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
