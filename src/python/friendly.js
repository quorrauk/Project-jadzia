// Python's own error messages are written for programmers. This turns them into plain words, with the line number,
// and keeps the technical message available for when she wants it.

const at = (line) => (line ? `On line ${line}: ` : '');

export function friendlyError(err) {
  if (!err) return null;
  const { type, message, line } = err;
  const m = String(message ?? '');
  let text;

  if (type === 'PanelError') {
    text = m;
  } else if (type === 'SyntaxError' || type === 'IndentationError' || type === 'TabError') {
    if (/never closed|was never closed/.test(m)) text = 'A bracket is open but never closed. Check every ( has a matching ).';
    else if (/unterminated string|EOL while scanning|unterminated/.test(m)) text = 'A quote mark is missing. Words need a quote at both ends, like "this".';
    else if (/expected ':'/.test(m)) text = 'This line needs a colon : at the end.';
    else if (/indent/i.test(m) || type !== 'SyntaxError') text = 'The spacing at the start of this line is off. Lines in the same block must line up.';
    else if (/invalid syntax|invalid decimal|invalid character/.test(m)) text = 'Python could not understand this line. Look for a missing quote, bracket, or operator, or a stray character.';
    else text = 'Python could not read this line. Check the spelling and punctuation.';
  } else if (type === 'NameError') {
    const name = m.match(/name '([^']+)'/)?.[1];
    text = name
      ? `Python does not know the name "${name}". Did you spell it the same way everywhere, and give it a value with = before using it?`
      : 'Python does not know one of the names you used.';
  } else if (type === 'TypeError') {
    if (/str.*int|int.*str/.test(m)) text = 'You tried to mix words and numbers. Use int() or float() to turn words into numbers, or an f-string to put a number in a sentence.';
    else if (/not callable/.test(m)) text = 'You put brackets after something that is not a command. Check the name before the ( .';
    else text = 'A command got the wrong kind of thing, or the wrong amount of things.';
  } else if (type === 'ZeroDivisionError') {
    text = 'You divided by zero. Nothing can be shared between zero things. Check the number after the / .';
  } else if (type === 'ValueError') {
    text = 'A value was the right kind of thing but a silly amount. Check the numbers you passed in.';
  } else if (type === 'AttributeError') {
    text = 'You asked for something that does not exist on that object. Check the spelling after the dot.';
  } else if (type === 'KeyError' || type === 'IndexError') {
    text = 'You asked for an item that is not in the list or dictionary.';
  } else if (type === 'ModuleNotFoundError' || type === 'ImportError') {
    text = 'That library is not available here. You do not need it for this mission.';
  } else {
    text = 'Something went wrong when the code ran.';
  }
  return { text: at(line) + text, line: line ?? null, technical: `${type}: ${m}` };
}

export const TIMEOUT_TEXT = 'This took too long and was stopped. A loop that never ends is the usual reason. Check that the loop has a way to finish.';
export const LOAD_FAIL_TEXT = 'Python could not start. It needs a connection the first time. Check you are online and try again. You can carry on without it.';
