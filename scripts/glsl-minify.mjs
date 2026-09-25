// Strips comments and spare whitespace from GLSL written as JavaScript
// template literals marked with a /* glsl */ comment, e.g.
//
//   const SHADER = /* glsl */ `void main() { ... }`;
//
// Only the literal's own text is touched: every ${…} is kept as written, so
// values and other (already minified) GLSL pieces drop in unchanged. Used by
// every build (scripts/esbuild-plugins.mjs); dev builds keep them readable
// only in source maps.

const MARKER = /\/\*\s*glsl\s*\*\/\s*`/g;
const IDENT = /[A-Za-z0-9_]/;
// Pairs that would fuse into a different token without a space between.
const FUSES = new Set(['++', '--', '//', '/*', '*/', '&&', '||', '+-', '-+', '==', '<=', '>=', '!=', '<<', '>>']);

/** Index just past the `}` closing the ${ … } that starts at `start` (just after "${"). */
function skipExpression(source, start) {
  let depth = 1;
  let i = start;
  while (i < source.length) {
    const c = source[i];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    } else if (c === "'" || c === '"') {
      i += 1;
      while (i < source.length && source[i] !== c) i += source[i] === '\\' ? 2 : 1;
    } else if (c === '`') {
      i = skipTemplate(source, i + 1);
      continue;
    } else if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
    } else if (c === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i + 2) + 1;
    }
    i += 1;
  }
  throw new Error('glsl-minify: unclosed ${ in a template literal');
}

/** Index just past the closing backtick of a template literal whose text starts at `start`. */
function skipTemplate(source, start) {
  let i = start;
  while (i < source.length) {
    const c = source[i];
    if (c === '\\') i += 2;
    else if (c === '`') return i + 1;
    else if (c === '$' && source[i + 1] === '{') i = skipExpression(source, i + 2);
    else i += 1;
  }
  throw new Error('glsl-minify: unclosed template literal');
}

/** Minifies one run of GLSL text (a literal's text between interpolations). */
function minifyText(text) {
  const lines = text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''));
  let out = '';
  for (const line of lines) {
    // Preprocessor lines keep their own line (and #version must be the very first).
    if (line.trim().startsWith('#')) out += `${out.trim() ? '\n' : ''}${line.trim()}\n`;
    else out += ` ${line}`;
  }
  const collapsed = out
    .replace(/[ \t\r]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n+/g, '\n');
  let result = '';
  for (let i = 0; i < collapsed.length; i++) {
    const c = collapsed[i];
    if (c !== ' ') {
      result += c;
      continue;
    }
    const before = result[result.length - 1];
    const after = collapsed[i + 1];
    // At either end, the neighbour is an interpolation we can't see: keep
    // one space next to anything that could run into it.
    if (before === undefined || after === undefined) {
      if (IDENT.test(before ?? after ?? '')) result += ' ';
      continue;
    }
    if (before === '\n' || after === '\n') continue;
    if ((IDENT.test(before) && IDENT.test(after)) || FUSES.has(before + after)) result += ' ';
  }
  return result;
}

/** Returns the source with every /* glsl *\/ template literal's text minified. */
export function minifyGlslTemplates(source) {
  let out = '';
  let from = 0;
  MARKER.lastIndex = 0;
  let match;
  while ((match = MARKER.exec(source))) {
    out += source.slice(from, match.index) + '`';
    let i = match.index + match[0].length;
    let text = '';
    for (;;) {
      const c = source[i];
      if (c === undefined) throw new Error('glsl-minify: unclosed template literal');
      if (c === '\\') {
        text += source.slice(i, i + 2);
        i += 2;
      } else if (c === '`') {
        out += minifyText(text) + '`';
        i += 1;
        break;
      } else if (c === '$' && source[i + 1] === '{') {
        const end = skipExpression(source, i + 2);
        out += minifyText(text) + source.slice(i, end);
        text = '';
        i = end;
      } else {
        text += c;
        i += 1;
      }
    }
    from = i;
    MARKER.lastIndex = i;
  }
  return out + source.slice(from);
}
