
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { User, UserRole } from '@/lib/types';

export async function POST(request: Request) {
    console.log('[API /login] Received login request.');
    try {
        const { email, password } = await request.json();
        console.log(`[API /login] Attempting to log in user: ${email}`);

        const user = await prisma.user.findUnique({
            where: { email },
            include: {
                vendor: true,
                department: true,
            }
        });

        if (!user || !user.password) {
            console.error(`[API /login] User not found or has no password: ${email}`);
            return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
        }
        
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            console.error(`[API /login] Password mismatch for user: ${email}`);
            return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
        }
        
        console.log(`[API /login] User authenticated successfully: ${email}`);

        const { password: _, ...userWithoutPassword } = user;
        
        const finalUser: User = {
            ...userWithoutPassword,
            role: user.role as UserRole,
            department: user.department?.name,
        };

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error('[API /login] JWT_SECRET is not defined!');
            throw new Error('JWT_SECRET is not defined in environment variables.');
        }

        const token = jwt.sign(
            { 
                id: finalUser.id, 
                name: finalUser.name,
                email: finalUser.email,
                role: finalUser.role,
                vendorId: finalUser.vendorId,
                department: finalUser.department,
            }, 
            jwtSecret, 
            { expiresIn: '1d' } // Token expires in 1 day
        );
        
        console.log(`[API /login] JWT token generated for user: ${email}. Role: ${finalUser.role}`);
        
        return NextResponse.json({ 
            user: finalUser, 
            token, 
            role: finalUser.role
        });

    } catch (error) {
        console.error('[API /login] An unexpected error occurred during login:', error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'An internal server error occurred', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
    }
}
