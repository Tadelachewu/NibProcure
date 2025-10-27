
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { useAuth } from '@/contexts/auth-context';

export async function GET() {
  try {
    const roles = await prisma.role.findMany({
      orderBy: {
        name: 'asc',
      },
    });
    return NextResponse.json(roles);
  } catch (error) {
    console.error('Failed to fetch roles:', error);
    return NextResponse.json({ error: 'Failed to fetch roles' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, actorUserId } = body;

    const actor = await prisma.user.findUnique({ where: { id: actorUserId } });
    if (!actor || actor.role !== 'Admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (!name) {
      return NextResponse.json({ error: 'Role name is required' }, { status: 400 });
    }
    
    const formattedName = name.replace(/ /g, '_');
    const existingRole = await prisma.role.findUnique({ where: { name: formattedName } });
    if (existingRole) {
        return NextResponse.json({ error: 'A role with this name already exists' }, { status: 409 });
    }

    const newRole = await prisma.role.create({
      data: {
        name: formattedName,
        description,
      },
    });

    return NextResponse.json(newRole, { status: 201 });
  } catch (error) {
    console.error('Failed to create role:', error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
   try {
    const body = await request.json();
    const { id, name, description, actorUserId } = body;

    const actor = await prisma.user.findUnique({where: { id: actorUserId }});
    if (!actor || actor.role !== 'Admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (!id || !name) {
      return NextResponse.json({ error: 'Role ID and name are required' }, { status: 400 });
    }
    
    const formattedName = name.replace(/ /g, '_');
    const existingRole = await prisma.role.findFirst({ where: { name: formattedName, NOT: { id } } });
    if (existingRole) {
        return NextResponse.json({ error: 'Another role with this name already exists' }, { status: 409 });
    }
    
    const updatedRole = await prisma.role.update({
        where: { id },
        data: { name: formattedName, description }
    });

    return NextResponse.json(updatedRole);
  } catch (error) {
     console.error('Failed to update role:', error);
     if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
   try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const actorUserId = searchParams.get('actorUserId');

    const actor = await prisma.user.findUnique({where: { id: actorUserId! }});
    if (!actor || actor.role !== 'Admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    if (!id) {
      return NextResponse.json({ error: 'Role ID is required' }, { status: 400 });
    }
    
    const roleToDelete = await prisma.role.findUnique({ where: { id } });
    if (!roleToDelete) {
        return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }
    
    if (['Admin', 'Procurement_Officer', 'Requester', 'Approver', 'Vendor'].includes(roleToDelete.name)) {
        return NextResponse.json({ error: `Cannot delete core system role: ${roleToDelete.name}` }, { status: 403 });
    }

    await prisma.role.delete({ where: { id } });

    return NextResponse.json({ message: 'Role deleted successfully' });
  } catch (error) {
     console.error('Failed to delete role:', error);
     if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
