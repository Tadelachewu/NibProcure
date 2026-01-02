
'use client';

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { RolePermissionsEditor } from './role-permissions-editor';
import { RoleManagementEditor } from './role-management-editor';
import { DepartmentManagementEditor } from './department-management-editor';
import { UserManagementEditor } from './user-management-editor';
import { RfqSettings } from './settings/rfq-settings';
import { CommitteeSettings } from './settings/committee-settings';
import { ApprovalMatrixEditor } from './settings/approval-matrix-editor';
import { QuorumSettings } from './settings/quorum-settings';
import { RequisitionCreatorSettings } from './settings/requisition-creator-settings';


export function SettingsPage() {
  return (
    <Tabs defaultValue="general" className="space-y-4">
      <div className="sticky top-0 z-40 -mx-4 border-b bg-background md:-mx-6 lg:-mx-8">
        <div className="px-4 md:px-6 lg:px-8">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger className="w-full" value="general">General</TabsTrigger>
            <TabsTrigger className="w-full" value="committees">Committees</TabsTrigger>
            <TabsTrigger className="w-full" value="permissions">Role Permissions</TabsTrigger>
            <TabsTrigger className="w-full" value="roles">Role Management</TabsTrigger>
            <TabsTrigger className="w-full" value="users">User Management</TabsTrigger>
            <TabsTrigger className="w-full" value="departments">Departments</TabsTrigger>
          </TabsList>
        </div>
      </div>
      <TabsContent value="general">
        <Accordion type="single" collapsible className="w-full space-y-4" defaultValue="item-1">
            <AccordionItem value="item-1">
                <AccordionTrigger className="text-lg font-semibold p-4 bg-muted/50 rounded-md">RFQ & Requisition Permissions</AccordionTrigger>
                <AccordionContent className="pt-4 space-y-6">
                    <Accordion type="single" collapsible className="w-full space-y-4">
                        <AccordionItem value="rfq-sender">
                            <AccordionTrigger>RFQ Sender Configuration</AccordionTrigger>
                            <AccordionContent className="pt-2">
                                <RfqSettings />
                            </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="req-creator">
                            <AccordionTrigger>Requisition Creator Permissions</AccordionTrigger>
                            <AccordionContent className="pt-2">
                                <RequisitionCreatorSettings />
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
                <AccordionTrigger className="text-lg font-semibold p-4 bg-muted/50 rounded-md">Quorum Settings</AccordionTrigger>
                <AccordionContent className="pt-4">
                    <QuorumSettings />
                </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
                <AccordionTrigger className="text-lg font-semibold p-4 bg-muted/50 rounded-md">Approval Matrix</AccordionTrigger>
                <AccordionContent className="pt-4">
                    <ApprovalMatrixEditor />
                </AccordionContent>
            </AccordionItem>
        </Accordion>
      </TabsContent>
      <TabsContent value="committees">
        <CommitteeSettings />
      </TabsContent>
      <TabsContent value="permissions">
        <RolePermissionsEditor />
      </TabsContent>
       <TabsContent value="roles">
        <RoleManagementEditor />
      </TabsContent>
       <TabsContent value="users">
        <UserManagementEditor />
      </TabsContent>
       <TabsContent value="departments">
        <DepartmentManagementEditor />
      </TabsContent>
    </Tabs>
  );
}
