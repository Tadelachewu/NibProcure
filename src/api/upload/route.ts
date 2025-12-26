
'use server';

import 'dotenv/config';
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function POST(request: NextRequest) {
  const data = await request.formData();
  const file: File | null = data.get('file') as unknown as File;
  const directory = data.get('directory') as string || 'general'; // Default to 'general' if not specified

  if (!file) {
    return NextResponse.json({ success: false, error: 'No file provided.' }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Use a timestamp and the original name to create a unique filename
  const filename = `${Date.now()}-${file.name.replace(/\s/g, '_')}`;
  
  // Define the base path for uploads
  const uploadDir = join(process.cwd(), 'public/uploads', directory);
  const path = join(uploadDir, filename);
  
  try {
    // Ensure the subdirectory exists
    await mkdir(uploadDir, { recursive: true });
    
    await writeFile(path, buffer);
    console.log(`File saved to ${path}`);
    
    // Return the public path for the client to use
    const publicPath = `/uploads/${directory}/${filename}`;
    return NextResponse.json({ success: true, path: publicPath });
  } catch (error) {
    console.error('Failed to save file:', error);
    if (error instanceof Error) {
        return NextResponse.json({ success: false, error: 'Failed to save file', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: false, error: 'An unknown error occurred' }, { status: 500 });
  }
}
