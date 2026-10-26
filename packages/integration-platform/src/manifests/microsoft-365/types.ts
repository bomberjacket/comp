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
