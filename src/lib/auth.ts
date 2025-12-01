
import type { User, UserRole } from './types';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { prisma } from './prisma';

/**
 * Decodes a JWT token without verifying its signature. 
 * This is safe to use on the client-side as it only reads the token's payload.
 * The signature should always be verified on the server/middleware.
 */
export function decodeJwt<T>(token: string): T | null {
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

    return JSON.parse(jsonPayload) as T;
  } catch (error) {
    console.error("Failed to decode JWT:", error);
    return null;
  }
}

/**
 * Verifies a JWT token on the server side using the secret key.
 * Throws an error if the token is invalid or expired.
 */
export async function verifyJwt(token: string) {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        throw new Error('JWT_SECRET is not defined in environment variables.');
    }
    
    try {
        const decoded = jwt.verify(token, jwtSecret);
        return decoded as JwtPayload;
    } catch(e) {
        console.error("Failed to verify token:", e);
        return null;
    }
}


export async function getActorFromToken(request: Request): Promise<User | null> {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return null;
    
    const decoded = await verifyJwt(token);
    if (!decoded || !decoded.id) return null;

    const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        include: { roles: true, department: true }
    });
    
    if (!user) return null;

    return {
      ...user,
      department: user.department?.name,
      roles: user.roles.map(r => r.name as UserRole),
    }
}

export async function getUserByToken(token: string): Promise<{ user: User, role: UserRole } | null> {
    try {
        const decoded = decodeJwt<User>(token);
        if (!decoded) {
            return null;
        }
        
        // **FIX**: Ensure the role from the token is always formatted with underscores
        const formattedRole = (decoded.role as string).replace(/ /g, '_') as UserRole;
        
        return { user: decoded, role: formattedRole };
    } catch(e) {
        console.error("Failed to decode token:", e);
        return null;
    }
}
