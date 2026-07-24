import { forwardRef } from 'react'

const SvgShape = forwardRef(function SvgShape(
  { item, className = '', children, ...properties },
  reference,
) {
  const width = item.width ?? item.size
  const height = item.height ?? item.size

  return (
    <g
      ref={reference}
      className={className}
      transform={`translate(${item.x} ${item.y})`}
      data-shape-id={item.id}
      {...properties}
    >
      {item.shape === 'circle' ? (
        <circle r={width / 2} />
      ) : item.shape === 'diamond' ? (
        <polygon
          points={`0,${-height / 2} ${width / 2},0 0,${height / 2} ${-width / 2},0`}
        />
      ) : (
        <rect
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          rx={Math.min(width, height) * 0.12}
        />
      )}
      {children}
    </g>
  )
})

export default SvgShape
