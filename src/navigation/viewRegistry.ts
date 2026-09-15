import type { IconName } from "../components/ui/AppIcon";
import type { UserProfile } from "../types";

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
  | "budgets"
  | "projects"
  | "reports"
  | "members"
  | "families"
  | "attendance"
  | "users"
  | "audit"
  | "backup"
  | "system"
  | "settings"
  | "financial-approvals";

export type NavigationItem = [View, IconName, string];

export const navigationSections = ["Overview", "Finance", "Ministry", "Administration"] as const;
export const navigationSectionByView: Record<View, typeof navigationSections[number]> = {
  dashboard: "Overview",
  transactions: "Finance",
  offerings: "Finance",
  donations: "Finance",
  expenses: "Finance",
  payables: "Finance",
  accounts: "Finance",
  categories: "Finance",
  "payment-methods": "Finance",
  budgets: "Finance",
  reports: "Finance",
  "financial-approvals": "Finance",
  projects: "Ministry",
  members: "Ministry",
  families: "Ministry",
  attendance: "Ministry",
  users: "Administration",
  audit: "Administration",
  backup: "Administration",
  system: "Administration",
  settings: "Administration",
};

export function getViewHeadings(
  profile: Pick<UserProfile, "fullName" | "email"> | null,
  now = new Date(),
): Record<View, [string, string]> {
  const firstName = (profile?.fullName || profile?.email || "Steward").trim().split(/\s+/)[0];
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return {
    dashboard: [`${greeting}, ${firstName}.`, "Welcome to your Faithful Steward financial stewardship workspace."],
    transactions: ["Transactions", "Record and review money in, money out, and transfers."],
    offerings: ["Offerings", "Record worship offerings and church collections."],
    donations: ["Donations", "Record member and special donations."],
    expenses: ["Expenses", "Record church expenses and payments."],
    payables: ["Payables", "Manage commitments, balances, and payments due."],
    accounts: ["Accounts", "Manage cash and bank accounts without losing history."],
    categories: ["Categories", "Manage income and expense categories for your church."],
    "payment-methods": ["Payment Methods", "Manage accepted payment methods for your church."],
    budgets: ["Budget Planning", "Plan and review church budgets by fiscal year and category."],
    projects: ["Projects", "Plan and follow church initiatives in one place."],
    reports: ["Reports", "Generate statements and review cash flow analytics."],
    families: ["Families", "Manage family groups and church member connections."],
    attendance: ["Attendance", "Record attendance and review member and family attendance history."],
    members: ["Members", "Manage church members, profiles, and ministry information."],
    users: ["Users", "Manage approved users, roles, and account status."],
    audit: ["Audit logs", "Review secured, immutable records of activity across the system."],
    backup: ["Backup Center", "Generate audited browser-only exports for church records."],
    system: ["System Information", "Review application health and operational usage."],
    settings: ["Settings", "Review your account and application configuration."],
    "financial-approvals": ["Financial Approvals", "Review and approve pending financial records."],
  };
}

export function getNavigationItems({ isChurchAdmin, canApproveFinance }: {
  isChurchAdmin: boolean;
  canApproveFinance: boolean;
}): NavigationItem[] {
  const navItems: NavigationItem[] = [
    ["dashboard", "dashboard", "Dashboard"],
    ["transactions", "transactions", "Transactions"],
    ["offerings", "transactions", "Offerings"],
    ["donations", "transactions", "Donations"],
    ["expenses", "transactions", "Expenses"],
    ["payables", "payables", "Payables"],
    ["accounts", "accounts", "Accounts"],
    ["categories", "accounts", "Categories"],
    ["payment-methods", "accounts", "Payment Methods"],
    ["budgets", "reports", "Budget Planning"],
    ["projects", "projects", "Projects"],
    ["families", "users", "Families"],
    ["attendance", "users", "Attendance"],
    ["reports", "reports", "Reports"],
  ];
  if (isChurchAdmin) {
    navItems.push(
      ["members", "users", "Members"],
      ["users", "users", "Users"],
      ["audit", "audit", "Audit Logs"],
      ["backup", "backup", "Backup Center"],
      ["system", "system", "System Information"],
    );
  }
  if (canApproveFinance) {
    navItems.push(["financial-approvals", "transactions", "Financial Approvals"]);
  }
  navItems.push(["settings", "settings", "Settings"]);
  return navItems;
}
