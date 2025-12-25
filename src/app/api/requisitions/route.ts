'use client';

import { NextResponse } from 'next/server';
import type { PurchaseRequisition, User, UserRole, Vendor } from '@/lib/types';
import { prisma } from '@/lib/prisma';
import { decodeJwt, getActorFromToken } from '@/lib/auth';
import { headers } from 'next/headers';
import { sendEmail } from '@/services/email-service';
import { isPast } from 'date-fns';
import { getNextApprovalStep, getPreviousApprovalStep } from '@/services/award-service';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { promises as fs } from 'fs';
import path from 'path';


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status');
  const forVendor = searchParams.get('forVendor');
  const approverId = searchParams.get('approverId');
  const forQuoting = searchParams.get('forQuoting');
  const forAwardReview = searchParams.get('forReview');

  // --- START: Server-side pagination and search ---
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const searchQuery = searchParams.get('search');
  const skip = (page - 1) * limit;
  // --- END: Server-side pagination and search ---

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  let userPayload: (User & { roles: { name: UserRole }[] }) | null = null;
  if(token) {
    const decodedUser = await getActorFromToken(request);
    if(decodedUser) {
        userPayload = decodedUser as any;
    }
  }

  try {
    let whereClause: any = {};
    
    // --- START: Search logic ---
    if (searchQuery) {
        whereClause.OR = [
            { title: { contains: searchQuery, mode: 'insensitive' } },
            { items: { some: { name: { contains: searchQuery, mode: 'insensitive' } } } },
        ];
    }
    // --- END: Search logic ---

    if (forAwardReview === 'true' && userPayload) {
        const userRoles = userPayload.roles as any[];
        const userId = userPayload.id;
        
        const orConditions: any[] = [
          // The user is the direct current approver for a pending item.
          { currentApproverId: userId, status: { startsWith: 'Pending_', not: 'Pending_Approval' } },
          // The status matches a committee role the user has.
          { status: { in: userRoles.map(r => `Pending_${r.name}`) } },
        ];
        
        const reviewableStatuses: RequisitionStatus[] = ['Award_Declined', 'Partially_Closed'];

        if(userRoles.some(r => r.name !== 'Requester' && r.name !== 'Vendor')) {
            orConditions.push({ status: { in: reviewableStatuses } });
        }

        if (userRoles.some(r => r.name === 'Admin' || r.name === 'Procurement_Officer')) {
            const allSystemRoles = await prisma.role.findMany({ select: { name: true } });
            const allPossiblePendingStatuses = allSystemRoles.map(r => `Pending_${r.name}`);
            orConditions.push({ status: { in: allPossiblePendingStatuses } });
            orConditions.push({ status: 'PostApproved' });
        }
        
        whereClause.OR = whereClause.OR ? [...whereClause.OR, ...orConditions] : orConditions;

    } else if (forVendor === 'true') {
        if (!userPayload || !userPayload.vendorId) {
             return NextResponse.json({ error: 'Unauthorized: No valid vendor found for this user.' }, { status: 403 });
        }
        
        const vendorWhere: any = {
            OR: [
                {
                    AND: [
                        { status: 'Accepting_Quotes' }, 
                        { deadline: { not: null } },
                        { deadline: { gt: new Date() } },
                        {
                            OR: [
                            { allowedVendorIds: { isEmpty: true } },
                            { allowedVendorIds: { has: userPayload.vendorId } },
                            ],
                        },
                        {
                            NOT: {
                            quotations: {
                                some: {
                                vendorId: userPayload.vendorId,
                                },
                            },
                            },
                        },
                    ]
                },
                {
                    quotations: {
                        some: {
                            vendorId: userPayload.vendorId,
                        }
                    }
                },
                {
                    items: {
                      some: {
                        perItemAwardDetails: {
                          array_contains: [{vendorId: userPayload.vendorId}],
                        },
                      },
                    },
                }
            ]
        };
        whereClause = { ...whereClause, ...vendorWhere };

    } else if (forQuoting) {
        const allRoles = await prisma.role.findMany({ select: { name: true } });
        const allPendingStatuses = allRoles.map(role => `Pending_${role.name}`);

        const baseRfqLifecycleStatuses: RequisitionStatus[] = [
            'PreApproved', 'Accepting_Quotes', 'Scoring_In_Progress', 
            'Scoring_Complete', 'Award_Declined', 'Awarded', 'PostApproved',
            'PO_Created', 'Fulfilled', 'Closed', 'Partially_Closed'
        ];
        
        const rfqLifecycleStatuses = [...baseRfqLifecycleStatuses, ...allPendingStatuses];

        const userRoles = userPayload?.roles.map(r => (r as any).name) || [];

        if (userRoles.includes('Committee_Member')) {
            whereClause.status = { in: rfqLifecycleStatuses };
            whereClause.OR = [
                    { financialCommitteeMembers: { some: { id: userPayload?.id } } },
                    { technicalCommitteeMembers: { some: { id: userPayload?.id } } },
                ];
        } else {
            whereClause.status = { in: rfqLifecycleStatuses };
        }
    } else {
      if (statusParam) {
        const statuses = statusParam.split(',').map(s => s.trim().replace(/ /g, '_'));
        whereClause.status = { in: statuses };
      }
      if (approverId) {
        whereClause.OR = [
            { currentApproverId: approverId },
            { reviews: { some: { reviewerId: approverId } } }
        ];
      }
      
      if (userPayload && userPayload.roles.some(r => (r as any).name === 'Requester') && !statusParam && !approverId) {
        whereClause.requesterId = userPayload.id;
      }
    }

    const [requisitions, totalCount] = await prisma.$transaction([
        prisma.purchaseRequisition.findMany({
          where: whereClause,
          skip,
          take: limit,
          include: {
            requester: true,
            department: true,
            approver: true,
            quotations: {
              select: {
                id: true,
                vendorId: true,
                status: true,
                vendorName: true,
                totalPrice: true,
                finalAverageScore: true,
                items: {
                  select: {
                    id: true,
                    requisitionItemId: true,
                    name: true,
                    quantity: true,
                    unitPrice: true,
                  }
                }
              }
            },
            financialCommitteeMembers: { select: { id: true } },
            technicalCommitteeMembers: { select: { id: true } },
            committeeAssignments: true,
            items: {
              select: {
                id: true,
                name: true,
                description: true,
                quantity: true,
                unitPrice: true,
                perItemAwardDetails: true,
              }
            },
            minutes: {
              include: {
                author: true,
                attendees: true,
                signatures: true,
              }
            }
          },
          orderBy: {
            createdAt: 'desc',
          },
        }),
        prisma.purchaseRequisition.count({ where: whereClause })
    ]);
    
    const transactionIds = requisitions.map(r => r.transactionId).filter(Boolean) as string[];
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        transactionId: { in: transactionIds }
      },
      include: {
        user: { select: { name: true, roles: true } }
      },
      orderBy: {
        timestamp: 'desc'
      }
    });

    const logsByTransaction = new Map<string, any[]>();
    auditLogs.forEach(log => {
      if (log.transactionId) {
        if (!logsByTransaction.has(log.transactionId)) {
          logsByTransaction.set(log.transactionId, []);
        }
        const userRoles = (log.user?.roles as any[])?.map(r => r.name).join(', ') || 'System';
        logsByTransaction.get(log.transactionId)!.push({
          ...log,
          user: log.user?.name || 'System',
          role: userRoles.replace(/_/g, ' '),
          approverComment: log.details,
        });
      }
    });

    const formattedRequisitions = requisitions.map(req => ({
        ...req,
        requesterName: req.requester?.name || 'Unknown',
        department: req.department?.name || 'N/A',
        auditTrail: logsByTransaction.get(req.transactionId!) || [],
    }));
    
    return NextResponse.json({ requisitions: formattedRequisitions, totalCount });
  } catch (error) {
    console.error('Failed to fetch requisitions:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to fetch requisitions', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
) {
  try {
    const body = await request.json();
    const { id, status, comment } = body;
    console.log(`[PATCH /api/requisitions] Received request for ID ${id} with status ${status}`);
    
    const newStatus = status ? status.replace(/ /g, '_') : null;

    const user = await getActorFromToken(request);
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized: Invalid token or user not found' }, { status: 401 });
    }

    const requisition = await prisma.purchaseRequisition.findUnique({ 
      where: { id },
      include: { 
        department: true, 
        requester: true, 
        items: true, 
        quotations: { include: { items: true, scores: { include: { itemScores: true } } } },
        minutes: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        financialCommitteeMembers: { select: { id: true } },
        technicalCommitteeMembers: { select: { id: true } },
      }
    });
    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }
    
    console.log(`[PATCH /api/requisitions] Current req status: ${requisition.status}. Requested new status: ${newStatus}`);

    let dataToUpdate: any = {};
    let auditAction = 'UPDATE_REQUISITION';
    let auditDetails = `Updated requisition ${id}.`;
    let updatedRequisition;
    
    if ((requisition.status === 'Draft' || requisition.status === 'Rejected') && body.title) {
        const totalPrice = body.items.reduce((acc: number, item: any) => {
            const price = item.unitPrice || 0;
            const quantity = item.quantity || 0;
            return acc + (price * quantity);
        }, 0);

        dataToUpdate = {
            title: body.title,
            justification: body.justification,
            urgency: body.urgency,
            department: { connect: { name: body.department } },
            totalPrice: totalPrice,
            status: status ? status.replace(/ /g, '_') : requisition.status,
            approver: { disconnect: true },
            approverComment: null, // *** FIX: Clear the rejection comment on resubmission ***
            items: {
                deleteMany: {},
                create: body.items.map((item: any) => ({
                    name: item.name,
                    quantity: Number(item.quantity) || 0,
                    unitPrice: Number(item.unitPrice) || 0,
                    description: item.description || ''
                })),
            },
            customQuestions: {
                deleteMany: {},
                create: body.customQuestions?.map((q: any) => ({
                    questionText: q.questionText,
                    questionType: q.questionType.replace(/-/g, '_'),
                    isRequired: q.isRequired,
                    options: q.options || [],
                })),
            },
        };
        if (body.evaluationCriteria) {
             const oldCriteria = await prisma.evaluationCriteria.findUnique({ where: { requisitionId: id } });
             if (oldCriteria) {
                 await prisma.financialCriterion.deleteMany({ where: { evaluationCriteriaId: oldCriteria.id } });
                 await prisma.technicalCriterion.deleteMany({ where: { evaluationCriteriaId: oldCriteria.id } });
                 await prisma.evaluationCriteria.delete({ where: { id: oldCriteria.id } });
             }

             dataToUpdate.evaluationCriteria = {
                create: {
                    financialWeight: body.evaluationCriteria.financialWeight,
                    technicalWeight: body.evaluationCriteria.technicalWeight,
                    financialCriteria: { create: body.evaluationCriteria.financialCriteria.map((c:any) => ({ name: c.name, weight: Number(c.weight) })) },
                    technicalCriteria: { create: body.evaluationCriteria.technicalCriteria.map((c:any) => ({ name: c.name, weight: Number(c.weight) })) }
                }
            };
        }
        
        if (newStatus === 'Pending_Approval') {
            const department = await prisma.department.findUnique({ where: { id: requisition.departmentId! } });
            if (department?.headId === user.id) {
                dataToUpdate.status = 'PreApproved';
                dataToUpdate.currentApprover = { disconnect: true };
                auditAction = 'SUBMIT_AND_AUTO_APPROVE';
                auditDetails = `Requisition ${id} ("${body.title}") submitted by department head and automatically approved.`;
            } else if (department?.headId) {
                dataToUpdate.status = 'Pending_Approval';
                dataToUpdate.currentApprover = { connect: { id: department.headId } };
                auditAction = 'SUBMIT_FOR_APPROVAL';
                auditDetails = `Requisition ${id} ("${body.title}") was edited and submitted for approval.`;
            } else {
                 dataToUpdate.status = 'PreApproved';
                 dataToUpdate.currentApprover = { disconnect: true };
                 auditAction = 'SUBMIT_FOR_APPROVAL';
                 auditDetails = `Requisition ${id} ("${body.title}") was edited and submitted for approval (no department head found, auto-approved).`;
            }
        }

    } else if (newStatus === 'PreApproved' && requisition.status === 'Pending_Approval') {
        dataToUpdate.status = 'PreApproved';
        dataToUpdate.approver = { connect: { id: user.id } };
        dataToUpdate.approverComment = comment;
        dataToUpdate.currentApprover = { disconnect: true };
        auditAction = 'APPROVE_REQUISITION';
        auditDetails = `Departmental approval for requisition ${id} granted by ${user.name}. Ready for RFQ.`;
    }
    else if (newStatus === 'Rejected' && requisition.status === 'Pending_Approval') {
        dataToUpdate.status = 'Rejected';
        dataToUpdate.approver = { connect: { id: user.id } };
        dataToUpdate.approverComment = comment;
        dataToUpdate.currentApprover = { disconnect: true };
        auditAction = 'REJECT_REQUISITION';
        auditDetails = `Requisition ${id} was rejected with comment: "${comment}".`;
    }
    else if (requisition.status.startsWith('Pending_') || requisition.status === 'Award_Declined' || requisition.status === 'Partially_Closed') {
        
        if (newStatus !== 'Approved' && newStatus !== 'Rejected') {
             return NextResponse.json({ error: 'Invalid action. Only approve or reject is allowed at this stage.' }, { status: 400 });
        }
        
        let isAuthorizedToAct = (requisition.currentApproverId === user.id) || 
                      (user.roles as any[]).some(r => requisition.status === `Pending_${r.name}`) ||
                      (user.roles as any[]).some(r => r.name === 'Admin' || r.name === 'Procurement_Officer');

        try {
          const awardStrategy = (requisition as any).rfqSettings?.awardStrategy;
          const hasPendingPerItemAwards = requisition.items.some((item: any) => {
            const details = (item.perItemAwardDetails as any[]) || [];
            return details.some(d => d.status === 'Pending_Award');
          });

          if (!isAuthorizedToAct && requisition.status === 'Award_Declined' && awardStrategy === 'item' && hasPendingPerItemAwards) {
            const fcIds = (requisition.financialCommitteeMembers || []).map((m: any) => m.id);
            const tcIds = (requisition.technicalCommitteeMembers || []).map((m: any) => m.id);
            if (fcIds.includes(user.id) || tcIds.includes(user.id) || (user.roles as any[]).some(r => (r.name as string).includes('Committee'))) {
              isAuthorizedToAct = true;
            }
          }
        } catch (e) {
          console.warn('Failed to evaluate per-item committee authorization fallback:', e);
        }

        try {
          let effectiveTotal = requisition.totalPrice || 0;
          const awardStrategy = (requisition as any).rfqSettings?.awardStrategy;
          if (requisition.status === 'Award_Declined' && awardStrategy === 'item') {
            let newTotal = 0;
            for (const item of requisition.items) {
              const details = (item.perItemAwardDetails as any[]) || [];
              const pending = details.find(d => d.status === 'Pending_Award');
              if (pending) {
                newTotal += (pending.unitPrice || pending.unitPrice === 0 ? pending.unitPrice : item.unitPrice) * (item.quantity || 1);
              }
            }
            effectiveTotal = newTotal;
          }

          const approvalMatrix = await prisma.approvalThreshold.findMany({
            include: { steps: { include: { role: { select: { name: true } } }, orderBy: { order: 'asc' } } },
            orderBy: { min: 'asc' }
          });

          const relevantTier = approvalMatrix.find((tier: any) =>
            (effectiveTotal >= tier.min) && (tier.max === null || effectiveTotal <= tier.max)
          );

          if (relevantTier) {
            const tierRoleNames = (relevantTier.steps || []).map((s: any) => s.role.name);
            const userRoleNames = (user.roles as any[]).map(r => r.name);
            if (!isAuthorizedToAct && userRoleNames.some((rn: string) => tierRoleNames.includes(rn))) {
              isAuthorizedToAct = true;
            }
          }
        } catch (err) {
          console.warn('Failed to evaluate approval matrix membership for authorization:', err);
        }

        if (!isAuthorizedToAct) {
            console.error(`[PATCH /api/requisitions] User ${user.id} not authorized for status ${requisition.status}.`);
            return NextResponse.json({ error: 'You are not authorized to act on this item at its current step.' }, { status: 403 });
        }
        
        console.log(`[PATCH /api/requisitions] Award action transaction started for Req ID: ${id}`);
        updatedRequisition = await prisma.$transaction(async (tx) => {
            const committeeName = requisition.status.replace('Pending_', '').replace(/_/g, ' ');

            await tx.review.create({
              data: {
                requisitionId: requisition.id,
                reviewerId: user.id,
                decision: newStatus as 'Approved' | 'Rejected',
                comment: comment,
              }
            });

            if (newStatus === 'Rejected') {
                const { previousStatus, previousApproverId, auditDetails: serviceAuditDetails } = await getPreviousApprovalStep(tx, requisition, user, comment);
                dataToUpdate.status = previousStatus;
                dataToUpdate.currentApproverId = previousApproverId;
                dataToUpdate.approverComment = comment; 
                auditDetails = serviceAuditDetails;
                auditAction = 'REJECT_AWARD_STEP';
            } else { // Approved
              let effectiveRequisition = requisition;
              try {
                const awardStrategy = (requisition as any).rfqSettings?.awardStrategy;
                if (requisition.status === 'Award_Declined' && awardStrategy === 'item') {
                  let newTotal = 0;
                  for (const item of requisition.items) {
                    const details = (item.perItemAwardDetails as any[]) || [];
                    const pending = details.find(d => d.status === 'Pending_Award');
                    if (pending) {
                      newTotal += (pending.unitPrice || pending.unitPrice === 0 ? pending.unitPrice : item.unitPrice) * (item.quantity || 1);
                    }
                  }
                  effectiveRequisition = { ...requisition, totalPrice: newTotal } as any;
                }
              } catch (e) {
                console.warn('Failed to compute adjusted total for per-item approval routing:', e);
              }

              const { nextStatus, nextApproverId, auditDetails: serviceAuditDetails } = await getNextApprovalStep(tx, effectiveRequisition, user);
                dataToUpdate.status = nextStatus;
                dataToUpdate.currentApproverId = nextApproverId;
                dataToUpdate.approverComment = comment;
                auditDetails = serviceAuditDetails;
                auditAction = 'APPROVE_AWARD_STEP';
            }

            const req = await tx.purchaseRequisition.update({
                where: { id },
                data: {
                    status: dataToUpdate.status,
                    currentApprover: dataToUpdate.currentApproverId ? { connect: { id: dataToUpdate.currentApproverId } } : { disconnect: true },
                    approverComment: dataToUpdate.approverComment,
                },
            });
            
            const latestMinute = requisition.minutes[0];
            if (latestMinute && latestMinute.documentUrl) {
              const signatureRecord = await tx.signature.create({
                data: {
                  minute: { connect: { id: latestMinute.id } },
                  signer: { connect: { id: user.id } },
                  signerName: user.name,
                  signerRole: (user.roles as any[]).map(r => r.name).join(', '),
                  decision: newStatus === 'Rejected' ? 'REJECTED' : 'APPROVED',
                  comment: comment,
                }
              });
              auditDetails += ` Signature recorded as ${signatureRecord.id}.`;
              
              const filePath = path.join(process.cwd(), 'public', latestMinute.documentUrl);
              try {
                const pdfBytes = await fs.readFile(filePath);
                const pdfDoc = await PDFDocument.load(pdfBytes);
                const newPage = pdfDoc.addPage();
                
                const { width, height } = newPage.getSize();
                let y = height - 50;

                const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                const drawText = (text: string, size: number, options: { y: number, color?: any, font?: any }) => {
                    newPage.drawText(text, { x: 50, y: options.y, size, font: options.font || font, color: options.color || rgb(0,0,0) });
                    return options.y - (size * 1.5);
                }

                y = drawText(`Digital Signature Record`, 18, { y });
                y -= 20;

                y = drawText(`Decision: ${signatureRecord.decision}`, 14, { y, color: signatureRecord.decision === 'APPROVED' ? rgb(0.1, 0.5, 0.1) : rgb(0.7, 0, 0) });
                y = drawText(`Signer: ${signatureRecord.signerName} (${signatureRecord.signerRole})`, 12, { y });
                y = drawText(`Date: ${new Date(signatureRecord.signedAt).toLocaleString()}`, 12, { y });
                y -= 10;
                y = drawText(`Justification:`, 12, { y });
                y = drawText(signatureRecord.comment || 'No comment provided.', 11, { y, font: await pdfDoc.embedFont(StandardFonts.HelveticaOblique) });

                const modifiedPdfBytes = await pdfDoc.save();
                await fs.writeFile(filePath, modifiedPdfBytes);
                auditDetails += ` Signature appended to document.`;
              } catch(e) {
                  console.error("Failed to append signature to PDF:", e);
                  auditDetails += ` (Failed to append signature to PDF).`;
              }
            }

            await tx.auditLog.create({
                data: {
                    transactionId: req.transactionId,
                    user: { connect: { id: user.id } },
                    timestamp: new Date(),
                    action: auditAction,
                    entity: 'Requisition',
                    entityId: id,
                    details: auditDetails,
                }
            });

            return req;
        });
        console.log(`[PATCH /api/requisitions] Award action transaction complete for Req ID: ${id}`);
        return NextResponse.json(updatedRequisition);
    }

    else if (newStatus === 'Pending_Approval' && (requisition.status === 'Draft' || requisition.status === 'Rejected')) {
        const department = await prisma.department.findUnique({ where: { id: requisition.departmentId! } });
        if (department?.headId === user.id) {
            dataToUpdate.status = 'PreApproved';
            dataToUpdate.currentApprover = { disconnect: true };
        } else if (department?.headId) { 
            dataToUpdate.currentApprover = { connect: { id: department.headId } };
            dataToUpdate.status = 'Pending_Approval';
        } else {
            // If no department head, auto-approve to the next stage
            dataToUpdate.status = 'PreApproved';
            dataToUpdate.currentApprover = { disconnect: true };
        }
        dataToUpdate.approverComment = null; // Clear rejection comment
        auditAction = 'SUBMIT_FOR_APPROVAL';
        auditDetails = `Requisition ${id} was submitted for approval.`;
    }
    
    else {
        return NextResponse.json({ error: 'Invalid operation for current status.' }, { status: 400 });
    }
    
    updatedRequisition = await prisma.purchaseRequisition.update({
      where: { id },
      data: dataToUpdate,
    });
    
    await prisma.auditLog.create({
        data: {
            transactionId: updatedRequisition.transactionId,
            user: { connect: { id: user.id } },
            timestamp: new Date(),
            action: auditAction,
            entity: 'Requisition',
            entityId: id,
            details: auditDetails,
        }
    });

    return NextResponse.json(updatedRequisition);
    
  } catch (error) {
    console.error('[PATCH] Failed to update requisition:', error);
    if (error instanceof Error) {
        if ((error as any).code === 'P2003') {
            return NextResponse.json({ error: 'A foreign key constraint was violated. This may be due to attempting to delete a record that is still referenced elsewhere.', details: (error as any).meta }, { status: 409 });
        }
        if ((error as any).code === 'P2002') {
             return NextResponse.json({ error: 'A unique constraint was violated. This usually means a user cannot review the same item twice.', details: (error as any).meta }, { status: 409 });
        }
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const actor = await prisma.user.findUnique({
      where: { id: body.requesterId },
      include: { roles: true },
    });
    if (!actor) {
      return NextResponse.json({ error: 'Requester user not found' }, { status: 404 });
    }
    const creatorSetting = await prisma.setting.findUnique({ where: { key: 'requisitionCreatorSetting' } });
    if (creatorSetting && typeof creatorSetting.value === 'object' && creatorSetting.value && 'type' in creatorSetting.value) {
      const setting = creatorSetting.value as { type: string, allowedRoles?: string[] };
      if (setting.type === 'specific_roles') {
        const userRoles = actor.roles.map(r => r.name);
        const canCreate = userRoles.some(role => setting.allowedRoles?.includes(role));
        if (!canCreate) {
          return NextResponse.json({ error: 'Unauthorized: You do not have permission to create requisitions.' }, { status: 403 });
        }
      }
    }
    const totalPrice = body.items.reduce((acc: number, item: any) => {
      const price = item.unitPrice || 0;
      const quantity = item.quantity || 0;
      return acc + (price * quantity);
    }, 0);
    const department = await prisma.department.findUnique({ where: { name: body.department } });
    if (!department) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
      const data: any = {
        requester: { connect: { id: actor.id } },
        department: { connect: { id: department.id } },
        title: body.title,
        urgency: body.urgency,
        justification: body.justification,
        status: body.status || 'Draft',
        totalPrice: totalPrice,
        items: {
          create: body.items.map((item: any) => ({
            name: item.name,
            quantity: Number(item.quantity) || 0,
            unitPrice: Number(item.unitPrice) || 0,
            description: item.description || ''
          }))
        },
        customQuestions: {
          create: body.customQuestions?.map((q: any) => ({
            questionText: q.questionText,
            questionType: q.questionType.replace(/-/g, '_'),
            isRequired: q.isRequired,
            options: q.options || [],
          }))
        },
        evaluationCriteria: body.evaluationCriteria ? {
          create: {
            financialWeight: body.evaluationCriteria.financialWeight,
            technicalWeight: body.evaluationCriteria.technicalWeight,
            financialCriteria: {
              create: body.evaluationCriteria.financialCriteria.map((c: any) => ({ name: c.name, weight: Number(c.weight) }))
            },
            technicalCriteria: {
              create: body.evaluationCriteria.technicalCriteria.map((c: any) => ({ name: c.name, weight: Number(c.weight) }))
            }
          }
        } : undefined,
      };

      // If submitting, check if user is their own dept head
      if (body.status === 'Pending_Approval') {
          if (department.headId === actor.id) {
              data.status = 'PreApproved';
              data.currentApprover = { disconnect: true };
          } else if (department.headId) {
              data.status = 'Pending_Approval';
              data.currentApprover = { connect: { id: department.headId } };
          } else {
              data.status = 'PreApproved'; // No head, auto-approve
              data.currentApprover = { disconnect: true };
          }
      }

      const newRequisition = await tx.purchaseRequisition.create({ data });

      const finalRequisition = await tx.purchaseRequisition.update({
        where: { id: newRequisition.id },
        data: { transactionId: newRequisition.id },
        include: { items: true, customQuestions: true, evaluationCriteria: true }
      });
      
      let auditAction = 'CREATE_REQUISITION';
      let auditDetails = `Created new requisition: "${finalRequisition.title}".`;

      if (body.status === 'Pending_Approval') {
          if (data.status === 'PreApproved') {
            auditAction = 'SUBMIT_AND_AUTO_APPROVE';
            auditDetails = `Requisition "${finalRequisition.title}" submitted by department head and automatically approved.`;
          } else {
            auditAction = 'SUBMIT_FOR_APPROVAL';
            auditDetails = `Requisition "${finalRequisition.title}" submitted for approval.`;
          }
      }

      await tx.auditLog.create({
        data: {
          transactionId: finalRequisition.id,
          user: { connect: { id: actor.id } },
          timestamp: new Date(),
          action: auditAction,
          entity: 'Requisition',
          entityId: finalRequisition.id,
          details: auditDetails,
        }
      });
      return finalRequisition;
    });
    return NextResponse.json(transactionResult, { status: 201 });
  } catch (error) {
    console.error('Failed to create requisition:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process requisition', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}