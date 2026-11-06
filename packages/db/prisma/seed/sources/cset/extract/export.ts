/**
 * Shapes the dumped CSET tables into one JSON document per module: a maturity model
 * (CPG 2.0, IMR, CRR, ...) or a standard set (HHS 405(d), AWWA 4.0, ...). Text is
 * kept exactly as CSET stores it (HTML included); the generator cleans it up.
 */
import type { Row, SqlValue, Tables } from './tables';

export interface ReferenceJson {
  title: string | null;
  shortName: string | null;
  docNum: string | null;
  section: string | null;
  page: SqlValue;
  destination: string | null;
}

export interface OptionJson {
  id: number;
  text: string;
  type: string | null;
  sequence: number | null;
  weight: SqlValue;
}

export interface MaturityQuestionJson {
  id: number;
  title: string;
  text: string;
  supplemental: string | null;
  levelId: number | null;
  sequence: number | null;
  groupingId: number | null;
  parentQuestionId: number | null;
  type: string | null;
  shortName: string | null;
  examinationApproach: string | null;
  scope: string | null;
  securityPractice: string | null;
  outcome: string | null;
  recommendAction: string | null;
  riskAddressed: string | null;
  services: string | null;
  implementationGuides: string | null;
  props: Record<string, string>;
  options: OptionJson[];
  references: ReferenceJson[];
  referenceText: string[];
  subModels: string[];
}

export interface GroupingJson {
  id: number;
  title: string;
  description: string | null;
  parentId: number | null;
  sequence: number | null;
  groupLevel: number | null;
  abbreviation: string | null;
  titlePrefix: string | null;
}

export interface MaturityModelJson {
  kind: 'maturity';
  source: string;
  modelId: number;
  modelName: string;
  title: string | null;
  description: string | null;
  questionsAlias: string | null;
  answerOptions: string[];
  levels: Array<{ id: number; level: number; name: string }>;
  groupings: GroupingJson[];
  questions: MaturityQuestionJson[];
}

export interface RequirementJson {
  id: number;
  sequence: number | null;
  title: string;
  text: string;
  supplemental: string | null;
  category: string | null;
  subCategory: string | null;
  weight: SqlValue;
  implementationRecommendations: string | null;
  references: ReferenceJson[];
}

export interface StandardSetJson {
  kind: 'standard';
  source: string;
  setName: string;
  fullName: string | null;
  shortName: string | null;
  requirements: RequirementJson[];
}

const str = (v: SqlValue | undefined): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: SqlValue | undefined): number | null => (typeof v === 'number' ? v : null);
const bySeq = <T extends { sequence: number | null; id: number }>(a: T, b: T): number =>
  (a.sequence ?? 0) - (b.sequence ?? 0) || a.id - b.id;

function rowsOf(tables: Tables, name: string): Row[] {
  return tables.get(name) ?? [];
}

function referencesFor(tables: Tables, linkTable: string, keyColumn: string, id: number): ReferenceJson[] {
  const files = new Map(rowsOf(tables, 'GEN_FILE').map((f) => [f.Gen_File_Id, f]));
  return rowsOf(tables, linkTable)
    .filter((r) => r[keyColumn] === id)
    .sort((a, b) => (num(a.Sequence) ?? 0) - (num(b.Sequence) ?? 0) || String(a.Section_Ref).localeCompare(String(b.Section_Ref)))
    .map((r) => {
      const f = files.get(r.Gen_File_Id);
      return {
        title: str(f?.Title),
        shortName: str(f?.Short_Name),
        docNum: str(f?.Doc_Num),
        section: str(r.Section_Ref),
        page: r.Page_Number ?? null,
        destination: str(r.Destination_String),
      };
    });
}

