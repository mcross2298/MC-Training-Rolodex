/* mc-suggest.js — AI-style exercise suggestion helper
   Uses heuristics (volume history, muscle balance) to suggest
   what to focus on or swap. No external API required. */

const McSuggest = (() => {
  /* Returns array of { muscle, reason, priority } */
  function getMuscleBalance(historyEntries) {
    const tally = {};
    for (const session of historyEntries) {
      for (const ex of (session.exercises || [])) {
        const m = ex.muscle || ex.primaryMuscle || 'unknown';
        tally[m] = (tally[m] || 0) + 1;
      }
    }
    return tally;
  }

  function suggestFocus(historyEntries) {
    const tally = getMuscleBalance(historyEntries);
    const allMuscles = [
      'chest','back','shoulders','biceps','triceps',
      'quads','hamstrings','glutes','calves','core'
    ];
    const suggestions = [];
    for (const m of allMuscles) {
      const count = tally[m] || 0;
      const avg   = Object.values(tally).reduce((a,b)=>a+b,0) / (Object.keys(tally).length || 1);
      if (count < avg * 0.6) {
        suggestions.push({ muscle: m, reason: 'Under-trained vs average', priority: 'high' });
      } else if (count < avg) {
        suggestions.push({ muscle: m, reason: 'Slightly under-trained', priority: 'medium' });
      }
    }
    return suggestions.sort((a,b) => a.priority === 'high' ? -1 : 1);
  }

  function suggestDeload(historyEntries, thresholdDays = 42) {
    if (historyEntries.length < 6) return false;
    const recent = historyEntries.slice(-6);
    const span   = (Date.now() - recent[0].startedAt) / 86_400_000;
    return span >= thresholdDays;
  }

  return { suggestFocus, suggestDeload, getMuscleBalance };
})();
