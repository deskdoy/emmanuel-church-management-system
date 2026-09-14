type DashboardQuickActionsProps = {
  canWriteFinance:boolean;
  canApproveFinance:boolean;
  onRecordIncome:()=>void;
  onRecordExpense:()=>void;
  onReviewApprovals:()=>void;
};

export function DashboardQuickActions({canWriteFinance,canApproveFinance,onRecordIncome,onRecordExpense,onReviewApprovals}:DashboardQuickActionsProps) {
  return <section className="panel dashboard-quick-actions" aria-labelledby="dashboard-quick-actions-heading">
      <h2 id="dashboard-quick-actions-heading">Quick Actions</h2>
      <div className="dashboard-quick-action-buttons">
        <button type="button" className="primary-button" disabled={!canWriteFinance} onClick={onRecordIncome}>
          Record Income
        </button>
        <button type="button" className="outline-button" disabled={!canWriteFinance} onClick={onRecordExpense}>
          Record Expense
        </button>
        {canApproveFinance&&<button type="button" className="outline-button" onClick={onReviewApprovals}>
          Review Financial Approvals
        </button>}
      </div>
    </section>;
}
