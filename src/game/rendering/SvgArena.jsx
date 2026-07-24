export default function SvgArena({ arena }) {
  if (arena.shape === 'polygon') {
    return <polygon points={arena.points.map((point) => point.join(',')).join(' ')} />
  }
  if (arena.shape === 'ellipse') {
    const radius = 500 - (arena.margin ?? 0)
    return <ellipse cx="500" cy="500" rx={radius} ry={radius} />
  }
  const margin = arena.margin ?? 0
  return (
    <rect
      x={margin}
      y={margin}
      width={1000 - margin * 2}
      height={1000 - margin * 2}
      rx={arena.cornerRadius ?? 0}
    />
  )
}
