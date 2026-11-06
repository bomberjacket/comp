'use client';

import { ANSWER_LABELS, type AnswerValue } from '@/types/framework-answers';
import { Button } from '@trycompai/design-system';

/**
 * One row of answer buttons in the framework's option order (Y / I / S / N …). The
 * selected answer is filled; everything else is outlined. Identity is never colour
 * alone: the short code is the label and the full word is the title.
 */
export function AnswerButtons({
  values,
  selected,
  disabled,
  onSelect,
}: {
  values: AnswerValue[];
  selected: AnswerValue | null;
  disabled?: boolean;
  onSelect: (value: AnswerValue) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup">
      {values.map((v) => {
        const active = v === selected;
        return (
          <Button
            key={v}
            size="sm"
            variant={active ? 'default' : 'outline'}
            role="radio"
            aria-checked={active}
            title={ANSWER_LABELS[v].label}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(v);
            }}
          >
            {ANSWER_LABELS[v].short}
          </Button>
        );
      })}
    </div>
  );
}
