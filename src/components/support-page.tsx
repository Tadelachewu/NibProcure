
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, MessageSquare, Ticket, LifeBuoy, X, Check, Clock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { SupportTicket } from '@/lib/types';
import { format, formatDistanceToNow } from 'date-fns';
import { Badge } from './ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from './ui/dialog';

const ticketFormSchema = z.object({
  subject: z.string().min(5, "Subject must be at least 5 characters."),
  message: z.string().min(10, "Message must be at least 10 characters."),
});

const responseFormSchema = z.object({
    response: z.string().min(10, "Response must be at least 10 characters."),
    status: z.enum(['In_Progress', 'Closed']),
});

function AdminView({ tickets, onTicketUpdated }: { tickets: SupportTicket[], onTicketUpdated: () => void }) {
    const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    const { user: admin, token } = useAuth();
    const responseStorageKey = selectedTicket ? `support-response-${selectedTicket.id}` : null;
    
    const form = useForm<z.infer<typeof responseFormSchema>>({
        resolver: zodResolver(responseFormSchema),
        defaultValues: { response: '', status: 'In_Progress' },
    });

    const responseValue = form.watch('response');
    
    useEffect(() => {
        if(selectedTicket) {
            const savedResponse = localStorage.getItem(`support-response-${selectedTicket.id}`);
            form.reset({
                response: savedResponse || selectedTicket.response || '',
                status: selectedTicket.status.replace(/ /g, '_') as 'In_Progress' | 'Closed',
            });
        }
    }, [selectedTicket, form]);

    useEffect(() => {
        if (responseStorageKey && responseValue) {
            localStorage.setItem(responseStorageKey, responseValue);
        }
    }, [responseValue, responseStorageKey]);

    const handleRespond = async (values: z.infer<typeof responseFormSchema>) => {
        if (!selectedTicket || !admin || !token) return;
        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/support/${selectedTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ 
                    response: values.response,
                    status: values.status,
                    adminId: admin.id 
                }),
            });
            if (!res.ok) throw new Error("Failed to submit response.");
            toast({ title: "Response Sent", description: "The user has been notified."});
            if (responseStorageKey) {
                localStorage.removeItem(responseStorageKey);
            }
            onTicketUpdated();
            setSelectedTicket(null);
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: "Could not send response."});
        } finally {
            setIsSubmitting(false);
        }
    }
    
    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Support Tickets</CardTitle>
                    <CardDescription>Review and respond to user-submitted issues.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Subject</TableHead>
                                <TableHead>Requester</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Submitted</TableHead>
                                <TableHead>Last Update</TableHead>
                                <TableHead></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tickets.map(ticket => (
                                <TableRow key={ticket.id}>
                                    <TableCell className="font-medium">{ticket.subject}</TableCell>
                                    <TableCell>{ticket.requester.name}</TableCell>
                                    <TableCell><Badge variant={ticket.status === 'Closed' ? 'default' : 'secondary'}>{ticket.status.replace(/_/g, ' ')}</Badge></TableCell>
                                    <TableCell>{formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</TableCell>
                                    <TableCell>{formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="outline" size="sm" onClick={() => setSelectedTicket(ticket)}>View & Respond</Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            <Dialog open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicket(null)}>
                <DialogContent className="sm:max-w-2xl">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleRespond)}>
                            <DialogHeader>
                                <DialogTitle>Ticket: {selectedTicket?.subject}</DialogTitle>
                                <DialogDescription>From: {selectedTicket?.requester.name} on {selectedTicket && format(new Date(selectedTicket.createdAt), 'PPp')}</DialogDescription>
                            </DialogHeader>
                            <div className="py-4 space-y-4">
                                <div>
                                    <Label>User's Message</Label>
                                    <p className="text-sm p-3 border rounded-md bg-muted/50">{selectedTicket?.message}</p>
                                </div>
                                <FormField control={form.control} name="response" render={({field}) => (
                                    <FormItem><FormLabel>Your Response</FormLabel><FormControl><Textarea rows={6} placeholder="Type your response to the user..." {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name="status" render={({field}) => (
                                    <FormItem><FormLabel>Update Status</FormLabel><FormControl>
                                        <select {...field} className="w-full p-2 border rounded-md bg-background">
                                            <option value="In_Progress">In Progress</option>
                                            <option value="Closed">Closed</option>
                                        </select>
                                    </FormControl><FormMessage /></FormItem>
                                )} />
                            </div>
                            <DialogFooter>
                                <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Submit Response
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </>
    );
}

function UserView({ tickets, onTicketSubmitted }: { tickets: SupportTicket[], onTicketSubmitted: () => void }) {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const storageKey = 'new-support-ticket-form';

  const form = useForm<z.infer<typeof ticketFormSchema>>({
    resolver: zodResolver(ticketFormSchema),
    defaultValues: { subject: '', message: '' },
  });

  useEffect(() => {
    const savedData = localStorage.getItem(storageKey);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        form.reset(parsed);
        toast({ title: 'Draft Restored', description: 'Your unsaved ticket has been restored.' });
      } catch(e) {
        console.error("Failed to parse saved ticket data", e);
      }
    }
  }, [form, toast]);

  useEffect(() => {
    const subscription = form.watch((value) => {
      localStorage.setItem(storageKey, JSON.stringify(value));
    });
    return () => subscription.unsubscribe();
  }, [form, storageKey]);


  const onSubmit = async (values: z.infer<typeof ticketFormSchema>) => {
    if (!user || !token) return;
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...values, requesterId: user.id }),
      });
      if (!response.ok) throw new Error("Failed to submit ticket.");
      toast({ title: "Ticket Submitted", description: "Our admin team will get back to you shortly." });
      form.reset();
      localStorage.removeItem(storageKey);
      onTicketSubmitted();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: "Could not submit your ticket." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageSquare /> Submit a Support Ticket</CardTitle>
          <CardDescription>Encountered an issue? Let us know.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="subject" render={({ field }) => (
                <FormItem><FormLabel>Subject</FormLabel><FormControl><Input placeholder="e.g., Cannot find approve button" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="message" render={({ field }) => (
                <FormItem><FormLabel>Message</FormLabel><FormControl><Textarea rows={8} placeholder="Please describe the issue in detail..." {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Send className="mr-2 h-4 w-4" />
                Submit Ticket
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Ticket /> Your Ticket History</CardTitle>
          <CardDescription>Your previously submitted tickets and their status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            {tickets.length > 0 ? tickets.map(ticket => (
                <Card key={ticket.id} className="p-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="font-semibold">{ticket.subject}</p>
                            <p className="text-xs text-muted-foreground">Submitted {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</p>
                        </div>
                        <Badge variant={ticket.status === 'Closed' ? 'default' : 'secondary'}>{ticket.status.replace(/_/g, ' ')}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 p-2 border-l-2">{ticket.message}</p>
                    {ticket.response && (
                         <div className="mt-3 pt-3 border-t">
                            <p className="text-sm font-semibold text-primary">Admin Response</p>
                            <p className="text-sm text-muted-foreground mt-1 p-2">{ticket.response}</p>
                         </div>
                    )}
                </Card>
            )) : (
                <div className="text-center py-10 text-muted-foreground">
                    <LifeBuoy className="mx-auto h-12 w-12" />
                    <p className="mt-4">You haven't submitted any tickets yet.</p>
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

export function SupportPage() {
  const { user, role, token } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTickets = useCallback(async () => {
    if (!user || !token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/support', {
          headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setTickets(data);
    } catch (error) {
      console.error("Failed to fetch tickets", error);
    } finally {
      setLoading(false);
    }
  }, [user, token]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div>
      {role === 'Admin' ? (
        <AdminView tickets={tickets} onTicketUpdated={fetchTickets} />
      ) : (
        <UserView tickets={tickets} onTicketSubmitted={fetchTickets} />
      )}
    </div>
  );
}
