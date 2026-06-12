/* mc-exercise-trends.js — per-exercise trend charts using Canvas API */

const McExerciseTrends = (() => {
  function getHistory(exerciseName) {
    try {
      const history = JSON.parse(localStorage.getItem('mcWorkoutHistory')) || [];
      const points  = [];
      for (const w of history) {
        for (const ex of (w.exercises||[])) {
          if (ex.name.toLowerCase() !== exerciseName.toLowerCase()) continue;
          const best = (ex.sets||[]).filter(s=>s.done)
            .reduce((max,s) => Math.max(max, parseFloat(s.weight)||0), 0);
          if (best > 0) points.push({ date: w.date, weight: best });
        }
      }
      return points;
    } catch { return []; }
  }

  function draw(canvas, exerciseName) {
    const points = getHistory(exerciseName);
    const ctx    = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);

    if (points.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Not enough data yet', W/2, H/2);
      return;
    }

    const weights = points.map(p=>p.weight);
    const minW = Math.min(...weights), maxW = Math.max(...weights);
    const pad  = { t:16, r:12, b:24, l:44 };
    const cW   = W - pad.l - pad.r;
    const cH   = H - pad.t - pad.b;

    const xOf = i  => pad.l + (i/(points.length-1))*cW;
    const yOf = w  => pad.t + (1-(w-minW)/(maxW-minW||1))*cH;

    // grid lines
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 1;
    for (let i=0;i<=4;i++) {
      const y = pad.t + i*(cH/4);
      ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+cW,y); ctx.stroke();
    }

    // line
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    points.forEach((p,i) => {
      i === 0 ? ctx.moveTo(xOf(i),yOf(p.weight)) : ctx.lineTo(xOf(i),yOf(p.weight));
    });
    ctx.stroke();

    // dots
    ctx.fillStyle = '#d4af37';
    points.forEach((p,i) => {
      ctx.beginPath();
      ctx.arc(xOf(i),yOf(p.weight),3,0,Math.PI*2);
      ctx.fill();
    });
  }

  return { draw, getHistory };
})();
