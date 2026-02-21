'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { sanitizeHtml } from '@/lib/sanitize';
import ClassicEditor from '@ckeditor/ckeditor5-build-classic';

type Props = {
  value?: string;
  onChange?: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  maxChars?: number;
  className?: string;
};

export function RichTextEditor({ value, onChange, readOnly, placeholder, maxChars, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [fallback, setFallback] = useState(false);
  const CKEditor = useMemo(
    () => dynamic(() => import('@ckeditor/ckeditor5-react').then(m => m.CKEditor as any), { ssr: false }) as any,
    []
  );
  const countChars = (html: string) => (html || '').replace(/<[^>]*>/g, '').length;

  useEffect(() => {
    let cancelled = false;
    async function ensureCdn() {
      if (typeof window === 'undefined') return;
      if ((window as any).CKEDITOR && (window as any).CKEDITOR.ClassicEditor) return;
      await new Promise<void>((resolve, reject) => {
        const id = 'ckeditor5-super-build';
        if (document.getElementById(id)) {
          resolve();
          return;
        }
        const s = document.createElement('script');
        s.id = id;
        s.src = 'https://cdn.ckeditor.com/ckeditor5/41.4.2/super-build/ckeditor.js';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Failed to load CKEditor CDN'));
        document.body.appendChild(s);
      });
    }
    async function init() {
      try {
        await ensureCdn();
        if (cancelled) return;
        const ClassicEditor = (window as any).CKEDITOR.ClassicEditor;
        if (!ClassicEditor || !containerRef.current) {
          setLoading(false);
          setFallback(true);
          return;
        }
        // Build a base config with heading options H1..H6
        const headingOptions = [
          { model: 'paragraph', title: 'Paragraph', class: 'ck-heading_paragraph' },
          { model: 'heading1', view: 'h1', title: 'Heading 1', class: 'ck-heading_heading1' },
          { model: 'heading2', view: 'h2', title: 'Heading 2', class: 'ck-heading_heading2' },
          { model: 'heading3', view: 'h3', title: 'Heading 3', class: 'ck-heading_heading3' },
          { model: 'heading4', view: 'h4', title: 'Heading 4', class: 'ck-heading_heading4' },
          { model: 'heading5', view: 'h5', title: 'Heading 5', class: 'ck-heading_heading5' },
          { model: 'heading6', view: 'h6', title: 'Heading 6', class: 'ck-heading_heading6' },
        ];

        // Default toolbar items; we'll include color/highlight if the build provides those plugins
        const toolbarItems: string[] = [
          'heading',
          '|',
          'bold',
          'italic',
          'underline',
          'strikethrough',
          'alignment',
          'bulletedList',
          'numberedList',
          'outdent',
          'indent',
          'link',
          'insertTable',
          'imageInsert',
          '|',
          'removeFormat',
          'undo',
          'redo',
        ];

        // If the super-build provides color/highlight plugins, include them
        if ((window as any).CKEDITOR && (window as any).CKEDITOR.plugins) {
          // super-build exposes a rich set; try to include optional plugins
          toolbarItems.splice(5, 0, 'highlight', 'fontColor', 'fontBackgroundColor');
        }

        const instance = await ClassicEditor.create(containerRef.current, {
          placeholder: placeholder || 'Add clear instructions for vendors...',
          heading: { options: headingOptions },
          toolbar: { items: toolbarItems, shouldNotGroupWhenFull: true },
          link: {
            decorators: {
              addTargetToExternalLinks: true,
              defaultProtocol: 'https://',
            },
          },
          table: { contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells'] },
        });
        editorRef.current = instance;
        if (value) {
          instance.setData(value);
        }
        instance.model.document.on('change:data', () => {
          const data = instance.getData() || '';
          const clean = sanitizeHtml(data);
          if (maxChars && countChars(clean) > maxChars) return;
          onChange?.(clean);
        });
        if (readOnly) {
          instance.enableReadOnlyMode('vendor-instructions');
        } else {
          instance.disableReadOnlyMode('vendor-instructions');
        }
      } catch {
        // If CDN fails, fall back to local Classic build via React wrapper
        setFallback(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
      if (editorRef.current) {
        editorRef.current.destroy().catch(() => { });
        editorRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const ed = editorRef.current;
    if (ed && typeof value === 'string' && value !== ed.getData()) {
      ed.setData(value);
    }
  }, [value]);

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    if (readOnly) ed.enableReadOnlyMode('vendor-instructions');
    else ed.disableReadOnlyMode('vendor-instructions');
  }, [readOnly]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">Vendor Instructions</CardTitle>
      </CardHeader>
      <CardContent>
        {!fallback ? (
          <div className="border rounded">
            <div ref={containerRef} />
            {loading && <div className="p-2 text-sm text-muted-foreground">Loading editor…</div>}
          </div>
        ) : (
          <CKEditor
            editor={ClassicEditor as any}
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
      className={`prose prose-sm max-w-none dark:prose-invert ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
