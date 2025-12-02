
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { User, UserRole } from '@/lib/types';

// TODO: Add rate limiting to this route to prevent brute-force attacks.
// Example using a hypothetical rate-limiter:
// import { rateLimiter } from '@/lib/rate-limiter';
// await rateLimiter(request);

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
            const { password: _, roles: roleInfo, ...userWithoutPassword } = user;
            
            const finalUser: User = {
                ...userWithoutPassword,
                roles: roleInfo.map(r => r.name as UserRole), // Use the role name from the relation
                department: user.department?.name,
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
                    roles: finalUser.roles,
                    vendorId: finalUser.vendorId,
                    department: finalUser.department,
                }, 
                jwtSecret, 
                { expiresIn: '1d' } // Token expires in 1 day
            );
            
            return NextResponse.json({ 
                user: finalUser, 
                token, 
                roles: finalUser.roles // Ensure this top-level role is present
            });
        }
        
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });

    } catch (error) {
        console.error('Login error:', error instanceof Error ? error.message : 'An unknown error occurred');
        return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
    }
}
