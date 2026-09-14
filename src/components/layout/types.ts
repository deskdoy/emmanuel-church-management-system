import type { IconName } from "../ui/AppIcon";

export type View =
  | "dashboard"
  | "transactions"
  | "offerings"
  | "donations"
  | "expenses"
  | "payables"
  | "accounts"
  | "categories"
  | "payment-methods"
  | "projects"
  | "reports"
  | "members"
  | "users"
  | "audit"
  | "backup"
  | "system"
  | "settings"
  | "financial-approvals";

export type NavigationItem = [View, IconName, string];
