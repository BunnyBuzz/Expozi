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
}
