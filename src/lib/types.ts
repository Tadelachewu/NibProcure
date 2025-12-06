

export type UserRole =
  | 'Requester'
  | 'Approver'
  | 'Procurement_Officer'
  | 'Finance'
  | 'Admin'
  | 'Receiving'
  | 'Vendor'
  | 'Committee_Member'
  | 'Committee'
  | 'Committee_A_Member'
  | 'Committee_B_Member'
  | 'Manager_Procurement_Division'
  | 'Director_Supply_Chain_and_Property_Management'
  | 'VP_Resources_and_Facilities'
  | 'President';

export type CommitteeAssignment = {
  requisitionId: string;
  scoresSubmitted: boolean;
}

export type User = {
  id: string;
  name: string;
  email: string;
  password?: string; // Should not be sent to client
  roles: UserRole[] | { name: UserRole }[]; // Can be an array of strings or objects
  vendorId?: string;
  departmentId?: string;
  department?: string;
  committeeAssignments?: CommitteeAssignment[];
};

export type Department = {
  id: string;
  name: string;
  description?: string;
  headId?: string;
  head?: {
    name: string;
  };
};

export type RequisitionStatus =
  | 'Draft'
  | 'Pending_Approval'
  | 'Rejected'
  | 'PreApproved' // Department head approved, ready for RFQ
  | 'Accepting_Quotes' // RFQ sent, vendors can submit quotes
  | 'Scoring_In_Progress' // Deadline passed, committee is scoring
  | 'Scoring_Complete' // All scores are in, ready to finalize award
  | 'Awarded' // Award has been sent to vendor(s) and is pending response
  | 'Award_Declined' // The winning vendor has declined the award
  | 'PostApproved' // All hierarchical reviews complete, ready for vendor notification
  | 'PO_Created'
  | 'Partially_Closed' // Some items paid, others pending
  | 'Fulfilled'
  | 'Closed'
  | 'Pending_Committee_B_Review'
  | 'Pending_Committee_A_Recommendation'
  | 'Pending_Managerial_Approval'
  | 'Pending_Director_Approval'
  | 'Pending_VP_Approval'
  | 'Pending_President_Approval';

export type Urgency = 'Low' | 'Medium' | 'High' | 'Critical';

export type PerItemAwardStatus = 'Awarded' | 'Standby' | 'Declined' | 'Accepted' | 'Pending_Award' | 'Failed_to_Award' | 'Restarted';

export type PerItemAwardDetail = {
  rank: number;
  vendorId: string;
  vendorName: string;
  quotationId: string;
  quoteItemId: string;
  proposedItemName: string;
  unitPrice: number;
  status: PerItemAwardStatus;
  score: number;
  rejectionReason?: string;
}

export type RequisitionItem = {
  id: string; // Will be UUID
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  perItemAwardDetails?: PerItemAwardDetail[];
  reopenDeadline?: Date;
  reopenVendorIds?: string[];
};

export type QuestionType = 'text' | 'boolean' | 'multiple_choice' | 'file';

export type CustomQuestion = {
  id: string;
  questionText: string;
  questionType: QuestionType;
  isRequired: boolean;
  options?: string[];
  requisitionItemId?: string;
};

export type ContractStatus = 'Draft' | 'Active' | 'Expired';

export type Contract = {
  id: string;
  contractNumber: string;
  requisitionId: string;
  requisition: { title: string };
  vendorId: string;
  vendor: { name: string };
  senderId: string;
  sender: User;
  startDate: Date;
  endDate: Date;
  filePath?: string;
  status: ContractStatus;
  createdAt: Date;
}

export type Signature = {
    id: string;
    minuteId: string;
    signerId: string;
    signerName: string;
    signerRole: string;
    decision: 'APPROVED' | 'REJECTED';
    comment: string;
    signedAt: Date;
}

export type MinuteDecision = 'APPROVED' | 'REJECTED' | 'REVISION';
export type MinuteType = 'system_generated' | 'uploaded_document';

export type Minute = {
    id: string;
    requisitionId: string;
    authorId: string;
    author: User;
    decision: MinuteDecision;
    decisionBody: string; // e.g., "Committee A", "VP Resources"
    justification: string;
    attendees: User[];
    createdAt: Date;
    type: MinuteType;
    documentUrl?: string;
    signatures?: Signature[];
}


export type PurchaseRequisition = {
  id:string; // Will be UUID
  transactionId: string;
  requesterId: string; // User ID
  requesterName?: string;
  title: string;
  department: string;
  departmentId: string;
  items: RequisitionItem[];
  totalPrice: number;
  justification: string;
  status: RequisitionStatus;
  urgency: Urgency;
  createdAt: Date;
  updatedAt: Date;
  approverId?: string;
  approverComment?: string;
  currentApproverId?: string;
  quotations?: Quotation[];
  contract?: {
      fileName: string;
      uploadDate: Date;
  };
  negotiationNotes?: string;
  purchaseOrderId?: string;
  purchaseOrders?: { id: string, vendor: { name: string } }[];
  allowedVendorIds: string[];
  awardedQuoteItemIds: string[];
  customQuestions?: CustomQuestion[];
  deadline?: Date;
  scoringDeadline?: Date;
  awardResponseDeadline?: Date;
  awardResponseDurationMinutes?: number;
  evaluationCriteria?: EvaluationCriteria;
  financialCommitteeMemberIds?: string[];
  technicalCommitteeMemberIds?: string[];
  committeeName?: string;
  committeePurpose?: string;
  cpoAmount?: number;
  rfqSettings?: {
      awardStrategy?: 'all' | 'item';
      allowQuoteEdits?: boolean;
      technicalEvaluatorSeesPrices?: boolean;
      experienceDocumentRequired?: boolean;
      [key: string]: any;
  };
  minutes?: Minute[];
  auditTrail?: AuditLog[];
};

