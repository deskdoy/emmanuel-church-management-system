import { Fragment } from "react";
import { AppIcon } from "../ui/AppIcon";
import { navigationSections, navigationSectionByView, type NavigationItem, type View } from "../../navigation/viewRegistry";

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
