
'use client';

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
    <Accordion type="single" collapsible className="w-full space-y-4" defaultValue="item-1">
      <AccordionItem value="item-1">
        <AccordionTrigger className="text-xl font-semibold">General Settings</AccordionTrigger>
        <AccordionContent className="pt-4">
          <div className="space-y-6">
            <RfqSettings />
            <RequisitionCreatorSettings />
            <QuorumSettings />
            <ApprovalMatrixEditor />
          </div>
        </AccordionContent>
      </AccordionItem>
      
      <AccordionItem value="item-2">
        <AccordionTrigger className="text-xl font-semibold">Committee Configuration</AccordionTrigger>
        <AccordionContent className="pt-4">
          <CommitteeSettings />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="item-3">
        <AccordionTrigger className="text-xl font-semibold">Role Permissions</AccordionTrigger>
        <AccordionContent className="pt-4">
          <RolePermissionsEditor />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="item-4">
        <AccordionTrigger className="text-xl font-semibold">Role Management</AccordionTrigger>
        <AccordionContent className="pt-4">
          <RoleManagementEditor />
        </AccordionContent>
      </AccordionItem>
      
      <AccordionItem value="item-5">
        <AccordionTrigger className="text-xl font-semibold">User Management</AccordionTrigger>
        <AccordionContent className="pt-4">
          <UserManagementEditor />
        </AccordionContent>
      </AccordionItem>
      
      <AccordionItem value="item-6">
        <AccordionTrigger className="text-xl font-semibold">Department Management</AccordionTrigger>
        <AccordionContent className="pt-4">
          <DepartmentManagementEditor />
        </AccordionContent>
      </AccordionItem>

    </Accordion>
  );
}
