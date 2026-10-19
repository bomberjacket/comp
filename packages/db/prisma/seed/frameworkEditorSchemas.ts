import { z } from 'zod';

// Assuming Frequency and Departments enums are defined elsewhere and imported
// For now, we'll use z.string() as a placeholder if their definitions aren't available.
// import { Frequency, Departments } from './path-to-shared-enums'; // Example import

const datePreprocess = (arg: unknown) => {
  if (typeof arg === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/.test(arg)) {
    return arg.replace(' ', 'T') + 'Z';
  }
  return arg;
};

export const FrameworkEditorVideoSchema = z.object({
  id: z.string().optional(), // @id @default
  title: z.string(),
  description: z.string(),
  youtubeId: z.string(),
  url: z.string(),
  createdAt: z
    .preprocess(
      datePreprocess,
      z.string().datetime({
        message: 'Invalid datetime string for createdAt. Expected ISO 8601 format.',
      }),
    )
    .optional(), // @default(now())
  updatedAt: z
    .preprocess(
      datePreprocess,
      z.string().datetime({
        message: 'Invalid datetime string for updatedAt. Expected ISO 8601 format.',
      }),
    )
    .optional(), // @default(now()) @updatedAt
});

export const FrameworkEditorFrameworkSchema = z.object({
  id: z.string().optional(), // @id @default
  name: z.string(),
  version: z.string(),
  description: z.string(),
  visible: z.boolean().optional(), // @default(true)
  familyId: z.string().nullable().optional(), // FrameworkEditorFrameworkFamily FK
  // requirements: FrameworkEditorRequirement[] - relational, omitted
  // frameworkInstances: FrameworkInstance[] - relational, omitted
  createdAt: z
    .preprocess(
      datePreprocess,
      z.string().datetime({
        message: 'Invalid datetime string for createdAt. Expected ISO 8601 format.',
      }),
    )
    .optional(), // @default(now())
  updatedAt: z
    .preprocess(
      datePreprocess,
      z.string().datetime({
        message: 'Invalid datetime string for updatedAt. Expected ISO 8601 format.',
      }),
    )
    .optional(), // @default(now()) @updatedAt
});

export const FrameworkEditorRequirementSchema = z.object({
  id: z.string().optional(), // @id @default
  frameworkId: z.string(),
  // framework: FrameworkEditorFramework - relational, omitted
  name: z.string(),
  identifier: z.string().optional(), // @default("")
  description: z.string(),
  requirementFamily: z.string().nullable().optional(),
  sortOrder: z.number().int().nullable().optional(),
  // controlTemplates: FrameworkEditorControlTemplate[] - relational, omitted
  // requirementMaps: RequirementMap[] - relational, omitted
  createdAt: z
    .preprocess(
      datePreprocess,
      z.string().datetime({
        message: 'Invalid datetime string for createdAt. Expected ISO 8601 format.',
      }),
    )
    .optional(), // @default(now())
  updatedAt: z
    .preprocess(
      datePreprocess,
      z.string().datetime({
        message: 'Invalid datetime string for updatedAt. Expected ISO 8601 format.',
      }),
    )
    .optional(), // @default(now()) @updatedAt
});

export const FrameworkEditorPolicyTemplateSchema = z.object({
  id: z.string().optional(), // @id @default
  name: z.string(),
  description: z.string(),
  frequency: z.string(), // Placeholder for Frequency enum
  department: z.string(), // Placeholder for Departments enum
  content: z.any(), // Json
  // controlTemplates: FrameworkEditorControlTemplate[] - relational, omitted
  createdAt: z
    .preprocess(
      datePreprocess,
      z.string().datetime({
        message: 'Invalid datetime string for createdAt. Expected ISO 8601 format.',
      }),
    )
    .optional(), // @default(now())
  updatedAt: z
    .preprocess(
      datePreprocess,
      z.string().datetime({
        message: 'Invalid datetime string for updatedAt. Expected ISO 8601 format.',
      }),
    )
    .optional(), // @default(now()) @updatedAt
  // policies: Policy[] - relational, omitted
});

