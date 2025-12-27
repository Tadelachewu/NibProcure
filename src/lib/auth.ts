
'use server';

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

    const rfqSenderSetting = await prisma.setting.findUnique({ where: { key: 'rfqSenderSetting' } });
    const effectiveRoles = new Set(user.roles.map(r => r.name as UserRole));

    if (rfqSenderSetting) {
        const setting = rfqSenderSetting.value as RfqSenderSetting;
        if (setting.type === 'specific' && setting.userIds?.includes(user.id)) {
            effectiveRoles.add('Procurement_Officer');
        }
    }

    return {
      ...user,
      department: user.department?.name,
      roles: Array.from(effectiveRoles),
    } as User;
}
