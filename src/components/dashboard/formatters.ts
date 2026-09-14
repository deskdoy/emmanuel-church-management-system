export const peso=(value:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(value||0);
export const dateTimeLabel=(value:string)=>new Intl.DateTimeFormat("en-PH",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
