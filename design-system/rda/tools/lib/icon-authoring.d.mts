export type IconKind = 'ui' | 'brand';
export type IconScope = 'general' | 'exclusive';

export interface IconValidation {
  valid: boolean;
  errors: string[];
  svg?: string;
  innerXml?: string;
  viewBox?: string;
  type?: 'stroke' | 'fill';
  elements?: Array<[string, Record<string, string>]>;
}

export const ICON_GUIDELINES: {
  version: number;
  ui: { viewBox: string; stroke: string; strokeWidth: number; fill: string; linecap: string; linejoin: string; margin: number; maxElements: number };
  brand: { preserveGeometry: boolean; fill: string; preserveViewBox: boolean };
  scopes: { exclusive: string; general: string };
  previewSizes: number[];
  review: string[];
};

export function createIconBrief(options: {
  name: string;
  description: string;
  kind?: IconKind;
  scope?: IconScope;
  context?: string;
}): string;

export function validateIconSvg(source: string, options?: { kind?: IconKind; parser?: DOMParser }): IconValidation;
