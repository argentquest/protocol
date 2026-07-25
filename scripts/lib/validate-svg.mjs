const forbiddenElements = [
  'animate',
  'animateMotion',
  'animateTransform',
  'filter',
  'foreignObject',
  'image',
  'pattern',
  'script',
  'style',
  'text',
  'use',
]

export function validateSvgSource(source, label = 'SVG') {
  const errors = []
  const normalized = source.trim()

  if (!normalized.startsWith('<svg')) {
    errors.push(`${label}: document must begin with an svg root element`)
  }
  if (!normalized.endsWith('</svg>')) {
    errors.push(`${label}: document must end with a closing svg element`)
  }
  if (!/<svg\b[^>]*\bxmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(source)) {
    errors.push(`${label}: svg root must declare the SVG namespace`)
  }
  if (!/<svg\b[^>]*\bviewBox=["']0 0 100 100["']/i.test(source)) {
    errors.push(`${label}: svg root must use viewBox="0 0 100 100"`)
  }
  if (/<svg\b[^>]*\b(?:width|height)=/i.test(source)) {
    errors.push(`${label}: svg root must not declare fixed width or height`)
  }
  for (const element of forbiddenElements) {
    if (new RegExp(`<\\s*${element}\\b`, 'i').test(source)) {
      errors.push(`${label}: <${element}> is not supported in vector mode`)
    }
  }
  if (/\b(?:href|xlink:href)\s*=/i.test(source)) {
    errors.push(`${label}: external or referenced resources are not allowed`)
  }
  if (/(?:data:|url\(\s*["']?https?:)/i.test(source)) {
    errors.push(`${label}: embedded or network resources are not allowed`)
  }
  if (/var\(\s*--/i.test(source)) {
    errors.push(`${label}: CSS custom properties are not allowed`)
  }
  if (/<rect\b[^>]*\bx=["']0["'][^>]*\by=["']0["'][^>]*\bwidth=["']100["'][^>]*\bheight=["']100["']/i.test(source)) {
    errors.push(`${label}: full-canvas rectangle violates transparent-background policy`)
  }
  if ((source.match(/<svg\b/gi) ?? []).length !== 1) {
    errors.push(`${label}: nested or multiple svg roots are not allowed`)
  }

  return errors
}
