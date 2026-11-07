'use client';

import type { ChecklistItemAnswer, VendorChecklistItemDef } from '@/hooks/use-vendor-checklists';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  TableCell,
  TableRow,
  Textarea,
} from '@trycompai/design-system';

const LEVELS = [0, 1, 2, 3] as const;

interface Props {
  item: VendorChecklistItemDef;
  answer: ChecklistItemAnswer;
  weightScale: Record<string, string>;
  scoreScale: Record<string, string>;
  readOnly: boolean;
  onChange: (next: ChecklistItemAnswer) => void;
}

/** One EPA checklist line: weight × score, contract flag, supplier response. */
export function ChecklistItemRow({ item, answer, weightScale, scoreScale, readOnly, onChange }: Props) {
  const total = answer.weight * answer.score;
  const scoreLabel = (scale: Record<string, string>, n: number) => `${n} · ${scale[String(n)] ?? ''}`;
  return (
    <TableRow>
      <TableCell>
        <div className="space-y-1">
          <p className="text-sm font-medium">
            <span className="text-muted-foreground mr-1 text-xs">{item.id}</span>
            {item.question}
          </p>
          {item.exampleResponse && item.exampleResponse !== 'N/A' && (
            <p className="text-xs text-muted-foreground">Example response: {item.exampleResponse}</p>
          )}
          {item.recommendation && item.recommendation !== 'N/A' && (
            <p className="text-xs text-muted-foreground">EPA recommendation: {item.recommendation}</p>
          )}
          {item.referenceUrl && (
            <a
              href={item.referenceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline underline-offset-2"
            >
              Reference guidance
            </a>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Select
          value={String(answer.weight)}
          onValueChange={(v) => onChange({ ...answer, weight: Number(v) })}
          disabled={readOnly}
        >
          <SelectTrigger size="sm">
            <SelectValue>{scoreLabel(weightScale, answer.weight)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {LEVELS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                <span className="text-xs">{scoreLabel(weightScale, n)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select
          value={String(answer.score)}
          onValueChange={(v) => onChange({ ...answer, score: Number(v) })}
          disabled={readOnly || answer.weight === 0}
        >
          <SelectTrigger size="sm">
            <SelectValue>{scoreLabel(scoreScale, answer.score)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {LEVELS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                <span className="text-xs">{scoreLabel(scoreScale, n)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <span className="block text-center tabular-nums text-sm">{answer.weight === 0 ? '—' : total}</span>
      </TableCell>
      <TableCell>
        <Switch
          checked={answer.inContract === true}
          onCheckedChange={(checked: boolean) => onChange({ ...answer, inContract: checked })}
          disabled={readOnly}
          aria-label="Supplier will include this in contract language"
        />
      </TableCell>
      <TableCell>
        <div className="min-w-[220px] space-y-1">
        <Textarea
          value={answer.supplierResponse ?? ''}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange({ ...answer, supplierResponse: e.target.value })}
          placeholder="Supplier response / evidence seen"
          rows={2}
          disabled={readOnly}
        />
        <Textarea
          value={answer.explanation ?? ''}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange({ ...answer, explanation: e.target.value })}
          placeholder="Explanation of the score"
          rows={1}
          disabled={readOnly}
        />
        </div>
      </TableCell>
    </TableRow>
  );
}
