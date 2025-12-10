
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const whereClauseForUser: any = { requesterId: actor.id };
    if (actor.roles.includes('Admin') || actor.roles.includes('Procurement_Officer')) {
        // Admins and POs see system-wide stats, so no user-specific filter
        delete whereClauseForUser.requesterId;
    }


    const [
      requisitionStats,
      invoiceStats,
      poStats
    ] = await prisma.$transaction([
      prisma.purchaseRequisition.groupBy({
        by: ['status'],
        _count: {
          status: true,
        },
        where: whereClauseForUser,
      }),
      prisma.invoice.groupBy({
        by: ['status'],
        _count: {
          status: true,
        },
        _sum: {
            totalAmount: true,
        },
      }),
      prisma.purchaseOrder.groupBy({
          by: ['status'],
          _count: {
              status: true,
          }
      })
    ]);

    const formatStats = (stats: any[], keyField: string) => {
        return stats.reduce((acc, curr) => {
            acc[curr[keyField]] = curr._count[keyField];
            return acc;
        }, {});
    };

    const formattedReqStats = formatStats(requisitionStats, 'status');
    const formattedPoStats = formatStats(poStats, 'status');
    
    const readyForRfq = formattedReqStats['PreApproved'] || 0;
    const acceptingQuotes = formattedReqStats['Accepting_Quotes'] || 0;
    const scoringInProgress = formattedReqStats['Scoring_In_Progress'] || 0;
    const scoringComplete = formattedReqStats['Scoring_Complete'] || 0;
    const awardDeclined = formattedReqStats['Award_Declined'] || 0;

    const totalPaid = invoiceStats.find(s => s.status === 'Paid')?._sum.totalAmount || 0;
    const totalUnpaid = invoiceStats.filter(s => s.status !== 'Paid').reduce((acc, s) => acc + (s._sum.totalAmount || 0), 0);

    const pendingReview = requisitions.filter(r => r.status.startsWith('Pending_') && r.status !== 'Pending_Approval').length;
    const pendingDepartmentalApproval = requisitions.filter(r => r.status === 'Pending_Approval').length;

    const dashboardData = {
        requester: {
            drafts: formattedReqStats['Draft'] || 0,
            pending: pendingDepartmentalApproval,
            rejected: formattedReqStats['Rejected'] || 0,
        },
        approver: {
            departmental: pendingDepartmentalApproval,
            award: pendingReview,
        },
        procurement: {
            readyForRfq,
            acceptingQuotes,
            scoringInProgress,
            scoringComplete,
            awardDeclined,
            pendingFinalReview: pendingReview,
            totalPaid,
            totalUnpaid,
        },
        finance: {
            pending: invoiceStats.find(s => s.status === 'Pending')?._count.status || 0,
            approved: invoiceStats.find(s => s.status === 'Approved_for_Payment')?._count.status || 0,
            disputed: invoiceStats.find(s => s.status === 'Disputed')?._count.status || 0,
            totalPaid,
            totalUnpaid
        },
        receiving: {
            readyToReceive: (formattedPoStats['Issued'] || 0) + (formattedPoStats['Acknowledged'] || 0) + (formattedPoStats['Shipped'] || 0) + (formattedPoStats['Partially_Delivered'] || 0),
        },
        // Add more role-specific data as needed
    };

    return NextResponse.json(dashboardData);

  } catch (error) {
    console.error("Failed to fetch dashboard data:", error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
