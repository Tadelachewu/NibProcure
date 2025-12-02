
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { getActorFromToken } from '@/lib/auth';
import { userSchema } from '@/lib/schemas';
import { ZodError } from 'zod';

export async function GET(request: Request) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor || !(actor.roles as string[]).includes('Admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const users = await prisma.user.findMany({
        include: { 
            department: true,
            roles: true,
        }
    });
    const formattedUsers = users.map(u => ({
        ...u,
        department: u.department?.name || 'N/A',
    }));
    return NextResponse.json(formattedUsers);
  } catch (error) {
    console.error("Failed to fetch users:", error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor || !(actor.roles as string[]).includes('Admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const body = await request.json();
    const { name, email, password, roles, departmentId } = userSchema.parse(body);

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
    }
    
    if (!password) {
        return NextResponse.json({ error: 'Password is required for new users' }, { status: 400 });
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
        data: {
            name,
            email,
            password: hashedPassword,
            roles: {
              connect: roles.map((roleName: string) => ({ name: roleName.replace(/ /g, '_') }))
            },
            department: { connect: { id: departmentId } },
        }
    });
    
    await prisma.auditLog.create({
        data: {
            user: { connect: { id: actor.id } },
            timestamp: new Date(),
            action: 'CREATE_USER',
            entity: 'User',
            entityId: newUser.id,
            details: `Created new user "${name}" with roles: ${roles.join(', ')}.`,
        }
    });

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
        return NextResponse.json({ error: 'Invalid input data', details: error.errors }, { status: 400 });
    }
    console.error("Failed to create user:", error);
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
   try {
    const actor = await getActorFromToken(request);
    if (!actor || !(actor.roles as string[]).includes('Admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const body = await request.json();
    const { id, ...updateData } = body;
    const { name, email, roles, departmentId, password } = userSchema.partial().parse(updateData);

    if (!id) {
        return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
    const oldUser = await prisma.user.findUnique({ where: { id }, include: { roles: true } });
    if (!oldUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const dataToUpdate: any = {
        name,
        email,
        department: departmentId ? { connect: { id: departmentId } } : undefined,
    };
    
    if (roles) {
        dataToUpdate.roles = {
            set: roles.map((roleName: string) => ({ name: roleName.replace(/ /g, '_') }))
        };
    }

    if (password) {
        dataToUpdate.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
        where: { id },
        data: dataToUpdate
    });

    await prisma.auditLog.create({
        data: {
            user: { connect: { id: actor.id } },
            timestamp: new Date(),
            action: 'UPDATE_USER',
            entity: 'User',
            entityId: id,
            details: `Updated user "${oldUser.name}".`,
        }
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof ZodError) {
        return NextResponse.json({ error: 'Invalid input data', details: error.errors }, { status: 400 });
    }
    console.error('Failed to update user:', error);
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
   try {
    const actor = await getActorFromToken(request);
    if (!actor || !(actor.roles as string[]).includes('Admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
    const userToDelete = await prisma.user.findUnique({ where: { id }, include: { roles: true } });
    if (!userToDelete) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (userToDelete.roles.some(r => r.name === 'Admin')) {
        return NextResponse.json({ error: 'Cannot delete an Admin user.' }, { status: 403 });
    }
    
    await prisma.user.delete({ where: { id } });
    
    await prisma.auditLog.create({
        data: {
            user: { connect: { id: actor.id } },
            timestamp: new Date(),
            action: 'DELETE_USER',
            entity: 'User',
            entityId: id,
            details: `Deleted user: "${userToDelete.name}".`,
        }
    });

    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
