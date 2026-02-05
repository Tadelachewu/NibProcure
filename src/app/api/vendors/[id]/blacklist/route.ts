"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken, isAdmin } from '@/lib/auth';
import { sendEmail } from '@/services/email-service';

export async function POST(request: Request, context: { params: any }) {
    try {
        const actor = await getActorFromToken(request);
        if (!isAdmin(actor) && !((actor.roles || []).includes('Procurement_Officer'))) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        const params = await context.params;
        const { id } = params;
        const body = await request.json().catch(() => ({} as any));
        const reason = body.reason || 'No reason provided';

        const key = `vendor:blacklist:${id}`;
        const value = { blacklisted: true, reason, updatedBy: actor.id, updatedAt: new Date().toISOString() };

        await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });

        await prisma.auditLog.create({
            data: {
                transactionId: null,
                user: { connect: { id: actor.id } },
                timestamp: new Date(),
                action: 'VENDOR_BLACKLISTED',
                entity: 'Vendor',
                entityId: id,
                details: `Vendor ${id} blacklisted. Reason: ${reason}`,
            }
        });

        // notify vendor by email when possible
        const vendor = await prisma.vendor.findUnique({ where: { id } });
        if (vendor?.email) {
            await sendEmail({ to: vendor.email, subject: 'You have been blacklisted', html: `<p>Dear ${vendor.name},</p><p>Your vendor account has been blacklisted for the following reason:</p><p>${reason}</p><p>If you believe this is an error please contact procurement.</p>` }).catch(() => null);
        }

        return NextResponse.json({ ok: true, key, value });
    } catch (err) {
        console.error('Failed to blacklist vendor', err);
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: { params: any }) {
    try {
        const actor = await getActorFromToken(request);
        if (!isAdmin(actor) && !((actor.roles || []).includes('Procurement_Officer'))) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        const params = await context.params;
        const { id } = params;
        const key = `vendor:blacklist:${id}`;

        // remove blacklist entry if present
        await prisma.setting.deleteMany({ where: { key } });

        await prisma.auditLog.create({
            data: {
                transactionId: null,
                user: { connect: { id: actor.id } },
                timestamp: new Date(),
                action: 'VENDOR_UNBLACKLISTED',
                entity: 'Vendor',
                entityId: id,
                details: `Vendor ${id} removed from blacklist.`,
            }
        });

        const vendor = await prisma.vendor.findUnique({ where: { id } });
        if (vendor?.email) {
            await sendEmail({ to: vendor.email, subject: 'Blacklist removed', html: `<p>Dear ${vendor.name},</p><p>Your vendor account has been removed from the blacklist and may now participate in procurement.</p>` }).catch(() => null);
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('Failed to remove vendor from blacklist', err);
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
}
