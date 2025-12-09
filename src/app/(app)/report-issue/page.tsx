'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, MessageSquare, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

const issueFormSchema = z.object({
  title: z.string().min(10, { message: 'Title must be at least 10 characters long.' }),
  description: z.string().min(20, { message: 'Description must be at least 20 characters long.' }),
  priority: z.enum(['Low', 'Medium', 'High']),
});

type IssueFormValues = z.infer<typeof issueFormSchema>;

interface SystemIssue {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
  response?: string;
  respondedAt?: string;
}

export default function ReportIssuePage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedIssues, setSubmittedIssues] = useState<SystemIssue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(true);
  const { user, token } = useAuth();

  const form = useForm<IssueFormValues>({
    resolver: zodResolver(issueFormSchema),
    defaultValues: {
      title: '',
      description: '',
      priority: 'Medium',
    },
  });

  const fetchIssues = useCallback(async () => {
    if (!user || !token) return;
    setLoadingIssues(true);
    try {
      const response = await fetch(`/api/issues?userId=${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch your issues.');
      const data = await response.json();
      setSubmittedIssues(data);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Could not fetch your reported issues.',
      });
    } finally {
      setLoadingIssues(false);
    }
  }, [user, token, toast]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const onSubmit = async (values: IssueFormValues) => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/issues', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit issue.');
      }

      toast({
        title: 'Issue Reported',
        description: 'Thank you for your feedback. Our team will look into it.',
      });
      form.reset();
      fetchIssues(); // Refresh the list after submitting
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Submission Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const getStatusVariant = (status: string): 'default' | 'secondary' | 'outline' | 'destructive' => {
      switch(status) {
        case 'Closed': return 'default';
        case 'In Progress': return 'secondary';
        case 'Open': 
        default: return 'outline';
      }
  }

  return (
    <div className="grid md:grid-cols-2 gap-8">
      <Card>
        <CardHeader>
          <CardTitle>Report a System Issue</CardTitle>
          <CardDescription>
            Encountered a bug or have a suggestion? Let us know. Please provide as much detail as possible.
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              <FormField control={form.control} name="title" render={({ field }) => ( <FormItem><FormLabel>Title</FormLabel><FormControl><Input placeholder="e.g., Unable to submit new requisition" {...field} /></FormControl><FormMessage /></FormItem> )} />
              <FormField control={form.control} name="description" render={({ field }) => ( <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="Describe the issue in detail. What were you doing? What did you expect to happen? What actually happened?" rows={8} {...field} /></FormControl><FormMessage /></FormItem> )} />
              <FormField control={form.control} name="priority" render={({ field }) => ( <FormItem><FormLabel>Priority</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="Low">Low - Minor issue or suggestion</SelectItem><SelectItem value="Medium">Medium - Affects functionality but has a workaround</SelectItem><SelectItem value="High">High - Blocks me from completing a task</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Submit Report
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
      <Card>
        <CardHeader>
            <CardTitle>Your Submitted Issues</CardTitle>
            <CardDescription>Track the status of issues you've reported.</CardDescription>
        </CardHeader>
        <CardContent>
            {loadingIssues ? (
                <div className="flex justify-center items-center h-48"><Loader2 className="h-8 w-8 animate-spin"/></div>
            ) : submittedIssues.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">You have not reported any issues yet.</p>
            ) : (
                <Accordion type="single" collapsible className="w-full">
                    {submittedIssues.map(issue => (
                        <AccordionItem key={issue.id} value={issue.id}>
                            <AccordionTrigger>
                                <div className="flex flex-col text-left">
                                    <span className="font-semibold">{issue.title}</span>
                                    <span className="text-xs text-muted-foreground">
                                        Reported on {format(new Date(issue.createdAt), 'PP')} - 
                                        Status: <Badge variant={getStatusVariant(issue.status)} className="ml-1 text-xs">{issue.status}</Badge>
                                    </span>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="space-y-4">
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{issue.description}</p>
                                {issue.response ? (
                                    <div className="p-4 bg-green-500/10 border-l-4 border-green-500 rounded-r-md">
                                        <div className="flex items-center gap-2 mb-2">
                                            <CheckCircle className="h-5 w-5 text-green-600"/>
                                            <h4 className="font-semibold text-green-800">Response from Admin</h4>
                                        </div>
                                        <p className="text-sm text-green-900 italic">"{issue.response}"</p>
                                        <p className="text-xs text-green-700 mt-2">Responded on {format(new Date(issue.respondedAt!), 'PPp')}</p>
                                    </div>
                                ) : (
                                     <div className="p-4 bg-amber-500/10 border-l-4 border-amber-500 rounded-r-md">
                                        <div className="flex items-center gap-2">
                                            <Clock className="h-5 w-5 text-amber-600"/>
                                            <h4 className="font-semibold text-amber-800">Awaiting Response</h4>
                                        </div>
                                        <p className="text-sm text-amber-900">An administrator will review your issue soon.</p>
                                    </div>
                                )}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
