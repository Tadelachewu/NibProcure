'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { sanitizeHtml } from '@/lib/sanitize';
import LocalClassicEditor from '@ckeditor/ckeditor5-build-classic';
import { Textarea } from '../ui/textarea';

type Props = {
  value?: string;
  onChange?: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  maxChars?: number;
  className?: string;
};

export function RichTextEditor({ value, onChange, readOnly, placeholder, maxChars, className }: Props) {
  const [loading, setLoading] = useState(false);
  const [fallback, setFallback] = useState(false);
  const CKEditor = useMemo(() => dynamic(() => import('@ckeditor/ckeditor5-react').then(m => m.CKEditor as any), { ssr: false }) as any, []);
  const countChars = (html: string) => (html || '').replace(/<[^>]*>/g, '').length;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">Vendor Instructions</CardTitle>
      </CardHeader>
      <CardContent>
        {CKEditor ? (
          <CKEditor
            editor={LocalClassicEditor}
            data={value || ''}
            disabled={!!readOnly}
            onReady={() => { }}
            onChange={(_, editor: any) => {
              const data = editor.getData() || '';
              const clean = sanitizeHtml(data);
              if (maxChars && countChars(clean) > maxChars) return;
              onChange?.(clean);
            }}
            config={{
              placeholder: placeholder || 'Add clear instructions for vendors...',
              toolbar: {
                items: [
                  'heading',
                  '|',
                  'bold',
                  'italic',
                  'underline',
                  'strikethrough',
                  'fontColor',
                  'fontBackgroundColor',
                  'fontFamily',
                  'fontSize',
                  'highlight',
                  'alignment',
                  '|',
                  'link',
                  'bulletedList',
                  'numberedList',
                  'blockQuote',
                  'insertTable',
                  '|',
                  'undo',
                  'redo',
                ],
                shouldNotGroupWhenFull: true,
              },
              heading: {
                options: [
                  { model: 'paragraph', title: 'Paragraph', class: 'ck-heading_paragraph' },
                  { model: 'heading1', view: 'h1', title: 'Heading 1', class: 'ck-heading_heading1' },
                  { model: 'heading2', view: 'h2', title: 'Heading 2', class: 'ck-heading_heading2' },
                  { model: 'heading3', view: 'h3', title: 'Heading 3', class: 'ck-heading_heading3' },
                  { model: 'heading4', view: 'h4', title: 'Heading 4', class: 'ck-heading_heading4' },
                  { model: 'heading5', view: 'h5', title: 'Heading 5', class: 'ck-heading_heading5' },
                  { model: 'heading6', view: 'h6', title: 'Heading 6', class: 'ck-heading_heading6' },
                ]
              },
              table: {
                contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells'],
              },
            }}
          />
        ) : (
          <Textarea
            value={value || ''}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder || 'Add clear instructions for vendors...'}
            disabled={!!readOnly}
            rows={8}
          />
        )}
      </CardContent>
      {maxChars && (
        <CardFooter className="justify-end text-xs text-muted-foreground">
          {countChars(value || '')}/{maxChars}
        </CardFooter>
      )}
    </Card>
  );
}

type RendererProps = {
  html: string;
  className?: string;
};

export function HtmlRenderer({ html, className }: RendererProps) {
  const clean = useMemo(() => sanitizeHtml(html || ''), [html]);
  return (
    <div
      className={`ck-content prose prose-sm max-w-none dark:prose-invert ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
