/** How deeply a source was read: abstract only, relevant full-text passages, or an official guideline summary. */
export type SourceDepth = 'abstract' | 'fulltext-excerpts' | 'guideline-summary';

export type PolicySource = {
  /** 'S01' … 'S26', as in docs/research/2026-11-06-training-science-foundation.md §12. */
  id: string;
  citation: string; url: string; studyType: string; depth: SourceDepth;
  population: string; endpoint: string; limits: string;
  /** YYYY-MM-DD */
  checkedOn: string;
};

/** orientation: fachliche Orientierung; product: Produktheuristik; personal: persönliche Vorgabe; technical: technische Bedingung. */
export type RuleClass = 'orientation' | 'product' | 'personal' | 'technical';
/** checked: code enforces it; weighed: the AI weighs it and it is shown. */
export type Enforcement = 'checked' | 'weighed';
export type RuleStatus =
  | { state: 'active' }
  | { state: 'to-replace'; task: number; replacement: string; untilThen: string }
  /** A fixed start value that is not in effect before that follow-up task. */
  | { state: 'planned'; task: number };
export type RuleValue = number | { min: number; max: number };

export type PolicyRule = {
  id: string;
  domain: 'gym' | 'muscle' | 'rest' | 'bike' | 'run' | 'planner' | 'endurance' | 'data';
  statement: string; decision: string; class: RuleClass; enforcement: Enforcement;
  value?: RuleValue; unit?: string;
  /** A source id proves neither a threshold nor an individual optimum. */
  sourceIds: string[];
  /** Code paths that apply the rule today or will apply it. */
  where: string[];
  status: RuleStatus; scenarioIds: string[];
};

/** An acceptance scenario from the foundation §11 or the concept §18, owned by a follow-up task. */
export type Scenario = { id: string; situation: string; expectation: string; task: number };
