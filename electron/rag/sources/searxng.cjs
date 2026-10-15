function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Web";
  }
}

async function searchWeb(query, limit = 8) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(
      "http://localhost:8080/search?q=" + encodeURIComponent(query) + "&format=json",
      { signal: ctrl.signal },
    );
    clearTimeout(t);
    if (!res.ok) return [];
    const data = await res.json();
    return (((data || {}).results) || [])
      .slice(0, limit)
      .filter((r) => r.title && r.url)
      .map((r) => ({
        title: r.title,
        authors: [],
        year: null,
        journal: host(r.url),
        citations: 0,
        url: r.url,
        doi: null,
        abstract: r.content || "",
        pdfUrl: null,
        provenance: "web",
      }));
  } catch {
    return [];
  }
}

module.exports = { searchWeb };
