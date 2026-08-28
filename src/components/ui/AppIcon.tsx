export type IconName="dashboard"|"transactions"|"payables"|"accounts"|"projects"|"reports"|"users"|"audit"|"backup"|"system"|"settings"|"logout"|"plus"|"church"|"empty"|"arrow";

const paths:Record<IconName,React.ReactNode>={
  dashboard:<><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5M9 20v-6h6v6"/></>,
  transactions:<><path d="M7 3v18M3.5 6.5 7 3l3.5 3.5M17 21V3m-3.5 14.5L17 21l3.5-3.5"/></>,
  payables:<><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></>,
  accounts:<><path d="M3 9h18L12 4 3 9Z"/><path d="M5 9v8m4-8v8m6-8v8m4-8v8M3 20h18"/></>,
  projects:<><path d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z"/><path d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5"/></>,
  reports:<><path d="M6 3.5h9l3 3V21H6V3.5Z"/><path d="M15 3.5V7h3M9 16v-3m3 3V9m3 7v-5"/></>,
  users:<><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M16 8.5a2.5 2.5 0 1 1 0 5M16.5 15.5c2.5.3 3.8 1.8 4 4.5"/></>,
  audit:<><path d="M12 3 4.5 6v5c0 4.8 2.8 8.2 7.5 10 4.7-1.8 7.5-5.2 7.5-10V6L12 3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>,
  backup:<><path d="M5 4h12l2 2v14H5V4Z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></>,
  system:<><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 8h.01M10 8h7M7 12h.01M10 12h7"/></>,
  settings:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  logout:<><path d="M10 4H5v16h5M14 8l4 4-4 4m4-4H9"/></>,
  plus:<path d="M12 5v14M5 12h14"/>,
  church:<><path d="M12 2v5m-2.5-2.5h5M5 11l7-4 7 4v10H5V11Z"/><path d="M9.5 21v-6h5v6M3 21h18"/></>,
  empty:<><path d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z"/><path d="m4 12 8 4.5 8-4.5"/></>,
  arrow:<path d="m9 5 7 7-7 7"/>,
};

export function AppIcon({name,size=20}:{name:IconName;size?:number}){
  return <svg className="app-icon" aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
