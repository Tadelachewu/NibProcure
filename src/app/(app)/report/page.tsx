"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function ReportsIndexPage() {
    const { token, user } = useAuth();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // placeholder for potential prefetching or permission checks
    }, []);

    if (loading) return <div className="p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

    return (
        <div className="p-4 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold">Reports</h1>
                    <p className="text-sm text-muted-foreground">Access procurement reports and dashboards.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/report/status"><Button>Open Status Report</Button></Link>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Procurement Status</CardTitle>
                        <CardDescription>Daily / Weekly / Monthly rollups of requisition lifecycle.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">Overview of requisition counts by status, with CSV export.</p>
                        <div className="mt-3 flex gap-2">
                            <Link href="/report/status"><Button variant="outline">Open</Button></Link>
                            <a href="/api/reports/status?format=csv"><Button>Download CSV</Button></a>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Vendor Performance</CardTitle>
                        <CardDescription>Track vendor spend, PO counts and average quotation scores.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">Aggregated vendor metrics for performance dashboards and exports.</p>
                        <div className="mt-3 flex gap-2">
                            <Link href="/report/vendor-performance"><Button variant="outline">Open</Button></Link>
                            <a href="/api/reports/vendor-performance?format=csv"><Button>Download CSV</Button></a>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Exceptions & Risks</CardTitle>
                        <CardDescription>Audit-sourced exception events and risk logs.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">Review flagged audit entries and export exception logs.</p>
                        <div className="mt-3 flex gap-2">
                            <Link href="/report/exceptions"><Button variant="outline">Open</Button></Link>
                            <a href="/api/reports/exceptions?format=csv"><Button>Download CSV</Button></a>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Custom Requisition Report</CardTitle>
                        <CardDescription>Per-requisition full report and timeline export.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">Open an individual requisition report from the requisitions list.</p>
                        <div className="mt-3 flex gap-2">
                            <Link href="/report/requisitions"><Button variant="outline">Browse Requisitions</Button></Link>
                            <Link href="/requisitions"><Button variant="ghost">App Requisitions</Button></Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
