// Tools registry entry point — require this to get the full, self-documented
// tool set registered and ready to run through the traced registry.
const registry = require("./registry.cjs");

require("./searchPapers.cjs");
require("./enrichSources.cjs");
require("./planQueries.cjs");
require("./questions.cjs");
require("./readPages.cjs");
require("./indexSources.cjs");
require("./rankEvidence.cjs");
require("./screenSources.cjs");
require("./expandQuery.cjs");
require("./writeAnswer.cjs");
require("./writeReport.cjs");

module.exports = registry;
