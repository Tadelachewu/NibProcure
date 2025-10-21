
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { DocumentRecord, AuditLog as AuditLogType, Minute } from '@/lib/types';
import { format, formatDistanceToNow } from 'date-fns';
import { Badge } from './ui/badge';
import {
  Download,
  History,
  Search,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  ArchiveX,
  Loader2,
  Printer,
  FileText,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from './ui/dialog';
import { useAuth } from '@/contexts/auth-context';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

const PAGE_SIZE = 15;

const getStatusVariant = (status: string) => {
    status = status.toLowerCase();
    if (status.includes('approve') || status.includes('match') || status.includes('paid') || status.includes('verified') || status.includes('delivered')) return 'default';
    if (status.includes('pending') || status.includes('submitted') || status.includes('issued') || status.includes('progress')) return 'secondary';
    if (status.includes('reject') || status.includes('dispute') || status.includes('mismatch') || status.includes('cancelled')) return 'destructive';
    return 'outline';
};

const AuditTrailDialog = ({ document, auditTrail, minutes }: { document: DocumentRecord, auditTrail: AuditLogType[], minutes: Minute[] }) => {
    const { toast } = useToast();
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);

    const handleGeneratePdf = async () => {
        const input = printRef.current;
        if (!input) return;

        setIsGeneratingPdf(true);
        toast({ title: "Generating PDF...", description: "This may take a moment." });

        try {
            const canvas = await html2canvas(input, {
                scale: 2,
                useCORS: true,
                backgroundColor: null, // Use transparent background for canvas
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const ratio = imgWidth / imgHeight;
            let width = pdfWidth - 20; // with margin
            let height = width / ratio;

            if (height > pdfHeight - 20) {
                 height = pdfHeight - 20;
                 width = height * ratio;
            }
            
            const x = (pdfWidth - width) / 2;
            const y = 10;
            
            pdf.addImage(imgData, 'PNG', x, y, width, height);
            
            pdf.save(`Audit-Trail-${document.id}.pdf`);
            toast({ title: "PDF Generated", description: "Your report has been downloaded." });

        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: "PDF Generation Failed", description: "An error occurred while creating the PDF." });
        } finally {
            setIsGeneratingPdf(false);
        }
    }


    return (
        <DialogContent className="max-w-3xl flex flex-col h-[90vh]">
            <DialogHeader>
                <DialogTitle>History for {document.type}: {document.id}</DialogTitle>
                <DialogDescription>
                    Showing all events and meeting minutes related to this document.
                </DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="audit" className="flex-1 flex flex-col min-h-0">
                <TabsList>
                    <TabsTrigger value="audit">Audit Trail</TabsTrigger>
                    <TabsTrigger value="minutes">Meeting Minutes ({minutes?.length || 0})</TabsTrigger>
                </TabsList>
                <TabsContent value="audit" className="flex-1 overflow-hidden">
                     <ScrollArea className="h-full">
                        <div ref={printRef} className="p-1 space-y-6 bg-background text-foreground print:bg-white print:text-black">
                            <div className="hidden print:block text-center mb-8 pt-4">
                                <Image src="/logo.png" alt="Logo" width={40} height={40} className="mx-auto mb-2" />
                                <h1 className="text-2xl font-bold text-black">Audit Trail Report</h1>
                                <p className="text-gray-600">{document.type}: {document.id}</p>
                                <p className="text-sm text-gray-500">Report Generated: {format(new Date(), 'PPpp')}</p>
                            </div>
                            {auditTrail.length > 0 ? (
                                <div className="relative pl-6">
                                    <div className="absolute left-6 top-0 h-full w-0.5 bg-border -translate-x-1/2"></div>
                                    {auditTrail.map((log, index) => (
                                    <div key={log.id} className="relative mb-8">
                                        <div className="absolute -left-3 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-secondary print:bg-gray-200">
                                            <div className="h-3 w-3 rounded-full bg-primary print:bg-blue-500"></div>
                                        </div>
                                        <div className="pl-8">
                                            <div className="flex items-center justify-between">
                                                <Badge variant={getStatusVariant(log.action)}>{log.action.replace(/_/g, ' ')}</Badge>
                                                <time className="text-xs text-muted-foreground print:text-gray-600">{format(new Date(log.timestamp), 'PPpp')}</time>
                                            </div>
                                            <p className="mt-2 text-sm text-muted-foreground print:text-gray-700">{log.details}</p>
                                            <p className="mt-2 text-xs text-muted-foreground print:text-gray-600">
                                                By <span className="font-semibold text-foreground print:text-black">{log.user}</span> ({log.role})
                                            </p>
                                        </div>
                                    </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center h-24 flex items-center justify-center text-muted-foreground">No audit history found for this document.</div>
                            )}
                        </div>
                    </ScrollArea>
                </TabsContent>
                 <TabsContent value="minutes" className="flex-1 overflow-hidden">
                     <ScrollArea className="h-full">
                         {minutes && minutes.length > 0 ? (
                             <div className="space-y-4">
                                {minutes.map(minute => (
                                    <Card key={minute.id}>
                                        <CardHeader>
                                            <CardTitle className="flex justify-between items-center">
                                                <span>Minute: {minute.decisionBody}</span>
                                                <Badge variant={minute.decision === 'APPROVED' ? 'default' : 'destructive'}>{minute.decision}</Badge>
                                            </CardTitle>
                                            <CardDescription>Recorded by {minute.author.name} on {format(new Date(minute.createdAt), 'PP')}</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <h4 className="font-semibold text-sm">Justification</h4>
                                            <p className="text-sm text-muted-foreground p-3 border rounded-md bg-muted/50 mt-1">{minute.justification}</p>
                                             <h4 className="font-semibold text-sm mt-4">Attendees</h4>
                                             <div className="flex flex-wrap gap-4 mt-2">
                                                {minute.attendees.map(attendee => <Badge key={attendee.id} variant="outline">{attendee.name}</Badge>)}
                                             </div>
                                        </CardContent>
                                    </Card>
                                ))}
                             </div>
                         ): (
                            <div className="text-center h-24 flex items-center justify-center text-muted-foreground">No meeting minutes found for this document.</div>
                         )}
                     </ScrollArea>
                 </TabsContent>
            </Tabs>
             <DialogFooter>
                <Button onClick={handleGeneratePdf} variant="outline" disabled={isGeneratingPdf}>
                    {isGeneratingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Printer className="mr-2 h-4 w-4"/>}
                    Print / Export PDF
                </Button>
            </DialogFooter>
        </DialogContent>
    )
}

export function RecordsPage() {
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();
  const { user, role } = useAuth();


  const fetchRecords = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/records');
      if (!response.ok) {
        throw new Error('Failed to fetch records');
      }
      const data = await response.json();
      setRecords(data);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'An unknown error occurred' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);
  
  const filteredRecords = useMemo(() => {
    let relevantRecords = records;
    if (role === 'Requester' && user) {
        relevantRecords = records.filter(r => r.user === user.name && r.type === 'Requisition');
    } else if (role === 'Finance') {
        relevantRecords = records.filter(r => ['Invoice', 'Purchase Order'].includes(r.type));
    } else if (role === 'Receiving') {
        relevantRecords = records.filter(r => ['Goods Receipt', 'Purchase Order'].includes(r.type));
    }

    return relevantRecords.filter(record => {
        const lowerSearch = searchTerm.toLowerCase();
        return (
            record.id.toLowerCase().includes(lowerSearch) ||
            record.type.toLowerCase().includes(lowerSearch) ||
            record.title.toLowerCase().includes(lowerSearch) ||
            record.status.toLowerCase().includes(lowerSearch) ||
            record.user.toLowerCase().includes(lowerSearch)
        )
    })
  }, [records, searchTerm, user, role]);

  const totalPages = Math.ceil(filteredRecords.length / PAGE_SIZE);
  const paginatedRecords = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredRecords.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredRecords, currentPage]);

  const handleDownload = (record: DocumentRecord) => {
    toast({
        title: 'Simulating Download',
        description: `Downloading ${record.type} - ${record.id}.pdf...`
    })
    console.log("Simulating download for:", record);
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Document Records</CardTitle>
        <CardDescription>
          A central repository for all documents in the procurement lifecycle.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search all records..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doc ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRecords.length > 0 ? (
                paginatedRecords.map((record) => (
                  <TableRow key={`${record.type}-${record.id}`}>
                    <TableCell className="font-medium text-primary">{record.id}</TableCell>
                    <TableCell>{record.type}</TableCell>
                    <TableCell>{record.title}</TableCell>
                    <TableCell>{format(new Date(record.date), 'PP')}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(record.status)}>{record.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                        {record.amount > 0 ? `${record.amount.toLocaleString()} ETB`: '-'}
                    </TableCell>
                    <TableCell>
                        <div className="flex gap-2">
                             <Button variant="outline" size="sm" onClick={() => handleDownload(record)}>
                                <Download className="mr-2 h-4 w-4" /> Download
                             </Button>
                             <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        <History className="mr-2 h-4 w-4" /> Trail
                                    </Button>
                                </DialogTrigger>
                                <AuditTrailDialog document={record} auditTrail={record.auditTrail || []} minutes={record.minutes || []}/>
                             </Dialog>
                        </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <ArchiveX className="h-16 w-16 text-muted-foreground/50" />
                      <div className="space-y-1">
                        <p className="font-semibold">No Records Found</p>
                        <p className="text-muted-foreground">There are no documents matching your search.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
         <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-muted-foreground">
             Page {currentPage} of {totalPages} ({filteredRecords.length} total records)
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}><ChevronsLeft /></Button>
            <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft /></Button>
            <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight /></Button>
            <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}><ChevronsRight /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
