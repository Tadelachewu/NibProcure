
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
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="committees">Committees</TabsTrigger>
        <TabsTrigger value="permissions">Role Permissions</TabsTrigger>
        <TabsTrigger value="roles">Role Management</TabsTrigger>
        <TabsTrigger value="users">User Management</TabsTrigger>
        <TabsTrigger value="departments">Departments</TabsTrigger>
      </TabsList>
      <TabsContent value="general">
        <Accordion type="single" collapsible className="w-full space-y-4">
            <AccordionItem value="item-1">
                <AccordionTrigger className="text-lg font-semibold p-4 bg-muted/50 rounded-md">RFQ & Requisition Permissions</AccordionTrigger>
                <AccordionContent className="pt-4 space-y-6">
                    <RfqSettings />
                    <RequisitionCreatorSettings />
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
