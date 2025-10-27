"use client";

import React, { useState } from 'react';
import { Card, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogTrigger } from './ui/dialog';
import { AwardCenterDialog } from './award-center-dialog';
import { PurchaseRequisition, Quotation } from '@/lib/types';

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
            <CardFooter className="pt-6">
                <Dialog open={isAwardCenterOpen} onOpenChange={setAwardCenterOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            {isFinalizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Award Standby
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
