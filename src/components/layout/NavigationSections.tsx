import { Fragment } from "react";
import { AppIcon } from "../ui/AppIcon";
import type { NavigationItem, View } from "./types";

const navigationSections = ["Overview", "Finance", "Ministry", "Administration"] as const;
const navigationSectionByView: Record<View, typeof navigationSections[number]> = {
  dashboard: "Overview",
  transactions: "Finance",
  offerings: "Finance",
  donations: "Finance",
  expenses: "Finance",
  payables: "Finance",
  accounts: "Finance",
  categories: "Finance",
  "payment-methods": "Finance",
  reports: "Finance",
  "financial-approvals": "Finance",
  projects: "Ministry",
  members: "Ministry",
  users: "Administration",
  audit: "Administration",
  backup: "Administration",
  system: "Administration",
  settings: "Administration",
};

export function NavigationSections({view,navItems,onNavigate}:{view:View;navItems:NavigationItem[];onNavigate:(view:View)=>void}) {
  return <>{navigationSections.map(section => (
          <Fragment key={section}>
            <p className="nav-section-label">{section}</p>
            {navItems.filter(([key]) => navigationSectionByView[key] === section).map(([key, icon, label]) => (
              <button
                key={key}
                title={label}
                className={`nav-item ${view === key ? "active" : ""}`}
                aria-current={view===key?"page":undefined}
                onClick={() => onNavigate(key)}
              >
                <span className="nav-icon"><AppIcon name={icon}/></span>
                <span className="nav-label">{label}</span>
              </button>
            ))}
          </Fragment>
        ))}</>;
}
