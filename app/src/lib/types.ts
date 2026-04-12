export interface Note {
  /** Filename without .md extension — used as a stable ID */
  id: string;
  /** Original filename e.g. 2026-04-12-karpathy-llm.md */
  filename: string;
  title: string;
  author: string;
  date: string;
  source: string;
  type: string;
  tags: string[];
  /** Content of the ## Summary section */
  summary: string;
  /** Full raw markdown */
  content: string;
  /** Parsed ## Section Name → body text */
  sections: Record<string, string>;
}

export interface AskResponse {
  answer: string;
  sources: Array<{
    id: string;
    title: string;
    filename: string;
    author: string;
  }>;
}
