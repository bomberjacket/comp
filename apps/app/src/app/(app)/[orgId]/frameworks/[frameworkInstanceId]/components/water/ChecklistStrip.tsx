'use client';

interface Props {
  questions: Array<{ id: string; identifier: string }>;
  /** Ids of the questions that already have an answer. */
  answered: Set<string>;
  index: number;
  /** Unsaved changes on the current question: jumping away is held until they are saved. */
  locked: boolean;
  onPick: (index: number) => void;
}

/**
 * Every checklist question as a small button, in order, so it is plain where the wizard
 * is, which questions are answered and how to reach any of them. The wizard opens on the
 * first unanswered question, which is not always the first question.
 */
export function ChecklistStrip({ questions, answered, index, locked, onPick }: Props) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1" role="list" aria-label="All questions">
        {questions.map((q, i) => {
          const done = answered.has(q.id);
          const current = i === index;
          return (
            <button
              key={q.id}
              type="button"
              role="listitem"
              onClick={() => onPick(i)}
              disabled={locked && !current}
              title={`${q.identifier}: ${done ? 'answered' : 'not answered yet'}`}
              aria-current={current ? 'step' : undefined}
              className={`rounded px-1.5 py-0.5 text-xs tabular-nums disabled:opacity-50 ${
                done ? 'bg-emerald-600/15 text-emerald-800 dark:text-emerald-300' : 'bg-muted text-muted-foreground'
              } ${current ? 'ring-2 ring-primary font-semibold' : 'hover:bg-muted/70'}`}
            >
              {q.identifier}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Green questions are answered. The wizard opens on the first one that is not; choose any question to read or change its answer. The numbers follow CISA&apos;s list of 38 practices; EPA&apos;s checklist uses 33 of them, so a few are skipped (1.F to 1.H, 4.B and 4.C).
        {locked ? ' Save this question before moving to another.' : ''}
      </p>
    </div>
  );
}
