'use client';

import {
  type EvidenceSubmissionInfo,
  getControlProgressPercent,
  getControlStatus,
  getRequirementArtifactCounts,
} from '@/lib/control-compliance';
import type { FrameworkInstanceWithControls } from '@/lib/types/framework';
import type { Control, Task } from '@db';
import { Badge, TableCell, TableRow, Text } from '@trycompai/design-system';
import { ChevronDown, ChevronRight, Launch } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { getStatusBadge } from './framework-controls-shared';
import type { ScoredRequirement } from '@/types/nist-800-171-score';

export function GroupedControlRow({
  control,
  requirements,
  tasks,
  evidenceSubmissions,
  orgId,
  frameworkInstanceId,
  onRowClick,
  expandable = false,
  expanded = false,
  onToggleExpand,
  score,
}: {
  control: FrameworkInstanceWithControls['controls'][number];
  requirements: Array<{ id: string; name: string; identifier: string }>;
  tasks: (Task & { controls: Control[] })[];
  evidenceSubmissions: EvidenceSubmissionInfo[];
  orgId: string;
  frameworkInstanceId: string;
  onRowClick: (controlId: string) => void;
  /** Show a chevron that reveals the control's requirements (assessment objectives). */
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** NIST SP 800-171 point value for this control's requirement, when scored. */
  score?: ScoredRequirement;
}) {
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;
  const policies = control.policies ?? [];
  const documentTypes = control.controlDocumentTypes ?? [];
  const counts = getRequirementArtifactCounts([control], tasks, evidenceSubmissions);
  const status = getControlStatus(policies, tasks, control.id, documentTypes, evidenceSubmissions);
  const badge = getStatusBadge(status);
  const compliancePercent = getControlProgressPercent(
    policies,
    tasks,
    control.id,
    documentTypes,
    evidenceSubmissions,
  );

  const controlHref = `/${orgId}/frameworks/${frameworkInstanceId}/controls/${control.id}`;

  const handleRowClick = () => {
    onRowClick(control.id);
  };

  const reqLabel =
    requirements.length > 0
      ? requirements.map((r) => r.identifier || r.name).join(', ')
      : null;

  return (
    <TableRow onClick={handleRowClick} style={{ cursor: 'pointer' }}>
      <TableCell>
        <div className="flex items-center gap-1 pl-4">
          {expandable ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse requirements' : 'Expand requirements'}
              className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand?.();
              }}
            >
              <ChevronIcon size={14} />
            </button>
          ) : (
            <span className="h-5 w-5 shrink-0" />
          )}
          <Link
            href={controlHref}
            onClick={(e) => e.stopPropagation()}
            className="group flex min-w-0 items-center gap-2"
          >
            <span className="block max-w-[280px] truncate text-sm" title={control.name}>
              {control.name}
            </span>
            <Launch
              size={14}
              className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            />
          </Link>
          {score && (
            <span
              className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground"
              title={
                score.sspGate
                  ? 'System Security Plan: not scored; without it the assessment cannot be completed'
                  : `${score.points} point${score.points === 1 ? '' : 's'} subtracted if NOT MET (32 CFR 170.24)${score.placeholder ? '; Rev 3 placeholder carried from Rev 2' : ''}`
              }
            >
              {score.sspGate ? 'SSP' : `${score.points} pt${score.placeholder ? '*' : ''}`}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        {reqLabel ? (
          <span className="block max-w-[200px] truncate text-sm" title={reqLabel}>
            {reqLabel}
          </span>
        ) : (
          <Text size="sm" variant="muted">
            —
          </Text>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 min-w-[100px]">
          <div className="flex-1 rounded-full bg-muted/50 h-1.5">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${compliancePercent}%` }}
            />
          </div>
          <div className="tabular-nums w-10 text-right">
            <Text size="sm" variant="muted">
              {compliancePercent}%
            </Text>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </TableCell>
      <TableCell>
        <div className="tabular-nums">
          <Text size="sm" variant="muted">
            {counts.policies.completed}/{counts.policies.total}
          </Text>
        </div>
      </TableCell>
      <TableCell>
        <div className="tabular-nums">
          <Text size="sm" variant="muted">
            {counts.tasks.completed}/{counts.tasks.total}
          </Text>
        </div>
      </TableCell>
      <TableCell>
        <div className="tabular-nums">
          <Text size="sm" variant="muted">
            {counts.documents.completed}/{counts.documents.total}
          </Text>
        </div>
      </TableCell>
    </TableRow>
  );
}
