import type { ModuleDef } from './types';

const CSET = 'CISA CSET v13 (Cyber Security Evaluation Tool, github.com/cisagov/cset, MIT licence, Battelle Energy Alliance)';

/** The eight CSET modules seeded as Comp AI frameworks, in gallery order. */
export const MODULES: ModuleDef[] = [
  {
    key: 'cpg2',
    inputFile: 'cset-cpg2.json',
    kind: 'maturity',
    name: 'CISA Cross-Sector Cybersecurity Performance Goals 2.0',
    version: '2.0',
    description:
      'CISA Cybersecurity Performance Goals (CPG) 2.0 (December 2025): 34 goals across the six ' +
      'NIST CSF 2.0 functions, answered separately for IT and OT where both apply. Each goal records ' +
      "the outcome, scope, recommended action, risk addressed, CISA's implementation criteria for IT and " +
      'OT, cost, impact and complexity, and CSF 2.0 / SP 800-53 r5 / SP 800-82 r3 references. Content from ' +
      CSET +
      '. Answers: Yes, In progress, Scoped, No.',
    answerOptions: ['Y', 'I', 'S', 'N'],
    domainMode: 'it_ot',
    scoring: 'cpg',
    defaultDepartment: 'it',
    taskFrequency: 'quarterly',
    attribution: 'CISA CPG 2.0, via CISA CSET v13',
  },
  {
    key: 'imr',
    inputFile: 'cset-imr.json',
    kind: 'maturity',
    name: 'CISA Incident Management Review (IMR)',
    version: '1.0',
    description:
      'CISA Incident Management Review: 88 practices in six domains (event detection and handling; ' +
      'incident declaration, handling and response; post-incident analysis and testing; integrating ' +
      'organizational capabilities; protecting and sustaining the incident management function; ' +
      'preparing for incident response) grouped into 20 goals, with CERT-RMM and NIST references. ' +
      'Retired from CSET in v13; content from ' +
      CSET +
      '. Answers: Yes, Incomplete, No; a goal is achieved when every practice is Yes.',
    answerOptions: ['Y', 'I', 'N'],
    domainMode: 'single',
    scoring: 'mil',
    defaultDepartment: 'it',
    taskFrequency: 'quarterly',
    attribution: 'CISA IMR, via CISA CSET v13',
  },
  {
    key: 'hhs405d',
    inputFile: 'cset-hhs405d.json',
    kind: 'standard',
    name: 'HHS 405(d) Health Industry Cybersecurity Practices (Technical Volume 1)',
    version: '2023',
    description:
      'Health Industry Cybersecurity Practices (HICP), Technical Volume 1 for small organizations, ' +
      'from the HHS 405(d) program: 63 requirements in ten practice areas (e-mail protection, endpoint ' +
      'protection, access management, data protection and loss prevention, asset management, network ' +
      'management, vulnerability management, incident response, medical device security, cybersecurity ' +
      'policies), with NIST CSF 1.1 references. Content from ' +
      CSET +
      '. Answers: Yes, No, Not applicable, Alternate.',
    answerOptions: ['Y', 'N', 'NA', 'A'],
    domainMode: 'single',
    scoring: 'standard',
    defaultDepartment: 'it',
    taskFrequency: 'quarterly',
    attribution: 'HHS 405(d) HICP, via CISA CSET v13',
  },
  {
    key: 'mvra',
    inputFile: 'cset-mvra.json',
    kind: 'maturity',
    name: 'CISA Minimum Viable Resilience Assessment (MVRA, draft)',
    version: 'draft',
    description:
      'CISA Minimum Viable Resilience Assessment (draft): 524 questions organised by the resilience ' +
      'goals Anticipate, Withstand, Recover and Adapt, then by CSF-style categories and outcome ' +
      'statements, at three tiers (Basic, Intermediate, Advanced); some questions carry multiple-choice ' +
      'detail options. Retired from CSET in v13; content from ' +
      CSET +
      '. Answers: Yes, Alternate, No.',
    answerOptions: ['Y', 'A', 'N'],
    domainMode: 'single',
    scoring: 'tier',
    defaultDepartment: 'it',
    taskFrequency: 'quarterly',
    attribution: 'CISA MVRA (draft), via CISA CSET v13',
  },
  {
    key: 'crr',
    inputFile: 'cset-crr.json',
    kind: 'maturity',
    name: 'CISA Cyber Resilience Review (CRR)',
    version: '1.0',
    description:
      'CISA Cyber Resilience Review: 397 practices in ten domains (asset management, controls management, ' +
      'configuration and change management, vulnerability management, incident management, service ' +
      'continuity management, risk management, external dependencies management, training and awareness, ' +
      'situational awareness) and 82 goals, with CERT-RMM and NIST CSF references. Retired from CSET in ' +
      'v13; content from ' +
      CSET +
      '. Answers: Yes, Incomplete, No; a goal is achieved when every practice is Yes.',
    answerOptions: ['Y', 'I', 'N'],
    domainMode: 'single',
    scoring: 'mil',
    defaultDepartment: 'it',
    taskFrequency: 'quarterly',
    attribution: 'CISA CRR, via CISA CSET v13',
  },
  {
    key: 'edm',
    inputFile: 'cset-edm.json',
    kind: 'maturity',
    name: 'CISA External Dependencies Management (EDM) Assessment',
    version: '3.0',
    description:
      'CISA External Dependencies Management assessment: 116 practices in three domains (relationship ' +
      'formation; relationship management and governance; service protection and sustainment) plus ' +
      'maturity indicator level questions MIL-1 to MIL-5, with CERT-RMM and NIST CSF references. Retired ' +
      'from CSET in v13; content from ' +
      CSET +
      '. Answers: Yes, Incomplete, No.',
    answerOptions: ['Y', 'I', 'N'],
    domainMode: 'single',
    scoring: 'mil',
    defaultDepartment: 'gov',
    taskFrequency: 'quarterly',
    attribution: 'CISA EDM, via CISA CSET v13',
  },
  {
    key: 'rra',
    inputFile: 'cset-rra.json',
    kind: 'maturity',
    name: 'CISA Ransomware Readiness Assessment (RRA)',
    version: '1.0',
    description:
      'CISA Ransomware Readiness Assessment: 48 practices in ten areas (data backup, web browser ' +
      'management and DNS filtering, phishing prevention and awareness, network perimeter monitoring, ' +
      'asset management, patch and update management, user and access management, application integrity ' +
      'and allow-listing, incident response, risk management) at three tiers (Basic, Intermediate, ' +
      'Advanced). Retired from CSET in v13; content from ' +
      CSET +
      '. Answers: Yes, No.',
    answerOptions: ['Y', 'N'],
    domainMode: 'single',
    scoring: 'tier',
    defaultDepartment: 'it',
    taskFrequency: 'quarterly',
    attribution: 'CISA RRA, via CISA CSET v13',
  },
  {
    key: 'awwa40',
    inputFile: 'cset-awwa40.json',
    kind: 'standard',
    name: 'AWWA Water Sector Cybersecurity Guidance v4.0',
    version: '4.0',
    description:
      'American Water Works Association Cybersecurity Risk Management Guidance v4.0 controls: 100 ' +
      'requirements in twelve practice categories (governance and risk management, access control, ' +
      'telecommunications and network security, operations security, application security, business ' +
      'continuity, encryption, physical security, service level agreements, education, server and ' +
      'workstation hardening, cyber-informed engineering). AWWA content redistributed inside ' +
      CSET +
      '. Answers: Yes, No, Not applicable, Alternate.',
    answerOptions: ['Y', 'N', 'NA', 'A'],
    domainMode: 'single',
    scoring: 'standard',
    defaultDepartment: 'it',
    taskFrequency: 'quarterly',
    attribution: 'AWWA Cybersecurity Guidance v4.0, via CISA CSET v13',
  },
];
