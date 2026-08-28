import type { ReactNode } from "react";
import { AppIcon } from "./AppIcon";

export function EmptyState({title,description,action,compact=false}:{title:string;description:string;action?:ReactNode;compact?:boolean}){
  return <div className={`empty-state-pro ${compact?"compact":""}`}><span className="empty-state-symbol"><AppIcon name="empty" size={22}/></span><h3>{title}</h3><p>{description}</p>{action&&<div className="empty-state-action">{action}</div>}</div>;
}
