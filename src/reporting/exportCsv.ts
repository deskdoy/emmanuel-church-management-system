export type CsvExport={organization:string;title:string;scopeLabel:string;headers:string[];rows:(string|number)[][];filename:string};

const escape=(value:string|number)=>`"${String(value??"").replaceAll('"','""')}"`;

export function buildReportCsv(report:CsvExport) {
  return [[report.organization],[report.title],[report.scopeLabel],[],report.headers,...report.rows].map(row=>row.map(escape).join(",")).join("\n");
}

export function downloadReportCsv(report:CsvExport) {
  const url=URL.createObjectURL(new Blob([buildReportCsv(report)],{type:"text/csv;charset=utf-8"})),anchor=document.createElement("a");
  anchor.href=url;anchor.download=report.filename;anchor.click();URL.revokeObjectURL(url);
}
