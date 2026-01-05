import { NextRequest, NextResponse } from 'next/server';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';

function getUploadsBaseDir(): string {
  return process.env.UPLOADS_BASE_DIR || path.join(process.cwd(), 'public', 'uploads');
}

function contentTypeForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.pdf':
      return 'application/pdf';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.txt':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

export async function GET(_request: NextRequest, { params }: { params: { path: string[] } }) {
  const parts = params?.path || [];
  if (parts.length === 0) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // Resolve a safe absolute path under the uploads base dir.
  const baseDir = path.resolve(getUploadsBaseDir());
  const requestedPath = path.resolve(baseDir, ...parts);

  if (!requestedPath.startsWith(baseDir + path.sep)) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  try {
    const fileStat = await stat(requestedPath);
    if (!fileStat.isFile()) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const nodeStream = createReadStream(requestedPath);
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentTypeForFile(requestedPath),
        'Content-Length': String(fileStat.size),
        // Uploaded documents are generally sensitive; avoid shared/proxy caching.
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    });
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }
}
