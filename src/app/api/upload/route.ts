
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';

// Define allowed file types and size limit for security
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const ALLOWED_DIRECTORIES = ['kyc', 'quotes', 'contracts', 'payment-evidence', 'general'];

const uploadSchema = z.object({
  file: z.instanceof(File).refine(file => file.size > 0, "File cannot be empty.")
    .refine(file => file.size <= MAX_FILE_SIZE, `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB.`)
    .refine(file => ALLOWED_FILE_TYPES.includes(file.type), "Invalid file type."),
  directory: z.string().refine(dir => ALLOWED_DIRECTORIES.includes(dir), "Invalid upload directory."),
});


export async function POST(request: NextRequest) {
  try {
    const data = await request.formData();
    const file: File | null = data.get('file') as unknown as File;
    const directory = data.get('directory') as string || 'general';

    // --- Start Security Validation ---
    const validation = uploadSchema.safeParse({ file, directory });
    if (!validation.success) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid file upload.',
        details: validation.error.flatten().fieldErrors 
      }, { status: 400 });
    }
    // --- End Security Validation ---

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Sanitize the filename to prevent security risks
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const uniqueFilename = `${Date.now()}-${sanitizedFilename}`;
    
    // Construct a safe path using the validated directory
    const uploadDir = join(process.cwd(), 'public/uploads', directory);
    const path = join(uploadDir, uniqueFilename);
    
    // Ensure the subdirectory exists
    await mkdir(uploadDir, { recursive: true });
    
    await writeFile(path, buffer);
    console.log(`File saved to ${path}`);
    
    // Return the public path for the client to use
    const publicPath = `/uploads/${directory}/${uniqueFilename}`;
    return NextResponse.json({ success: true, path: publicPath });

  } catch (error) {
    console.error('Failed to save file:', error);
    if (error instanceof Error) {
        return NextResponse.json({ success: false, error: 'Failed to save file', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: false, error: 'An unknown error occurred' }, { status: 500 });
  }
}
