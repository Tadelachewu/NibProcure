
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { getActorFromToken } from '@/lib/auth';

export async function GET() {
  try {
    const users = await prisma.user.findMany({
        include: { 
            department: true,
            roles: true, // Include the roles relation
            committeeAssignments: true,
        }
    });
    // Return the full user object with the nested roles
    const formattedUsers = users.map(u => ({
        ...u,
        department: u.department?.name || 'N/A',
        // The roles object is now correctly nested, no flattening needed here.
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
    if (!actor || !actor.effectiveRoles.includes('Admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, password, roles, departmentId } = body;
    
    if (!name || !email || !password || !roles || !Array.isArray(roles) || roles.length === 0 || !departmentId) {
      return NextResponse.json({ error: 'All fields including at least one role are required' }, { status: 400 });
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
            transactionId: newUser.id,
        }
    });

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error("Failed to create user:", error);
    if (error instanceof Error && error.message.includes('Unauthorized')) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
   try {
    const actor = await getActorFromToken(request);
    if (!actor || !actor.effectiveRoles.includes('Admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, email, roles, departmentId, password } = body;

    if (!id || !name || !email || !roles || !Array.isArray(roles) || !departmentId) {
      return NextResponse.json({ error: 'User ID and all fields are required' }, { status: 400 });
    }
    
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
            transactionId: id,
        }
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
     console.error('Failed to update user:', error);
     if (error instanceof Error && error.message.includes('Unauthorized')) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }
     if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
   try {
    const actor = await getActorFromToken(request);
    if (!actor || !actor.effectiveRoles.includes('Admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { id } = body;

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
            transactionId: id,
        }
    });

    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
     if (error instanceof Error && error.message.includes('Unauthorized')) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }
     if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
