
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Inbox, ServerCrash, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface SystemIssue {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
  submittedBy: {
    name: string;
    email: string;
  };
  response?: string;
  responder?: { name: string };
}

export function SystemIssuesViewer() {
  const [issues, setIssues] = useState<SystemIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState<SystemIssue | null>(null);
  const [isResponding, setIsResponding] = useState(false);
  const [response, setResponse] = useState('');
  const [newStatus, setNewStatus] = useState('In Progress');
  const { token } = useAuth();
  const { toast } = useToast();

  const fetchIssues = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch('/api/issues', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch issues');
      }
      const data = await response.json();
      setIssues(data);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Could not fetch system issues.',
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const handleRespondClick = (issue: SystemIssue) => {
    setSelectedIssue(issue);
    setResponse(issue.response || '');
    setNewStatus(issue.status === 'Open' ? 'In Progress' : issue.status);
  };

  const handleResponseSubmit = async () => {
    if (!selectedIssue || !response.trim()) {
        toast({ variant: 'destructive', title: 'Error', description: 'Response cannot be empty.' });
        return;
    }
    setIsResponding(true);
    try {
        const response = await fetch(`/api/issues`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: selectedIssue.id, status: newStatus, response }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to submit response.');
        }
        toast({ title: 'Response Submitted', description: 'The issue has been updated.' });
        setSelectedIssue(null);
        fetchIssues();
    } catch (error) {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: error instanceof Error ? error.message : 'An unknown error occurred.',
        });
    } finally {
        setIsResponding(false);
    }
  };

  const getPriorityVariant = (priority: string) => {
    switch (priority) {
      case 'High': return 'destructive';
      case 'Medium': return 'secondary';
      case 'Low':
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>System Issue Reports</CardTitle>
          <CardDescription>Review issues and feedback submitted by users.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Submitted By</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.length > 0 ? (
                  issues.map((issue) => (
                    <TableRow key={issue.id}>
                      <TableCell>
                        <p className="font-medium">{issue.title}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-sm">{issue.description}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{issue.submittedBy.name}</p>
                        <p className="text-xs text-muted-foreground">{issue.submittedBy.email}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getPriorityVariant(issue.priority)}>{issue.priority}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={issue.status === 'Open' ? 'outline' : 'default'}>{issue.status}</Badge>
                      </TableCell>
                      <TableCell>{format(new Date(issue.createdAt), 'PP')}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => handleRespondClick(issue)}>
                            <MessageSquare className="mr-2 h-4 w-4"/>
                            {issue.response ? 'View / Edit' : 'Respond'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-48 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <Inbox className="h-16 w-16 text-muted-foreground/50" />
                        <p className="font-semibold">No Issues Reported</p>
                        <p className="text-muted-foreground">The issue report queue is empty.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      <Dialog open={!!selectedIssue} onOpenChange={(open) => !open && setSelectedIssue(null)}>
          <DialogContent className="max-w-2xl">
              <DialogHeader>
                  <DialogTitle>Respond to Issue: {selectedIssue?.title}</DialogTitle>
                  <DialogDescription>
                      Submitted by {selectedIssue?.submittedBy.name} on {selectedIssue?.createdAt ? format(new Date(selectedIssue.createdAt), 'PP') : ''}.
                  </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                  <Card>
                      <CardHeader><CardTitle className="text-base">Original Report</CardTitle></CardHeader>
                      <CardContent>
                          <p className="text-sm whitespace-pre-wrap">{selectedIssue?.description}</p>
                      </CardContent>
                  </Card>
                  <div>
                      <Label htmlFor="response">Your Response</Label>
                      <Textarea id="response" value={response} onChange={(e) => setResponse(e.target.value)} rows={6} className="mt-2" placeholder="Provide a solution or update..."/>
                  </div>
                   <div>
                      <Label htmlFor="status">Set Status</Label>
                      <Select value={newStatus} onValueChange={(value) => setNewStatus(value)}>
                          <SelectTrigger id="status" className="mt-2">
                              <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                              <SelectItem value="In Progress">In Progress</SelectItem>
                              <SelectItem value="Closed">Closed</SelectItem>
                          </SelectContent>
                      </Select>
                  </div>
              </div>
              <DialogFooter>
                  <Button variant="ghost" onClick={() => setSelectedIssue(null)}>Cancel</Button>
                  <Button onClick={handleResponseSubmit} disabled={isResponding}>
                      {isResponding && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                      Submit Response
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </>
  );
}
