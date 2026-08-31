import { REPORT_PATH, saveJson } from "./config.mjs";
import { verifyCleanup } from "./verification.mjs";

const report = await verifyCleanup();
await saveJson(REPORT_PATH, report);
console.log(JSON.stringify(report, null, 2));
if (report.status !== "PASS") process.exitCode = 1;
