
'use client';

import { useEffect } from 'react';
import { workflowEventBus } from '@/lib/workflow-event-bus';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';

export function WorkflowListener() {
  const { toast } = useToast();
  const { token } = useAuth();

  useEffect(() => {
    const handleAwardRejected = async (data: { requisitionId: string, userId: string, comment: string }) => {
      if (!token) return;

      console.log('[WorkflowListener] Caught awardRejected event:', data);
      
      try {
        const response = await fetch('/api/workflows/rejection', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'The rejection workflow failed.');
        }

        toast({
          title: 'Rejection Processed',
          description: result.message || 'The requisition has been rolled back.',
          variant: 'success'
        });

        // Optionally, you could emit another event here to trigger a data refresh in the UI
        workflowEventBus.emit('dataChanged', { entity: 'requisition', id: data.requisitionId });

      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Workflow Error',
          description: error instanceof Error ? error.message : 'Could not process the rejection workflow.',
        });
      }
    };

    workflowEventBus.on('awardRejected', handleAwardRejected);

    return () => {
      workflowEventBus.off('awardRejected', handleAwardRejected);
    };
  }, [toast, token]);

  return null; // This component does not render anything
}
