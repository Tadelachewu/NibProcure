
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { getActorFromToken } from '@/lib/auth';
import { randomBytes } from 'crypto';

// --- Security Configuration ---
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_FILE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};
type MimeType = keyof typeof ALLOWED_FILE_TYPES;

// Whitelist of directories to prevent path traversal
const ALLOWED_DIRECTORIES = ['general', 'kyc', 'contracts', 'payment-evidence', 'quotes'];

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication: Ensure only logged-in users can upload.
    const actor = await getActorFromToken(request);
    if (!actor) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.formData();
    const file: File | null = data.get('file') as unknown as File;
    const directory = data.get('directory') as string || 'general';

    // 2. Input Validation
    if (!file) {
        return NextResponse.json({ success: false, error: 'No file provided.' }, { status: 400 });
    }

    // 3. Security: Validate directory against whitelist
    if (!ALLOWED_DIRECTORIES.includes(directory)) {
        return NextResponse.json({ success: false, error: 'Invalid upload directory specified.' }, { status: 400 });
    }

    // 4. Security: Validate file size
    if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ success: false, error: `File size exceeds the limit of ${MAX_FILE_SIZE / 1024 / 1024}MB.` }, { status: 400 });
    }

    // 5. Security: Validate file type
    const fileType = file.type as MimeType;
    if (!Object.keys(ALLOWED_FILE_TYPES).includes(fileType)) {
        return NextResponse.json({ success: false, error: `File type "${file.type}" is not allowed.` }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 6. Security: Generate a secure, random filename to prevent malicious naming
    const randomSuffix = randomBytes(16).toString('hex');
    const extension = ALLOWED_FILE_TYPES[fileType];
    const newFilename = `${Date.now()}-${randomSuffix}.${extension}`;
  
    const uploadDir = join(process.cwd(), 'public/uploads', directory);
    const path = join(uploadDir, newFilename);
  
    // Ensure the subdirectory exists
    await mkdir(uploadDir, { recursive: true });
    
    await writeFile(path, buffer);
    console.log(`File saved to ${path}`);
    
    // Return the public path for the client to use
    const publicPath = `/uploads/${directory}/${newFilename}`;
    return NextResponse.json({ success: true, path: publicPath });

  } catch (error) {
    console.error('Failed to save file:', error);
    if (error instanceof Error) {
        return NextResponse.json({ success: false, error: 'Failed to save file', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: false, error: 'An unknown error occurred' }, { status: 500 });
  }
}
