/**
 * report-generator.js (Backward Compatibility Bridge)
 */

if (typeof window !== 'undefined' && window.ReportEngine) {
  window.ReportGenerator = window.ReportEngine;
}
