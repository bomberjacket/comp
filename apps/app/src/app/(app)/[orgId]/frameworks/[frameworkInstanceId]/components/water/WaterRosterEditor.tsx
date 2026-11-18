'use client';

import { useWaterRoster, type RosterContact, type RosterInput, type RosterPerson } from '@/hooks/use-water-roster';
import { Badge, Button, Input, Text, Textarea } from '@trycompai/design-system';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { rosterGuidance } from './guidance-plans';
import { RosterVendors } from './RosterVendors';
import { VoiceDirection } from './VoiceDirection';

interface Props {
  orgId: string;
  frameworkInstanceId: string;
  canEdit: boolean;
  onChanged?: () => void;
  /** Go on to the plans. */
  onDone: () => void;
}

type InputEvent = React.ChangeEvent<HTMLInputElement>;
const SELECT = 'h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-60';

/**
 * Who's who: the first thing in step 1. The utility names the person for each role and
 * its outside contacts once; the boxes of both plans that ask for the same person or
 * contact are then filled from this list, and a change here reaches both plans.
 */
export function WaterRosterEditor({ orgId, frameworkInstanceId, canEdit, onChanged, onDone }: Props) {
  const { roster, error, isLoading, save } = useWaterRoster(frameworkInstanceId);
  const [draft, setDraft] = useState<RosterInput | null>(null);
  const [saving, setSaving] = useState(false);
  const stored = roster ? JSON.stringify([roster.staff, roster.contacts, roster.facts]) : '';

  useEffect(() => {
    if (roster) setDraft({ staff: roster.staff, contacts: roster.contacts, facts: roster.facts });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);

  if (error) return <Text variant="muted">The Who&apos;s who list could not be loaded: {error.message}</Text>;
  if (isLoading || !roster || !draft) return <Text variant="muted">Loading the Who&apos;s who list…</Text>;

  const { roles, contacts, facts } = roster.definition;
  const dirty = JSON.stringify([draft.staff, draft.contacts, draft.facts]) !== stored;
  const locked = !canEdit || saving;
  const setPerson = (key: string, patch: Partial<RosterPerson>) =>
    setDraft({ ...draft, staff: { ...draft.staff, [key]: { ...(draft.staff[key] as RosterPerson), ...patch } } });
  const setContact = (key: string, patch: Partial<RosterContact>) =>
    setDraft({ ...draft, contacts: { ...draft.contacts, [key]: { ...(draft.contacts[key] as RosterContact), ...patch } } });
  const labelOf = (key: string) => roles.find((r) => r.key === key)?.label ?? key;
  /** The role a "same person as" choice finally lands on; undefined when the choices go round in a circle. */
  const endOf = (key: string): string | undefined => {
    let current = key;
    for (let i = 0; i <= roles.length; i += 1) {
      const next = draft.staff[current]?.sameAs;
      if (!next) return current;
      current = next;
    }
    return undefined;
  };
  const nameBehind = (key: string): string => draft.staff[endOf(key) ?? '']?.name ?? '';
  /** Choosing `other` for `key` must not send the choices round in a circle. */
  const canFollow = (key: string, other: string): boolean => other !== key && endOf(other) !== key && endOf(other) !== undefined;

  const persist = async (thenContinue: boolean) => {
    // Nothing typed and already saved once: just move on.
    if (!canEdit || (!dirty && roster.saved)) {
      if (thenContinue) onDone();
      return;
    }
    setSaving(true);
    try {
      await save(draft);
      onChanged?.();
      toast.success("Who's who saved. Both plans now use it.");
      if (thenContinue) onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 rounded-lg border p-4">
      <VoiceDirection guidance={rosterGuidance(roster.progress.filled, roster.progress.total)} />
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">Who&apos;s who</h3>
        <Badge variant="outline">
          {roster.progress.filled} of {roster.progress.total} filled in
        </Badge>
        {!roster.saved && <Badge variant="secondary">not saved yet</Badge>}
      </div>

      <section className="space-y-3">
        <Text size="sm" weight="medium">
          People and their roles
        </Text>
        {roles.map((role) => {
          const p = draft.staff[role.key] as RosterPerson;
          const set = (field: keyof RosterPerson) => (e: InputEvent) => setPerson(role.key, { [field]: e.target.value });
          return (
            <div key={role.key} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{role.label}</span>
                <span className="text-xs text-muted-foreground">{role.hint}</span>
              </div>
              <div className="grid gap-2 md:grid-cols-[220px_1fr]">
                <select className={SELECT} value={p.sameAs} onChange={(e) => setPerson(role.key, { sameAs: e.target.value })} disabled={locked} aria-label={`${role.label}: who`}>
                  <option value="">A person named here</option>
                  {roles
                    .filter((r) => r.key === p.sameAs || canFollow(role.key, r.key))
                    .map((r) => (
                      <option key={r.key} value={r.key}>
                        Same person as: {r.label}
                      </option>
                    ))}
                </select>
                {p.sameAs ? (
                  <Text size="sm" variant="muted">
                    {nameBehind(role.key) ? `${nameBehind(role.key)} (from ${labelOf(p.sameAs)})` : `Fill in ${labelOf(p.sameAs)} and this follows it.`}
                  </Text>
                ) : (
                  <div className="grid gap-2 md:grid-cols-4">
                    <Input value={p.name} onChange={set('name')} placeholder="Name" disabled={locked} />
                    <Input value={p.title} onChange={set('title')} placeholder="Title" disabled={locked} />
                    <Input value={p.phone} onChange={set('phone')} placeholder="Mobile phone" disabled={locked} />
                    <Input value={p.email} onChange={set('email')} placeholder="Email that works in an outage" disabled={locked} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <Text size="sm" weight="medium">
          Outside contacts
        </Text>
        {contacts.map((c) => {
          const v = draft.contacts[c.key] as RosterContact;
          const set = (field: 'name' | 'detail' | 'phone') => (e: InputEvent) => setContact(c.key, { [field]: e.target.value });
          return (
            <div key={c.key} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{c.label}</span>
                {c.allowNone && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={v.none} onChange={(e) => setContact(c.key, { none: e.target.checked })} disabled={locked} />
                    The utility has none
                  </label>
                )}
              </div>
              {!v.none && (
                <div className="grid gap-2 md:grid-cols-3">
                  <Input value={v.name} onChange={set('name')} placeholder={c.nameLabel} disabled={locked} />
                  <Input value={v.detail} onChange={set('detail')} placeholder={c.detailLabel} disabled={locked} />
                  <Input value={v.phone} onChange={set('phone')} placeholder={c.phoneLabel} disabled={locked} />
                </div>
              )}
            </div>
          );
        })}
      </section>

      <RosterVendors orgId={orgId} frameworkInstanceId={frameworkInstanceId} canEdit={canEdit} />

      <section className="space-y-3">
        <Text size="sm" weight="medium">
          Asked once, used in both plans
        </Text>
        {facts.map((f) => {
          const value = draft.facts[f.key] ?? '';
          const change = (v: string) => setDraft({ ...draft, facts: { ...draft.facts, [f.key]: v } });
          return (
            <label key={f.key} className="block space-y-1">
              <span className="text-sm font-medium">
                {f.label}
                {f.optional ? ' (optional)' : ''}
              </span>
              {f.long ? (
                <Textarea value={value} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => change(e.target.value)} placeholder={f.hint} rows={3} disabled={locked} />
              ) : (
                <Input value={value} onChange={(e: InputEvent) => change(e.target.value)} placeholder={f.hint} disabled={locked} />
              )}
            </label>
          );
        })}
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        {canEdit && dirty && (
          <Button size="sm" variant="outline" onClick={() => void persist(false)} disabled={saving}>
            Save
          </Button>
        )}
        <Button size="sm" onClick={() => void persist(true)} disabled={saving} loading={saving}>
          {canEdit && (dirty || !roster.saved) ? 'Save and continue to the plans' : 'Continue to the plans'}
        </Button>
      </div>
    </div>
  );
}
