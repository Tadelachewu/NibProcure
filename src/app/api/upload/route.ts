
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

function sanitizePathSegment(input: string): string {
  const trimmed = (input || '').trim();
  const cleaned = trimmed.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');
  return cleaned || 'general';
}

function getUploadsBaseDir(): string {
  // In some hosting environments (e.g., IIS/iisnode) process.cwd() may not be the project root.
  // Allow overriding via env var so production can point to a stable, writable directory.
  // Default keeps current behavior for local dev.
  return process.env.UPLOADS_BASE_DIR || path.join(process.cwd(), 'public', 'uploads');
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.formData();
    const file: File | null = data.get('file') as unknown as File;
    const directory = sanitizePathSegment((data.get('directory') as string) || 'general');

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const originalName = path.basename(file.name || 'upload');
    const safeName = originalName.replace(/\s/g, '_').replace(/[^a-zA-Z0-9._()-]/g, '_');
    const filename = `${Date.now()}-${safeName}`;
    
    const uploadDir = path.join(getUploadsBaseDir(), directory);
    const filePath = path.join(uploadDir, filename);
    
    await mkdir(uploadDir, { recursive: true });
    
    await writeFile(filePath, buffer);
    console.log(`File saved to ${filePath}`);
    
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
