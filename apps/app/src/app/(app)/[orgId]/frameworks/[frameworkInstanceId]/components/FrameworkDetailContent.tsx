'use client';

import { useFrameworkAnswers } from '@/hooks/use-framework-answers';
import { useFrameworkInstance } from '@/hooks/use-framework-instance';
import { usePermissions } from '@/hooks/use-permissions';
import { getFrameworkAggregatePercent } from '@/lib/control-compliance';
import type { FrameworkUpdateStatus } from '@/types/framework-versioning';
import { useFeatureFlag } from '@trycompai/analytics';
import {
  Button,
  PageHeader,
  PageHeaderDescription,
  PageLayout,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@trycompai/design-system';
import { Edit, OverflowMenuVertical, TrashCan } from '@trycompai/design-system/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@trycompai/ui/dropdown-menu';
import Link from 'next/link';
import { WATER_FRAMEWORK_ID } from '@/hooks/use-water-program';
import { WaterProgramGuide } from './WaterProgramGuide';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { AddCustomRequirementSheet } from './AddCustomRequirementSheet';
import { EditCustomFrameworkSheet } from './EditCustomFrameworkSheet';
import { FrameworkControls } from './FrameworkControls';
import { FrameworkControlsGrouped } from './FrameworkControlsGrouped';
import { FrameworkDeleteDialog } from './FrameworkDeleteDialog';
import { FrameworkProgress } from './FrameworkProgress';
import { FrameworkRequirements } from './FrameworkRequirements';
import { FrameworkRequirementsGrouped } from './FrameworkRequirementsGrouped';
import { FrameworkTimeline } from './FrameworkTimeline';
import { FrameworkVersioningSection } from './FrameworkVersioningSection';
import { Nist800171ScoreCard } from './Nist800171ScoreCard';
import type { Nist800171ScoreResult } from '@/types/nist-800-171-score';
import { LinkRequirementSheet } from './LinkRequirementSheet';
import { SyncHistorySection } from './SyncHistorySection';
import { AnswerResults } from './answers/AnswerResults';
import { AssessTab } from './answers/AssessTab';

interface FrameworkDetailContentProps {
  orgId: string;
  frameworkInstanceId: string;
  initialFramework: any;
  initialUpdateStatus?: FrameworkUpdateStatus;
  initialScore?: Nist800171ScoreResult;
}

const DEFAULT_TAB = 'controls';

export function FrameworkDetailContent({
  orgId,
  frameworkInstanceId,
  initialFramework,
  initialUpdateStatus,
  initialScore,
}: FrameworkDetailContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasPermission, permissions } = usePermissions();
  const complianceTimelineEnabled = useFeatureFlag('is-timeline-enabled');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const { data, mutate } = useFrameworkInstance<any>(frameworkInstanceId, {
    fallbackData: initialFramework,
  });
  const framework = data ?? initialFramework;
  const frameworkInstanceWithControls = {
    ...framework,
    controls: framework.controls ?? [],
  };

  const frameworkName = framework.framework?.name ?? framework.customFramework?.name ?? 'Framework';
  const frameworkDescription =
    framework.framework?.description ?? framework.customFramework?.description ?? '';

  const tasks = framework.tasks || [];
  const evidenceSubmissions = framework.evidenceSubmissions || [];
  const requirementDefinitions = framework.requirementDefinitions || [];

  // Question-based frameworks (CISA CSET modules) carry an answer profile and get
  // Assess and Results tabs in front of the upstream ones. Custom frameworks never do.
  const answersApi = useFrameworkAnswers(frameworkInstanceId, !!framework.framework);
  const answerData = answersApi.data;
  const isQuestionBased = !!answerData;
  // The water and wastewater framework opens on its program guide (five ordered steps).
  const isWaterProgram = framework.framework?.id === WATER_FRAMEWORK_ID;
  const answeredCount = answerData?.answers.length ?? 0;
  const expectedAnswers = requirementDefinitions.length * (answerData?.domains.length ?? 1);

  const hasControlFamilies = useMemo(
    () =>
      frameworkInstanceWithControls.controls.some(
        (c: { controlFamily?: string | null }) => c.controlFamily,
      ),
    [frameworkInstanceWithControls.controls],
  );

  const hasRequirementFamilies = useMemo(
    () =>
      requirementDefinitions.some(
        (r: { requirementFamily?: string | null }) => r.requirementFamily,
      ),
    [requirementDefinitions],
  );

  // Tab state synced to ?tab=
  // Progress tab only exists when the compliance timeline flag is on — when
  // it's off, the lightweight FrameworkProgress renders above the tabs.
  const tabParam = searchParams.get('tab');
  const validTabsList: string[] = [];
  if (isWaterProgram) validTabsList.push('program');
  if (isQuestionBased) validTabsList.push('assess', 'results');
  if (complianceTimelineEnabled) validTabsList.push('progress');
  validTabsList.push('controls');
  validTabsList.push('requirements');
  validTabsList.push('history');
  const validTabs = new Set(validTabsList);
  const defaultTab = isWaterProgram ? 'program' : isQuestionBased ? 'assess' : DEFAULT_TAB;
  const activeTab = tabParam && validTabs.has(tabParam) ? tabParam : defaultTab;

  const handleTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === defaultTab) params.delete('tab');
      else params.set('tab', value);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [defaultTab, pathname, router, searchParams],
  );

  // Tab label counts
  const compliancePct = computeCompliancePercent(
    frameworkInstanceWithControls.controls,
    tasks,
    evidenceSubmissions,
  );
  const controlsCount = frameworkInstanceWithControls.controls.length;
  const requirementsCount = requirementDefinitions.length;

  const canDeleteFramework = hasPermission('framework', 'delete');
  // Only org-authored custom frameworks have editable name/description; platform
  // frameworks inherit theirs from the shared global template.
  const canEditCustomFramework =
    !!framework.customFramework && hasPermission('framework', 'update');

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <PageLayout
        header={
          <PageHeader
            title={frameworkName}
            breadcrumbs={[
              {
                label: 'Frameworks',
                href: `/${orgId}/frameworks`,
                props: { render: <Link href={`/${orgId}/frameworks`} /> },
              },
              { label: frameworkName, isCurrent: true },
            ]}
            actions={
              <>
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href={`/${orgId}/tasks?framework=${frameworkInstanceId}`} />}
                >
                  Evidence
                </Button>
                <LinkRequirementSheet frameworkInstanceId={frameworkInstanceId} />
                <AddCustomRequirementSheet frameworkInstanceId={frameworkInstanceId} />
                {(canEditCustomFramework || canDeleteFramework) && (
                  <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost">
                        <OverflowMenuVertical size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canEditCustomFramework && (
                        <DropdownMenuItem
                          onClick={() => {
                            setDropdownOpen(false);
                            setEditSheetOpen(true);
                          }}
                        >
                          <Edit size={16} className="mr-2" />
                          Edit Framework
                        </DropdownMenuItem>
                      )}
                      {canDeleteFramework && (
                        <DropdownMenuItem
                          onClick={() => {
                            setDropdownOpen(false);
                            setDeleteDialogOpen(true);
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <TrashCan size={16} className="mr-2" />
                          Delete Framework
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            }
            tabs={
              <TabsList variant="underline">
                {isWaterProgram && <TabsTrigger value="program">Program guide</TabsTrigger>}
                {isQuestionBased && (
                  <TabsTrigger value="assess">
                    Assess{' '}
                    <TabBadge>
                      {answeredCount}/{expectedAnswers}
                    </TabBadge>
                  </TabsTrigger>
                )}
                {isQuestionBased && <TabsTrigger value="results">Results</TabsTrigger>}
                {complianceTimelineEnabled && (
                  <TabsTrigger value="progress">
                    Progress <TabBadge>{compliancePct}%</TabBadge>
                  </TabsTrigger>
                )}
                <TabsTrigger value="controls">
                  Controls <TabBadge>{controlsCount}</TabBadge>
                </TabsTrigger>
                <TabsTrigger value="requirements">
                  Requirements <TabBadge>{requirementsCount}</TabBadge>
                </TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
            }
          >
            {frameworkDescription && (
              <PageHeaderDescription>{frameworkDescription}</PageHeaderDescription>
            )}
          </PageHeader>
        }
      >
        <FrameworkVersioningSection
          frameworkInstanceId={frameworkInstanceId}
          initialStatus={initialUpdateStatus}
          hasActiveAudit={false}
        />

        {initialScore?.supported && (
          <Nist800171ScoreCard
            score={initialScore}
            orgId={orgId}
            frameworkInstanceId={frameworkInstanceId}
          />
        )}

        {!complianceTimelineEnabled && (
          <FrameworkProgress
            framework={frameworkInstanceWithControls}
            tasks={tasks}
            evidenceSubmissions={evidenceSubmissions}
          />
        )}

        {isWaterProgram && (
          <TabsContent value="program">
            <WaterProgramGuide orgId={orgId} frameworkInstanceId={frameworkInstanceId} />
          </TabsContent>
        )}

        {isQuestionBased && (
          <TabsContent value="assess">
            <AssessTab
              orgId={orgId}
              frameworkInstanceId={frameworkInstanceId}
              requirementDefinitions={requirementDefinitions}
              onAnswersChanged={() => mutate()}
            />
          </TabsContent>
        )}

        {isQuestionBased && answerData && (
          <TabsContent value="results">
            <AnswerResults frameworkInstanceId={frameworkInstanceId} scoring={answerData.profile.scoring} />
          </TabsContent>
        )}

        {complianceTimelineEnabled && (
          <TabsContent value="progress">
            <FrameworkTimeline frameworkInstanceId={frameworkInstanceId} />
          </TabsContent>
        )}

        <TabsContent value="controls">
          {hasControlFamilies ? (
            <Suspense>
              <FrameworkControlsGrouped
                frameworkInstanceWithControls={frameworkInstanceWithControls}
                requirementDefinitions={requirementDefinitions}
                tasks={tasks}
                evidenceSubmissions={evidenceSubmissions}
                requirementScores={initialScore?.supported ? initialScore.requirements : undefined}
              />
            </Suspense>
          ) : (
            <FrameworkControls
              frameworkInstanceWithControls={frameworkInstanceWithControls}
              requirementDefinitions={requirementDefinitions}
              tasks={tasks}
              evidenceSubmissions={evidenceSubmissions}
            />
          )}
        </TabsContent>

        <TabsContent value="requirements">
          {hasRequirementFamilies ? (
            <Suspense>
              <FrameworkRequirementsGrouped
                requirementDefinitions={requirementDefinitions}
                frameworkInstanceWithControls={frameworkInstanceWithControls}
                tasks={tasks}
                evidenceSubmissions={evidenceSubmissions}
              />
            </Suspense>
          ) : (
            <FrameworkRequirements
              requirementDefinitions={requirementDefinitions}
              frameworkInstanceWithControls={frameworkInstanceWithControls}
              tasks={tasks}
              evidenceSubmissions={evidenceSubmissions}
            />
          )}
        </TabsContent>

        <TabsContent value="history">
          <SyncHistorySection
            frameworkInstanceId={frameworkInstanceId}
            permissions={permissions}
          />
        </TabsContent>
      </PageLayout>

      <FrameworkDeleteDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        frameworkInstance={frameworkInstanceWithControls}
      />

      {canEditCustomFramework && (
        <EditCustomFrameworkSheet
          isOpen={editSheetOpen}
          onClose={() => setEditSheetOpen(false)}
          frameworkInstance={frameworkInstanceWithControls}
          onUpdated={() => mutate()}
        />
      )}
    </Tabs>
  );
}

function TabBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">
      {children}
    </span>
  );
}

function computeCompliancePercent(
  controls: any[],
  tasks: any[],
  evidenceSubmissions: any[],
): number {
  return getFrameworkAggregatePercent(controls, tasks, evidenceSubmissions);
}
