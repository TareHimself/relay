import { ActionIcon, Group, Modal, Text, Tooltip } from '@mantine/core'
import { IconFocusCentered, IconZoomIn, IconZoomOut } from '@tabler/icons-react'
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from 'react'

const MIN_SCALE = 0.25
const MAX_SCALE = 8
const STEP = 1.25

interface Transform {
  scale: number
  x: number
  y: number
}

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 }

const STAGE_GUTTER = 48

function clamp(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

function intrinsicSize(svg: SVGSVGElement): { width: number; height: number } | null {
  const box = svg.viewBox.baseVal
  if (box.width > 0 && box.height > 0) return { width: box.width, height: box.height }
  const width = svg.width.baseVal.value
  const height = svg.height.baseVal.value
  return width > 0 && height > 0 ? { width, height } : null
}

function sizeToFit(svg: SVGSVGElement, stage: DOMRect, scale: number): void {
  const size = intrinsicSize(svg)
  if (!size) return
  const natural = parseFloat(svg.dataset.naturalWidth ?? svg.style.maxWidth) || size.width
  svg.dataset.naturalWidth = String(natural)
  const aspect = size.width / size.height
  const fitWidth = Math.min(
    natural,
    stage.width - STAGE_GUTTER,
    (stage.height - STAGE_GUTTER) * aspect,
  )
  svg.style.maxWidth = 'none'
  svg.style.maxHeight = 'none'
  svg.style.width = `${fitWidth * scale}px`
  svg.style.height = `${(fitWidth / aspect) * scale}px`
}

interface DiagramLightboxProps {
  svg: string | null
  onClose: () => void
}

export function DiagramLightbox({ svg, onClose }: DiagramLightboxProps) {
  const [transform, setTransform] = useState<Transform>(IDENTITY)
  const [shownSvg, setShownSvg] = useState(svg)
  if (svg !== shownSvg) {
    setShownSvg(svg)
    if (svg) setTransform(IDENTITY)
  }
  const [dragging, setDragging] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const diagram = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const svgElement = diagram.current?.querySelector('svg')
    const bounds = stage.current?.getBoundingClientRect()
    if (svgElement && bounds) sizeToFit(svgElement, bounds, transform.scale)
  }, [shownSvg, transform.scale])
  const drag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null)

  const zoomAround = useCallback((factor: number, clientX?: number, clientY?: number) => {
    setTransform((current) => {
      const scale = clamp(current.scale * factor)
      const ratio = scale / current.scale
      const bounds = stage.current?.getBoundingClientRect()
      if (!bounds || clientX === undefined || clientY === undefined) {
        return { scale, x: current.x * ratio, y: current.y * ratio }
      }
      const px = clientX - bounds.left - bounds.width / 2
      const py = clientY - bounds.top - bounds.height / 2
      return { scale, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio }
    })
  }, [])

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    zoomAround(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX, event.clientY)
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      originX: transform.x,
      originY: transform.y,
    }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (!start) return
    setTransform((current) => ({
      ...current,
      x: start.originX + event.clientX - start.x,
      y: start.originY + event.clientY - start.y,
    }))
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <Modal
      opened={svg !== null}
      onClose={onClose}
      fullScreen
      padding={0}
      title={
        <Group gap="xs">
          <Tooltip label="Zoom out">
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label="Zoom out"
              onClick={() => zoomAround(1 / STEP)}
            >
              <IconZoomOut size={18} />
            </ActionIcon>
          </Tooltip>
          <Text size="sm" c="dimmed" w={48} ta="center">
            {Math.round(transform.scale * 100)}%
          </Text>
          <Tooltip label="Zoom in">
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label="Zoom in"
              onClick={() => zoomAround(STEP)}
            >
              <IconZoomIn size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Reset">
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label="Reset"
              onClick={() => setTransform(IDENTITY)}
            >
              <IconFocusCentered size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      }
      styles={{
        header: { paddingInline: 'var(--mantine-spacing-md)' },
        body: { height: 'calc(100dvh - 60px)' },
      }}
    >
      <div
        ref={stage}
        className="relay-lightbox"
        data-dragging={dragging ? 'true' : undefined}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(event) => zoomAround(STEP, event.clientX, event.clientY)}
      >
        <div
          ref={diagram}
          className="relay-lightbox__diagram"
          style={{ transform: `translate(${transform.x}px, ${transform.y}px)` }}
          dangerouslySetInnerHTML={{ __html: svg ?? '' }}
        />
      </div>
    </Modal>
  )
}
