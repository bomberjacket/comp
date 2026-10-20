'use client';

import type { Control, Task } from '@db';
import { Badge, TableCell, TableRow, Text } from '@trycompai/design-system';
import { Launch } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getStatusBadge,
  taskProgressPercent,
  taskStatusToStatusType,
} from './framework-controls-shared';

/**
 * Third nesting level on the Controls tab: one assessment objective under its control.
 * Status and progress come from the objective's evidence task when the framework has one
 * task per objective (NIST SP 800-171); otherwise the row only names the requirement.
 */
export function GroupedObjectiveRow({
  objective,
  task,
  orgId,
  frameworkInstanceId,
}: {
  objective: { id: string; name: string; identifier?: string | null };
  task: (Task & { controls: Control[] }) | undefined;
  orgId: string;
  frameworkInstanceId: string;
}) {
  const router = useRouter();
  const identifier = objective.identifier?.trim();
  const requirementHref = `/${orgId}/frameworks/${frameworkInstanceId}/requirements/${objective.id}`;
  const taskHref = task ? `/${orgId}/tasks/${task.id}` : null;
  const badge = task ? getStatusBadge(taskStatusToStatusType(task.status)) : null;
  const percent = task ? taskProgressPercent(task.status) : null;
  const taskDone = task && (task.status === 'done' || task.status === 'not_relevant') ? 1 : 0;

  return (
    <TableRow
      onClick={() => router.push(taskHref ?? requirementHref)}
      style={{ cursor: 'pointer' }}
      data-objective-row
    >
      <TableCell>
        <Link
          href={requirementHref}
          onClick={(e) => e.stopPropagation()}
          className="group flex items-center gap-2 pl-12"
        >
          <span className="text-sm text-muted-foreground">{identifier || '—'}</span>
          <Launch
            size={14}
            className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          />
        </Link>
      </TableCell>
      <TableCell>
        <span className="block truncate text-sm" title={objective.name}>
          {objective.name}
        </span>
      </TableCell>
      <TableCell>
        {percent === null ? (
          <Text size="sm" variant="muted">
            —
          </Text>
        ) : (
          <div className="flex min-w-[100px] items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-muted/50">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="tabular-nums w-10 text-right">
              <Text size="sm" variant="muted">
                {percent}%
              </Text>
            </div>
          </div>
        )}
      </TableCell>
      <TableCell>
        {badge ? (
          <Badge variant={badge.variant}>{badge.label}</Badge>
        ) : (
          <Text size="sm" variant="muted">
            —
          </Text>
        )}
      </TableCell>
      <TableCell>
        <Text size="sm" variant="muted">
          —
        </Text>
      </TableCell>
      <TableCell>
        {taskHref ? (
          <Link
            href={taskHref}
            onClick={(e) => e.stopPropagation()}
            className="tabular-nums text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            {taskDone}/1
          </Link>
        ) : (
          <Text size="sm" variant="muted">
            —
          </Text>
        )}
      </TableCell>
      <TableCell>
        <Text size="sm" variant="muted">
          —
        </Text>
      </TableCell>
    </TableRow>
  );
}
