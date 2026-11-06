import type { NIST_800_171_TASK_TEMPLATES } from '../../task-mappings.nist-800-171';

type Rev2Objective = keyof typeof NIST_800_171_TASK_TEMPLATES;

/**
 * SCuBA policy (versionless id) -> NIST SP 800-171 Rev 2 assessment objective
 * whose evidence task the check moves. Curated by BNI from CISA's SCuBA ->
 * 800-53 r5 mapping and the Rev 2 objective wording; one objective per policy.
 *
 * Conventions:
 * - Email hygiene policies (SI-8: spam, phishing, impersonation, attachments)
 *   go to 3.14.2[b], malicious code protection at the mail gateway.
 * - Sharing / DLP / forwarding policies (AC-4, AC-21) go to 3.1.3[e], flow
 *   control enforcement.
 * - "Admins only" policies (AC-6(10)) go to 3.1.7[c].
 * - Policies with no Rev 2 counterpart are evidence-only (not listed here).
 */
export const SCUBA_OBJECTIVES: Record<string, Rev2Objective> = {
  // Entra ID
  'MS.AAD.1.1': '3.4.7[l]', // legacy authentication protocols disabled
  'MS.AAD.2.1': '3.14.6[a]', // high-risk users blocked (Identity Protection)
  'MS.AAD.2.2': '3.14.6[a]', // admin notified of high-risk users
  'MS.AAD.2.3': '3.14.6[a]', // high-risk sign-ins blocked
  'MS.AAD.3.1': '3.5.3[d]', // phishing-resistant MFA, all users
  'MS.AAD.3.2': '3.5.3[d]', // MFA, all users
  'MS.AAD.3.3': '3.5.3[d]', // Authenticator shows login context
  'MS.AAD.3.4': '3.5.3[d]', // authentication methods migration complete
  'MS.AAD.3.5': '3.5.4[a]', // SMS, voice, email OTP disabled
  'MS.AAD.3.6': '3.5.3[c]', // phishing-resistant MFA, privileged roles
  'MS.AAD.3.7': '3.1.1[f]', // managed devices required to authenticate
  'MS.AAD.3.8': '3.1.1[f]', // managed devices required to register MFA
  'MS.AAD.3.9': '3.4.7[f]', // device code flow blocked
  'MS.AAD.4.1': '3.3.5[a]', // security logs to the SOC
  'MS.AAD.5.1': '3.1.7[c]', // only admins register applications
  'MS.AAD.5.2': '3.1.7[c]', // user consent restricted
  'MS.AAD.5.3': '3.4.9[b]', // admin consent workflow
  'MS.AAD.5.5': '3.5.2[b]', // application password addition blocked
  'MS.AAD.5.6': '3.5.2[b]', // application password lifetime limited
  'MS.AAD.5.7': '3.5.2[b]', // application certificate lifetime limited
  'MS.AAD.7.1': '3.1.5[b]', // two to eight Global Administrators
  'MS.AAD.7.2': '3.1.5[b]', // finer-grained roles over Global Administrator
  'MS.AAD.7.3': '3.1.5[b]', // cloud-only privileged accounts
  'MS.AAD.7.4': '3.1.5[b]', // no permanent active privileged assignments
  'MS.AAD.7.5': '3.1.5[b]', // privileged roles provisioned through PAM only
  'MS.AAD.7.6': '3.1.5[b]', // Global Administrator activation needs approval
  'MS.AAD.7.7': '3.1.7[d]', // privileged role assignments alert
  'MS.AAD.7.8': '3.1.7[d]', // Global Administrator activation alert
  'MS.AAD.7.9': '3.1.7[d]', // other privileged role activation alert
  'MS.AAD.8.1': '3.1.2[b]', // guest directory access limited
  'MS.AAD.8.2': '3.1.7[c]', // only Guest Inviter role invites guests
  'MS.AAD.8.3': '3.1.1[d]', // guest invites limited to approved domains
  'MS.AAD.9.1': '3.4.8[c]', // risky AI agents blocked
  // Exchange Online
  'MS.EXO.1.1': '3.1.3[e]', // automatic external forwarding disabled
  'MS.EXO.2.2': '3.13.1[g]', // SPF
  'MS.EXO.3.1': '3.13.1[g]', // DKIM
  'MS.EXO.4.1': '3.13.1[g]', // DMARC published
  'MS.EXO.4.2': '3.13.1[g]', // DMARC p=reject
  'MS.EXO.5.1': '3.4.7[l]', // SMTP AUTH disabled
  'MS.EXO.6.1': '3.1.3[e]', // contact folders not shared with all domains
  'MS.EXO.6.2': '3.1.3[e]', // calendar details not shared with all domains
  'MS.EXO.7.1': '3.14.2[b]', // external sender warnings
  'MS.EXO.13.1': '3.3.1[c]', // mailbox auditing
  // Power BI
  'MS.POWERBI.1.1': '3.1.3[e]', // Publish to Web disabled
  'MS.POWERBI.2.1': '3.1.1[d]', // guest access disabled
  'MS.POWERBI.3.1': '3.1.1[d]', // external invitations disabled
  'MS.POWERBI.4.1': '3.1.1[e]', // service principals restricted to groups
  'MS.POWERBI.4.2': '3.1.1[e]', // service principal profiles restricted
  'MS.POWERBI.5.1': '3.5.2[b]', // ResourceKey authentication blocked
  'MS.POWERBI.6.1': '3.13.13[a]', // Python and R visuals disabled
  'MS.POWERBI.7.1': '3.1.3[b]', // sensitivity labels
  // Power Platform
  'MS.POWERPLATFORM.1.1': '3.1.7[c]', // environment creation, admins only
  'MS.POWERPLATFORM.1.2': '3.1.7[c]', // trial environment creation, admins only
  'MS.POWERPLATFORM.2.1': '3.1.3[e]', // DLP policy, default environment
  'MS.POWERPLATFORM.2.2': '3.1.3[e]', // DLP policy, other environments
  'MS.POWERPLATFORM.3.1': '3.1.20[e]', // tenant isolation
  'MS.POWERPLATFORM.3.2': '3.1.20[e]', // connection allowlist
  'MS.POWERPLATFORM.5.1': '3.1.7[c]', // Power Pages creation, admins only
  'MS.POWERPLATFORM.6.1': '3.1.3[e]', // "Share with everyone" disabled
  // Security Suite (Defender for Office 365, Purview)
  'MS.SECURITYSUITE.1.1': '3.14.2[b]', // click-to-run attachments blocked
  'MS.SECURITYSUITE.1.2': '3.14.2[b]', // post-delivery scanning
  'MS.SECURITYSUITE.1.3': '3.14.2[b]', // malware quarantined
  'MS.SECURITYSUITE.1.4': '3.14.2[b]', // SharePoint, OneDrive, Teams scanning
  'MS.SECURITYSUITE.2.1': '3.14.2[b]', // user impersonation protection
  'MS.SECURITYSUITE.2.2': '3.14.2[b]', // domain impersonation protection
  'MS.SECURITYSUITE.2.3': '3.14.2[b]', // partner domain impersonation protection
  'MS.SECURITYSUITE.2.4': '3.2.1[c]', // user safety tips
  'MS.SECURITYSUITE.3.1': '3.1.3[e]', // DLP policy for sensitive information
  'MS.SECURITYSUITE.3.2': '3.1.3[e]', // DLP policy applied to all workloads
  'MS.SECURITYSUITE.3.3': '3.1.3[e]', // DLP action blocks external sharing
  'MS.SECURITYSUITE.3.4': '3.2.1[d]', // DLP user notifications
  'MS.SECURITYSUITE.3.5': '3.8.7[a]', // DLP restricts USB and third-party apps
  'MS.SECURITYSUITE.4.1': '3.14.6[a]', // alert policies enabled
  'MS.SECURITYSUITE.4.2': '3.14.6[a]', // alerts routed to a monitored address or SIEM
  'MS.SECURITYSUITE.5.1': '3.3.1[c]', // unified audit logging
  'MS.SECURITYSUITE.5.2': '3.3.1[f]', // audit log retention
  'MS.SECURITYSUITE.6.1': '3.14.2[b]', // spam and phishing not delivered
  'MS.SECURITYSUITE.6.2': '3.14.2[b]', // no allowed domains in anti-spam
  'MS.SECURITYSUITE.7.1': '3.14.2[b]', // Safe Links block-list
  'MS.SECURITYSUITE.7.2': '3.14.2[b]', // direct download links scanned
  'MS.SECURITYSUITE.7.3': '3.3.1[c]', // click tracking
  'MS.SECURITYSUITE.8.1': '3.14.2[b]', // no IP allow lists
  'MS.SECURITYSUITE.8.2': '3.14.2[b]', // safe lists not enabled
  // SharePoint Online and OneDrive
  'MS.SHAREPOINT.1.1': '3.1.3[e]', // SharePoint external sharing limited
  'MS.SHAREPOINT.1.2': '3.1.3[e]', // OneDrive external sharing limited
  'MS.SHAREPOINT.1.3': '3.1.3[e]', // approved external domains only
  'MS.SHAREPOINT.2.1': '3.1.3[e]', // default sharing scope, specific people
  'MS.SHAREPOINT.2.2': '3.1.2[b]', // default sharing permission, view only
  'MS.SHAREPOINT.3.1': '3.1.3[e]', // Anyone links expire
  'MS.SHAREPOINT.3.2': '3.1.2[b]', // Anyone links view only
  'MS.SHAREPOINT.3.3': '3.5.2[a]', // verification-code re-authentication
  // Microsoft Teams
  'MS.TEAMS.1.1': '3.1.20[e]', // externals cannot request control
  'MS.TEAMS.1.2': '3.13.12[c]', // anonymous users cannot start meetings
  'MS.TEAMS.1.3': '3.13.12[c]', // anonymous and dial-in wait in the lobby
  'MS.TEAMS.1.5': '3.13.12[c]', // dial-in users cannot bypass the lobby
  'MS.TEAMS.1.6': '3.4.7[f]', // meeting recording disabled
  'MS.TEAMS.1.7': '3.4.7[f]', // events not always recorded
  'MS.TEAMS.2.1': '3.1.20[e]', // external access per domain
  'MS.TEAMS.2.2': '3.1.20[e]', // unmanaged users cannot initiate contact
  'MS.TEAMS.2.3': '3.1.20[e]', // internal users cannot contact unmanaged users
  'MS.TEAMS.4.1': '3.4.7[f]', // Teams email integration disabled
  'MS.TEAMS.5.1': '3.4.9[b]', // approved Microsoft apps only
  'MS.TEAMS.5.2': '3.4.9[b]', // approved third-party apps only
  'MS.TEAMS.5.3': '3.4.9[b]', // approved custom apps only
};
