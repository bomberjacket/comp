/** Microsoft Graph response shapes used by the Microsoft 365 checks. */

export interface GraphList<T> {
  value?: T[];
  '@odata.nextLink'?: string;
}

export interface GraphUser {
  id: string;
  displayName?: string | null;
  userPrincipalName: string;
  mail?: string | null;
  accountEnabled?: boolean;
  userType?: 'Member' | 'Guest' | string | null;
  createdDateTime?: string;
  /** Requires AuditLog.Read.All; absent on tenants without Entra ID P1. */
  signInActivity?: {
    lastSignInDateTime?: string | null;
    lastNonInteractiveSignInDateTime?: string | null;
  } | null;
}

export interface GraphDirectoryRole {
  id: string;
  displayName: string;
  roleTemplateId: string;
}

export interface GraphDirectoryObject {
  id: string;
  '@odata.type'?: string;
  displayName?: string | null;
  userPrincipalName?: string;
  accountEnabled?: boolean;
  userType?: string | null;
}

/** /reports/authenticationMethods/userRegistrationDetails */
export interface GraphUserRegistrationDetails {
  id: string;
  userPrincipalName: string;
  userDisplayName?: string;
  userType?: 'member' | 'guest' | string;
  isAdmin?: boolean;
  isMfaRegistered: boolean;
  isMfaCapable?: boolean;
  isPasswordlessCapable?: boolean;
  methodsRegistered?: string[];
  defaultMfaMethod?: string;
  lastUpdatedDateTime?: string;
}

/** /users/{id}/authentication/methods (fallback without the registration report). */
export interface GraphAuthenticationMethod {
  id: string;
  '@odata.type': string;
}

export interface GraphConditionalAccessPolicy {
  id: string;
  displayName: string;
  state: 'enabled' | 'disabled' | 'enabledForReportingButNotEnforced' | string;
  conditions?: {
    users?: {
      includeUsers?: string[];
      excludeUsers?: string[];
      includeGroups?: string[];
      excludeGroups?: string[];
      includeRoles?: string[];
      excludeRoles?: string[];
    };
    applications?: {
      includeApplications?: string[];
      excludeApplications?: string[];
    };
    clientAppTypes?: string[];
  };
  grantControls?: {
    operator?: 'AND' | 'OR' | string;
    builtInControls?: string[];
    authenticationStrength?: { id: string; displayName?: string } | null;
  } | null;
}

export interface GraphOrganization {
  id: string;
  displayName?: string;
  verifiedDomains?: Array<{ name: string; isDefault?: boolean }>;
}

/** /deviceManagement/managedDevices (Intune) */
export interface GraphManagedDevice {
  id: string;
  deviceName?: string | null;
  operatingSystem?: string | null;
  osVersion?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  userPrincipalName?: string | null;
  complianceState?:
    | 'compliant'
    | 'noncompliant'
    | 'inGracePeriod'
    | 'unknown'
    | 'conflict'
    | 'error'
    | 'configManager'
    | string;
  isEncrypted?: boolean | null;
  lastSyncDateTime?: string | null;
  enrolledDateTime?: string | null;
  managementAgent?: string | null;
  managedDeviceOwnerType?: string | null;
  deviceEnrollmentType?: string | null;
  azureADDeviceId?: string | null;
  jailBroken?: string | null;
}

/** /deviceManagement/deviceCompliancePolicies?$expand=assignments */
export interface GraphCompliancePolicy {
  id: string;
  '@odata.type'?: string;
  displayName: string;
  description?: string | null;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  version?: number;
  assignments?: Array<{ id?: string; target?: { '@odata.type'?: string; groupId?: string } }>;
}

/** /deviceManagement?$select=settings */
export interface GraphDeviceManagement {
  settings?: {
    secureByDefault?: boolean;
    deviceComplianceCheckinThresholdDays?: number;
  } | null;
}

/** /beta/deviceManagement/managedDevices/{id}/windowsProtectionState (Defender Antivirus) */
export interface GraphWindowsProtectionState {
  id?: string;
  malwareProtectionEnabled?: boolean | null;
  realTimeProtectionEnabled?: boolean | null;
  networkInspectionSystemEnabled?: boolean | null;
  tamperProtectionEnabled?: boolean | null;
  signatureUpdateOverdue?: boolean | null;
  quickScanOverdue?: boolean | null;
  fullScanOverdue?: boolean | null;
  fullScanRequired?: boolean | null;
  rebootRequired?: boolean | null;
  isVirtualMachine?: boolean | null;
  deviceState?: string | null;
  productStatus?: string | null;
  antiMalwareVersion?: string | null;
  engineVersion?: string | null;
  signatureVersion?: string | null;
  lastQuickScanDateTime?: string | null;
  lastFullScanDateTime?: string | null;
  lastReportedDateTime?: string | null;
}

/** /security/alerts_v2 (Defender XDR) */
export interface GraphSecurityAlert {
  id: string;
  title?: string | null;
  category?: string | null;
  severity?: 'high' | 'medium' | 'low' | 'informational' | 'unknown' | string;
  status?: 'new' | 'inProgress' | 'resolved' | 'unknown' | string;
  classification?: string | null;
  determination?: string | null;
  serviceSource?: string | null;
  detectionSource?: string | null;
  incidentId?: string | null;
  assignedTo?: string | null;
  createdDateTime?: string;
  lastUpdateDateTime?: string;
  evidence?: Array<{
    '@odata.type'?: string;
    deviceDnsName?: string;
    userAccount?: { userPrincipalName?: string } | null;
  }>;
}