export function exportMaturityModel(tables: Tables, modelId: number, source: string): MaturityModelJson {
  const model = rowsOf(tables, 'MATURITY_MODELS').find((m) => m.Maturity_Model_Id === modelId);
  if (!model) throw new Error(`Maturity model ${modelId} not found`);
  const questions = rowsOf(tables, 'MATURITY_QUESTIONS').filter((q) => q.Maturity_Model_Id === modelId);
  const qids = new Set(questions.map((q) => q.Mat_Question_Id));
  const options = rowsOf(tables, 'MATURITY_ANSWER_OPTIONS').filter((o) => qids.has(o.Mat_Question_Id));
  const props = rowsOf(tables, 'MATURITY_QUESTION_PROPS').filter((p) => qids.has(p.Mat_Question_Id));
  const refText = rowsOf(tables, 'MATURITY_REFERENCE_TEXT').filter((p) => qids.has(p.Mat_Question_Id));
  const subModels = rowsOf(tables, 'MATURITY_SUB_MODEL_QUESTIONS').filter((p) => qids.has(p.Mat_Question_Id));

  return {
    kind: 'maturity',
    source,
    modelId,
    modelName: String(model.Model_Name),
    title: str(model.Model_Title),
    description: str(model.Model_Description),
    questionsAlias: str(model.Questions_Alias),
    answerOptions: String(model.Answer_Options ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    levels: rowsOf(tables, 'MATURITY_LEVELS')
      .filter((l) => l.Maturity_Model_Id === modelId)
      .map((l) => ({ id: Number(l.Maturity_Level_Id), level: Number(l.Level), name: String(l.Level_Name) }))
      .sort((a, b) => a.level - b.level),
    groupings: rowsOf(tables, 'MATURITY_GROUPINGS')
      .filter((g) => g.Maturity_Model_Id === modelId)
      .map((g) => ({
        id: Number(g.Grouping_Id),
        title: String(g.Title ?? ''),
        description: str(g.Description),
        parentId: num(g.Parent_Id),
        sequence: num(g.Sequence),
        groupLevel: num(g.Group_Level),
        abbreviation: str(g.Abbreviation),
        titlePrefix: str(g.Title_Prefix),
      }))
      .sort(bySeq),
    questions: questions
      .map((q) => {
        const id = Number(q.Mat_Question_Id);
        const p: Record<string, string> = {};
        for (const r of props.filter((x) => x.Mat_Question_Id === id)) p[String(r.PropertyName)] = String(r.PropertyValue ?? '');
        return {
          id,
          title: String(q.Question_Title ?? ''),
          text: String(q.Question_Text ?? ''),
          supplemental: str(q.Supplemental_Info),
          levelId: num(q.Maturity_Level_Id ?? q.Maturity_Level),
          sequence: num(q.Sequence),
          groupingId: num(q.Grouping_Id),
          parentQuestionId: num(q.Parent_Question_Id),
          type: str(q.Mat_Question_Type),
          shortName: str(q.Short_Name),
          examinationApproach: str(q.Examination_Approach),
          scope: str(q.Scope),
          securityPractice: str(q.Security_Practice),
          outcome: str(q.Outcome),
          recommendAction: str(q.Recommend_Action),
          riskAddressed: str(q.Risk_Addressed),
          services: str(q.Services),
          implementationGuides: str(q.Implementation_Guides),
          props: p,
          options: options
            .filter((o) => o.Mat_Question_Id === id)
            .map((o) => ({
              id: Number(o.Mat_Option_Id),
              text: String(o.Option_Text ?? ''),
              type: str(o.Mat_Option_Type),
              sequence: num(o.Answer_Sequence),
              weight: o.Weight ?? null,
            }))
            .sort(bySeq),
          references: referencesFor(tables, 'MATURITY_REFERENCES', 'Mat_Question_Id', id),
          referenceText: refText
            .filter((r) => r.Mat_Question_Id === id)
            .sort((a, b) => (num(a.Sequence) ?? 0) - (num(b.Sequence) ?? 0))
            .map((r) => String(r.Reference_Text ?? '')),
          subModels: subModels.filter((s) => s.Mat_Question_Id === id).map((s) => String(s.Sub_Model_Name)),
        };
      })
      .sort(bySeq),
  };
}

export function exportStandardSet(tables: Tables, setName: string, source: string): StandardSetJson {
  const set = rowsOf(tables, 'SETS').find((s) => s.Set_Name === setName);
  if (!set) throw new Error(`Standard set ${setName} not found`);
  const members = new Map(
    rowsOf(tables, 'REQUIREMENT_SETS')
      .filter((r) => r.Set_Name === setName)
      .map((r) => [r.Requirement_Id, num(r.Requirement_Sequence)]),
  );
  const requirements = rowsOf(tables, 'NEW_REQUIREMENT').filter((r) => members.has(r.Requirement_Id));
  return {
    kind: 'standard',
    source,
    setName,
    fullName: str(set.Full_Name),
    shortName: str(set.Short_Name),
    requirements: requirements
      .map((r) => {
        const id = Number(r.Requirement_Id);
        return {
          id,
          sequence: members.get(r.Requirement_Id) ?? null,
          title: String(r.Requirement_Title ?? ''),
          text: String(r.Requirement_Text ?? ''),
          supplemental: str(r.Supplemental_Info),
          category: str(r.Standard_Category),
          subCategory: str(r.Standard_Sub_Category),
          weight: r.Weight ?? null,
          implementationRecommendations: str(r.Implementation_Recommendations),
          references: referencesFor(tables, 'REQUIREMENT_REFERENCES', 'Requirement_Id', id),
        };
      })
      .sort(bySeq),
  };
}
