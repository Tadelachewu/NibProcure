
'use server';

import { prisma } from '@/lib/prisma';
import { UserRole } from '@/lib/types';
import { add } from 'date-fns';

const PIN_EXPIRY_DAYS = 7;

/**
 * Generates a unique 6-digit PIN.
 * @returns A unique 6-digit PIN as a string.
 */
async function generateUniquePin(tx: any): Promise<string> {
  let pin: string;
  let isUnique = false;

  do {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
    const existingPin = await tx.directorPin.findUnique({ where: { pin } });
    if (!existingPin) {
      isUnique = true;
    }
  } while (!isUnique);

  return pin;
}

/**
 * Generates and assigns PINs to specified directorial roles for a given requisition.
 * This should be triggered when a requisition's quote submission deadline passes.
 * @param requisitionId The ID of the requisition.
 */
export async function generateDirectorPins(requisitionId: string) {
  console.log(`Generating PINs for requisition: ${requisitionId}`);
  
  const directorRoles: UserRole[] = [
    'Finance_Director',
    'Facility_Director',
    'Director_Supply_Chain_and_Property_Management',
  ];
  
  try {
    const directors = await prisma.user.findMany({
      where: {
        roles: {
          some: {
            name: { in: directorRoles },
          },
        },
      },
    });

    if (directors.length === 0) {
      console.warn('No directors found for PIN generation.');
      return;
    }

    const expiresAt = add(new Date(), { days: PIN_EXPIRY_DAYS });

    await prisma.$transaction(async (tx) => {
      for (const director of directors) {
        const pin = await generateUniquePin(tx);

        await tx.directorPin.upsert({
          where: {
            requisitionId_userId: {
              requisitionId,
              userId: director.id,
            },
          },
          update: {
            pin,
            expiresAt,
          },
          create: {
            pin,
            requisitionId,
            userId: director.id,
            expiresAt,
          },
        });
        console.log(`Generated PIN for director ${director.name} for requisition ${requisitionId}`);
      }
    });

  } catch (error) {
    console.error(`Failed to generate director PINs for requisition ${requisitionId}:`, error);
  }
}
