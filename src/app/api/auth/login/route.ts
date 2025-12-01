'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { User, UserRole } from '@/lib/types';
import { z } from 'zod';

// Define a hierarchy or precedence for roles. Higher number = higher precedence.
const rolePrecedence: Record<string, number> = {
  Admin: 10,
  Procurement_Officer: 9,
  Committee: 8,
  Finance: 7,
  Approver: 6,
  Receiving: 5,
  Requester: 4,
  Committee_A_Member: 3,
  Committee_B_Member: 3,
  Committee_Member: 3,
  Manager_Procurement_Division: 7,
  Director_Supply_Chain_and_Property_Management: 7,
  VP_Resources_and_Facilities: 7,
  President: 7,
  Vendor: 1,
};

const getPrimaryRole = (roles: {name: string}[]): UserRole | null => {
    if (!roles || roles.length === 0) return null;
    
    const roleNames = roles.map(r => r.name);
    
    // Sort by precedence (descending)
    roleNames.sort((a, b) => (rolePrecedence[b] || 0) - (rolePrecedence[a] || 0));
    
    return (roleNames[0] as UserRole) || null;
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});


export async function POST(request: Request) {
    try {
        const body = await request.json();
        const validation = loginSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid request data', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { email, password } = validation.data;

        const user = await prisma.user.findUnique({
            where: { email },
            include: {
                vendor: true,
                department: true,
                roles: true,
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
            
            const roleNames = user.roles.map(r => r.name as UserRole);

            const finalUser: Omit<User, 'roles'> & { roles: UserRole[] } = {
                ...userWithoutPassword,
                department: user.department?.name,
                roles: roleNames, // Return a simple array of role names
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
                    roles: roleNames, // Token contains the array of role names
                    vendorId: finalUser.vendorId,
                    department: finalUser.department,
                }, 
                jwtSecret, 
                { expiresIn: '1d' }
            );
            
            return NextResponse.json({ 
                user: finalUser, 
                token, 
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
