
'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken } from '@/lib/auth';
import { departmentSchema } from '@/lib/schemas';
import { ZodError } from 'zod';

export async function GET(request: Request) {
    try {
        const actor = await getActorFromToken(request);
        if (!actor) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

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
    if (!actor || !(actor.roles as string[]).includes('Admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, headId } = departmentSchema.parse(body);
    
    const existingDepartment = await prisma.department.findUnique({ where: { name } });
    if (existingDepartment) {
        return NextResponse.json({ error: 'Department with this name already exists' }, { status: 409 });
    }

    const newDepartment = await prisma.department.create({
      data: { 
        name,
        description,
        headId: headId || null
      },
    });

    await prisma.auditLog.create({
        data: {
            user: { connect: { id: actor.id } },
            timestamp: new Date(),
            action: 'CREATE_DEPARTMENT',
            entity: 'Department',
            entityId: newDepartment.id,
            details: `Created new department: "${name}".`,
        }
    });

    return NextResponse.json(newDepartment, { status: 201 });
  } catch (error) {
     if (error instanceof ZodError) {
        return NextResponse.json({ error: 'Invalid input data', details: error.errors }, { status: 400 });
    }
    console.error("Error creating department:", error);
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
    const { name, description, headId } = departmentSchema.parse(updateData);


    if (!id) {
      return NextResponse.json({ error: 'Department ID is required' }, { status: 400 });
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
    const newHeadId = headId;
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
            details: `Updated department name from "${oldName}" to "${name}".`,
        }
    });


    return NextResponse.json(updatedDepartment);
  } catch (error) {
     if (error instanceof ZodError) {
        return NextResponse.json({ error: 'Invalid input data', details: error.errors }, { status: 400 });
    }
    if ((error as any).code === 'P2002' && (error as any).meta?.target?.includes('headId')) {
        return NextResponse.json({ error: 'This user is already the head of another department.' }, { status: 409 });
    }
    console.error("Error updating department:", error);
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
            details: `Deleted department: "${deletedDepartment.name}".`,
        }
    });

    return NextResponse.json({ message: 'Department deleted successfully' });
  } catch (error) {
     console.error("Error deleting department:", error);
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
