"use client";

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function ComplianceIndexPage() {
  const { user } = useAuth();
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/requisitions');
        const data = await res.json();
        const items = data?.requisitions || [];
        setRequisitions(items);
      } catch (e) {
        console.error('Failed to load requisitions for compliance index', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const assigned = useMemo(() => {
    if (!user) return [];
    const uid = user.id;
    return requisitions.filter(r => (r.financialCommitteeMemberIds || []).includes(uid) || (r.technicalCommitteeMemberIds || []).includes(uid) || (r.committeeAssignments || []).some((a:any) => a.userId === uid));
  }, [requisitions, user]);

  if (loading) return <div className="p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Compliance</h1>
        <p className="text-sm text-muted-foreground">Access assigned requisitions and perform compliance checks.</p>
      </div>

      {assigned.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No assigned requisitions</CardTitle>
            <CardDescription>You have no requisitions assigned for compliance checks.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Link href="/requisitions"><Button>Browse Requisitions</Button></Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {assigned.map(r => (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{r.title}</span>
                  <span className="text-sm text-muted-foreground">{r.department}</span>
                </CardTitle>
                <CardDescription>{r.requesterName}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">Quotes: {r.quotations?.length || 0}</div>
                  <Link href={`/compliance/${r.id}`}><Button variant="outline">Open</Button></Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
