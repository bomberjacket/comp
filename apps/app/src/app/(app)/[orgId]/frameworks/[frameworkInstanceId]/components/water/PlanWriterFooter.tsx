'use client';

import { Button, Text } from '@trycompai/design-system';

interface Props {
  canEdit: boolean;
  saving: boolean;
  isFirst: boolean;
  isLast: boolean;
  published: boolean;
  /** Something on this section is waiting to be saved. */
  hasChanges: boolean;
  /** Name of the other plan when it is not published yet. */
  nextPlanName?: string;
  onPrevious: () => void;
  onContinue: () => void;
  onSave: () => void;
  onPublish: () => void;
  onNextPlan: () => void;
}

/**
 * The buttons under a plan section. There is one way forward at each point: "Save and
 * continue" on every section but the last, "Save and publish plan" on the last, then on
 * to the other plan. Moving between sections saves by itself, so nothing is greyed out
 * waiting for a separate Save.
 */
export function PlanWriterFooter(props: Props) {
  const { canEdit, saving, isFirst, isLast, published, hasChanges, nextPlanName } = props;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        {!isFirst && (
          <Button size="sm" variant="outline" onClick={props.onPrevious} disabled={saving}>
            Previous
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!isLast && (
          <Button size="sm" onClick={props.onContinue} disabled={saving} loading={saving}>
            {canEdit ? (hasChanges ? 'Save and continue' : 'Continue') : 'Next'}
          </Button>
        )}
        {isLast && canEdit && !published && (
          <>
            {hasChanges && (
              <Button size="sm" variant="outline" onClick={props.onSave} disabled={saving}>
                Save without publishing
              </Button>
            )}
            <Button size="sm" onClick={props.onPublish} disabled={saving} loading={saving}>
              {hasChanges ? 'Save and publish plan' : 'Publish plan'}
            </Button>
          </>
        )}
        {isLast && canEdit && published && hasChanges && (
          <Button size="sm" onClick={props.onSave} disabled={saving} loading={saving}>
            Save changes
          </Button>
        )}
        {isLast && published && !hasChanges && nextPlanName && (
          <Button size="sm" onClick={props.onNextPlan}>
            Continue to the {nextPlanName}
          </Button>
        )}
        {isLast && published && !hasChanges && !nextPlanName && (
          <Text size="sm" variant="muted">
            Both plans are published. Step 1 is complete; close this box and go on to step 2.
          </Text>
        )}
      </div>
    </div>
  );
}

interface ConfirmProps {
  percent: number;
  filled: number;
  total: number;
  incomplete: { index: number; title: string; filled: number; total: number }[];
  saving: boolean;
  onBack: () => void;
  onPublish: () => void;
}

/** Shown before publishing: how complete the plan is, and the choice to go back or publish. */
export function PublishConfirm({ percent, filled, total, incomplete, saving, onBack, onPublish }: ConfirmProps) {
  const complete = percent >= 100;
  return (
    <div role="alert" className={`space-y-3 rounded-md border p-3 ${complete ? 'border-emerald-600/50 bg-emerald-600/10' : 'border-amber-500/60 bg-amber-500/10'}`}>
      {complete ? (
        <p className="text-sm font-medium">Every box is filled in. Publishing records this version as the approved plan.</p>
      ) : (
        <>
          <p className="text-sm font-medium">
            This plan has {percent}% of the requested information: {filled} of {total} boxes are filled in.
          </p>
          <p className="text-sm">You can publish it as it is, or go back and fill in the rest. Sections with empty boxes:</p>
          <ul className="space-y-0.5 text-sm">
            {incomplete.map((s) => (
              <li key={s.index} className="ml-4 list-disc">
                {s.title}: {s.total - s.filled} of {s.total} empty
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onBack}>
          {complete ? 'Not yet' : 'Go back and fill in'}
        </Button>
        <Button size="sm" onClick={onPublish} disabled={saving}>
          {complete ? 'Publish' : 'Publish anyway'}
        </Button>
      </div>
    </div>
  );
}
