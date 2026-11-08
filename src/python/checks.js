// Did the code do what the mission asked? Rules come from the lesson JSON (`expect`). A failed check never blocks.
//   { kind: 'code-contains', text }     her code contains this text (spaces and case matter little)
//   { kind: 'output-contains', text }   what it printed contains this text
//   { kind: 'any-output' }              it printed something
//   { kind: 'panel', fn, name }         it called panel.fn(name)

const squash = (s) => String(s).replace(/\s+/g, '').toLowerCase();

export function checkPython(expect, { code, output, error, actions = [] }) {
  if (error) return { pass: false, notes: ['It stopped with an error, so fix that first.'] };
  const notes = [];
  for (const rule of expect ?? []) {
    switch (rule.kind) {
      case 'code-contains':
        if (!squash(code).includes(squash(rule.text))) notes.push(`Your code should use ${rule.text}`);
        break;
      case 'output-contains':
        if (!String(output).includes(rule.text)) notes.push(`The output should include "${rule.text}"`);
        break;
      case 'any-output':
        if (!String(output).trim()) notes.push('It should print something');
        break;
      case 'panel':
        if (!actions.some((a) => a.fn === rule.fn && (rule.name === undefined || a.name === rule.name))) notes.push(`Your code should call panel.${rule.fn}("${rule.name ?? ''}")`);
        break;
      default:
        throw new Error(`Unknown expect rule: ${rule.kind}`);
    }
  }
  return { pass: notes.length === 0, notes };
}
