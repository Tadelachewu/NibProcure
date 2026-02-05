
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken, isAdmin } from '@/lib/auth';

export async function GET() {
    try {
        const settings = await prisma.setting.findMany();
        return NextResponse.json(settings);
    } catch (error) {
        console.error("Failed to fetch settings:", error);
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const actor = await getActorFromToken(request);
        if (!isAdmin(actor)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { key, value } = body;

        if (!key || value === undefined) {
            return NextResponse.json({ error: 'Key and value are required.' }, { status: 400 });
        }

        // Handle committeeConfig cascade: if committees were removed from the config,
        // also delete their corresponding roles; if new committees were added, ensure a role exists.
        let updatedSetting;
        if (key === 'committeeConfig') {
            const existing = await prisma.setting.findUnique({ where: { key } });
            const oldConfig = existing?.value && typeof existing.value === 'object' ? existing.value as Record<string, any> : {};
            const newConfig = typeof value === 'object' ? value as Record<string, any> : {};

            const oldKeys = new Set(Object.keys(oldConfig || {}));
            const newKeys = new Set(Object.keys(newConfig || {}));

            const removed = Array.from(oldKeys).filter(k => !newKeys.has(k));
            const added = Array.from(newKeys).filter(k => !oldKeys.has(k));

            await prisma.$transaction(async (tx) => {
                // Upsert the setting first
                updatedSetting = await tx.setting.upsert({ where: { key }, update: { value }, create: { key, value } });

                // Define core roles that must not be removed
                const coreRoles: string[] = [
                    'Admin', 'Procurement_Officer', 'Requester', 'Approver', 'Vendor', 'Finance', 'Receiving', 'Committee',
                    'Committee_A_Member', 'Committee_B_Member', 'Committee_Member', 'Manager_Procurement_Division',
                    'Director_Supply_Chain_and_Property_Management', 'VP_Resources_and_Facilities', 'President'
                ].map(r => r.toUpperCase());

                // Remove roles for deleted committees
                for (const keyName of removed) {
                    const roleName = `Committee_${keyName}_Member`;
                    const role = await tx.role.findFirst({ where: { name: { equals: roleName, mode: 'insensitive' } } });
                    if (role && !coreRoles.includes(role.name.toUpperCase())) {
                        await tx.role.delete({ where: { id: role.id } });
                    }
                }

                // Ensure roles exist for newly added committees
                for (const keyName of added) {
                    const roleName = `Committee_${keyName}_Member`;
                    const role = await tx.role.findFirst({ where: { name: { equals: roleName, mode: 'insensitive' } } });
                    if (!role) {
                        await tx.role.create({ data: { name: roleName, description: `Member of the ${keyName} review committee.` } });
                        // Also ensure rolePermissions has an entry for this role
                        const permissionsSetting = await tx.setting.findUnique({ where: { key: 'rolePermissions' } });
                        if (permissionsSetting) {
                            const currentPermissions = permissionsSetting.value as any;
                            currentPermissions[roleName] = currentPermissions[roleName] || [];
                            await tx.setting.update({ where: { key: 'rolePermissions' }, data: { value: currentPermissions } });
                        }
                    }
                }
            });

            return NextResponse.json(updatedSetting, { status: 200 });
        } else {
            updatedSetting = await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
            return NextResponse.json(updatedSetting, { status: 200 });
        }

    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Failed to save setting:', error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
