## MODES

The app has three workflow modes selected before submitting a query:

### 1. Research Agent
Default mode. Runs full pipeline → streams answer with [1][2] citations in chat.

### 2. Report
Runs full pipeline → structures output as a formal document:
  - Title, Abstract, Introduction, Findings (sectioned), Conclusion, References
  - Shown as a readable document view, not chat
  - Right panel shows pipeline status: Gather sources → Screen sources → Writing

### 3. Systematic Review
Skips synthesis entirely. Shows all found papers in a sortable table:
  - Columns: Title, Authors, Journal, Year, Citations, DOI, Abstract snippet
  - Checkbox per row for Include / Exclude screening
  - Filters: year range, min citations, source type
  - User screens papers manually

All three modes share the same search/fetch/embed pipeline. Only the final output differs.

---

## PDF READING

When a result URL points to a PDF (ends in .pdf or pdfUrl is set):
- Download PDF buffer
- Extract text with pdfjs-dist (not pdf-parse — better accuracy)
- If text extraction fails (scanned PDF), skip silently
- Use extracted text as the document content for chunking

Also allow user to upload local PDF files via drag-and-drop.
Uploaded PDFs are extracted, chunked, embedded, and added to the index as source type 'local'.

---

## STRUCTURED EXTRACTION

After fetching and before chunking, for academic papers run LLM extraction:

Prompt:
"""
Extract the following fields from this academic paper. Return ONLY JSON, no markdown.
{
  "research_question": "",
  "methodology": "",
  "sample_size": "",
  "key_findings": "",
  "limitations": "",
  "year": "",
  "authors": []
}

Paper text: {TEXT}
"""

Store extracted fields in SQLite sources table (add these columns).
Fall back to nulls if LLM returns invalid JSON.

---

## LITERATURE TABLE

In Systematic Review mode, display papers as a table:
- Each row = one paper
- Columns: checkbox, Title, Authors, Year, Citations, Source, Abstract (truncated), DOI link
- Clicking a row expands it to show full extracted fields
- Sort by: Most relevant / Year / Citations
- Filter bar: year range slider, min citations input, source checkboxes

---

## REPORT DRAFTING

In Report mode, after synthesis generate structured document:

Prompt:
"""
Write a formal research report answering: {QUERY}
Use ONLY the provided sources. Format as:
# Title
## Abstract (150 words)
## Introduction
## Key Findings (use subsections per theme)
## Conclusion
## References
Cite sources as [1], [2] etc. Return plain markdown.

Sources: {SOURCES}
"""

Render markdown as formatted document in main panel.
Right panel shows: version timestamp, format selector (General Review / Meta-analysis), pipeline status steps with Edit and Download buttons per step.

---

## EXPORT

Available in all modes:
- Report mode → Export as PDF (use electron print-to-PDF), Export as DOCX (use officegen or docx npm)
- Systematic Review mode → Export as CSV, Export as Excel (use exceljs)
- Research Agent → Copy answer to clipboard button

---

## PROJECTS

- User can create named projects
- Any session can be assigned to a project via "Add to project" button
- Projects sidebar shows list with session count
- Clicking project shows all its sessions grouped by date
- Store in SQLite: projects(id, name, created_at), sessions.project_id FK

---

## LIBRARY

- User can save any paper/source permanently to Library regardless of session
- Save button on each source card and each table row
- Library view shows all saved papers with search/filter
- Store in SQLite: library(id, title, url, authors, year, citation_count, abstract, saved_at)
- Library papers are always included in local search alongside session sources