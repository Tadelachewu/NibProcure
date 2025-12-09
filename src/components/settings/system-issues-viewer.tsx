
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Inbox, ServerCrash } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';

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
}

export function SystemIssuesViewer() {
  const [issues, setIssues] = useState<SystemIssue[]>([]);
  const [loading, setLoading] = useState(true);
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
                      <Badge variant={issue.status === 'Open' ? 'secondary' : 'default'}>{issue.status}</Badge>
                    </TableCell>
                    <TableCell>{format(new Date(issue.createdAt), 'PP')}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-48 text-center">
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
  );
}
