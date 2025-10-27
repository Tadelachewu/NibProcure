
"use client";

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogTrigger } from './ui/dialog';
import { AwardCenterDialog } from './award-center-dialog';
import { PurchaseRequisition, Quotation } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Info } from 'lucide-react';

interface AwardStandbyButtonProps {
    requisition: PurchaseRequisition;
    quotations: Quotation[];
    isFinalizing: boolean;
    onFinalize: (awardStrategy: 'all' | 'item', awards: any, awardResponseDeadline?: Date) => void;
}

export function AwardStandbyButton({
    requisition,
    quotations,
    isFinalizing,
    onFinalize,
}: AwardStandbyButtonProps) {
    const [isAwardCenterOpen, setAwardCenterOpen] = useState(false);

    return (
        <Card className="mt-6 border-amber-500">
             <CardHeader>
                <CardTitle>Action Required: Award Declined</CardTitle>
                <CardDescription>
                   A previously awarded vendor has declined. You must now award a standby vendor or restart the RFQ process.
                </CardDescription>
            </CardHeader>
            <CardFooter className="pt-0">
                <Dialog open={isAwardCenterOpen} onOpenChange={setAwardCenterOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            {isFinalizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Re-Award
                        </Button>
                    </DialogTrigger>
                    <AwardCenterDialog 
                        requisition={requisition}
                        quotations={quotations}
                        onFinalize={onFinalize}
                        onClose={() => setAwardCenterOpen(false)}
                    />
                </Dialog>
            </CardFooter>
        </Card>
    );
}
