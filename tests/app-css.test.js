// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { scopeAppCss } from '../core/ui/scopeAppCss.js';

describe('Application stylesheet scoping', () => {
  it('preserves responsive and conditional rules while scoping their selectors', () => {
    const css = scopeAppCss('.row { display:flex } @media (max-width:760px) { .row { flex-direction:column } } @supports (display:grid) { .grid { display:grid } }', 'sample-app');
    expect(css).toContain('@media'); expect(css).not.toContain('.sample-app @media');
    expect(css.match(/\.sample-app \.row/g)).toHaveLength(2);
    expect(css).toContain('.sample-app .grid');
  });
  it('keeps function commas and keyframe steps intact, without global body styles', () => {
    const css = scopeAppCss('body { color:red } .row:is(.one,.two), [data-name="a,b"] { color:blue } @keyframes sample-enter { from {opacity:0} to {opacity:1} }', 'sample-app');
    expect(css).toContain('.sample-app {'); expect(css).toContain('.sample-app .row:is(.one,.two)');
    expect(css).toContain('.sample-app [data-name="a,b"]'); expect(css).not.toContain('.sample-app from');
    expect(css).toContain('@keyframes sample-enter');
  });
});
