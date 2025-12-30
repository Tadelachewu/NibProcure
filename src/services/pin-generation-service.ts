
'use server';

import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

const DIRECTOR_ROLES = [
    'Director_Supply_Chain_and_Property_Management',
    'Finance_Director',
    'Facility_Director',
];

/**
 * Generates a random 6-digit PIN.
 */
function generatePin(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Finds director users, generates a unique PIN for each, hashes it,
 * and stores it in the database for a specific requisition.
 * @param requisitionId - The ID of the requisition to associate the PINs with.
 */
export async function generatePinsForRequisition(requisitionId: string) {
    console.log(`Generating PINs for requisition: ${requisitionId}`);
    try {
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
            console.warn('No directors found with the specified roles. No PINs will be generated.');
            return { success: false, message: 'No directors found.' };
        }
        
        for (const director of directors) {
            const pin = generatePin();
            const hashedPin = await bcrypt.hash(pin, 10);
            
            // Store the plain text PIN temporarily for display on the dashboard
            // In a real production system, you'd send this via a secure channel (e.g., email) and not store it plain.
            // For this project, we will store it for demonstration purposes on the dashboard.
            const createdPin = await prisma.directorPin.upsert({
                where: {
                    requisitionId_userId: {
                        requisitionId,
                        userId: director.id,
                    },
                },
                update: {
                    hashedPin,
                    status: 'Active',
                    // Also store the plain pin for dashboard display - FOR DEMO ONLY
                    pin: pin,
                },
                create: {
                    requisitionId,
                    userId: director.id,
                    hashedPin,
                    status: 'Active',
                    // Also store the plain pin for dashboard display - FOR DEMO ONLY
                    pin: pin,
                },
            });
            console.log(`Generated PIN for ${director.name} for requisition ${requisitionId}`);
        }
        
        return { success: true, message: `Successfully generated PINs for ${directors.length} directors.` };

    } catch (error) {
        console.error('Failed to generate PINs for requisition:', error);
        return { success: false, message: 'Failed to generate PINs.', error };
    }
}
