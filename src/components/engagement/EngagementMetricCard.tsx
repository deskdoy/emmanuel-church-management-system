import { useId } from "react";

export interface EngagementMetricCardProps {
  label: string;
  value: number | string;
  description: string;
}

export function EngagementMetricCard({ label, value, description }: EngagementMetricCardProps) {
  const headingId = useId();
  return <article className="metric-card engagement-metric" aria-labelledby={headingId}>
    <h3 className="metric-label" id={headingId}>{label}</h3>
    <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
    <p>{description}</p>
  </article>;
}
