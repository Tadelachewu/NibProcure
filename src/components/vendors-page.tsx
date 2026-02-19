

'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  CardFooter,
} from './ui/card';
import { Button } from './ui/button';
import { Vendor, KycStatus } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { Loader2, PlusCircle, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, ShieldCheck, ShieldAlert, ShieldQuestion, Building2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';

const vendorSchema = z.object({
  name: z.string().min(2, "Vendor name is required."),
  contactPerson: z.string().min(2, "Contact person is required."),
  // Email is optional for procurement 'Add Vendor' form — allow empty string or a valid email
  email: z.union([z.string().email("Invalid email address."), z.literal('')]),
  phone: z.string().min(10, "Phone number seems too short."),
  address: z.string().min(10, "Address is required."),
});

const PAGE_SIZE = 10;

const KycStatusBadge = ({ status, reason }: { status: KycStatus, reason?: string }) => {
  const badgeContent = {
    'Verified': { icon: <ShieldCheck className="mr-2 h-3 w-3" />, text: 'Verified', variant: 'default' as const, className: 'bg-green-600 text-white hover:bg-green-600' },
    'Pending': { icon: <ShieldQuestion className="mr-2 h-3 w-3" />, text: 'Pending', variant: 'secondary' as const },
    'Rejected': { icon: <ShieldAlert className="mr-2 h-3 w-3" />, text: 'Rejected', variant: 'destructive' as const },
  };

  const { icon, text, variant, className } = badgeContent[status] as any;

  if (status === 'Rejected' && reason) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant={variant} className={className}>{icon} {text}</Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Reason: {reason}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return <Badge variant={variant} className={className}>{icon} {text}</Badge>;
}

export function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setFormOpen] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [requisitionHistoryData, setRequisitionHistoryData] = useState<any[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof vendorSchema>>({
    resolver: zodResolver(vendorSchema),
    defaultValues: {
      name: "",
      contactPerson: "",
      email: "",
      phone: "",
      address: "",
    },
  });

  const fetchVendors = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/vendors', { headers: { Authorization: token ? `Bearer ${token}` : '' } });
      if (!response.ok) throw new Error('Failed to fetch vendors');
      const data = await response.json();
      setVendors(data);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Could not fetch vendors.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, token]);

  const fetchRequisitionHistory = useCallback(async () => {
    if (requisitionHistoryData) return;
    try {
      setHistoryLoading(true);
      setHistoryError(null);
      const response = await fetch('/api/requisitions?limit=200', {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!response.ok) throw new Error('Failed to fetch requisition history');
      const data = await response.json();
      setRequisitionHistoryData(data.requisitions || []);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Could not fetch participation history.');
    } finally {
      setHistoryLoading(false);
    }
  }, [token, requisitionHistoryData]);

  const canManageVendors = (user && (user.roles || []).includes('Admin')) || (user && (user.roles || []).includes('Procurement_Officer'));

  async function handleBlacklist(id: string) {
    const reason = window.prompt('Enter reason for blacklisting this vendor:');
    if (!reason) return;
    try {
      const res = await fetch(`/api/vendors/${id}/blacklist`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' }, body: JSON.stringify({ reason }) });
      if (!res.ok) throw new Error('Failed to blacklist vendor');
      toast({ title: 'Vendor blacklisted', description: 'Vendor has been blacklisted.' });
      await fetchVendors();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err instanceof Error ? err.message : 'Failed to blacklist' });
    }
  }

  async function handleUnblacklist(id: string) {
    if (!window.confirm('Remove vendor from blacklist?')) return;
    try {
      const res = await fetch(`/api/vendors/${id}/blacklist`, { method: 'DELETE', headers: { Authorization: token ? `Bearer ${token}` : '' } });
      if (!res.ok) throw new Error('Failed to remove vendor from blacklist');
      toast({ title: 'Vendor removed from blacklist', description: 'Vendor may now participate in procurement.' });
      await fetchVendors();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err instanceof Error ? err.message : 'Failed to unblacklist' });
    }
  }

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const totalPages = Math.ceil(vendors.length / PAGE_SIZE);
  const paginatedVendors = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return vendors.slice(startIndex, startIndex + PAGE_SIZE);
  }, [vendors, currentPage]);

  const vendorParticipation = useMemo(() => {
    if (!selectedVendor || !requisitionHistoryData) return [];
    const vid = selectedVendor.id;
    const rows: {
      requisitionId: string;
      title: string;
      status: string;
      createdAt: string | Date;
      totalPrice: number | null;
      quoteStatus: string;
      score: number | null;
    }[] = [];
    for (const req of requisitionHistoryData) {
      const quotes = (req.quotations || []).filter((q: any) => q.vendorId === vid);
      if (!quotes.length) continue;
      const quote = quotes[0];
      rows.push({
        requisitionId: req.id,
        title: req.title,
        status: req.status,
        createdAt: req.createdAt,
        totalPrice: quote.totalPrice ?? null,
        quoteStatus: quote.status,
        score: quote.finalAverageScore ?? null,
      });
    }
    return rows;
  }, [selectedVendor, requisitionHistoryData]);

  const handleOpenDetails = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setIsDetailsOpen(true);
    fetchRequisitionHistory();
  };

  const onSubmit = async (values: z.infer<typeof vendorSchema>) => {
    setSubmitting(true);
    try {
      const response = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) throw new Error('Failed to add vendor.');

      toast({
        title: 'Success!',
        description: 'New vendor has been added and is pending verification.',
      });
      await fetchVendors(); // Refresh the list
      setFormOpen(false); // Close the dialog
      form.reset(); // Reset form
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Vendors</CardTitle>
          <CardDescription>
            Manage your list of approved suppliers and vendors.
          </CardDescription>
        </div>
        <Dialog open={isFormOpen} onOpenChange={setFormOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Vendor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Vendor</DialogTitle>
              <DialogDescription>
                Fill in the details below to add a new vendor. They will require KYC verification before they can participate in quotes.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vendor Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Acme Corporation" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contactPerson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="e.g. contact@acme.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. (555) 123-4567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 123 Main St, Anytown, USA" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="ghost">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Vendor
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>KYC Status</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedVendors.length > 0 ? (
                paginatedVendors.map((vendor, index) => (
                  <TableRow key={vendor.id}>
                    <TableCell className="text-muted-foreground">{(currentPage - 1) * PAGE_SIZE + index + 1}</TableCell>
                    <TableCell className="font-medium text-primary">{vendor.name}</TableCell>
                    <TableCell>{vendor.contactPerson}</TableCell>
                    <TableCell>{vendor.email}</TableCell>
                    <TableCell>
                      <KycStatusBadge status={vendor.kycStatus} reason={vendor.rejectionReason} />
                    </TableCell>
                    <TableCell>
                      {vendor.blacklist && (vendor.blacklist.blacklisted === true || vendor.blacklist.status === 'blacklisted') ? (
                        <Badge variant="destructive">Blacklisted</Badge>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleOpenDetails(vendor)}>Details</Button>
                        {canManageVendors ? (
                          vendor.blacklist && (vendor.blacklist.blacklisted === true || vendor.blacklist.status === 'blacklisted') ? (
                            <Button size="sm" variant="outline" onClick={() => handleUnblacklist(vendor.id)}>Unblacklist</Button>
                          ) : (
                            <Button size="sm" variant="destructive" onClick={() => handleBlacklist(vendor.id)}>Blacklist</Button>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <Building2 className="h-16 w-16 text-muted-foreground/50" />
                      <div className="space-y-1">
                        <p className="font-semibold">No Vendors Found</p>
                        <p className="text-muted-foreground">There are no vendors to display. Try adding one!</p>
                      </div>
                      <DialogTrigger asChild>
                        <Button size="sm">
                          <PlusCircle className="mr-2 h-4 w-4" />
                          Add Vendor
                        </Button>
                      </DialogTrigger>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages} ({vendors.length} total vendors)
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}><ChevronsLeft /></Button>
            <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft /></Button>
            <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight /></Button>
            <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}><ChevronsRight /></Button>
          </div>
        </div>
      </CardContent>
      <Dialog open={isDetailsOpen} onOpenChange={(open) => {
        setIsDetailsOpen(open);
        if (!open) {
          setSelectedVendor(null);
        }
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Vendor Details</DialogTitle>
            <DialogDescription>
              View full vendor profile and participation history.
            </DialogDescription>
          </DialogHeader>
          {selectedVendor && (
            <Tabs defaultValue="details" className="mt-4">
              <TabsList>
                <TabsTrigger value="details">Vendor Details</TabsTrigger>
                <TabsTrigger value="participation">Participation History</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="mt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Vendor Name</p>
                    <p className="font-medium">{selectedVendor.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Contact Person</p>
                    <p className="font-medium">{selectedVendor.contactPerson}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="font-medium">{selectedVendor.email || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="font-medium">{selectedVendor.phone}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs text-muted-foreground">Address</p>
                    <p className="font-medium break-words">{selectedVendor.address}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">KYC Status</p>
                    <div className="mt-1">
                      <KycStatusBadge status={selectedVendor.kycStatus} reason={selectedVendor.rejectionReason} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Blacklist Status</p>
                    <div className="mt-1">
                      {selectedVendor.blacklist && (selectedVendor.blacklist.blacklisted === true || selectedVendor.blacklist.status === 'blacklisted') ? (
                        <Badge variant="destructive">Blacklisted</Badge>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">KYC Documents</p>
                  {selectedVendor.kycDocuments && selectedVendor.kycDocuments.length > 0 ? (
                    <ScrollArea className="max-h-40 border rounded-md p-2">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Document</TableHead>
                            <TableHead>Submitted At</TableHead>
                            <TableHead>Link</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedVendor.kycDocuments.map((doc, idx) => (
                            <TableRow key={idx}>
                              <TableCell>{doc.name}</TableCell>
                              <TableCell>{doc.submittedAt ? new Date(doc.submittedAt).toLocaleString() : '—'}</TableCell>
                              <TableCell>
                                {doc.url && doc.url !== '#' ? (
                                  <a href={doc.url} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                                    Open
                                  </a>
                                ) : (
                                  <span className="text-xs text-muted-foreground">N/A</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  ) : (
                    <p className="text-sm text-muted-foreground">No KYC documents recorded.</p>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="participation" className="mt-4">
                {historyLoading && (
                  <div className="flex h-32 items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                )}
                {!historyLoading && historyError && (
                  <p className="text-sm text-destructive">{historyError}</p>
                )}
                {!historyLoading && !historyError && (
                  vendorParticipation.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      This vendor has not yet participated in any requisitions.
                    </p>
                  ) : (
                    <ScrollArea className="max-h-64 border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Requisition</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Quote Status</TableHead>
                            <TableHead className="text-right">Total Price</TableHead>
                            <TableHead className="text-right">Score</TableHead>
                            <TableHead>Created</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {vendorParticipation.map(row => (
                            <TableRow key={row.requisitionId}>
                              <TableCell>
                                <div className="space-y-0.5">
                                  <div className="font-medium">{row.title}</div>
                                  <div className="text-xs text-muted-foreground">{row.requisitionId}</div>
                                </div>
                              </TableCell>
                              <TableCell>{row.status}</TableCell>
                              <TableCell>{row.quoteStatus}</TableCell>
                              <TableCell className="text-right">
                                {row.totalPrice != null ? row.totalPrice.toFixed ? row.totalPrice.toFixed(2) : row.totalPrice : '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                {row.score != null ? row.score.toFixed ? row.score.toFixed(2) : row.score : '—'}
                              </TableCell>
                              <TableCell>
                                {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )
                )}
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
