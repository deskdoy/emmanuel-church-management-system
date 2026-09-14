export const today = new Date().toISOString().slice(0, 10);
export const peso = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value) || 0);
export const dateLabel = (value: string) => value ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`)) : "—";
