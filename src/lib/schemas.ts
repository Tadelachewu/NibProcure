
import { z } from 'zod';
import { QuestionType, Urgency, UserRole } from './types';

// --- Basic Reusable Schemas ---
const idSchema = z.string().min(1, 'ID is required.');
const emailSchema = z.string().email('Invalid email address.');
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters long.');

// --- Authentication ---
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.'),
});

export const vendorDetailsSchema = z.object({
    contactPerson: z.string().min(1, 'Contact person is required.'),
    address: z.string().min(1, 'Address is required.'),
    phone: z.string().min(1, 'Phone number is required.'),
    licensePath: z.string().min(1, 'Business license is required.'),
    taxIdPath: z.string().min(1, 'Tax ID document is required.'),
});

export const registerSchema = z.object({
  name: z.string().min(2, "Company name is required."),
  email: emailSchema,
  password: passwordSchema,
  role: z.literal('Vendor'),
  vendorDetails: vendorDetailsSchema,
});


// --- User & Department Management ---
export const departmentSchema = z.object({
  name: z.string().min(2, 'Department name must be at least 2 characters.'),
  description: z.string().optional(),
  headId: z.string().nullable().optional(),
});

export const userSchema = z.object({
  name: z.string().min(2, 'Name is required.'),
  email: emailSchema,
  roles: z.array(z.string()).min(1, "At least one role is required."),
  departmentId: idSchema,
  password: passwordSchema.optional(),
});


// --- Requisition ---

export const evaluationCriterionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Criterion name is required."),
  weight: z.coerce.number().min(0).max(100),
});

export const evaluationCriteriaSchema = z.object({
  financialWeight: z.number().min(0).max(100),
  technicalWeight: z.number().min(0).max(100),
  financialCriteria: z.array(evaluationCriterionSchema).min(1, "At least one financial criterion is required."),
  technicalCriteria: z.array(evaluationCriterionSchema).min(1, "At least one technical criterion is required."),
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

export const customQuestionSchema = z.object({
    id: z.string().optional(),
    questionText: z.string().min(5, 'Question must be at least 5 characters.'),
    questionType: z.nativeEnum(QuestionType),
    isRequired: z.boolean(),
    options: z.array(z.string()).optional(),
    requisitionItemId: z.string().optional(),
});


export const requisitionItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, 'Item name is required.'),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1.'),
  unitPrice: z.coerce.number().optional(),
  description: z.string().optional(),
});

export const requisitionSchema = z.object({
  title: z.string().min(3, 'Title is required.'),
  department: z.string().min(1, 'Department is required.'),
  justification: z.string().min(10, 'Justification is required.'),
  urgency: z.nativeEnum(Urgency),
  items: z.array(requisitionItemSchema).min(1, 'At least one item is required.'),
  evaluationCriteria: evaluationCriteriaSchema,
  customQuestions: z.array(customQuestionSchema).optional(),
});


// --- Quotation & Scoring ---

export const scoreSchema = z.object({
    criterionId: z.string(),
    score: z.coerce.number().min(0).max(100),
    comment: z.string().optional(),
});

export const itemScoreSchema = z.object({
    quoteItemId: z.string(),
    financialScores: z.array(scoreSchema).optional(),
    technicalScores: z.array(scoreSchema).optional(),
});

export const scoreSubmissionSchema = z.object({
    committeeComment: z.string().min(1, "An overall comment is required."),
    itemScores: z.array(itemScoreSchema),
});


export const quoteItemSchema = z.object({
    requisitionItemId: z.string(),
    name: z.string().min(1, "Item name cannot be empty."),
    quantity: z.number(),
    unitPrice: z.coerce.number().min(0.01, "Price is required."),
    leadTimeDays: z.coerce.number().min(0, "Lead time is required."),
    brandDetails: z.string().optional(),
    imageUrl: z.string().optional(),
});

export const quoteAnswerSchema = z.object({
  questionId: z.string(),
  answer: z.string().min(1, "This question requires an answer."),
});

export const quotationSchema = z.object({
  requisitionId: idSchema,
  vendorId: idSchema,
  items: z.array(quoteItemSchema).min(1),
  notes: z.string().optional(),
  answers: z.array(quoteAnswerSchema).optional(),
  cpoDocumentUrl: z.string().optional(),
  experienceDocumentUrl: z.string().optional(),
});


// --- Post-Award ---

export const invoiceItemSchema = z.object({
    name: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    totalPrice: z.number(),
});

export const invoiceSchema = z.object({
    purchaseOrderId: idSchema,
    vendorId: idSchema,
    invoiceDate: z.string().datetime(),
    items: z.array(invoiceItemSchema),
    totalAmount: z.number(),
    documentUrl: z.string().optional(),
});

export const receiptItemSchema = z.object({
    poItemId: idSchema,
    quantityReceived: z.coerce.number().min(0),
    condition: z.enum(['Good', 'Damaged', 'Incorrect']),
    notes: z.string().optional(),
});

export const goodsReceiptSchema = z.object({
    purchaseOrderId: idSchema,
    items: z.array(receiptItemSchema).min(1),
});

export const paymentSchema = z.object({
    invoiceId: idSchema,
    paymentEvidenceUrl: z.string().min(1, 'Payment evidence document is required.'),
});
