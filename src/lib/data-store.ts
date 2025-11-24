import type { PurchaseRequisition, AuditLog, Vendor, Quotation, PurchaseOrder, GoodsReceiptNote, Invoice, User, Department } from './types';
import { getInitialData, AppData } from './seed-data';

let data: AppData = getInitialData();

export function resetData() {
  data = getInitialData();
}

export const vendors: Vendor[] = data.vendors;
export const requisitions: PurchaseRequisition[] = data.requisitions;
export const auditLogs: AuditLog[] = data.auditLogs;
export const quotations: Quotation[] = data.quotations;
export const purchaseOrders: PurchaseOrder[] = data.purchaseOrders;
export const goodsReceipts: GoodsReceiptNote[] = data.goodsReceipts;
export const invoices: Invoice[] = data.invoices;
export const users: User[] = data.users;
export const departments: Department[] = data.departments;
