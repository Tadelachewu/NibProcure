
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { User, UserRole } from '@/lib/types';

export async function POST(request: Request) {
    try {
        const { email, password } = await request.json();

        const user = await prisma.user.findUnique({
            where: { email },
            include: {
                vendor: true,
                department: true,
            }
        });

        if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
            return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
        }

        const { password: _, ...userWithoutPassword } = user;
        
        const finalUser: User = {
            ...userWithoutPassword,
            role: user.role as UserRole,
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
                role: finalUser.role,
                vendorId: finalUser.vendorId,
                department: finalUser.department,
            }, 
            jwtSecret, 
            { expiresIn: '1d' } // Token expires in 1 day
        );
        
        return NextResponse.json({ 
            user: finalUser, 
            token, 
            role: finalUser.role
        });

    } catch (error) {
        console.error('Login error:', error);
        if (error instanceof Error) {
            return NextResponse.json({ error: 'An internal server error occurred', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
    }
}
