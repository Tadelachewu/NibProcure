
'use server';

import { z } from 'zod';
import { QuestionType as PrismaQuestionType, Urgency as PrismaUrgency, KYCStatus as PrismaKYCStatus, PurchaseOrderStatus as PrismaPurchaseOrderStatus, InvoiceStatus as PrismaInvoiceStatus, ContractStatus as PrismaContractStatus } from '@prisma/client';

// Helper for optional file uploads
const fileSchema = z.any().optional();

// --- Requisition Schemas ---
export const EvaluationCriterionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Criterion name is required."),
  weight: z.coerce.number().min(0, "Weight must be non-negative.").max(100, "Weight cannot exceed 100%."),
});

export const EvaluationCriteriaSchema = z.object({
  financialWeight: z.coerce.number().min(0).max(100),
  technicalWeight: z.coerce.number().min(0).max(100),
  financialCriteria: z.array(EvaluationCriterionSchema).min(1, "At least one financial criterion is required."),
  technicalCriteria: z.array(EvaluationCriterionSchema).min(1, "At least one technical criterion is required."),
}).refine(data => data.financialWeight + data.technicalWeight === 100, {
    message: "Total weight for Financial and Technical criteria must be 100%.",
    path: ["financialWeight"],
}).refine(data => data.financialCriteria.reduce((acc, c) => acc + c.weight, 0) === 100, {
    message: "Total weight for financial criteria must be 100%.",
    path: ["financialCriteria"],
}).refine(data => data.technicalCriteria.reduce((acc, c) => acc + c.weight, 0) === 100, {
    message: "Total weight for technical criteria must be 100%.",
    path: ["technicalCriteria"],
});

export const CustomQuestionSchema = z.object({
  id: z.string().optional(),
  questionText: z.string().min(5, 'Question must be at least 5 characters.'),
  questionType: z.nativeEnum(PrismaQuestionType),
  isRequired: z.boolean(),
  options: z.array(z.string()).optional(),
  requisitionItemId: z.string().optional(),
});

export const RequisitionItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, 'Item name is required.'),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1.'),
  unitPrice: z.coerce.number().optional(),
  description: z.string().optional(),
});

export const RequisitionFormSchema = z.object({
  department: z.string().min(1, 'Department is required.'),
  title: z.string().min(3, 'Title must be at least 3 characters long.'),
  urgency: z.nativeEnum(PrismaUrgency),
  justification: z.string().min(10, 'Justification must be at least 10 characters.'),
  items: z.array(RequisitionItemSchema).min(1, 'At least one item is required.'),
  evaluationCriteria: EvaluationCriteriaSchema.optional(),
  customQuestions: z.array(CustomQuestionSchema).optional(),
});


// --- Authentication & User Schemas ---
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const RegisterSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8, "Password must be at least 8 characters long."),
    role: z.literal('Vendor'),
    vendorDetails: z.object({
        contactPerson: z.string().min(2),
        phone: z.string().min(10),
        address: z.string().min(10),
        licensePath: z.string(),
        taxIdPath: z.string(),
    })
});

export const UserFormSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(2, "Name is required."),
    email: z.string().email("Invalid email address."),
    roles: z.array(z.string()).min(1, "At least one role is required."),
    departmentId: z.string().min(1, "Department is required."),
    password: z.string().min(8, "Password must be at least 8 characters.").optional().or(z.literal('')),
});


// --- Department & Role Schemas ---
export const DepartmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Department name must be at least 2 characters."),
  description: z.string().optional(),
  headId: z.string().nullable().optional(),
});

export const RoleSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(2, "Role name must be at least 2 characters."),
    description: z.string().optional(),
});


// --- Quotation & Scoring Schemas ---
export const QuoteItemSchema = z.object({
    requisitionItemId: z.string(),
    name: z.string().min(1, "Item name cannot be empty."),
    quantity: z.number(),
    unitPrice: z.coerce.number().min(0.01, "Price is required."),
    leadTimeDays: z.coerce.number().min(0, "Lead time is required."),
    brandDetails: z.string().optional(),
    imageUrl: z.string().optional(),
});

export const QuoteAnswerSchema = z.object({
  questionId: z.string(),
  answer: z.string().min(1, "This question requires an answer."),
});

export const QuotationSubmissionSchema = z.object({
  requisitionId: z.string(),
  vendorId: z.string(),
  notes: z.string().optional(),
  items: z.array(QuoteItemSchema),
  answers: z.array(QuoteAnswerSchema).optional(),
  cpoDocumentUrl: z.string().optional(),
  experienceDocumentUrl: z.string().optional(),
});

export const ScoreSchema = z.object({
  criterionId: z.string(),
  score: z.coerce.number().min(0).max(100),
  comment: z.string().optional(),
});

export const ScoringFormSchema = z.object({
  committeeComment: z.string().optional(),
  itemScores: z.array(z.object({
      quoteItemId: z.string(),
      financialScores: z.array(ScoreSchema).optional(),
      technicalScores: z.array(ScoreSchema).optional(),
  }))
});


// --- Other API Schemas ---
export const ContractSchema = z.object({
    requisitionId: z.string(),
    vendorId: z.string(),
    startDate: z.date(),
    endDate: z.date(),
});

export const InvoiceSchema = z.object({
    purchaseOrderId: z.string(),
    vendorId: z.string(),
    invoiceDate: z.string().refine((d) => !isNaN(Date.parse(d)), { message: "Invalid date format" }),
    items: z.array(z.object({
        name: z.string(),
        quantity: z.number(),
        unitPrice: z.number(),
        totalPrice: z.number(),
    })),
    totalAmount: z.number(),
    documentUrl: z.string().optional(),
});

export const ReceiptItemSchema = z.object({
    poItemId: z.string(),
    quantityReceived: z.coerce.number().min(0),
    condition: z.enum(['Good', 'Damaged', 'Incorrect']),
    notes: z.string().optional(),
});

export const GoodsReceiptSchema = z.object({
    purchaseOrderId: z.string(),
    items: z.array(ReceiptItemSchema).min(1),
});

export const VendorStatusSchema = z.object({
    status: z.nativeEnum(PrismaKYCStatus),
    rejectionReason: z.string().optional(),
});

export const PurchaseOrderStatusSchema = z.object({
    status: z.nativeEnum(PrismaPurchaseOrderStatus),
});

export const InvoiceStatusSchema = z.object({
    status: z.nativeEnum(PrismaInvoiceStatus),
});
