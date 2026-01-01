
import 'dotenv/config';
import util from 'util';
import type { User, UserRole } from './types';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { prisma } from './prisma';
import { RfqSenderSetting } from '@/contexts/auth-context';

/**
 * Decodes a JWT token without verifying its signature.
 * This is safe to use on the client-side as it only reads the token's payload.
 * The signature should always be verified on the server/middleware.
 */
export function decodeJwt<T>(token: string): (T & { exp: number }) | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;

    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join('')
    );

    return JSON.parse(jsonPayload) as T & { exp: number };
  } catch (error) {
    console.error("Failed to decode JWT:", error);
    return null;
  }
}

/**
 * Verifies a JWT token on the server side using the secret key.
 * Throws an error if the token is invalid or expired.
 */
export async function verifyJwt(token: string): Promise<JwtPayload | null> {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        console.error('JWT_SECRET is not defined in environment variables.');
        return null;
    }

    const verify = util.promisify(jwt.verify);
    try {
        const decoded = await verify(token, jwtSecret);
        return decoded as JwtPayload;
    } catch (e) {
        console.error("Failed to verify token:", e);
        return null;
    }
}


export async function getActorFromToken(request: Request): Promise<User> {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) {
      throw new Error('Unauthorized');
    };

    const decoded = await verifyJwt(token);
    if (!decoded || !decoded.id) {
        throw new Error('Unauthorized');
    }

    const user = await prisma.user.findUnique({
        where: { id: decoded.id as string },
        include: { roles: true, department: true }
    });
    
    if (!user) {
        throw new Error('Unauthorized');
    }

    // Do not grant global procurement permissions here based on the rfqSenderSetting.
    // Authorization for RFQ sender actions should be decided per-requisition using
    // the requisition.assignedRfqSenderIds field. Keep the user's roles as-is.
    return {
      ...user,
      department: user.department?.name,
      roles: user.roles.map(r => (typeof r === 'string' ? r : r.name)),
    } as User;
}

/**
 * Returns true if the provided actor/user has the Admin role.
 * Accepts either normalized actor objects (roles: string[]) or
 * Prisma-loaded user objects (roles: { name: string }[]).
 */
export function isAdmin(actor: any): boolean {
  if (!actor) return false;
  const roles = actor.roles || [];
  if (Array.isArray(roles) && roles.length > 0) {
    // roles may be strings or objects { name }
    const roleNames = roles.map((r: any) => (typeof r === 'string' ? r : r?.name)).filter(Boolean);
    return roleNames.includes('Admin');
  }
  return false;
}

/**
 * Determines whether the given actor is authorized to perform RFQ-related actions
 * on the specified requisition. The check prefers the requisition-level
 * `assignedRfqSenderIds` when present; otherwise it falls back to the global
 * `rfqSenderSetting`.
 */
export async function isActorAuthorizedForRequisition(actor: User, requisitionId: string): Promise<boolean> {
  const userRoles = actor.roles as string[];

  const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId } });
  if (!requisition) return false;

  const assignedForReq = requisition.assignedRfqSenderIds || [];
  if (assignedForReq.length > 0) {
    return assignedForReq.includes(actor.id);
  }

  const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
  let settingValue: any = undefined;
  if (rfqSenderSetting) {
    settingValue = rfqSenderSetting.value;
    if (typeof settingValue === 'string') {
      try { settingValue = JSON.parse(settingValue); } catch (e) { /* keep as string */ }
    }
  }

  if (settingValue && typeof settingValue === 'object' && 'type' in settingValue) {
    const setting = settingValue as { type: string, userIds?: string[] };
    if (setting.type === 'all' && userRoles.includes('Procurement_Officer')) return true;
    if (setting.type === 'specific' && setting.userIds?.includes(actor.id)) return true;
  }

  return false;
}
