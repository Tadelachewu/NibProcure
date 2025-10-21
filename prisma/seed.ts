
import { PrismaClient } from '@prisma/client';
import { getInitialData } from '../src/lib/seed-data';
import bcrypt from 'bcryptjs';
import { rolePermissions } from '../src/lib/roles';

const prisma = new PrismaClient();

async function main() {
  console.log(`Clearing existing data...`);
  // Manually manage order of deletion to avoid foreign key constraint violations
  await prisma.approvalStep.deleteMany({});
  await prisma.approvalThreshold.deleteMany({});
  await prisma.score.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.receiptItem.deleteMany({});
  await prisma.goodsReceiptNote.deleteMany({});
  await prisma.invoiceItem.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.pOItem.deleteMany({});
  await prisma.purchaseOrder.deleteMany({});
  await prisma.quoteAnswer.deleteMany({});
  await prisma.itemScore.deleteMany({});
  await prisma.committeeScoreSet.deleteMany({});
  await prisma.quoteItem.deleteMany({});
  await prisma.technicalCriterion.deleteMany({});
  await prisma.financialCriterion.deleteMany({});
  await prisma.evaluationCriteria.deleteMany({});
  await prisma.customQuestion.deleteMany({});
  await prisma.requisitionItem.deleteMany({});
  await prisma.committeeAssignment.deleteMany({});
  await prisma.contract.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.purchaseRequisition.deleteMany({});
  await prisma.kYC_Document.deleteMany({});
  await prisma.setting.deleteMany({});
  
  // Manually manage order of user/vendor deletion to avoid foreign key issues
  await prisma.user.updateMany({ data: { managerId: null } });
  await prisma.department.updateMany({data: { headId: null }});
  await prisma.vendor.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.department.deleteMany({});
  await prisma.role.deleteMany({});
  console.log('Existing data cleared.');

  console.log(`Start seeding ...`);

  const seedData = getInitialData();
  const allRoles = [
      { name: 'Requester', description: 'Can create purchase requisitions.' },
      { name: 'Approver', description: 'Can approve or reject requisitions.' },
      { name: 'Procurement_Officer', description: 'Manages the RFQ and PO process.' },
      { name: 'Finance', description: 'Manages invoices and payments.' },
      { name: 'Admin', description: 'System administrator with all permissions.' },
      { name: 'Receiving', description: 'Manages goods receipt notes.' },
      { name: 'Vendor', description: 'External supplier of goods/services.' },
      { name: 'Committee_Member', description: 'Scores and evaluates vendor quotations.' },
      { name: 'Committee_A_Member', description: 'Reviews high-value procurements.' },
      { name: 'Committee_B_Member', description: 'Reviews mid-value procurements.' },
      { name: 'Committee', description: 'Manages evaluation committees.' },
      { name: 'Manager_Procurement_Division', description: 'Approves low-value awards.' },
      { name: 'Director_Supply_Chain_and_Property_Management', description: 'Approves mid-value awards.' },
      { name: 'VP_Resources_and_Facilities', description: 'Approves high-value awards.' },
      { name: 'President', description: 'Approves very-high-value awards.' },
  ];

  // Seed Roles
  for (const role of allRoles) {
      await prisma.role.create({ data: { name: role.name.replace(/ /g, '_'), description: role.description } });
  }
  console.log('Seeded roles.');
  
  // Seed Settings
  await prisma.setting.create({
    data: {
      key: 'rfqSenderSetting',
      value: {
        type: 'all' // or 'specific'
        // userId: 'some-user-id' // if type is 'specific'
      }
    }
  });

  await prisma.setting.create({
      data: {
          key: 'committeeConfig',
          value: {
              A: { min: 200001, max: 1000000 },
              B: { min: 10001, max: 200000 }
          }
      }
  });

  await prisma.setting.create({
    data: {
        key: 'rolePermissions',
        value: rolePermissions,
    }
  });

  await prisma.setting.create({
    data: {
        key: 'rfqQuorum',
        value: 3,
    }
  });

  await prisma.setting.create({
    data: {
        key: 'committeeQuorum',
        value: 3,
    }
  });

  console.log('Seeded settings.');

  // Seed Approval Matrix
  const defaultApprovalThresholds = [
    { name: 'Low Value', min: 0, max: 10000, steps: ['Manager_Procurement_Division'] },
    { name: 'Mid Value', min: 10001, max: 200000, steps: ['Committee_B_Member', 'Manager_Procurement_Division', 'Director_Supply_Chain_and_Property_Management'] },
    { name: 'High Value', min: 200001, max: 1000000, steps: ['Committee_A_Member', 'Director_Supply_Chain_and_Property_Management', 'VP_Resources_and_Facilities'] },
    { name: 'Very-High Value', min: 1000001, max: null, steps: ['Committee_A_Member', 'VP_Resources_and_Facilities', 'President'] },
  ];

  for (const tier of defaultApprovalThresholds) {
    const createdThreshold = await prisma.approvalThreshold.create({
      data: {
        name: tier.name,
        min: tier.min,
        max: tier.max,
      },
    });

    for (let i = 0; i < tier.steps.length; i++) {
      await prisma.approvalStep.create({
        data: {
          thresholdId: createdThreshold.id,
          role: tier.steps[i],
          order: i,
        },
      });
    }
  }
  console.log('Seeded approval matrix.');


  // Seed Departments without heads first
  for (const department of seedData.departments) {
    const { headId, ...deptData } = department;
    await prisma.department.create({
      data: deptData,
    });
  }
  console.log('Seeded departments.');

  // Seed non-vendor users first
  for (const user of seedData.users.filter(u => u.role !== 'Vendor')) {
    const { committeeAssignments, department, vendorId, password, managerId, ...userData } = user;
    const hashedPassword = await bcrypt.hash(password || 'password123', 10);

    await prisma.user.create({
      data: {
          ...userData,
          password: hashedPassword,
          role: userData.role.replace(/ /g, '_'), // Pass role as a string
          departmentId: user.departmentId,
      },
    });
  }
  console.log('Seeded non-vendor users.');
  
  // Second pass to link managers
  for (const user of seedData.users.filter(u => u.role !== 'Vendor' && u.managerId)) {
      await prisma.user.update({
          where: { id: user.id },
          data: {
              manager: { connect: { id: user.managerId } }
          }
      });
  }
  console.log('Linked managers to users.');
  
  // Third pass to link department heads
  for (const dept of seedData.departments) {
    if (dept.headId) {
      await prisma.department.update({
        where: { id: dept.id },
        data: { head: { connect: { id: dept.headId } } }
      });
    }
  }
  console.log('Linked department heads.');


  // Seed Vendors and their associated users
  for (const vendor of seedData.vendors) {
      const { kycDocuments, userId, ...vendorData } = vendor; // Destructure userId out
      const vendorUser = seedData.users.find(u => u.id === userId);

      if (!vendorUser) {
          console.warn(`Skipping vendor ${vendor.name} because its user was not found.`);
          continue;
      }
      
      const hashedPassword = await bcrypt.hash(vendorUser.password || 'password123', 10);
      
      // Create user for the vendor first
      const createdUser = await prisma.user.create({
          data: {
              id: vendorUser.id,
              name: vendorUser.name,
              email: vendorUser.email,
              password: hashedPassword,
              approvalLimit: vendorUser.approvalLimit,
              role: vendorUser.role.replace(/ /g, '_'), // Pass role as a string
          }
      });
      
      // Then create the vendor and link it to the user
    const createdVendor = await prisma.vendor.create({
      data: {
          ...vendorData,
          kycStatus: vendorData.kycStatus.replace(/ /g, '_') as any,
          user: { connect: { id: createdUser.id } },
      },
    });

    // Now, update the user with the vendorId
    await prisma.user.update({
        where: { id: createdUser.id },
        data: { vendorId: createdVendor.id }
    });

    if (kycDocuments) {
        for (const doc of kycDocuments) {
            await prisma.kYC_Document.create({
                data: {
                    ...doc,
                    vendorId: createdVendor.id,
                }
            });
        }
    }
  }
  console.log('Seeded vendors and their users.');

  // Seed Requisitions
  for (const requisition of seedData.requisitions) {
      const {
          items, 
          customQuestions, 
          evaluationCriteria, 
          quotations, 
          requesterId,
          approverId,
          currentApproverId,
          financialCommitteeMemberIds,
          technicalCommitteeMemberIds,
          department,
          departmentId,
          ...reqData 
      } = requisition;

      const createdRequisition = await prisma.purchaseRequisition.create({
          data: {
              ...reqData,
              status: reqData.status.replace(/ /g, '_') as any,
              urgency: reqData.urgency || 'Low',
              totalPrice: items.reduce((acc, item) => acc + (item.unitPrice || 0) * item.quantity, 0),
              requester: { connect: { id: requesterId } },
              approver: approverId ? { connect: { id: approverId } } : undefined,
              currentApprover: currentApproverId ? { connect: { id: currentApproverId } } : undefined,
              department: { connect: { id: departmentId } },
              financialCommitteeMembers: financialCommitteeMemberIds ? { connect: financialCommitteeMemberIds.map(id => ({ id })) } : undefined,
              technicalCommitteeMembers: technicalCommitteeMemberIds ? { connect: technicalCommitteeMemberIds.map(id => ({ id })) } : undefined,
              deadline: reqData.deadline ? new Date(reqData.deadline) : undefined,
              scoringDeadline: reqData.scoringDeadline ? new Date(reqData.scoringDeadline) : undefined,
              awardResponseDeadline: reqData.awardResponseDeadline ? new Date(reqData.awardResponseDeadline) : undefined,
          }
      });
      
      // Seed RequisitionItems
      if (items) {
          for (const item of items) {
              await prisma.requisitionItem.create({
                  data: {
                      ...item,
                      unitPrice: item.unitPrice || 0,
                      requisitionId: createdRequisition.id
                  }
              });
          }
      }

      // Seed CustomQuestions
      if (customQuestions) {
          for (const question of customQuestions) {
              await prisma.customQuestion.create({
                  data: {
                      ...question,
                      questionType: question.questionType.replace(/-/g, '_') as any,
                      options: question.options || [],
                      requisitionId: createdRequisition.id,
                  }
              });
          }
      }

      // Seed EvaluationCriteria
      if (evaluationCriteria) {
          await prisma.evaluationCriteria.create({
              data: {
                  requisitionId: createdRequisition.id,
                  financialWeight: evaluationCriteria.financialWeight,
                  technicalWeight: evaluationCriteria.technicalWeight,
                  financialCriteria: {
                      create: evaluationCriteria.financialCriteria
                  },
                  technicalCriteria: {
                      create: evaluationCriteria.technicalCriteria
                  }
              }
          })
      }
  }
  console.log('Seeded requisitions and related items/questions/criteria.');

   // Seed Quotations
   for (const quote of seedData.quotations) {
       const { items, answers, scores, requisitionId, vendorId, ...quoteData } = quote;
       const createdQuote = await prisma.quotation.create({
           data: {
               ...quoteData,
               status: quoteData.status.replace(/_/g, '_') as any,
               deliveryDate: new Date(quoteData.deliveryDate),
               createdAt: new Date(quoteData.createdAt),
               vendor: { connect: { id: vendorId } },
               requisition: { connect: { id: requisitionId } },
           }
       });

       if (items) {
           for (const item of items) {
               await prisma.quoteItem.create({
                   data: {
                       ...item,
                       quotationId: createdQuote.id
                   }
               })
           }
       }

       if (answers) {
           for (const answer of answers) {
               await prisma.quoteAnswer.create({
                   data: {
                       ...answer,
                       quotationId: createdQuote.id
                   }
               })
           }
       }
   }
   console.log('Seeded quotations and related items/answers.');

   // Seed Purchase Orders
    for (const po of seedData.purchaseOrders) {
        const { items, receipts, invoices, vendor, ...poData } = po;
        const createdPO = await prisma.purchaseOrder.create({
            data: {
                ...poData,
                status: poData.status.replace(/ /g, '_') as any,
                createdAt: new Date(poData.createdAt),
                vendorId: vendor.id,
                requisitionId: po.requisitionId,
                items: {
                    create: items.map(item => ({
                        id: item.id,
                        name: item.name,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        totalPrice: item.totalPrice,
                        receivedQuantity: item.receivedQuantity,
                        requisitionItemId: item.requisitionItemId
                    })),
                },
            }
        });
    }
    console.log('Seeded purchase orders and related items.');
    
    // Seed Invoices
    for (const invoice of seedData.invoices) {
        const { items, ...invoiceData } = invoice;
        const createdInvoice = await prisma.invoice.create({
            data: {
                ...invoiceData,
                status: invoiceData.status.replace(/_/g, '_') as any,
                invoiceDate: new Date(invoiceData.invoiceDate),
                paymentDate: invoiceData.paymentDate ? new Date(invoiceData.paymentDate) : undefined,
            }
        });

        if (items) {
            for (const item of items) {
                await prisma.invoiceItem.create({
                    data: {
                        ...item,
                        invoiceId: createdInvoice.id,
                    }
                })
            }
        }
    }
    console.log('Seeded invoices and related items.');

    // Seed Goods Receipt Notes
    for (const grn of seedData.goodsReceipts) {
        const { items, ...grnData } = grn;
        const createdGrn = await prisma.goodsReceiptNote.create({
            data: {
                ...grnData,
                receivedDate: new Date(grnData.receivedDate),
            }
        });

        if (items) {
            for (const item of items) {
                await prisma.receiptItem.create({
                    data: {
                        ...item,
                        condition: item.condition.replace(/ /g, '_') as any,
                        goodsReceiptNoteId: createdGrn.id,
                    }
                })
            }
        }
    }
    console.log('Seeded goods receipts and related items.');


  // Seed Audit Logs
  for (const log of seedData.auditLogs) {
    const userForLog = seedData.users.find(u => u.name === log.user);
    if (!userForLog) {
      console.warn(`Skipping audit log for user '${log.user}' because user was not found.`);
      continue;
    }
    // Exclude user and role from logData as they are not direct fields on the model
    const { user, role, ...logData } = log;
    await prisma.auditLog.create({
      data: {
          ...logData,
          timestamp: new Date(log.timestamp),
          user: { connect: { id: userForLog.id } }
      },
    });
  }
  console.log('Seeded audit logs.');


  console.log(`Seeding finished.`);
}

main()
  .catch(async (e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

    

    
