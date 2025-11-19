
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { User, UserRole } from '@/lib/types';

// Define a hierarchy or precedence for roles. Higher number = higher precedence.
const rolePrecedence: Record<string, number> = {
  Admin: 10,
  Procurement_Officer: 9,
  Finance: 8,
  Approver: 7,
  Receiving: 6,
  Requester: 5,
  Committee: 4,
  Committee_A_Member: 3,
  Committee_B_Member: 3,
  Committee_Member: 3,
  Manager_Procurement_Division: 7,
  Director_Supply_Chain_and_Property_Management: 7,
  VP_Resources_and_Facilities: 7,
  President: 7,
  Vendor: 1,
};

const getPrimaryRole = (roles: {name: UserRole}[]): UserRole | null => {
    if (!roles || roles.length === 0) return null;
    
    const roleNames = roles.map(r => r.name);
    
    // Sort by precedence (descending)
    roleNames.sort((a, b) => (rolePrecedence[b] || 0) - (rolePrecedence[a] || 0));
    
    return (roleNames[0] as UserRole) || null;
}

export async function POST(request: Request) {
    try {
        const { email, password } = await request.json();

        const user = await prisma.user.findUnique({
            where: { email },
            include: {
                vendor: true,
                department: true,
                roles: true, // Include the roles relation
            }
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (user && user.password && await bcrypt.compare(password, user.password)) {
            const { password: _, ...userWithoutPassword } = user;
            
            const primaryRole = getPrimaryRole(user.roles);
            if (!primaryRole) {
                return NextResponse.json({ error: 'User has no assigned role.' }, { status: 403 });
            }

            const finalUser: User = {
                ...userWithoutPassword,
                department: user.department?.name,
                // Pass the full roles array to the token and user object
                roles: user.roles, 
            };

            const jwtSecret = process.env.JWT_SECRET;
            if (!jwtSecret) {
                throw new Error('JWT_SECRET is not defined in environment variables.');
            }

            const token = jwt.sign(
                { 
                    id: finalUser.id, 
                    name: finalUser.name,
                    email: finalUser.email,
                    // The token should contain all roles for context
                    roles: user.roles.map(r => r.name),
                    vendorId: finalUser.vendorId,
                    department: finalUser.department,
                }, 
                jwtSecret, 
                { expiresIn: '1d' } // Token expires in 1 day
            );
            
            return NextResponse.json({ 
                user: finalUser, 
                token, 
                // Return the single primary role for the auth context to use
                role: primaryRole
            });
        }
        
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });

    } catch (error) {
        console.error('Login error:', error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'An internal server error occurred', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
    }
}
