/**
 * The facts only the utility can supply, per plan section: one fill-in box each in the
 * plan writer. BNI's own list; the standard wording of a section (guidance) says what
 * the utility commits to, these fields say who, where and when at this utility.
 */
export interface PlanField {
  label: string;
  /** Example or short instruction shown inside the empty box. */
  hint?: string;
  /** Multi-line box. */
  long?: boolean;
  /** The platform fills this box in from its own records; the utility does not type it. */
  auto?: 'epa_assessment' | 'risk_register' | 'last_exercise' | 'next_exercise';
  /** Not counted in the plan's completeness. */
  optional?: boolean;
  /** The box starts with a list from the platform's records; the utility edits and saves it. */
  prefill?: 'vendors' | 'vendor_scorers';
}

const f = (label: string, hint?: string, long?: boolean): PlanField => ({ label, ...(hint ? { hint } : {}), ...(long ? { long } : {}) });

export const PLAN_FIELDS: Record<string, Record<string, PlanField[]>> = {
  crmp: {
    '1. Introduction': [
      f('Utility name', 'Legal name of the utility or district'),
      f('Population served and service area', 'For example: 4,200 connections in the City of Example'),
      f('Regulatory primacy agency', 'The state agency that regulates the utility'),
      f('Systems and facilities in scope, by site', 'Treatment plants, wells, pump and lift stations, storage, administrative offices', true),
      f('Plan approved by', 'Name and title of the official'),
      f('Approval date', 'For example: 9 November 2026'),
      f('Where the current version is kept and who may change it', 'For example: this platform; the cybersecurity lead'),
    ],
    '2. Cybersecurity Team': [
      f('Cybersecurity lead', 'Name, title, phone'),
      f('Alternate for the cybersecurity lead', 'Name, title, phone'),
      f('OT cybersecurity lead', 'Name, title, phone; may be the same person at a small utility'),
      f('Operations lead', 'Name, title, phone'),
      f('IT lead or provider', 'Name or company, phone'),
      f('Finance and procurement contact', 'Name, title'),
      { label: 'Integrators and managed service providers with access', hint: 'Company, what they manage, contact', long: true, prefill: 'vendors' },
      f('IT and OT coordination meeting', 'How often, who attends, where the notes are kept'),
    ],
    '3. Risk Assessment, Monitoring, and Reporting': [
      f('Where the asset inventory is kept and who updates it', 'For example: spreadsheet on the shared drive; the OT lead'),
      f('Inventory review schedule', 'For example: every quarter and after every project'),
      f('Who reviews vendor and CISA advisories, and how often'),
      f('Unsupported equipment and how it is protected', 'Each item, its protection and its replacement date; or "None"', true),
      { label: 'Annual EPA checklist assessment', auto: 'epa_assessment' },
      f('Who answers the EPA checklist, and the month it is repeated', 'For example: the cybersecurity lead, every November'),
      { label: 'Independent assessment (optional)', hint: 'Provider and date, if the utility chooses to have one', optional: true },
      { label: 'Where the risk register is kept', auto: 'risk_register' },
      f('Who receives the quarterly status and the annual report', 'For example: general manager quarterly; board annually'),
    ],
    '4. Employee Training and Awareness': [
      f('Awareness training course or provider'),
      f('When training is given', 'For example: within 30 days of hire and every March'),
      f('OT-specific training', 'Who gives it and who attends'),
      f('Where training records are kept'),
      f('Phishing exercises', 'How often and who runs them; or "Email is not in use"'),
      f('How contractors with accounts are trained'),
    ],
    '5. Third-Party Risk Management': [
      { label: 'Who scores vendors before a purchase', hint: 'Names or roles', prefill: 'vendor_scorers' },
      { label: 'Vendors, integrators and service providers with network or remote access', hint: 'Company and what they can reach', long: true, prefill: 'vendors' },
      f('Approved remote access method', 'For example: VPN with multifactor, enabled per session by the operator'),
      f('Where the standard contract language is kept'),
      f('Vendor re-scoring schedule', 'For example: at renewal and at least every two years'),
    ],
    '6. Incident Response Plan': [
      f('Who may activate the Cyber Incident Response Plan', 'Names or roles'),
      f('Where the plan is kept, including the printed copy'),
      f('State primacy agency reporting contact', 'Office and phone'),
      f('Cyber insurance carrier', 'Carrier, policy number, breach line; or "None"'),
      { label: 'Date of the last exercise', auto: 'last_exercise' },
    ],
    '7. Business Continuity and Disaster Recovery': [
      f('What is backed up', 'PLC and RTU programs, HMI and SCADA configurations, historian, network devices, billing and payroll', true),
      f('Where backups are kept, including the offline copy'),
      f('Backup schedule and who checks it'),
      f('Date and result of the last restore test'),
      f('Manual operation', 'How long the utility can run without SCADA and where the procedures are kept', true),
      f('Recovery order and target times', 'Which systems come back first and how fast', true),
      f('Outside dependencies and contacts', 'Power, carriers, chemical supplier, laboratory, integrator', true),
    ],
    '8. Plan Maintenance and Review': [
      f('Review month and reviewer', 'For example: every November; the cybersecurity lead'),
      f('Events that force an early review', 'Or "As written above"'),
      f('Where staff and contractors read the current plan'),
      f('Version log entry for this version', 'Version, date, author, approver, what changed'),
    ],
  },
  cirp: {
    'Incident Response Team': [
      f('Incident commander', 'Name, mobile, personal email'),
      f('Alternate commander', 'Name, mobile, personal email'),
      f('OT lead', 'Name, mobile'),
      f('IT lead or provider', 'Name or company, mobile'),
      f('Operations lead', 'Name, mobile'),
      f('Communications lead', 'Name, mobile'),
      f('Executive who approves spending and public statements', 'Name, title, mobile'),
      f('Integrator, service provider and SCADA vendor support contacts', 'Company, contact, 24-hour number', true),
      f('External partners and numbers', 'State agency, FBI field office, insurer breach line, WaterISAC', true),
      f('Out-of-band channel for the team', 'For example: group text on personal phones'),
      f('Where the printed roster is kept', 'For example: control room binder and with the on-call supervisor'),
    ],
    'Detecting an Incident': [
      f('Who staff report a suspected incident to', 'Role and 24-hour number'),
      f('How phishing emails are reported'),
      f('Where security logs are collected and who reviews them'),
      f('Malware detection in use', 'Product and which machines it covers'),
      f('After-hours coverage', 'Who is on call and how alarms reach them'),
    ],
    'Severity Matrix': [
      f('Who declares the severity level', 'Normally the incident commander'),
      f('Changes to the standard levels', 'Or "None, adopted as written"', true),
      f('Who is notified at each level and how fast', 'Level 1 to Level 4', true),
      f('State or permit notification deadlines', 'For example: primacy agency within 24 hours'),
    ],
    'Cyber-Incident Action Checklist': [
      f('Who can isolate the OT network, and how', 'The person, the device and the physical step', true),
      f('Where the manual operation procedures are kept'),
      f('Who makes each external notification', 'Regulator, CISA, law enforcement, insurer, customers', true),
      f('Where the incident log is kept', 'For example: paper log in the control room'),
      f('Changes to the standard checklist', 'Or "None, adopted as written"', true),
    ],
    'Post Incident Actions': [
      f('Who signs off recovery', 'For control systems, business systems and operations'),
      f('Where known-good PLC and HMI copies are kept'),
      f('Who declares the incident closed'),
      f('Who records costs and hours'),
    ],
    'Evidence Retention': [
      f('Who collects evidence', 'For business systems and for control systems'),
      f('Where evidence is stored, and the second copy'),
      f('How long evidence is kept', 'At least one year after closure'),
      f('Who may release evidence outside the utility'),
    ],
    'Lessons Learned / After Action Report (AAR)': [
      f('Who calls the after-action meeting'),
      f('Where after-action reports are kept'),
      { label: 'When the next tabletop exercise is due', auto: 'next_exercise' },
      f('Leadership who take part', 'Names or roles'),
    ],
    'Implementing Improvements/Corrective Actions': [
      f('Where the corrective action list is kept'),
      f('Who reviews it and how often'),
      f('Who approves money or contract changes'),
    ],
  },
};
