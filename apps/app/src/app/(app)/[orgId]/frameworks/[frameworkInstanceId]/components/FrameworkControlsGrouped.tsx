'use client';

import type { EvidenceSubmissionInfo } from '@/lib/control-compliance';
import type { FrameworkInstanceWithControls } from '@/lib/types/framework';
import type { Control, FrameworkEditorRequirement, Task } from '@db';
import {
  Button,
  Heading,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { ChevronDown, ChevronRight, Search } from '@trycompai/design-system/icons';
import { useParams, useRouter } from 'next/navigation';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { FamilyFilterDropdown } from './FamilyFilterDropdown';
import {
  areAllFamiliesExpanded,
  isFamilyExpanded,
  toggleAllFamilyExpansion,
  toggleFamilyExpansion,
} from './family-expansion-state';
import {
  buildControlItems,
  buildRequirementMap,
  compareRequirementsByOrder,
  findObjectiveTask,
  getFamilyDisplayLabel,
  groupByFamily,
  type ControlItem,
  type FamilyGroup,
} from './framework-controls-shared';
import { GroupedControlRow } from './GroupedControlRow';
import { GroupedObjectiveRow } from './GroupedObjectiveRow';
import type { ScoredRequirement } from '@/types/nist-800-171-score';

const COLUMN_COUNT = 7;

export function FrameworkControlsGrouped({
  frameworkInstanceWithControls,
  requirementDefinitions,
  tasks,
  evidenceSubmissions = [],
  requirementScores,
}: {
  frameworkInstanceWithControls: FrameworkInstanceWithControls;
  requirementDefinitions: FrameworkEditorRequirement[];
  tasks: (Task & { controls: Control[] })[];
  evidenceSubmissions?: EvidenceSubmissionInfo[];
  /** NIST SP 800-171 scoring per requirement number, when the framework is scored. */
  requirementScores?: ScoredRequirement[];
}) {
  const scoreByNumber = useMemo(
    () => new Map((requirementScores ?? []).map((r) => [r.number, r])),
    [requirementScores],
  );
  const { orgId, frameworkInstanceId } = useParams<{ orgId: string; frameworkInstanceId: string }>();
  const router = useRouter();

  const handleRowClick = useCallback(
    (controlId: string) => {
      router.push(`/${orgId}/frameworks/${frameworkInstanceId}/controls/${controlId}`);
    },
    [orgId, frameworkInstanceId, router],
  );

  const [searchTerm, setSearchTerm] = useQueryState('q', parseAsString.withDefault('').withOptions({ shallow: true, throttleMs: 300 }));
  const [familyFilterParam, setFamilyFilterParam] = useQueryState('families', parseAsArrayOf(parseAsString, '|').withDefault([]).withOptions({ shallow: true }));
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  // Third level: controls whose requirements (assessment objectives) are shown. Collapsed by default.
  const [expandedControls, setExpandedControls] = useState<Set<string>>(new Set());

  const selectedFamilyFilter = useMemo(() => new Set(familyFilterParam), [familyFilterParam]);

  const requirementMap = useMemo(
    () => buildRequirementMap(requirementDefinitions),
    [requirementDefinitions],
  );

  const definitionsById = useMemo(
    () => new Map(requirementDefinitions.map((def) => [def.id, def])),
    [requirementDefinitions],
  );

  const allItems = useMemo(
    () => buildControlItems(frameworkInstanceWithControls.controls, requirementMap),
    [frameworkInstanceWithControls.controls, requirementMap],
  );

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return allItems;
    const lower = searchTerm.toLowerCase();
    return allItems.filter(
      (item) =>
        item.control.name.toLowerCase().includes(lower) ||
        item.control.description?.toLowerCase().includes(lower) ||
        item.requirements.some(
          (r) => r.name.toLowerCase().includes(lower) || r.identifier.toLowerCase().includes(lower),
        ),
    );
  }, [allItems, searchTerm]);

  const allGroups = useMemo(() => groupByFamily(filteredItems), [filteredItems]);

  const groups = useMemo(() => {
    if (selectedFamilyFilter.size === 0) return allGroups;
    return allGroups.filter((g) => selectedFamilyFilter.has(g.family));
  }, [allGroups, selectedFamilyFilter]);

  const allFamilyNames = useMemo(() => allGroups.map((g) => g.family), [allGroups]);
  const familyCounts = useMemo(() => new Map(allGroups.map((g) => [g.family, g.items.length])), [allGroups]);

  const isSearching = searchTerm.trim().length > 0;
  const visibleFamilyNames = useMemo(() => groups.map((g) => g.family), [groups]);
  const allExpanded = areAllFamiliesExpanded({
    expandedFamilies,
    familyNames: visibleFamilyNames,
  });

  const handleToggleFamily = (family: string) => {
    setExpandedFamilies((prev) =>
      toggleFamilyExpansion({ expandedFamilies: prev, family }),
    );
  };

  const handleToggleControl = useCallback((controlId: string) => {
    setExpandedControls((prev) => {
      const next = new Set(prev);
      if (next.has(controlId)) next.delete(controlId);
      else next.add(controlId);
      return next;
    });
  }, []);

  const handleToggleAll = () => {
    setExpandedFamilies((prev) =>
      toggleAllFamilyExpansion({
        expandedFamilies: prev,
        familyNames: visibleFamilyNames,
        shouldExpand: !allExpanded,
      }),
    );
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value || null);
  };

  const handleToggleFamilyFilter = (family: string) => {
    const next = new Set(selectedFamilyFilter);
    if (next.has(family)) {
      next.delete(family);
    } else {
      next.add(family);
    }
    setFamilyFilterParam(next.size > 0 ? [...next].sort() : null);
  };

  const handleClearFamilyFilter = () => {
    setFamilyFilterParam(null);
  };

  const getIsFamilyExpanded = (family: string) =>
    isFamilyExpanded({ expandedFamilies, family, isSearching });

  return (
    <div className="space-y-4">
      <Heading level="2">Controls ({filteredItems.length})</Heading>
      <div className="flex items-center gap-3">
        <div className="w-full max-w-sm">
          <InputGroup>
            <InputGroupAddon>
              <Search size={16} />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search controls..."
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </InputGroup>
        </div>
        <FamilyFilterDropdown
          allFamilyNames={allFamilyNames}
          familyCounts={familyCounts}
          selectedFamilies={selectedFamilyFilter}
          onToggleFamily={handleToggleFamilyFilter}
          onClear={handleClearFamilyFilter}
        />
        {!isSearching && (
          <Button variant="ghost" onClick={handleToggleAll}>
            {allExpanded ? 'Collapse All' : 'Expand All'}
          </Button>
        )}
      </div>
      <Table variant="bordered">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Requirement</TableHead>
            <TableHead>Compliance</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Policies</TableHead>
            <TableHead>Tasks</TableHead>
            <TableHead>Documents</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT}>
                <Text size="sm" variant="muted">
                  No controls found.
                </Text>
              </TableCell>
            </TableRow>
          ) : (
            groups.map((group) => (
              <FamilySection
                key={group.family}
                group={group}
                expanded={getIsFamilyExpanded(group.family)}
                onToggle={() => handleToggleFamily(group.family)}
                tasks={tasks}
                evidenceSubmissions={evidenceSubmissions}
                orgId={orgId}
                frameworkInstanceId={frameworkInstanceId}
                onRowClick={handleRowClick}
                definitionsById={definitionsById}
                expandedControls={expandedControls}
                isSearching={isSearching}
                onToggleControl={handleToggleControl}
                scoreByNumber={scoreByNumber}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function FamilySection({
  group,
  expanded,
  onToggle,
  tasks,
  evidenceSubmissions,
  orgId,
  frameworkInstanceId,
  onRowClick,
  definitionsById,
  expandedControls,
  isSearching,
  onToggleControl,
  scoreByNumber,
}: {
  group: FamilyGroup;
  expanded: boolean;
  onToggle: () => void;
  tasks: (Task & { controls: Control[] })[];
  evidenceSubmissions: EvidenceSubmissionInfo[];
  orgId: string;
  frameworkInstanceId: string;
  onRowClick: (controlId: string) => void;
  definitionsById: Map<string, FrameworkEditorRequirement>;
  scoreByNumber: Map<string, ScoredRequirement>;
  expandedControls: Set<string>;
  isSearching: boolean;
  onToggleControl: (controlId: string) => void;
}) {
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;

  return (
    <>
      <TableRow data-state="selected">
        <TableCell colSpan={COLUMN_COUNT}>
          <button
            type="button"
            className="flex w-full items-center gap-2 py-1 text-left font-medium cursor-pointer"
            onClick={onToggle}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggle();
              }
            }}
            aria-expanded={expanded}
          >
            <ChevronIcon size={16} />
            <span>{getFamilyDisplayLabel(group.family)}</span>
            <span className="text-muted-foreground text-sm font-normal">
              ({group.items.length})
            </span>
          </button>
        </TableCell>
      </TableRow>
      {expanded &&
        group.items.map(({ control, requirements }) => {
          // Family -> Control -> Requirement (assessment objective), in the framework's order.
          const objectives = requirements
            .map((r) => definitionsById.get(r.id) ?? { ...r, sortOrder: null })
            .sort(compareRequirementsByOrder);
          const expandable = objectives.length > 0;
          const controlExpanded = expandable && (isSearching || expandedControls.has(control.id));
          return (
            <Fragment key={control.id}>
              <GroupedControlRow
                control={control}
                requirements={objectives}
                tasks={tasks}
                evidenceSubmissions={evidenceSubmissions}
                orgId={orgId}
                frameworkInstanceId={frameworkInstanceId}
                onRowClick={onRowClick}
                expandable={expandable}
                expanded={controlExpanded}
                onToggleExpand={() => onToggleControl(control.id)}
                score={scoreByNumber.get(control.name.split(' ')[0])}
              />
              {controlExpanded &&
                objectives.map((objective) => (
                  <GroupedObjectiveRow
                    key={objective.id}
                    objective={objective}
                    task={findObjectiveTask(tasks, control.id, objective.identifier)}
                    orgId={orgId}
                    frameworkInstanceId={frameworkInstanceId}
                  />
                ))}
            </Fragment>
          );
        })}
    </>
  );
}
