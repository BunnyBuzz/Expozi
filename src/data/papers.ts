export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  journal: string;
  citations: number;
  sample: string;
  abstract: string;
  summary: string;
  methods: string;
  findings: string[];
  doi?: string | null;
  url?: string;
  provenance?: string;
  studyType?: string | null;
  quality?: number | null;
  retracted?: boolean;
  suggested?: string | null;
  suggestReason?: string | null;
  sourceBadge?: string;
  hasPdf?: boolean;
  isAbstractOnly?: boolean;
  usedSnippet?: string;
  passageNo?: number;
}
