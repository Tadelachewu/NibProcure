
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { PurchaseRequisition } from '@/lib/types';
import { isPast } from 'date-fns';

interface RfqStatusManagerProps {
  requisition: PurchaseRequisition;
  onStatusChange: () => void;
}

export function RfqStatusManager({ requisition, onStatusChange }: RfqStatusManagerProps) {
  const { token } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const checkDeadline = async () => {
      if (
        !token ||
        isUpdating ||
        requisition.status !== 'Accepting_Quotes' ||
        !requisition.deadline ||
        !isPast(new Date(requisition.deadline))
      ) {
        return;
      }

      setIsUpdating(true);
      try {
        const response = await fetch(`/api/requisitions/${requisition.id}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: 'Ready_for_Opening' }),
        });

        if (response.ok) {
          onStatusChange();
        } else {
          console.error('Failed to update requisition status automatically.');
        }
      } catch (error) {
        console.error('Error during automatic status update:', error);
      } finally {
        setIsUpdating(false);
      }
    };

    const interval = setInterval(checkDeadline, 30000); // Check every 30 seconds
    checkDeadline(); // Check immediately on component mount

    return () => clearInterval(interval);
  }, [requisition, token, isUpdating, onStatusChange]);

  return null; // This is a logic component, it does not render anything
}

    