
'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo, useCallback } from 'react';
import { Department, User, UserRole } from '@/lib/types';
import { rolePermissions as defaultRolePermissions } from '@/lib/roles';

// Custom JWT decoding function to avoid dependency issues
function jwtDecode<T>(token: string): T | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;

    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join('')
    );

    return JSON.parse(jsonPayload) as T;
  } catch (error) {
    console.error("Failed to decode JWT:", error);
    return null;
  }
}


export interface RfqSenderSetting {
  type: 'all' | 'specific';
  userId?: string | null;
}

export interface ApprovalStep {
    role: UserRole;
    id?: string;
    order?: number;
}

export interface ApprovalThreshold {
    id: string;
    name: string;
    min: number;
    max: number | null; // null for infinity
    steps: ApprovalStep[];
}

interface CommitteeConfig {
    [key: string]: {
        min: number;
        max: number;
    }
}

interface Setting {
    key: string;
    value: any;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  role: UserRole | null;
  allUsers: User[];
  departments: Department[];
  rolePermissions: Record<UserRole, string[]>;
  rfqSenderSetting: RfqSenderSetting;
  approvalThresholds: ApprovalThreshold[];
  committeeConfig: CommitteeConfig;
  settings: Setting[];
  rfqQuorum: number;
  committeeQuorum: number;
  login: (token: string, user: User, role: UserRole) => Promise<void>;
  logout: () => void;
  loading: boolean;
  switchUser: (userId: string) => void;
  updateRolePermissions: (newPermissions: Record<UserRole, string[]>) => Promise<void>;
  updateRfqSenderSetting: (newSetting: RfqSenderSetting) => Promise<void>;
  updateUserRole: (userId: string, newRole: UserRole) => void;
  updateApprovalThresholds: (newThresholds: ApprovalThreshold[]) => void;
  updateCommitteeConfig: (newConfig: any) => Promise<void>;
  updateSetting: (key: string, value: any) => Promise<void>;
  fetchAllUsers: () => Promise<User[]>;
  fetchAllSettings: () => Promise<void>;
  fetchAllDepartments: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolePermissions, setRolePermissions] = useState<Record<UserRole, string[]>>(defaultRolePermissions);
  const [rfqSenderSetting, setRfqSenderSetting] = useState<RfqSenderSetting>({ type: 'all' });
  const [approvalThresholds, setApprovalThresholds] = useState<ApprovalThreshold[]>([]);
  const [committeeConfig, setCommitteeConfig] = useState<CommitteeConfig>({});
  const [settings, setSettings] = useState<Setting[]>([]);
  const [rfqQuorum, setRfqQuorum] = useState<number>(3);
  const [committeeQuorum, setCommitteeQuorum] = useState<number>(3);

  const fetchAllSettings = useCallback(async () => {
    try {
      const settingsRes = await fetch('/api/settings');
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setSettings(settingsData);
        
        const rfqSetting = settingsData.find((s:any) => s.key === 'rfqSenderSetting');
        if (rfqSetting) setRfqSenderSetting(rfqSetting.value);
        
        const committeeConf = settingsData.find((s:any) => s.key === 'committeeConfig');
        if (committeeConf) setCommitteeConfig(committeeConf.value);
        
        const rolePerms = settingsData.find((s:any) => s.key === 'rolePermissions');
        if (rolePerms) setRolePermissions(rolePerms.value);
        
        const rfqQuorumSetting = settingsData.find((s:any) => s.key === 'rfqQuorum');
        if (rfqQuorumSetting) setRfqQuorum(Number(rfqQuorumSetting.value));
        
        const committeeQuorumSetting = settingsData.find((s:any) => s.key === 'committeeQuorum');
        if (committeeQuorumSetting) setCommitteeQuorum(Number(committeeQuorumSetting.value));
      }
      
      const approvalMatrixRes = await fetch('/api/settings/approval-matrix');
      if (approvalMatrixRes.ok) {
        const matrixData = await approvalMatrixRes.json();
        setApprovalThresholds(matrixData);
      }

    } catch (error) {
        console.error("Failed to fetch settings", error);
    }
  }, []);

  const fetchAllDepartments = useCallback(async () => {
    try {
      const response = await fetch('/api/departments');
      if (response.ok) {
        const deptsData = await response.json();
        setDepartments(deptsData);
      }
    } catch (error) {
      console.error("Failed to fetch departments", error);
    }
  }, []);

  const fetchAllUsers = useCallback(async () => {
    try {
        const response = await fetch('/api/users');
        if (response.ok) {
            const usersData = await response.json();
            setAllUsers(usersData);
            return usersData;
        }
        return [];
    } catch (error) {
        console.error("Failed to fetch all users", error);
        return [];
    }
  }, []);
  

  useEffect(() => {
    const initializeAuth = async () => {
        setLoading(true);
        try {
            const storedToken = localStorage.getItem('authToken');
            if (storedToken) {
                const decoded = jwtDecode<{ id: string; role: UserRole; exp: number }>(storedToken);
                if (decoded && decoded.exp * 1000 > Date.now()) {
                    setToken(storedToken);
                    
                    // Fetch settings first to get roles
                    await fetchAllSettings();
                    
                    const usersResponse = await fetch('/api/users');
                    const usersData: User[] = await usersResponse.json();
                    setAllUsers(usersData);
                    
                    const currentUser = usersData.find(u => u.id === decoded.id);
                    if (currentUser) {
                        setUser(currentUser);
                        setRole(currentUser.role);
                    } else {
                       logout();
                    }
                } else {
                    logout();
                }
            }
        } catch (error) {
            console.error("Auth init error:", error);
            logout();
        } finally {
            setLoading(false);
        }
    };
    initializeAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const login = async (newToken: string, loggedInUser: User, loggedInRole: UserRole) => {
    setLoading(true);
    localStorage.setItem('authToken', newToken);
    setToken(newToken);
    setUser(loggedInUser);
    setRole(loggedInRole);
    // Fetch all critical data needed for the app to function after login
    await Promise.all([
      fetchAllSettings(),
      fetchAllDepartments(),
      fetchAllUsers(),
    ]);
    setLoading(false);
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setToken(null);
    setUser(null);
    setRole(null);
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
    }
  };
  
  const switchUser = async (userId: string) => {
      const targetUser = allUsers.find(u => u.id === userId);
      if (targetUser) {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: targetUser.email, password: 'password123' }),
          });
          
          if(response.ok) {
              const result = await response.json();
              await login(result.token, result.user, result.role); // use await here
              if (typeof window !== 'undefined') {
                window.location.href = '/dashboard';
              }
          } else {
              console.error("Failed to switch user.")
          }
      }
  };

  const updateSetting = async (key: string, value: any) => {
     try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value }),
        });
        if (!response.ok) throw new Error('Failed to save setting');
        await fetchAllSettings();
    } catch(e) {
        console.error(e);
        throw e;
    }
  }

  const updateRolePermissions = async (newPermissions: Record<UserRole, string[]>) => {
    await updateSetting('rolePermissions', newPermissions);
  }
  
  const updateRfqSenderSetting = async (newSetting: RfqSenderSetting) => {
    await updateSetting('rfqSenderSetting', newSetting);
  }

  const updateUserRole = async (userId: string, newRole: UserRole) => {
    const userToUpdate = allUsers.find(u => u.id === userId);
    if (!userToUpdate) return;
    
    try {
        const response = await fetch('/api/users', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...userToUpdate, role: newRole, actorUserId: user?.id })
        });
        if (!response.ok) throw new Error("Failed to update role");
        await fetchAllUsers(); // Re-fetch all users to update the UI state
    } catch (e) {
        console.error(e);
        throw e;
    }
  }

  const updateApprovalThresholds = async (newThresholds: ApprovalThreshold[]) => {
      try {
          const response = await fetch('/api/settings/approval-matrix', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newThresholds)
          });
          if (!response.ok) throw new Error("Failed to save approval matrix");
          const data = await response.json();
          setApprovalThresholds(data);
      } catch (e) {
          console.error("Failed to update approval thresholds", e);
          throw e;
      }
  }

  const updateCommitteeConfig = async (newConfig: CommitteeConfig) => {
      await updateSetting('committeeConfig', newConfig);
  }

  const authContextValue = useMemo(() => ({
      user,
      token,
      role,
      allUsers,
      departments,
      rolePermissions,
      rfqSenderSetting,
      approvalThresholds,
      committeeConfig,
      settings,
      rfqQuorum,
      committeeQuorum,
      login,
      logout,
      loading,
      switchUser,
      updateRolePermissions,
      updateRfqSenderSetting,
      updateUserRole,
      updateApprovalThresholds,
      updateCommitteeConfig,
      updateSetting,
      fetchAllUsers,
      fetchAllSettings,
      fetchAllDepartments
  }), [user, token, role, loading, allUsers, departments, rolePermissions, rfqSenderSetting, approvalThresholds, committeeConfig, settings, rfqQuorum, committeeQuorum, fetchAllUsers, fetchAllSettings, fetchAllDepartments]);


  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
