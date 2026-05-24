import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import type { HanziPadHandle, HanziPadProps, Point, Stroke } from './types'

export const HanziPad = forwardRef<HanziPadHandle, HanziPadProps>(
  function HanziPad({ onStrokesChange, width = 280, height = 280, strokeColor = '#1a1a1a', lineWidth = 3, background = 'transparent', showGrid = true, gridLines = 2, gridColor = 'rgba(128,128,128,0.25)', className, style }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const strokesRef = useRef<Stroke[]>([])
    const currentRef = useRef<Point[] | null>(null)
    const drawingRef = useRef(false)

    const getCtx = () => canvasRef.current?.getContext('2d') ?? null

    const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
      if (!showGrid) return
      const fractions: Record<1 | 2 | 3, number[]> = {
        1: [0.5],
        2: [1 / 3, 2 / 3],
        3: [0.25, 0.5, 0.75],
      }
      const splits = fractions[gridLines]
      const drawLines = (fs: number[], alpha: number) => {
        ctx.globalAlpha = alpha
        ctx.beginPath()
        for (const f of fs) {
          ctx.moveTo(width * f, 0)
          ctx.lineTo(width * f, height)
          ctx.moveTo(0, height * f)
          ctx.lineTo(width, height * f)
        }
        ctx.stroke()
      }
      ctx.save()
      ctx.strokeStyle = gridColor
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      if (gridLines === 3) {
        drawLines([0.25, 0.75], 0.35)
        drawLines([0.5], 1)
      } else {
        drawLines(splits, 1)
      }
      ctx.setLineDash([])
      ctx.restore()
    }, [width, height, showGrid, gridLines, gridColor])

    const redraw = useCallback(() => {
      const ctx = getCtx()
      if (!ctx) return
      ctx.clearRect(0, 0, width, height)
      drawGrid(ctx)
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = lineWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const stroke of strokesRef.current) {
        if (stroke.length < 2) continue
        ctx.beginPath()
        ctx.moveTo(stroke[0].x, stroke[0].y)
        for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y)
        ctx.stroke()
      }
    }, [width, height, strokeColor, lineWidth, drawGrid])

    useEffect(() => {
      const ctx = getCtx()
      if (ctx) drawGrid(ctx)
    }, [drawGrid])

    const getPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
      const rect = canvasRef.current!.getBoundingClientRect()
      return { x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top), t: Date.now() }
    }

    const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      drawingRef.current = true
      const p = getPoint(e)
      currentRef.current = [p]
      const ctx = getCtx()
      if (!ctx) return
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = lineWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
    }, [strokeColor, lineWidth])

    const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      if (!drawingRef.current || !currentRef.current) return
      const p = getPoint(e)
      currentRef.current.push(p)
      const ctx = getCtx()
      if (!ctx) return
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
    }, [])

    const onPointerUp = useCallback(() => {
      if (!drawingRef.current || !currentRef.current) return
      drawingRef.current = false
      strokesRef.current = [...strokesRef.current, currentRef.current]
      currentRef.current = null
      onStrokesChange?.(strokesRef.current)
    }, [onStrokesChange])

    useImperativeHandle(ref, () => ({
      getStrokes: () => [...strokesRef.current],
      clear: () => {
        strokesRef.current = []
        currentRef.current = null
        drawingRef.current = false
        const ctx = getCtx()
        if (ctx) { ctx.clearRect(0, 0, width, height); drawGrid(ctx) }
        onStrokesChange?.([])
      },
      undo: () => {
        strokesRef.current = strokesRef.current.slice(0, -1)
        redraw()
        onStrokesChange?.(strokesRef.current)
      },
      toDataURL: () => {
        const canvas = canvasRef.current
        if (!canvas) return null
        const off = document.createElement('canvas')
        off.width = canvas.width
        off.height = canvas.height
        const ctx = off.getContext('2d')!
        ctx.fillStyle = background
        ctx.fillRect(0, 0, off.width, off.height)
        ctx.drawImage(canvas, 0, 0)
        return off.toDataURL('image/png')
      },
    }))

    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={className}
        style={{ background, touchAction: 'none', cursor: 'crosshair', display: 'block', ...style }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
    )
  }
)
