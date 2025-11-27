
import { PrismaClient } from '@prisma/client';
import { getInitialData } from '../src/lib/seed-data';
import bcrypt from 'bcryptjs';
import { rolePermissions } from '../src/lib/roles';

const prisma = new PrismaClient();

async function main() {
  console.log(`Start seeding ...`);

  // Clear existing data in a specific order to avoid foreign key constraints
  console.log('Clearing existing data...');
  await prisma.auditLog.deleteMany({});
  await prisma.score.deleteMany({});
  await prisma.itemScore.deleteMany({});
  await prisma.committeeScoreSet.deleteMany({});
  await prisma.standbyAssignment.deleteMany({});
  await prisma.quoteAnswer.deleteMany({});
  await prisma.quoteItem.deleteMany({});
  await prisma.quotation.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.committeeAssignment.deleteMany({});
  await prisma.minute.deleteMany({});
  await prisma.receiptItem.deleteMany({});
  await prisma.goodsReceiptNote.deleteMany({});
  await prisma.invoiceItem.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.pOItem.deleteMany({});
  await prisma.purchaseOrder.deleteMany({});
  await prisma.contract.deleteMany({});
  await prisma.customQuestion.deleteMany({});
  await prisma.financialCriterion.deleteMany({});
  await prisma.technicalCriterion.deleteMany({});
  await prisma.evaluationCriteria.deleteMany({});
  await prisma.requisitionItem.deleteMany({});
  await prisma.purchaseRequisition.deleteMany({});
  await prisma.kYC_Document.deleteMany({});
  await prisma.vendor.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.department.deleteMany({});
  await prisma.approvalStep.deleteMany({});
  await prisma.approvalThreshold.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.setting.deleteMany({});
  console.log('Data cleared.');


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
      await prisma.role.upsert({
        where: { name: role.name.replace(/ /g, '_') },
        update: { description: role.description },
        create: { name: role.name.replace(/ /g, '_'), description: role.description }
      });
  }
  console.log('Seeded roles.');

  // Seed Settings
  await prisma.setting.upsert({
    where: { key: 'rfqSenderSetting' },
    update: {
        value: {
            type: 'all'
        }
    },
    create: {
      key: 'rfqSenderSetting',
      value: {
        type: 'all' // or 'specific'
        // userId: 'some-user-id' // if type is 'specific'
      }
    }
  });

  await prisma.setting.upsert({
    where: { key: 'requisitionCreatorSetting' },
    update: {
        value: {
            type: 'all_users'
        }
    },
    create: {
      key: 'requisitionCreatorSetting',
      value: {
        type: 'all_users' // or 'specific_roles'
        // allowedRoles: ['Requester', 'Procurement_Officer'] // if type is 'specific_roles'
      }
    }
  });

  await prisma.setting.upsert({
      where: { key: 'committeeConfig' },
      update: {
        value: {
            A: { min: 200001, max: 1000000 },
            B: { min: 10001, max: 200000 }
        }
      },
      create: {
          key: 'committeeConfig',
          value: {
              A: { min: 200001, max: 1000000 },
              B: { min: 10001, max: 200000 }
          }
      }
  });

  await prisma.setting.upsert({
    where: { key: 'rolePermissions' },
    update: {
        value: rolePermissions,
    },
    create: {
        key: 'rolePermissions',
        value: rolePermissions,
    }
  });

  await prisma.setting.upsert({
    where: { key: 'rfqQuorum' },
    update: {
        value: 3,
    },
    create: {
        key: 'rfqQuorum',
        value: 3,
    }
  });

  await prisma.setting.upsert({
    where: { key: 'committeeQuorum' },
    update: {
        value: 2,
    },
    create: {
        key: 'committeeQuorum',
        value: 2,
    }
  });

  console.log('Seeded settings.');

  // Seed Approval Matrix
  const defaultApprovalThresholds = [
    { name: 'Low Value', min: 0, max: 10000, steps: [{ role: 'Manager_Procurement_Division'}] },
    { name: 'Mid Value', min: 10001, max: 200000, steps: [{ role: 'Committee_B_Member'}, { role: 'Manager_Procurement_Division'}, { role: 'Director_Supply_Chain_and_Property_Management'}] },
    { name: 'High Value', min: 200001, max: 1000000, steps: [{ role: 'Committee_A_Member'}, { role: 'Director_Supply_Chain_and_Property_Management'}, { role: 'VP_Resources_and_Facilities'}] },
    { name: 'Very-High Value', min: 1000001, max: null, steps: [{ role: 'Committee_A_Member'}, { role: 'VP_Resources_and_Facilities'}, { role: 'President'}] },
  ];

  for (const tier of defaultApprovalThresholds) {
    const createdThreshold = await prisma.approvalThreshold.upsert({
      where: { name: tier.name },
      update: { min: tier.min, max: tier.max },
      create: {
        name: tier.name,
        min: tier.min,
        max: tier.max,
      },
    });

    // Clear old steps before adding new ones
    await prisma.approvalStep.deleteMany({ where: { thresholdId: createdThreshold.id }});

    for (let i = 0; i < tier.steps.length; i++) {
      await prisma.approvalStep.create({
        data: {
          threshold: { connect: { id: createdThreshold.id } },
          role: { connect: { name: tier.steps[i].role } },
          order: i,
        },
      });
    }
  }
  console.log('Seeded approval matrix.');


  // Seed Departments without heads first
  for (const department of seedData.departments) {
    const { head, users, headId, ...deptData } = department;
    await prisma.department.upsert({
      where: { id: deptData.id },
      update: deptData,
      create: deptData,
    });
  }
  console.log('Seeded departments.');

  // Seed non-vendor users first
  for (const user of seedData.users.filter(u => u.role !== 'Vendor')) {
    const { committeeAssignments, department, departmentId, vendorId, password, managingDepartment, ...userData } = user;
    const hashedPassword = await bcrypt.hash(password || 'password123', 10);
    const formattedRoleName = userData.role.replace(/ /g, '_');

    await prisma.user.upsert({
      where: { id: user.id },
      update: {
          name: userData.name,
          email: userData.email,
          roles: { connect: { name: formattedRoleName } },
          department: departmentId ? { connect: { id: departmentId } } : undefined,
      },
      create: {
          id: userData.id,
          name: userData.name,
          email: userData.email,
          password: hashedPassword,
          roles: { connect: { name: formattedRoleName } },
          department: departmentId ? { connect: { id: departmentId } } : undefined,
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
      const formattedRoleName = vendorUser.role.replace(/ /g, '_');

      // Create user for the vendor first
      const createdUser = await prisma.user.upsert({
          where: { id: vendorUser.id },
          update: {
              name: vendorUser.name,
              email: vendorUser.email,
              roles: { connect: { name: formattedRoleName } },
          },
          create: {
              id: vendorUser.id,
              name: vendorUser.name,
              email: vendorUser.email,
              password: hashedPassword,
              roles: { connect: { name: formattedRoleName } },
          }
      });

    // Then create the vendor and link it to the user
    const createdVendor = await prisma.vendor.upsert({
      where: { id: vendor.id },
      update: {
          name: vendor.name,
          contactPerson: vendor.contactPerson,
          email: vendor.email,
          phone: vendor.phone,
          address: vendor.address,
          kycStatus: vendor.kycStatus.replace(/ /g, '_') as any,
          userId: createdUser.id,
      },
      create: {
          id: vendor.id,
          name: vendor.name,
          contactPerson: vendor.contactPerson,
          email: vendor.email,
          phone: vendor.phone,
          address: vendor.address,
          kycStatus: vendor.kycStatus.replace(/ /g, '_') as any,
          userId: createdUser.id,
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
                    submittedAt: new Date(doc.submittedAt),
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
          totalPrice,
          ...reqData
      } = requisition;

      const createdRequisition = await prisma.purchaseRequisition.upsert({
          where: { id: reqData.id },
          update: {},
          create: {
              ...reqData,
              status: reqData.status.replace(/ /g, '_') as any,
              urgency: reqData.urgency || 'Low',
              totalPrice: totalPrice,
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
              await prisma.requisitionItem.upsert({
                  where: { id: item.id },
                  update: { ...item },
                  create: {
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
              await prisma.customQuestion.upsert({
                  where: { id: question.id },
                  update: { ...question },
                  create: {
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

       const createdQuote = await prisma.quotation.upsert({
           where: { id: quote.id },
           update: {},
           create: {
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
               await prisma.quoteItem.upsert({
                   where: { id: item.id },
                   update: { ...item },
                   create: {
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
        const { items, receipts, invoices, vendorId, ...poData } = po;

        const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: po.requisitionId }});
        if (!requisition) {
            console.warn(`Skipping PO ${po.id} because its requisition ${po.requisitionId} was not found.`);
            continue;
        }

        const createdPO = await prisma.purchaseOrder.upsert({
            where: { id: po.id },
            update: {},
            create: {
                ...poData,
                status: poData.status.replace(/ /g, '_') as any,
                createdAt: new Date(poData.createdAt),
                vendorId: vendorId,
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
        const createdInvoice = await prisma.invoice.upsert({
            where: { id: invoice.id },
            update: {},
            create: {
                ...invoiceData,
                status: invoiceData.status.replace(/_/g, '_') as any,
                invoiceDate: new Date(invoiceData.invoiceDate),
                paymentDate: invoiceData.paymentDate ? new Date(invoiceData.paymentDate) : undefined,
            }
        });

        if (items) {
            for (const item of items) {
                await prisma.invoiceItem.upsert({
                    where: { id: item.id },
                    update: {},
                    create: {
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
        const createdGrn = await prisma.goodsReceiptNote.upsert({
            where: { id: grn.id },
            update: {},
            create: {
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
    await prisma.auditLog.upsert({
      where: { id: log.id },
      update: {},
      create: {
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
