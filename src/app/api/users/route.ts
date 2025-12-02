'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { getActorFromToken } from '@/lib/auth';
import { z } from 'zod';

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  roles: z.array(z.string()).min(1),
  departmentId: z.string(),
  password: z.string().min(8).optional(),
});

const userEditSchema = userSchema.extend({
  id: z.string(),
});

export async function GET() {
  try {
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
    console.error("Failed to fetch users");
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
    const validation = userSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request data', details: validation.error.flatten() }, { status: 400 });
    }
    
    const { name, email, password, roles, departmentId } = validation.data;

    if (!password) {
        return NextResponse.json({ error: 'Password is required for new users.'}, {status: 400});
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
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
    console.error("Failed to create user");
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
    const validation = userEditSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request data', details: validation.error.flatten() }, { status: 400 });
    }
    const { id, name, email, roles, departmentId, password } = validation.data;
    
    const oldUser = await prisma.user.findUnique({ where: { id }, include: { roles: true } });
    if (!oldUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const updateData: any = {
        name,
        email,
        roles: {
          set: roles.map((roleName: string) => ({ name: roleName.replace(/ /g, '_') }))
        },
        department: { connect: { id: departmentId } },
    };
    
    if (password) {
        updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
        where: { id },
        data: updateData
    });

    await prisma.auditLog.create({
        data: {
            user: { connect: { id: actor.id } },
            timestamp: new Date(),
            action: 'UPDATE_USER',
            entity: 'User',
            entityId: id,
            details: `Updated user "${oldUser.name}". Name: ${oldUser.name} -> ${name}. Roles: ${oldUser.roles.map(r=>r.name).join(', ')} -> ${roles.join(', ')}.`,
        }
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
     console.error('Failed to update user');
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
   try {
    const actor = await getActorFromToken(request);
    if (!actor || !(actor.roles as string[]).includes('Admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { id } = z.object({ id: z.string() }).parse(body);
    
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
     console.error("Failed to delete user");
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
