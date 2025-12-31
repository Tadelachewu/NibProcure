"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { getActorFromToken } from '@/lib/auth';
import { sendEmail } from '@/services/email-service';

const DIRECTOR_ROLES = ['Procurement_Director', 'Finance_Director', 'Facility_Director'];

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Only allow Admin or Procurement_Officer or RFQ senders
    const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
    const userRoles = actor.roles as string[];
    let isAuthorized = false;
    if (userRoles.includes('Admin')) isAuthorized = true;
    if (userRoles.includes('Procurement_Officer')) isAuthorized = true;
    if (rfqSenderSetting?.value && typeof rfqSenderSetting.value === 'object' && rfqSenderSetting.value.type === 'specific' && Array.isArray(rfqSenderSetting.value.userIds) && rfqSenderSetting.value.userIds.includes(actor.id)) isAuthorized = true;
    if (!isAuthorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { id } = params;
    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id } });
    if (!requisition) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    const createdPins: any[] = [];
    for (const roleName of DIRECTOR_ROLES) {
      const pin = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
      const hash = await bcrypt.hash(pin, 10);

      const pinRecord = await prisma.pin.create({
        data: {
          requisition: { connect: { id } },
          roleName,
          pinHash: hash,
          generatedById: actor.id,
          expiresAt,
        }
      });

      // Notify users with this role via email
      const usersWithRole = await prisma.user.findMany({ where: { roles: { some: { name: roleName } } } });
      for (const u of usersWithRole) {
        if (u.email) {
          await sendEmail({
            to: u.email,
            subject: `[NibProcure] Verification Pin for Requisition ${requisition.id}`,
            html: `<p>Hello ${u.name},</p><p>A verification PIN has been generated for you to unmask vendor quotations for requisition <strong>${requisition.title}</strong> (${requisition.id}).</p><p>Your PIN (valid 1 hour): <strong>${pin}</strong></p><p>Please keep this PIN private. It will be used to confirm your presence at the RFQ meeting.</p>`
          });
        }
      }

      createdPins.push({ roleName, expiresAt });
    }

    await prisma.auditLog.create({
      data: {
        transactionId: requisition.transactionId,
        user: { connect: { id: actor.id } },
        timestamp: new Date(),
        action: 'GENERATE_PINS',
        entity: 'Requisition',
        entityId: id,
        details: `Generated verification pins for roles: ${DIRECTOR_ROLES.join(', ')}`,
      }
    });

    return NextResponse.json({ ok: true, pins: createdPins });
  } catch (error) {
    console.error('Failed to generate pins:', error);
    return NextResponse.json({ error: 'Failed to generate pins' }, { status: 500 });
  }
}
