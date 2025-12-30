
'use server';

import { prisma } from '@/lib/prisma';
import { UserRole } from '@/lib/types';
import crypto from 'crypto';

const DIRECTOR_ROLES: UserRole[] = [
    'Finance_Director',
    'Facility_Director',
    'Director_Supply_Chain_and_Property_Management'
];

/**
 * Generates a unique 6-digit PIN for each director for a specific requisition.
 * This should be triggered when a requisition's quotation deadline is met.
 * @param requisitionId - The ID of the requisition to generate PINs for.
 */
export async function generateAndAssignPins(requisitionId: string) {
    console.log(`Generating PINs for requisition: ${requisitionId}`);

    const directors = await prisma.user.findMany({
        where: {
            roles: {
                some: {
                    name: {
                        in: DIRECTOR_ROLES,
                    },
                },
            },
        },
    });

    if (directors.length === 0) {
        console.warn('No directors found to assign PINs to.');
        return;
    }

    const pinCreationPromises = directors.map(director => {
        const pin = crypto.randomInt(100000, 999999).toString().padStart(6, '0');
        
        return prisma.directorPin.upsert({
            where: {
                userId_requisitionId: {
                    userId: director.id,
                    requisitionId: requisitionId,
                }
            },
            update: {
                pin: pin,
            },
            create: {
                pin: pin,
                userId: director.id,
                requisitionId: requisitionId,
            }
        });
    });

    try {
        await Promise.all(pinCreationPromises);
        await prisma.purchaseRequisition.update({
            where: { id: requisitionId },
            data: { bidsOpened: false }
        });
        console.log(`Successfully generated and assigned PINs for ${directors.length} directors for requisition ${requisitionId}.`);
    } catch (error) {
        console.error('Failed to generate one or more director PINs:', error);
        // Depending on requirements, you might want to throw the error
        // to handle it in the calling function (e.g., show a toast to the user).
    }
}

/**
 * Fetches active PINs for a specific user.
 * @param userId - The ID of the user (a director).
 * @returns A list of active PINs with their associated requisition details.
 */
export async function getActivePinsForUser(userId: string) {
    try {
        const pins = await prisma.directorPin.findMany({
            where: {
                userId: userId,
                // Add any logic to filter for "active" requisitions, e.g., not closed
                requisition: {
                    status: {
                        notIn: ['Closed', 'Fulfilled', 'Rejected']
                    },
                    bidsOpened: false, // Only show PINs for requisitions where bids are not yet opened.
                }
            },
            include: {
                requisition: {
                    select: {
                        id: true,
                        title: true,
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        return pins;
    } catch (error) {
        console.error(`Failed to fetch PINs for user ${userId}:`, error);
        return [];
    }
}
