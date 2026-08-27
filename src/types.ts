export type RoleName = "Admin" | "Pastor" | "Treasurer" | "Secretary" | "Encoder" | "Viewer";

export interface Role { id: string; name: RoleName; description: string; createdAt: string }
export interface AppUser { id: string; email: string; fullName: string; role: RoleName; isActive: boolean }
export interface Member { id: string; firstName: string; middleName: string; lastName: string; birthDate: string | null; joinedAt: string; phone: string; email: string | null; address: string; membershipStatus: string; ministry: string; notes: string; createdAt: string; updatedAt: string }
export interface Attendance { id: string; memberId: string; eventId: string | null; attendanceDate: string; status: "Present" | "Absent" | "Late" | "Excused"; notes: string; createdAt: string }
export interface Offering { id: string; offeringDate: string; serviceName: string; description: string; amount: number; accountId: string; categoryId: string; paymentMethod: string; reference: string; notes: string; createdAt: string }
export interface Donation { id: string; donationDate: string; donorMemberId: string | null; donorName: string; description: string; amount: number; accountId: string; categoryId: string; projectId: string | null; paymentMethod: string; reference: string; notes: string; createdAt: string }
export interface Expense { id: string; expenseDate: string; vendor: string; description: string; amount: number; accountId: string; categoryId: string; projectId: string | null; paymentMethod: string; reference: string; notes: string; createdAt: string }
export interface Project { id: string; name: string; description: string; budget: number; startDate: string | null; endDate: string | null; status: string; createdAt: string }
export interface Announcement { id: string; title: string; content: string; publishAt: string; expiresAt: string | null; isPublished: boolean; createdAt: string }
export interface ChurchEvent { id: string; title: string; description: string; location: string; startsAt: string; endsAt: string | null; capacity: number | null; createdAt: string }
export interface SavedReport { id: string; title: string; reportType: string; dateFrom: string | null; dateTo: string | null; parameters: Record<string, unknown>; generatedData: Record<string, unknown>; createdAt: string }
export interface AuditLog { id: number; actorUserId: string | null; actorName: string; actorEmail: string; action: "INSERT" | "UPDATE" | "DELETE"; tableName: string; recordId: string | null; oldValues: Record<string, unknown> | null; newValues: Record<string, unknown> | null; createdAt: string }
export type AccessRequestStatus = "Pending" | "Approved" | "Rejected";
export interface AccessRequest { id:string; fullName:string; email:string; phone:string; requestedRole:RoleName; reason:string; status:AccessRequestStatus; approvedRoleId:string|null; approvedRole:RoleName|null; approvedBy:string|null; approvedByName:string; approvedAt:string|null; createdAt:string }
export interface AccessRequestInput { fullName:string; email:string; phone:string; requestedRole:RoleName; reason:string }

export type TransactionSource = "offerings" | "donations" | "expenses";
export interface Transaction { id:string; source:TransactionSource; date:string; type:"Income"|"Expense"; account:string; category:string; description:string; vendor?:string; moneyIn:number; moneyOut:number; paymentMethod:string; reference:string; notes:string; specifiedDetails?:string; createdAt:string }
export interface Account { id:string; name:string; type:string; openingBalance:number; moneyIn:number; moneyOut:number; currentBalance:number; active:string }
export interface Category { id:string; name:string; type:"Income"|"Expense"; group:string; active:string }
export interface PayablePayment { id:string; payableId:string; paymentDate:string; amount:number; paymentMethod:string; reference:string; notes:string; recordedBy:string|null; recordedByName:string; createdAt:string }
export interface PayablePaymentInput { payableId:string; paymentDate:string; amount:number; paymentMethod:string; reference:string; notes:string }
export interface Payable { id:string; vendor:string; dueDate:string; category:string; categoryId:string; amount:number; amountPaid:number; balance:number; status:string; notes:string; createdAt:string; payments:PayablePayment[] }
export interface CashFlowData { transactions:Transaction[]; accounts:Account[]; categories:Category[]; payables:Payable[] }
export interface AccountInput { id?:string; name:string; type:"Cash"|"Bank"|"Other"; openingBalance:number; active:boolean }

export type CashFlowMutation =
  | { action:"addTransaction"; transaction:Transaction }
  | { action:"updateTransaction"; transaction:Transaction }
  | { action:"addPayable"; payable:Payable }
  | { action:"recordPayablePayment"; payment:PayablePaymentInput }
  | { action:"saveAccount"; account:AccountInput };
