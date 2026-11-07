'use client';

import {
  useVendorChecklistDefinitions,
  useVendorChecklists,
  type ChecklistAssessment,
  type ChecklistItemAnswer,
  type VendorChecklistDef,
  type VendorChecklistKind,
} from '@/hooks/use-vendor-checklists';
import {
  Badge,
  Button,
  Input,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChecklistItemRow } from './ChecklistItemRow';

const KIND_LABEL: Record<VendorChecklistKind, string> = {
  epa_supplier: 'Product / service supplier',
  epa_integrator_msp: 'Integrator or managed service provider',
};

interface Props {
  vendorId: string;
  canEdit: boolean;
}

function emptyAnswers(def: VendorChecklistDef, saved: ChecklistItemAnswer[]): Record<string, ChecklistItemAnswer> {
  const byId = new Map(saved.map((a) => [a.itemId, a]));
  return Object.fromEntries(
    def.items.map((i) => [i.id, byId.get(i.id) ?? { itemId: i.id, weight: 0, score: 0, inContract: null }]),
  );
}

/**
 * EPA Cybersecurity Procurement Evaluation Checklist for one vendor: pick the sheet
 * (supplier or integrator/MSP), weight each item 0–3 and score the supplier's response
 * 0–3; EPA's total value is weight × score and the section gap is target minus actual.
 */
export function VendorProcurementChecklist({ vendorId, canEdit }: Props) {
  const { data: defs, error: defsError } = useVendorChecklistDefinitions();
  const { assessments, isLoading, save } = useVendorChecklists(vendorId);
  const [kind, setKind] = useState<VendorChecklistKind>('epa_supplier');
  const [answers, setAnswers] = useState<Record<string, ChecklistItemAnswer>>({});
  const [contractReference, setContractReference] = useState('');
  const [evaluationFrequency, setEvaluationFrequency] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const def = useMemo(() => defs?.checklists.find((c) => c.kind === kind), [defs, kind]);
  const saved: ChecklistAssessment | undefined = assessments.find((a) => a.kind === kind);

  useEffect(() => {
    if (!def) return;
    setAnswers(emptyAnswers(def, saved?.items ?? []));
    setContractReference(saved?.contractReference ?? '');
    setEvaluationFrequency(saved?.evaluationFrequency ?? '');
    setDirty(false);
  }, [def, saved]);

  const live = useMemo(() => {
    if (!def) return null;
    const sections = def.sections.map((section) => {
      let target = 0;
      let actual = 0;
      let scored = 0;
      for (const i of def.items.filter((x) => x.section === section)) {
        const a = answers[i.id];
        if (!a || a.weight === 0) continue;
        scored += 1;
        target += a.weight * 3;
        actual += a.weight * a.score;
      }
      return { section, scored, target, actual, gap: target - actual, percent: target ? Math.round((actual / target) * 100) : null };
    });
    const target = sections.reduce((s, x) => s + x.target, 0);
    const actual = sections.reduce((s, x) => s + x.actual, 0);
    return { sections, target, actual, percent: target ? Math.round((actual / target) * 100) : null };
  }, [def, answers]);

  const handleSave = async () => {
    if (!def) return;
    setSaving(true);
    try {
      const items = Object.values(answers).filter((a) => a.weight > 0 || a.supplierResponse || a.explanation || a.inContract !== null);
      await save(kind, { items, contractReference, evaluationFrequency });
      setDirty(false);
      toast.success('Checklist saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the checklist');
    } finally {
      setSaving(false);
    }
  };

  if (defsError) return <Text variant="muted">The checklist definitions could not be loaded.</Text>;
  if (!defs || !def || isLoading) return <Text variant="muted">Loading checklist…</Text>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {defs.checklists.map((c) => (
          <Button
            key={c.kind}
            size="sm"
            variant={c.kind === kind ? 'default' : 'outline'}
            onClick={() => setKind(c.kind)}
            disabled={dirty && c.kind !== kind}
          >
            {KIND_LABEL[c.kind]}
          </Button>
        ))}
        {saved?.assessedAt && (
          <Text size="sm" variant="muted">
            Last saved {new Date(saved.assessedAt).toLocaleDateString()}
          </Text>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Input
          value={contractReference}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setContractReference(e.target.value);
            setDirty(true);
          }}
          placeholder="Contract name or number"
          disabled={!canEdit}
        />
        <Input
          value={evaluationFrequency}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setEvaluationFrequency(e.target.value);
            setDirty(true);
          }}
          placeholder="Evaluation frequency (e.g. annual, at renewal)"
          disabled={!canEdit}
        />
      </div>

      {live && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            Total {live.actual} / {live.target}
            {live.percent !== null ? ` (${live.percent}%)` : ''}
          </Badge>
          {live.sections.map((s) => (
            <Badge key={s.section} variant="outline">
              {s.section}: {s.scored ? `${s.actual}/${s.target}, gap ${s.gap}` : 'not weighted'}
            </Badge>
          ))}
        </div>
      )}

      {def.sections.map((section) => (
        <div key={section} className="space-y-2">
          <h3 className="text-sm font-semibold">{section}</h3>
          <Table variant="bordered">
            <TableHeader>
              <TableRow>
                <TableHead>Question</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>In contract</TableHead>
                <TableHead>Response and explanation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {def.items
                .filter((i) => i.section === section)
                .map((item) => (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    answer={answers[item.id] ?? { itemId: item.id, weight: 0, score: 0, inContract: null }}
                    weightScale={defs.weightScale}
                    scoreScale={defs.scoreScale}
                    readOnly={!canEdit}
                    onChange={(next) => {
                      setAnswers((prev) => ({ ...prev, [item.id]: next }));
                      setDirty(true);
                    }}
                  />
                ))}
            </TableBody>
          </Table>
        </div>
      ))}

      <div className="flex items-center justify-between gap-3">
        <Text size="sm" variant="muted">
          {def.source}. Weight 0 leaves an item out of the score; value = weight × score; section gap = target − actual.
        </Text>
        {canEdit && (
          <Button onClick={() => void handleSave()} disabled={!dirty || saving} loading={saving}>
            Save checklist
          </Button>
        )}
      </div>
    </div>
  );
}
