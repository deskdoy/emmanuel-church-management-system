import type { ReactNode } from "react";

export function PageTransition({pageKey,children}:{pageKey:string;children:ReactNode}){
  return <div className="page-transition" key={pageKey}>{children}</div>;
}
