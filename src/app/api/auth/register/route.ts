
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { User, UserRole } from '@/lib/types';
import { registerSchema } from '@/lib/schemas';
import { ZodError } from 'zod';


export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, email, password, role, vendorDetails } = registerSchema.parse(body);


        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const vendorRole = await prisma.role.findUnique({ where: { name: 'Vendor' } });
        if (!vendorRole) {
            return NextResponse.json({ error: 'Vendor role not found. Please seed the database.' }, { status: 500 });
        }

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                roles: {
                    connect: { id: vendorRole.id }
                }
            }
        });
        
        let newVendor;
        if (role === 'Vendor' && vendorDetails) {
            newVendor = await prisma.vendor.create({
                data: {
                    name: name,
                    contactPerson: vendorDetails.contactPerson,
                    email: email,
                    phone: vendorDetails.phone,
                    address: vendorDetails.address,
                    user: { connect: { id: newUser.id } },
                    kycStatus: 'Pending',
                    kycDocuments: {
                        create: [
                            { name: 'Business License', url: vendorDetails.licensePath, submittedAt: new Date() },
                            { name: 'Tax ID Document', url: vendorDetails.taxIdPath, submittedAt: new Date() },
                        ]
                    }
                }
            });
            await prisma.user.update({
                where: { id: newUser.id },
                data: { vendorId: newVendor.id }
            });
        }
        
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            throw new Error('JWT_SECRET is not defined in environment variables.');
        }

        const { password: _, ...userWithoutPassword } = newUser;
        
        const finalUser = {
            ...userWithoutPassword,
            vendorId: newVendor?.id,
            roles: ['Vendor'] as UserRole[]
        }
        
        const token = jwt.sign(
            { 
                id: finalUser.id, 
                name: finalUser.name,
                email: finalUser.email,
                roles: finalUser.roles,
                vendorId: finalUser.vendorId,
            }, 
            jwtSecret, 
            { expiresIn: '1d' }
        );

        return NextResponse.json({ 
            user: finalUser, 
            token: token, 
        }, { status: 201 });

    } catch (error) {
        if (error instanceof ZodError) {
            return NextResponse.json({ error: 'Invalid registration data', details: error.errors }, { status: 400 });
        }
        console.error('Registration error:', error instanceof Error ? error.message : 'An unknown error occurred');
        return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
    }
}
