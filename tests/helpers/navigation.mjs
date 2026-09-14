import assert from "node:assert/strict";
import { getNavigationItems } from "../../src/navigation/viewRegistry.ts";

export function assertNavigationWiring(page) {
  assert.match(page, /import\s*\{[^}]*\bgetNavigationItems\b[^}]*\}\s*from\s*"\.\.\/src\/navigation\/viewRegistry"/);
  assert.match(page, /const\s+navItems\s*=\s*getNavigationItems\(\{\s*isChurchAdmin\s*,\s*canApproveFinance\s*\}\)/);
  assert.match(page, /isChurchAdmin\s*=\s*activeRole\s*===\s*"Admin"/);
  assert.match(page, /canApproveFinance\s*=\s*activeRole\s*===\s*"Admin"\s*\|\|\s*activeRole\s*===\s*"Treasurer"\s*;/);
}

export function assertAdminNavigation(page, key, icon, label) {
  assertNavigationWiring(page);
  for (const canApproveFinance of [false, true]) {
    const adminItems = getNavigationItems({ isChurchAdmin: true, canApproveFinance });
    assert.deepEqual(adminItems.filter(([view]) => view === key), [[key, icon, label]]);
    const otherItems = getNavigationItems({ isChurchAdmin: false, canApproveFinance });
    assert.equal(otherItems.some(([view]) => view === key), false, `${key} must be hidden from non-Admins, including financial approvers`);
  }
}