export type AuditLog = {
  id: string; // Will be UUID
  transactionId: string;
  timestamp: Date;
  user: string;
  role: UserRole;
  action: string;
  entity: string; // e.g., 'Requisition', 'PurchaseOrder'
  entityId: string;
  details: string;
  approverComment?: string;
};

export type KycStatus = 'Pending' | 'Verified' | 'Rejected';

export type KycDocument = {
    name: string;
    url: string;
    submittedAt: Date;
}

export type Vendor = {
  id: string;
  userId: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  kycStatus: KycStatus;
  kycDocuments?: KycDocument[];
  rejectionReason?: string;
};

export type QuoteItem = {
    id: string;
    requisitionItemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    leadTimeDays: number;
    brandDetails?: string;
    imageUrl?: string;
};

export type QuoteAnswer = {
  questionId: string;
  answer: string;
}

export type QuotationStatus = 'Submitted' | 'Awarded' | 'Partially_Awarded' | 'Rejected' | 'Standby' | 'Invoice_Submitted' | 'Failed' | 'Accepted' | 'Declined' | 'Pending_Award';

export type EvaluationCriterion = {
  id: string;
  name: string;
  weight: number;
}

export type EvaluationCriteria = {
  financialWeight: number;
  technicalWeight: number;
  financialCriteria: EvaluationCriterion[];
  technicalCriteria: EvaluationCriterion[];
};

export type Score = {
  id: string;
  financialCriterionId?: string | null;
  technicalCriterionId?: string | null;
  score: number; // 0-100
  comment: string;
  type: 'FINANCIAL' | 'TECHNICAL';
}

export type ItemScore = {
    id: string;
    quoteItemId: string;
    scores: Score[];
    finalScore: number;
}

export type CommitteeScoreSet = {
    id: string;
    scorerId: string;
    scorer: { name?: string };
    itemScores: ItemScore[];
    finalScore: number;
    committeeComment: string;
    submittedAt: Date;
}

export type Quotation = {
    id: string;
    transactionId: string;
    requisitionId: string;
    vendorId: string;
    vendorName: string;
    items: QuoteItem[];
    totalPrice: number;
    deliveryDate: Date;
    createdAt: Date;
    updatedAt: Date;
    status: QuotationStatus;
    notes?: string;
    rank?: 1 | 2 | 3;
    answers?: QuoteAnswer[];
    scores?: CommitteeScoreSet[];
    finalAverageScore?: number;
    cpoDocumentUrl?: string;
    experienceDocumentUrl?: string;
};

export type POItem = {
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    receivedQuantity: number;
    requisitionItemId: string;
};

export type PurchaseOrderStatus = 'Issued' | 'Acknowledged' | 'Shipped' | 'Partially_Delivered' | 'Delivered' | 'Cancelled' | 'Matched' | 'Mismatched' | 'On_Hold' | 'Closed';

export type PurchaseOrder = {
    id: string;
    transactionId: string;
    requisitionId: string;
    requisitionTitle: string;
    vendor: Vendor;
    items: POItem[];
    totalAmount: number;
    status: PurchaseOrderStatus;
    createdAt: Date;
    contract?: {
        fileName: string;
        uploadDate: Date;
    };
    notes?: string;
    receipts?: GoodsReceiptNote[];
    invoices?: Invoice[];
};


export type ReceiptItem = {
    poItemId: string;
    name: string;
    quantityOrdered: number;
    quantityReceived: number;
    condition: 'Good' | 'Damaged' | 'Incorrect';
    notes?: string;
}

export type GoodsReceiptNote = {
    id: string;
    transactionId: string;
    purchaseOrderId: string;
    receivedBy: User;
    receivedById: string;
    receivedDate: Date;
    items: ReceiptItem[];
    photos?: { name: string; url: string }[];
}

export type InvoiceStatus = 'Pending' | 'Approved_for_Payment' | 'Paid' | 'Disputed';

export type Invoice = {
  id: string;
  transactionId: string;
  purchaseOrderId: string;
  vendorId: string;
  invoiceDate: Date;
  items: InvoiceItem[];
  totalAmount: number;
  status: InvoiceStatus;
  disputeReason?: string | null;
  documentUrl?: string;
  paymentDate?: Date;
  paymentReference?: string;
  paymentEvidenceUrl?: string;
  po?: PurchaseOrder;
};


export type MatchingStatus = 'Matched' | 'Mismatched' | 'Pending';

export type MatchingResult = {
  poId: string;
  status: MatchingStatus;
  quantityMatch: boolean;
  priceMatch: boolean;
  details: {
    poTotal: number;
    grnTotalQuantity: number;
    invoiceTotal: number;
    invoiceTotalQuantity: number;
    items: {
      itemId: string;
      itemName: string;
      poQuantity: number;
      grnQuantity: number;
      invoiceQuantity: number;
      poUnitPrice: number;
      invoiceUnitPrice: number;
      quantityMatch: boolean;
      priceMatch: boolean;
    }[];
  };
};

export type DocumentRecord = {
    id: string;
    type: 'Requisition' | 'Purchase Order' | 'Invoice' | 'Quotation' | 'Goods Receipt' | 'Contract';
    title: string;
    status: string;
    date: Date;
    amount: number;
    user: string;
    transactionId: string;
    auditTrail?: AuditLog[];
    minutes?: Minute[];
}

export interface ApprovalStep {
    role: UserRole;
    id?: string;
    order?: number;
}

export interface ApprovalThreshold {
    id: string;
    name: string;
    min: number;
    max: number | null; // null for infinity
    steps: ApprovalStep[];
}
