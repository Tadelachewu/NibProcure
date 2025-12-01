'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { User, UserRole } from '@/lib/types';
import { z } from 'zod';

// TODO: Implement rate limiting to prevent brute-force attacks
// For example, using a library like `upstash/ratelimit`.

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
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        if (user && user.password && await bcrypt.compare(password, user.password)) {
            const { password: _, ...userWithoutPassword } = user;
            
            const roleNames = user.roles.map(r => r.name as UserRole);

            // Sanitize the user object before sending it to the client.
            // NEVER return the full user object from the database.
            const finalUser: User = {
                id: user.id,
                name: user.name,
                email: user.email,
                roles: roleNames,
                vendorId: user.vendorId,
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
                { expiresIn: '1d' }
            );
            
            return NextResponse.json({ 
                user: finalUser, 
                token, 
            });
        }
        
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

    } catch (error) {
        console.error('Login error:', error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'An internal server error occurred', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
    }
}
