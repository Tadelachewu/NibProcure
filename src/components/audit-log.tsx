

'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { format, formatDistanceToNow } from 'date-fns';
import { AuditLog as AuditLogType, UserRole } from '@/lib/types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import {
  Search,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ListX,
  Loader2,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { useAuth } from '@/contexts/auth-context';

const PAGE_SIZE = 15;

export function AuditLog() {
  const [logs, setLogs] = useState<AuditLogType[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtering and pagination state
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<{ role: string; action: string; date?: Date }>({ role: 'all', action: 'all' });
  const [currentPage, setCurrentPage] = useState(1);
  const { user, role } = useAuth();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/audit-log');
      const data = await response.json();
      setLogs(data);
    } catch (error) {
      console.error("Failed to fetch audit logs", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    window.addEventListener('focus', fetchLogs);
    return () => {
      window.removeEventListener('focus', fetchLogs);
    };
  }, [fetchLogs]);

  const uniqueRoles = useMemo(() => ['all', ...Array.from(new Set(logs.map(log => log.role)))], [logs]);
  const uniqueActions = useMemo(() => ['all', ...Array.from(new Set(logs.map(log => log.action)))], [logs]);

  const filteredLogs = useMemo(() => {
    return logs
      .filter(log => {
        const lowerSearch = searchTerm.toLowerCase();
        return (
          (log.user && log.user.toLowerCase().includes(lowerSearch)) ||
          (log.entity && log.entity.toLowerCase().includes(lowerSearch)) ||
          (log.entityId && log.entityId.toLowerCase().includes(lowerSearch)) ||
          (log.details && log.details.toLowerCase().includes(lowerSearch))
        );
      })
      .filter(log => filters.role === 'all' || log.role === filters.role)
      .filter(log => filters.action === 'all' || log.action === filters.action)
      .filter(log => !filters.date || new Date(log.timestamp).toDateString() === filters.date.toDateString());
  }, [logs, searchTerm, filters]);

  const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE);
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredLogs.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredLogs, currentPage]);

  const handleFilterChange = (filterType: 'role' | 'action', value: string) => {
    setFilters(prev => ({ ...prev, [filterType]: value }));
    setCurrentPage(1);
  };
  
  const handleDateChange = (date?: Date) => {
      setFilters(prev => ({...prev, date}));
      setCurrentPage(1);
  }

  const clearFilters = () => {
    setSearchTerm('');
    setFilters({ role: 'all', action: 'all', date: undefined });
    setCurrentPage(1);
  };

  const getActionVariant = (action: string) => {
    const lowerAction = action.toLowerCase();
    if (lowerAction.includes('create') || lowerAction.includes('approve') || lowerAction.includes('award') || lowerAction.includes('match')) return 'default';
    if (lowerAction.includes('update') || lowerAction.includes('submit') || lowerAction.includes('attach')) return 'secondary';
    if (lowerAction.includes('reject') || lowerAction.includes('dispute')) return 'destructive';
    return 'outline';
  };
  
   if (role !== 'Procurement Officer' && role !== 'Admin') {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Access Denied</CardTitle>
            </CardHeader>
            <CardContent>
                <p>You do not have permission to view the audit log.</p>
            </CardContent>
        </Card>
    )
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Audit Log</CardTitle>
        <CardDescription>
          A chronological and filterable log of all actions and events in the system.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4 mb-4 p-4 bg-muted/50 rounded-lg">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search details, entities..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filters.role} onValueChange={value => handleFilterChange('role', value)}>
            <SelectTrigger className="flex-1 min-w-[150px]">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              {uniqueRoles.map(role => <SelectItem key={role} value={role}>{role === 'all' ? 'All Roles' : role}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.action} onValueChange={value => handleFilterChange('action', value)}>
            <SelectTrigger className="flex-1 min-w-[150px]">
              <SelectValue placeholder="Filter by action" />
            </SelectTrigger>
            <SelectContent>
              {uniqueActions.map(action => <SelectItem key={action} value={action}>{action === 'all' ? 'All Actions' : action}</SelectItem>)}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="flex-1 min-w-[150px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.date ? format(filters.date, 'PPP') : <span>Filter by date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={filters.date} onSelect={handleDateChange} initialFocus />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" onClick={clearFilters}>Clear</Button>
        </div>

        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead className="w-[150px]">Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead className="w-[40%]">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLogs.length > 0 ? paginatedLogs.map((log, index) => (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground">{(currentPage - 1) * PAGE_SIZE + index + 1}</TableCell>
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="text-muted-foreground text-xs text-left cursor-default">
                          {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{format(new Date(log.timestamp), 'PPpp')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="font-medium">{log.user}</TableCell>
                  <TableCell>{log.role}</TableCell>
                  <TableCell>
                    <Badge variant={getActionVariant(log.action)}>{log.action}</Badge>
                  </TableCell>
                  <TableCell>
                    {log.entity}: <span className="text-muted-foreground">{log.entityId}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{log.details}</TableCell>
                </TableRow>
              )) : (
                <TableRow>
                    <TableCell colSpan={7} className="h-48 text-center">
                        <div className="flex flex-col items-center gap-4">
                            <ListX className="h-16 w-16 text-muted-foreground/50" />
                            <div className="space-y-1">
                                <p className="font-semibold">No Logs Found</p>
                                <p className="text-muted-foreground">There are no audit logs matching your current filters.</p>
                            </div>
                        </div>
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages} ({filteredLogs.length} total logs)
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}><ChevronsLeft /></Button>
            <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft /></Button>
            <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight /></Button>
            <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}><ChevronsRight /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
