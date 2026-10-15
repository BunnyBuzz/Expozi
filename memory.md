## MEMORY SYSTEM

### 1. Conversation Memory
Keep last 10 messages in renderer state. Send full history with every LLM call.
Truncate oldest messages first if token count exceeds model context limit.

### 2. Session Memory (Cross-Session)
Before running pipeline, search past sessions in SQLite using BM25 on query field.
If similarity > 0.7, return the past session as a "Resume" suggestion to the user.
Do not re-run the full pipeline unless user confirms a new search.

### 3. Index Memory (Persistent)
hnsw.bin and BM25 index persist across app restarts.
Every chunk stored in SQLite with its source session_id.
On startup: reload hnsw.bin from disk, rebuild BM25 index from passages table.
On new research: add new chunks to existing index (do not wipe it).