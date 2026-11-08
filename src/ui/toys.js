// Little things to poke before anything is explained. Each is a handful of sliders or buttons plus a readout.
// Plain DOM, no engine: the sums here are deliberately simple (the workshop has the real solver).

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function slider(label, { min, max, step = 1, value, unit }, onInput, id) {
  const wrap = el('label', { class: 'slider' });
  const text = el('span', {}, '');
  const input = el('input', { type: 'range', min, max, step, value, 'data-testid': `toy-${id}` });
  const sync = () => {
    text.textContent = `${label}: ${input.value} ${unit}`;
  };
  input.addEventListener('input', () => {
    sync();
    onInput(Number(input.value));
  });
  sync();
  wrap.append(text, input);
  return { wrap, input };
}

const fmt = (n, dp = 2) => String(Number(n.toFixed(dp)));

function bar(testid) {
  const outer = el('div', { class: 'meter', role: 'presentation' });
  const inner = el('div', { class: 'meter-fill', 'data-testid': testid });
  outer.append(inner);
  return { outer, set: (frac) => { inner.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`; inner.dataset.value = String(Math.round(frac * 100)); } };
}

export function makeToy(spec) {
  const toy = el('div', { class: 'toy', 'data-testid': 'toy' });
  toy.append(el('p', { class: 'muted' }, spec.prompt ?? 'Have a play.'));
  const out = el('p', { class: 'toy-out', role: 'status', 'data-testid': 'toy-out' });

  switch (spec.kind) {
    case 'bulb-switch': {
      const lamp = el('div', { class: 'toy-bulb', 'data-testid': 'toy-bulb', 'data-lit': 'false' }, 'Bulb: dark');
      const sw = el('button', { type: 'button', 'aria-pressed': 'false', 'data-testid': 'toy-switch' }, 'Switch: open');
      sw.style.marginTop = '0';
      sw.addEventListener('click', () => {
        const on = sw.getAttribute('aria-pressed') !== 'true';
        sw.setAttribute('aria-pressed', String(on));
        sw.textContent = on ? 'Switch: closed' : 'Switch: open';
        lamp.dataset.lit = String(on);
        lamp.textContent = on ? 'Bulb: glowing' : 'Bulb: dark';
      });
      toy.append(sw, lamp);
      return toy;
    }

    case 'ohm-slider': {
      let V = 6;
      let R = 3;
      const flow = bar('toy-meter');
      const paint = () => {
        const I = V / R;
        out.textContent = `Push ${V} V ÷ squeeze ${R} Ω = flow ${fmt(I)} A`;
        flow.set(I / 12);
      };
      const sV = slider('Push (voltage)', { min: 1, max: 12, value: V, unit: 'V' }, (v) => { V = v; paint(); }, 'v');
      const sR = slider('Squeeze (resistance)', { min: 1, max: 50, value: R, unit: 'Ω' }, (v) => { R = v; paint(); }, 'r');
      toy.append(sV.wrap, sR.wrap, flow.outer, out);
      paint();
      return toy;
    }

    case 'led-guard': {
      const V = spec.battery ?? 5;
      const Vf = 2.0;
      let R = 0;
      const lamp = el('div', { class: 'toy-bulb', 'data-testid': 'toy-led', 'data-state': 'pop' }, '');
      const paint = () => {
        const I = Math.max(0, (V - Vf) / (R + 2));
        const mA = I * 1000;
        const state = mA > 30 ? 'pop' : mA >= 1 ? 'lit' : 'dark';
        lamp.dataset.state = state;
        lamp.dataset.lit = String(state === 'lit');
        lamp.textContent = state === 'pop' ? 'LED: pop! retired early' : state === 'lit' ? 'LED: glowing happily' : 'LED: dark';
        out.textContent = `Flow through the LED: ${fmt(mA, 1)} mA. Safe is under 30 mA.`;
      };
      const s = slider('Resistor (squeeze)', { min: 0, max: 470, step: 10, value: 0, unit: 'Ω' }, (v) => { R = v; paint(); }, 'r');
      toy.append(s.wrap, lamp, out);
      paint();
      return toy;
    }

    case 'dimmer': {
      const lamp = bar('toy-meter');
      let R = 0;
      const paint = () => {
        const frac = (20 / (20 + R)) ** 2;
        out.textContent = `Dimmer at ${R} Ω. Bulb brightness: ${Math.round(frac * 100)}%`;
        lamp.set(frac);
      };
      const s = slider('Dimmer (squeeze)', { min: 0, max: 200, step: 5, value: 0, unit: 'Ω' }, (v) => { R = v; paint(); }, 'r');
      toy.append(s.wrap, lamp.outer, out);
      paint();
      return toy;
    }

    case 'series-parallel': {
      const mode = { v: 'series' };
      const row = el('div', { class: 'chips' });
      const bs = ['series', 'parallel'].map((m) => {
        const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(m === mode.v), 'data-testid': `toy-${m}` }, m === 'series' ? 'One after the other (series)' : 'Side by side (parallel)');
        b.addEventListener('click', () => { mode.v = m; paint(); });
        return b;
      });
      row.append(...bs);
      const paint = () => {
        bs.forEach((b, i) => b.setAttribute('aria-pressed', String(['series', 'parallel'][i] === mode.v)));
        out.textContent = mode.v === 'series'
          ? 'Two bulbs in series: each gets half the push, so both are dim. If one breaks, both go out. Battery drain: 1×.'
          : 'Two bulbs in parallel: each gets the full push, so both are bright. If one breaks, the other stays on. Battery drain: 4× (twice the flow, and each bulb is brighter).';
        out.dataset.mode = mode.v;
      };
      toy.append(row, out);
      paint();
      return toy;
    }

    case 'battery-life': {
      let mAh = 2000;
      let mA = 200;
      const paint = () => {
        out.textContent = `${mAh} mAh ÷ ${mA} mA = ${fmt(mAh / mA, 1)} hours`;
      };
      const a = slider('Battery size', { min: 500, max: 5000, step: 500, value: mAh, unit: 'mAh' }, (v) => { mAh = v; paint(); }, 'c');
      const b = slider('Robot draws', { min: 50, max: 1000, step: 50, value: mA, unit: 'mA' }, (v) => { mA = v; paint(); }, 'i');
      toy.append(a.wrap, b.wrap, out);
      paint();
      return toy;
    }

    default:
      toy.append(el('p', { class: 'muted' }, 'Nothing to play with here.'));
      return toy;
  }
}