export const FrameworkEditorTaskTemplateSchema = z.object({
  id: z.string().optional(), // @id @default
  name: z.string(),
  description: z.string(),
  frequency: z.string(), // Placeholder for Frequency enum
  department: z.string(), // Placeholder for Departments enum
  automationStatus: z.enum(['AUTOMATED', 'MANUAL']).optional(), // @default(AUTOMATED)
  // controlTemplates: FrameworkEditorControlTemplate[] - relational, omitted
  createdAt: z
    .preprocess(
      datePreprocess,
      z.string().datetime({
        message: 'Invalid datetime string for createdAt. Expected ISO 8601 format.',
      }),
    )
    .optional(), // @default(now())
  updatedAt: z
    .preprocess(
      datePreprocess,
      z.string().datetime({
        message: 'Invalid datetime string for updatedAt. Expected ISO 8601 format.',
      }),
    )
    .optional(), // @default(now()) @updatedAt
  // tasks: Task[] - relational, omitted
});

export const FrameworkEditorControlTemplateSchema = z.object({
  id: z.string().optional(), // @id @default
  name: z.string(),
  description: z.string(),
  controlFamily: z.string().nullable().optional(),
  // policyTemplates: FrameworkEditorPolicyTemplate[] - relational, omitted
  // requirements: FrameworkEditorRequirement[] - relational, omitted
  // taskTemplates: FrameworkEditorTaskTemplate[] - relational, omitted
  createdAt: z
    .preprocess(
      datePreprocess,
      z.string().datetime({
        message: 'Invalid datetime string for createdAt. Expected ISO 8601 format.',
      }),
    )
    .optional(), // @default(now())
  updatedAt: z
    .preprocess(
      datePreprocess,
      z.string().datetime({
        message: 'Invalid datetime string for updatedAt. Expected ISO 8601 format.',
      }),
    )
    .optional(), // @default(now()) @updatedAt
  // controls: Control[] - relational, omitted
});

export const FindingTemplateSchema = z.object({
  id: z.string().optional(), // @id @default
  category: z.string(),
  title: z.string(),
  content: z.string(),
  order: z.number().optional(), // @default(0)
  createdAt: z
    .preprocess(
      datePreprocess,
      z.string().datetime({
        message: 'Invalid datetime string for createdAt. Expected ISO 8601 format.',
      }),
    )
    .optional(), // @default(now())
  updatedAt: z
    .preprocess(
      datePreprocess,
      z.string().datetime({
        message: 'Invalid datetime string for updatedAt. Expected ISO 8601 format.',
      }),
    )
    .optional(), // @default(now()) @updatedAt
  // findings: Finding[] - relational, omitted
});

const optionalSeedDate = (field: string) =>
  z
    .preprocess(
      datePreprocess,
      z.string().datetime({
        message: `Invalid datetime string for ${field}. Expected ISO 8601 format.`,
      }),
    )
    .optional();

export const FrameworkEditorFrameworkFamilySchema = z.object({
  id: z.string().optional(), // @id @default
  name: z.string(),
  description: z.string().optional(), // @default("")
  status: z.enum(['visible', 'hidden', 'under_construction', 'partial']).optional(), // @default(hidden)
  // frameworks: FrameworkEditorFramework[] - relational, omitted
  createdAt: optionalSeedDate('createdAt'),
  updatedAt: optionalSeedDate('updatedAt'),
});

export const FrameworkEditorControlPolicyTemplateLinkSchema = z.object({
  id: z.string().optional(), // @id @default
  frameworkId: z.string(),
  controlTemplateId: z.string(),
  policyTemplateId: z.string(),
  createdAt: optionalSeedDate('createdAt'),
});

export const FrameworkEditorControlTaskTemplateLinkSchema = z.object({
  id: z.string().optional(), // @id @default
  frameworkId: z.string(),
  controlTemplateId: z.string(),
  taskTemplateId: z.string(),
  createdAt: optionalSeedDate('createdAt'),
});

// For use in seed script validation
export const frameworkEditorModelSchemas = {
  FrameworkEditorVideo: FrameworkEditorVideoSchema,
  FrameworkEditorFrameworkFamily: FrameworkEditorFrameworkFamilySchema,
  FrameworkEditorFramework: FrameworkEditorFrameworkSchema,
  FrameworkEditorRequirement: FrameworkEditorRequirementSchema,
  FrameworkEditorPolicyTemplate: FrameworkEditorPolicyTemplateSchema,
  FrameworkEditorTaskTemplate: FrameworkEditorTaskTemplateSchema,
  FrameworkEditorControlTemplate: FrameworkEditorControlTemplateSchema,
  FrameworkEditorControlPolicyTemplateLink: FrameworkEditorControlPolicyTemplateLinkSchema,
  FrameworkEditorControlTaskTemplateLink: FrameworkEditorControlTaskTemplateLinkSchema,
  FindingTemplate: FindingTemplateSchema,
};
