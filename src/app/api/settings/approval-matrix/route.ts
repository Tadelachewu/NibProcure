
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApprovalThreshold } from '@/lib/types';
import { getActorFromToken } from '@/lib/auth';

export async function GET() {
  try {
    const thresholds = await prisma.approvalThreshold.findMany({
      include: {
        steps: {
          include: {
            role: true, // Include the full Role object
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
      orderBy: {
        min: 'asc'
      }
    });
    
    // Format the response to match what the client expects
    const formattedThresholds = thresholds.map(t => ({
      ...t,
      steps: t.steps.map(s => ({
        ...s,
        role: s.role.name // Flatten the role object to just the name
      }))
    }));

    return NextResponse.json(formattedThresholds);
  } catch (error) {
    console.error("Failed to fetch approval matrix:", error instanceof Error ? error.message : 'An unknown error occurred');
    return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor || !(actor.roles as string[]).includes('Admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const newThresholds: ApprovalThreshold[] = await request.json();

    // Use a transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Delete all existing steps and thresholds
      await tx.approvalStep.deleteMany({});
      await tx.approvalThreshold.deleteMany({});

      const createdThresholds = [];
      for (const tier of newThresholds) {
        const createdThreshold = await tx.approvalThreshold.create({
          data: {
            name: tier.name,
            min: tier.min,
            max: tier.max,
          },
        });

        if (tier.steps && tier.steps.length > 0) {
            const stepsToCreate = tier.steps.map((step, index) => ({
              thresholdId: createdThreshold.id,
              roleName: step.role, // Connect using the role name
              order: index,
            }));
            
            for (const stepData of stepsToCreate) {
              await tx.approvalStep.create({
                data: {
                  threshold: { connect: { id: stepData.thresholdId } },
                  role: { connect: { name: stepData.roleName } },
                  order: stepData.order,
                }
              });
            }
        }
        
        createdThresholds.push({
            ...createdThreshold,
            steps: tier.steps || []
        });
      }
      return createdThresholds;
    });

    return NextResponse.json(result, { status: 200 });

  } catch (error) {
    console.error("Failed to update approval matrix:", error instanceof Error ? error.message : 'An unknown error occurred');
    return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
  }
}
