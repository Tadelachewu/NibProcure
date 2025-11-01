
import { PrismaClient } from '@prisma/client';
import { getInitialData } from '../src/lib/seed-data';
import bcrypt from 'bcryptjs';
import { rolePermissions } from '../src/lib/roles';

const prisma = new PrismaClient();

async function main() {
  console.log(`Clearing existing data...`);
  // Manually manage order of deletion to avoid foreign key constraint violations
  await prisma.minute.deleteMany({});
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
  await prisma.quotation.deleteMany({});
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
        value: 2,
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
    const { committeeAssignments, department, vendorId, password, ...userData } = user;
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
      const { kycDocuments, ...vendorData } = vendor;
      const vendorUser = seedData.users.find(u => u.id === vendor.userId);

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
              role: vendorUser.role.replace(/ /g, '_'),
          }
      });
      
    // Then create the vendor and link it to the user
    const createdVendor = await prisma.vendor.create({
      data: {
          id: vendor.id,
          name: vendor.name,
          contactPerson: vendor.contactPerson,
          email: vendor.email,
          phone: vendor.phone,
          address: vendor.address,
          kycStatus: vendor.kycStatus.replace(/ /g, '_') as any,
          userId: createdUser.id, // Explicitly provide the userId
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
       
       const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId } });
       if (!requisition) {
           console.warn(`Skipping quote ${quote.id} because its requisition ${requisitionId} was not found.`);
           continue;
       }

       const createdQuote = await prisma.quotation.create({
           data: {
               ...quoteData,
               transactionId: requisition.transactionId, // Add the transactionId from the requisition
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

        const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: po.requisitionId }});
        if (!requisition) {
            console.warn(`Skipping PO ${po.id} because its requisition ${po.requisitionId} was not found.`);
            continue;
        }

        const createdPO = await prisma.purchaseOrder.create({
            data: {
                ...poData,
                transactionId: requisition.transactionId, // Get transaction ID from requisition
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
        const { items, receivedBy, ...grnData } = grn;
        const createdGrn = await prisma.goodsReceiptNote.create({
            data: {
                ...grnData,
                receivedDate: new Date(grnData.receivedDate),
                receivedById: grnData.receivedById,
                items: {
                    create: items.map(item => ({
                        poItemId: item.poItemId,
                        quantityReceived: item.quantityReceived,
                        condition: item.condition.replace(/ /g, '_') as any,
                        notes: item.notes,
                    }))
                }
            }
        });
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

  // --- START: PARTIAL AWARD SEED DATA ---
  console.log('Seeding partial award test scenarios...');

  // --- CASE 1: BOTH VENDORS AWARDED, READY TO ACCEPT ---
  // SCENARIO 1.1
  await prisma.purchaseRequisition.create({
    data: {
      id: 'REQ-SPLIT-CASE1', transactionId: 'REQ-SPLIT-CASE1', title: 'Partial Award Case 1.1: Both Accept (Laptops/Mice)',
      requester: { connect: { id: '1' } }, department: { connect: { id: 'DEPT-1' } }, status: 'PostApproved', totalPrice: 1500,
      justification: 'Test case for both vendors accepting a split award.', createdAt: new Date(), updatedAt: new Date(),
      urgency: 'Medium',
      awardedQuoteItemIds: ['QI-SPLIT-A1', 'QI-SPLIT-B1'],
      items: { create: [ { id: 'ITEM-SPLIT-A', name: 'Laptop Power Adapter', quantity: 10, unitPrice: 50 }, { id: 'ITEM-SPLIT-B', name: 'Ergonomic Mouse', quantity: 10, unitPrice: 100 } ] },
      quotations: { create: [
          { id: 'QUO-SPLIT-A', transactionId: 'REQ-SPLIT-CASE1', vendor: { connect: { id: 'VENDOR-001' } }, vendorName: 'Apple Inc.', status: 'Pending_Award', totalPrice: 500, deliveryDate: new Date(), rank: 1, items: { create: { id: 'QI-SPLIT-A1', requisitionItemId: 'ITEM-SPLIT-A', name: 'Laptop Power Adapter', quantity: 10, unitPrice: 50, leadTimeDays: 5 } } },
          { id: 'QUO-SPLIT-B', transactionId: 'REQ-SPLIT-CASE1', vendor: { connect: { id: 'VENDOR-002' } }, vendorName: 'Dell Technologies', status: 'Pending_Award', totalPrice: 1000, deliveryDate: new Date(), rank: 1, items: { create: { id: 'QI-SPLIT-B1', requisitionItemId: 'ITEM-SPLIT-B', name: 'Ergonomic Mouse', quantity: 10, unitPrice: 100, leadTimeDays: 7 } } }
      ] }
    }
  });

  // SCENARIO 1.2
  await prisma.purchaseRequisition.create({
    data: {
      id: 'REQ-SPLIT-CASE4', transactionId: 'REQ-SPLIT-CASE4', title: 'Partial Award Case 1.2: Both Accept (Monitors/Keyboards)',
      requester: { connect: { id: '1' } }, department: { connect: { id: 'DEPT-3' } }, status: 'PostApproved', totalPrice: 2200,
      justification: 'Second test case for both vendors accepting a split award.', createdAt: new Date(), updatedAt: new Date(),
      urgency: 'Low',
      awardedQuoteItemIds: ['QI-SPLIT-I1', 'QI-SPLIT-J1'],
      items: { create: [ { id: 'ITEM-SPLIT-I', name: '4K Monitor', quantity: 4, unitPrice: 400 }, { id: 'ITEM-SPLIT-J', name: 'Mechanical Keyboard', quantity: 4, unitPrice: 150 } ] },
      quotations: { create: [
          { id: 'QUO-SPLIT-I', transactionId: 'REQ-SPLIT-CASE4', vendor: { connect: { id: 'VENDOR-004' } }, vendorName: 'HP Inc.', status: 'Pending_Award', totalPrice: 1600, deliveryDate: new Date(), rank: 1, items: { create: { id: 'QI-SPLIT-I1', requisitionItemId: 'ITEM-SPLIT-I', name: '4K Monitor', quantity: 4, unitPrice: 400, leadTimeDays: 10 } } },
          { id: 'QUO-SPLIT-J', transactionId: 'REQ-SPLIT-CASE4', vendor: { connect: { id: 'VENDOR-001' } }, vendorName: 'Apple Inc.', status: 'Pending_Award', totalPrice: 600, deliveryDate: new Date(), rank: 1, items: { create: { id: 'QI-SPLIT-J1', requisitionItemId: 'ITEM-SPLIT-J', name: 'Mechanical Keyboard', quantity: 4, unitPrice: 150, leadTimeDays: 5 } } }
      ] }
    }
  });


  // --- CASE 2: ONE ACCEPTS, ONE DECLINES ---
  // SCENARIO 2.1
  await prisma.purchaseRequisition.create({
    data: {
      id: 'REQ-SPLIT-CASE2', transactionId: 'REQ-SPLIT-CASE2', title: 'Partial Award Case 2.1: One Accepts, One Declines',
      requester: { connect: { id: '1' } }, department: { connect: { id: 'DEPT-1' } }, status: 'Award_Declined', totalPrice: 500,
      urgency: 'High',
      justification: 'Test case for one vendor accepting and one declining.', createdAt: new Date(), updatedAt: new Date(),
      items: { create: [ { id: 'ITEM-SPLIT-C', name: 'Docking Station', quantity: 2, unitPrice: 150 }, { id: 'ITEM-SPLIT-D', name: '4K Webcam', quantity: 2, unitPrice: 100 } ] }
    }
  });
  await prisma.purchaseOrder.create({
      data: { id: 'PO-SPLIT-C', transactionId: 'REQ-SPLIT-CASE2', requisitionId: 'REQ-SPLIT-CASE2', requisitionTitle: 'Partial Award Case 2.1: One Accepts, One Declines', vendorId: 'VENDOR-004', totalAmount: 300, status: 'Issued', items: { create: { requisitionItemId: 'ITEM-SPLIT-C', name: 'Docking Station', quantity: 2, unitPrice: 150, totalPrice: 300, receivedQuantity: 0 } } }
  });
  await prisma.quotation.createMany({ data: [
      { id: 'QUO-SPLIT-C', transactionId: 'REQ-SPLIT-CASE2', requisitionId: 'REQ-SPLIT-CASE2', vendorId: 'VENDOR-004', vendorName: 'HP Inc.', status: 'Accepted', totalPrice: 300, deliveryDate: new Date(), rank: 1 },
      { id: 'QUO-SPLIT-D', transactionId: 'REQ-SPLIT-CASE2', requisitionId: 'REQ-SPLIT-CASE2', vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Declined', totalPrice: 200, deliveryDate: new Date(), rank: 1 },
      { id: 'QUO-SPLIT-E', transactionId: 'REQ-SPLIT-CASE2', requisitionId: 'REQ-SPLIT-CASE2', vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Standby', totalPrice: 220, deliveryDate: new Date(), rank: 2 },
  ]});

  // SCENARIO 2.2
  await prisma.purchaseRequisition.create({
    data: {
      id: 'REQ-SPLIT-CASE5', transactionId: 'REQ-SPLIT-CASE5', title: 'Partial Award Case 2.2: One Accepts, One Rejects',
      requester: { connect: { id: '1' } }, department: { connect: { id: 'DEPT-3' } }, status: 'Award_Declined', totalPrice: 1300,
      urgency: 'Medium',
      justification: 'Second test case for one vendor accepting and one rejecting.', createdAt: new Date(), updatedAt: new Date(),
      items: { create: [ { id: 'ITEM-SPLIT-K', name: 'Laser Printer', quantity: 1, unitPrice: 800 }, { id: 'ITEM-SPLIT-L', name: 'Scanner', quantity: 1, unitPrice: 500 } ] }
    }
  });
  await prisma.purchaseOrder.create({
      data: { id: 'PO-SPLIT-K', transactionId: 'REQ-SPLIT-CASE5', requisitionId: 'REQ-SPLIT-CASE5', requisitionTitle: 'Partial Award Case 2.2: One Accepts, One Rejects', vendorId: 'VENDOR-001', totalAmount: 800, status: 'Issued', items: { create: { requisitionItemId: 'ITEM-SPLIT-K', name: 'Laser Printer', quantity: 1, unitPrice: 800, totalPrice: 800, receivedQuantity: 0 } } }
  });
  await prisma.quotation.createMany({ data: [
      { id: 'QUO-SPLIT-K', transactionId: 'REQ-SPLIT-CASE5', requisitionId: 'REQ-SPLIT-CASE5', vendorId: 'VENDOR-001', vendorName: 'Apple Inc.', status: 'Accepted', totalPrice: 800, deliveryDate: new Date(), rank: 1 },
      { id: 'QUO-SPLIT-L', transactionId: 'REQ-SPLIT-CASE5', requisitionId: 'REQ-SPLIT-CASE5', vendorId: 'VENDOR-002', vendorName: 'Dell Technologies', status: 'Declined', totalPrice: 500, deliveryDate: new Date(), rank: 1 },
      { id: 'QUO-SPLIT-M', transactionId: 'REQ-SPLIT-CASE5', requisitionId: 'REQ-SPLIT-CASE5', vendorId: 'VENDOR-004', vendorName: 'HP Inc.', status: 'Standby', totalPrice: 550, deliveryDate: new Date(), rank: 2 },
  ]});


  // --- CASE 3: BOTH VENDORS DECLINE, STANDBY AVAILABLE ---
  // SCENARIO 3.1
  await prisma.purchaseRequisition.create({
    data: {
      id: 'REQ-SPLIT-CASE3', transactionId: 'REQ-SPLIT-CASE3', title: 'Partial Award Case 3.1: Both Decline',
      requester: { connect: { id: '1' } }, department: { connect: { id: 'DEPT-1' } }, status: 'Award_Declined', totalPrice: 400,
      justification: 'Test case for both vendors declining, with a standby available.', createdAt: new Date(), updatedAt: new Date(),
      urgency: 'Low',
      items: { create: [ { id: 'ITEM-SPLIT-F', name: 'Wireless Keyboard', quantity: 5, unitPrice: 50 }, { id: 'ITEM-SPLIT-G', name: 'Wireless Mouse', quantity: 5, unitPrice: 30 } ] },
      quotations: { create: [
          { id: 'QUO-SPLIT-F', transactionId: 'REQ-SPLIT-CASE3', vendor: { connect: { id: 'VENDOR-001' } }, vendorName: 'Apple Inc.', status: 'Declined', totalPrice: 250, deliveryDate: new Date(), rank: 1 },
          { id: 'QUO-SPLIT-G', transactionId: 'REQ-SPLIT-CASE3', vendor: { connect: { id: 'VENDOR-002' } }, vendorName: 'Dell Technologies', status: 'Declined', totalPrice: 150, deliveryDate: new Date(), rank: 1 },
          { id: 'QUO-SPLIT-H', transactionId: 'REQ-SPLIT-CASE3', vendor: { connect: { id: 'VENDOR-004' } }, vendorName: 'HP Inc.', status: 'Standby', totalPrice: 420, deliveryDate: new Date(), rank: 2 },
      ] }
    }
  });

  // SCENARIO 3.2
  await prisma.purchaseRequisition.create({
    data: {
      id: 'REQ-SPLIT-CASE6', transactionId: 'REQ-SPLIT-CASE6', title: 'Partial Award Case 3.2: Both Decline Again',
      requester: { connect: { id: '1' } }, department: { connect: { id: 'DEPT-2' } }, status: 'Award_Declined', totalPrice: 900,
      justification: 'Second test case for both vendors declining.', createdAt: new Date(), updatedAt: new Date(),
      urgency: 'Medium',
      items: { create: [ { id: 'ITEM-SPLIT-N', name: 'Projector', quantity: 1, unitPrice: 600 }, { id: 'ITEM-SPLIT-O', name: 'Projector Screen', quantity: 1, unitPrice: 300 } ] },
      quotations: { create: [
          { id: 'QUO-SPLIT-N', transactionId: 'REQ-SPLIT-CASE6', vendor: { connect: { id: 'VENDOR-001' } }, vendorName: 'Apple Inc.', status: 'Declined', totalPrice: 600, deliveryDate: new Date(), rank: 1 },
          { id: 'QUO-SPLIT-O', transactionId: 'REQ-SPLIT-CASE6', vendor: { connect: { id: 'VENDOR-002' } }, vendorName: 'Dell Technologies', status: 'Declined', totalPrice: 300, deliveryDate: new Date(), rank: 1 },
          { id: 'QUO-SPLIT-P', transactionId: 'REQ-SPLIT-CASE6', vendor: { connect: { id: 'VENDOR-004' } }, vendorName: 'HP Inc.', status: 'Standby', totalPrice: 950, deliveryDate: new Date(), rank: 2 },
      ] }
    }
  });


  console.log('Seeded partial award test scenarios.');
  // --- END: NEW PARTIAL AWARD SEED DATA ---

  // --- START: BULK SEED FOR "READY TO AWARD" AND "READY TO NOTIFY" ---
  console.log('Seeding bulk data for testing...');

  const sampleItems = [
    { name: 'Standard Office Chair', price: 150 },
    { name: 'Ergonomic Keyboard', price: 75 },
    { name: '24-inch Monitor', price: 250 },
    { name: 'Docking Station', price: 180 },
    { name: 'High-Speed Scanner', price: 400 },
    { name: 'Color Laser Printer', price: 600 },
    { name: 'Conference Room Camera', price: 900 },
    { name: 'Whiteboard 4x6 ft', price: 220 },
    { name: 'Noise-Cancelling Headphones', price: 350 },
    { name: 'Developer-Grade Laptop', price: 2500 },
  ];

  // 10 "Ready to Award" (Scoring_Complete)
  for (let i = 1; i <= 10; i++) {
    const item = sampleItems[i-1];
    const reqId = `TEST-AWARD-${i}`;
    await prisma.purchaseRequisition.create({
      data: {
        id: reqId,
        transactionId: reqId,
        title: `Ready to Award ${i}: ${item.name}`,
        requester: { connect: { id: '1' } },
        department: { connect: { id: 'DEPT-3' } },
        status: 'Scoring_Complete',
        totalPrice: item.price * (i+1),
        urgency: 'Medium',
        justification: `Test scenario for Ready to Award case ${i}.`,
        createdAt: new Date(),
        updatedAt: new Date(),
        deadline: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        scoringDeadline: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        financialCommitteeMembers: { connect: [{ id: '9' }] },
        technicalCommitteeMembers: { connect: [{ id: '10' }] },
        items: { create: { id: `ITEM-AWARD-${i}`, name: item.name, quantity: (i+1), unitPrice: item.price } },
        quotations: {
          create: [
            {
              id: `QUO-AWARD-W-${i}`,
              transactionId: reqId,
              vendor: { connect: { id: 'VENDOR-001' } },
              vendorName: 'Apple Inc.',
              status: 'Submitted',
              totalPrice: item.price * (i+1) * 0.95, // Winning quote
              finalAverageScore: 92.5 + i,
              deliveryDate: new Date(),
              items: { create: { id: `QI-AWARD-W-${i}`, requisitionItemId: `ITEM-AWARD-${i}`, name: item.name, quantity: (i+1), unitPrice: item.price * 0.95, leadTimeDays: 10 } },
            },
            {
              id: `QUO-AWARD-L-${i}`,
              transactionId: reqId,
              vendor: { connect: { id: 'VENDOR-002' } },
              vendorName: 'Dell Technologies',
              status: 'Submitted',
              totalPrice: item.price * (i+1),
              finalAverageScore: 85.0 + i,
              deliveryDate: new Date(),
              items: { create: { id: `QI-AWARD-L-${i}`, requisitionItemId: `ITEM-AWARD-${i}`, name: item.name, quantity: (i+1), unitPrice: item.price, leadTimeDays: 8 } },
            },
          ],
        },
      },
    });
  }
  console.log('Seeded 10 "Ready to Award" scenarios.');

  // 10 "Ready to Notify" (PostApproved)
  for (let i = 1; i <= 10; i++) {
    const item = sampleItems[(i + 4) % 10]; // Use different items
    const reqId = `TEST-NOTIFY-${i}`;
    const winnerVendorId = i % 2 === 0 ? 'VENDOR-001' : 'VENDOR-002';
    const winnerVendorName = i % 2 === 0 ? 'Apple Inc.' : 'Dell Technologies';
    const loserVendorId = i % 2 === 0 ? 'VENDOR-002' : 'VENDOR-001';
    const loserVendorName = i % 2 === 0 ? 'Dell Technologies' : 'Apple Inc.';

    await prisma.purchaseRequisition.create({
      data: {
        id: reqId,
        transactionId: reqId,
        title: `Ready to Notify ${i}: ${item.name}`,
        requester: { connect: { id: '1' } },
        department: { connect: { id: 'DEPT-2' } },
        status: 'PostApproved',
        totalPrice: item.price * i,
        urgency: 'Low',
        justification: `Test scenario for Ready to Notify case ${i}.`,
        createdAt: new Date(),
        updatedAt: new Date(),
        deadline: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        scoringDeadline: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        awardedQuoteItemIds: [`QI-NOTIFY-W-${i}`],
        items: { create: { id: `ITEM-NOTIFY-${i}`, name: item.name, quantity: i, unitPrice: item.price } },
        quotations: {
          create: [
            {
              id: `QUO-NOTIFY-W-${i}`,
              transactionId: reqId,
              vendor: { connect: { id: winnerVendorId } },
              vendorName: winnerVendorName,
              status: 'Pending_Award',
              rank: 1,
              totalPrice: item.price * i * 0.9,
              finalAverageScore: 95,
              deliveryDate: new Date(),
              items: { create: { id: `QI-NOTIFY-W-${i}`, requisitionItemId: `ITEM-NOTIFY-${i}`, name: item.name, quantity: i, unitPrice: item.price * 0.9, leadTimeDays: 5 } },
            },
            {
              id: `QUO-NOTIFY-S-${i}`,
              transactionId: reqId,
              vendor: { connect: { id: loserVendorId } },
              vendorName: loserVendorName,
              status: 'Standby',
              rank: 2,
              totalPrice: item.price * i,
              finalAverageScore: 90,
              deliveryDate: new Date(),
              items: { create: { id: `QI-NOTIFY-S-${i}`, requisitionItemId: `ITEM-NOTIFY-${i}`, name: item.name, quantity: i, unitPrice: item.price, leadTimeDays: 7 } },
            },
          ],
        },
      },
    });
  }
  console.log('Seeded 10 "Ready to Notify" scenarios.');

  // --- END: BULK SEED DATA ---


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

    

    



    

    



