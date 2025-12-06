
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { UserRole } from '@/lib/types';

export async function GET() {
    try {
        const departments = await prisma.department.findMany({
            include: {
                head: {
                    select: {
                        name: true,
                    }
                }
            }
        });
        return NextResponse.json(departments);
    } catch (error) {
        console.error("Failed to fetch departments:", error);
        return NextResponse.json({ error: 'Failed to fetch departments' }, { status: 500 });
    }
}

export async function POST(request: Request) {
  try {
    const actor = await getActorFromToken(request);
    if (!actor || !actor.roles.some(r => r.name === 'Admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, headId } = body;
    
    if (!name) {
      return NextResponse.json({ error: 'Department name is required' }, { status: 400 });
    }
    
    const existingDepartment = await prisma.department.findUnique({ where: { name } });
    if (existingDepartment) {
        return NextResponse.json({ error: 'Department with this name already exists' }, { status: 409 });
    }

    const newDepartment = await prisma.department.create({
      data: { 
        name,
        description,
        headId: headId === 'null' ? null : headId
      },
    });

    await prisma.auditLog.create({
        data: {
            user: { connect: { id: actor.id } },
            timestamp: new Date(),
            action: 'CREATE_DEPARTMENT',
            entity: 'Department',
            entityId: newDepartment.id,
            transactionId: newDepartment.id,
            details: `Created new department: "${name}".`,
        }
    });

    return NextResponse.json(newDepartment, { status: 201 });
  } catch (error) {
    console.error("Error creating department:", error);
    if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
   try {
    const actor = await getActorFromToken(request);
    if (!actor || !actor.roles.some(r => r.name === 'Admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, description, headId } = body;

    if (!id || !name) {
      return NextResponse.json({ error: 'Department ID and name are required' }, { status: 400 });
    }
    
    const department = await prisma.department.findUnique({ where: { id }});
    if (!department) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }
    const oldName = department.name;

    const existingDepartment = await prisma.department.findFirst({ where: { name, NOT: { id } } });
    if (existingDepartment) {
        return NextResponse.json({ error: 'Another department with this name already exists' }, { status: 409 });
    }

    // Check if the new head is already a head of another department
    const newHeadId = headId === 'null' ? null : headId;
    if (newHeadId) {
        const anotherDeptWithHead = await prisma.department.findFirst({
            where: {
                headId: newHeadId,
                NOT: { id: id } // Exclude the current department from the check
            }
        });
        if (anotherDeptWithHead) {
            return NextResponse.json({ error: `This user is already the head of the "${anotherDeptWithHead.name}" department.` }, { status: 409 });
        }
    }


    const updatedDepartment = await prisma.department.update({
        where: { id },
        data: { 
          name,
          description,
          headId: newHeadId,
        },
    });
    
    await prisma.auditLog.create({
        data: {
            user: { connect: { id: actor.id } },
            timestamp: new Date(),
            action: 'UPDATE_DEPARTMENT',
            entity: 'Department',
            entityId: id,
            transactionId: id,
            details: `Updated department name from "${oldName}" to "${name}".`,
        }
    });


    return NextResponse.json(updatedDepartment);
  } catch (error) {
     console.error("Error updating department:", error);
     if (error instanceof Error) {
        // Handle potential unique constraint errors on the 'headId' field
        if ((error as any).code === 'P2002' && (error as any).meta?.target?.includes('headId')) {
            return NextResponse.json({ error: 'This user is already the head of another department.' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
   try {
    const actor = await getActorFromToken(request);
    if (!actor || !actor.roles.some(r => r.name === 'Admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Department ID is required' }, { status: 400 });
    }
    
    const deletedDepartment = await prisma.department.delete({ where: { id } });
    
    await prisma.auditLog.create({
        data: {
            user: { connect: { id: actor.id } },
            timestamp: new Date(),
            action: 'DELETE_DEPARTMENT',
            entity: 'Department',
            entityId: id,
            transactionId: id,
            details: `Deleted department: "${deletedDepartment.name}".`,
        }
    });

    return NextResponse.json({ message: 'Department deleted successfully' });
  } catch (error) {
     console.error("Error deleting department:", error);
     if (error instanceof Error) {
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
