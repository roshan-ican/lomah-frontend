import { useRef } from "react";
import {
  clientToSvgPoint,
  mmToSvgPoint,
  svgPointToMm,
  SVG_VIEW_SIZE,
  TARGET_HALF_HEIGHT_MM,
  TARGET_HALF_WIDTH_MM,
} from "@shared/coordinates";
import type { TargetProfileType } from "../../../../types";

/**
 * One bench read, held in SENSOR space — the millimetres the board itself
 * reported, before this target's offset is added back.
 *
 * Storing the corrected pair instead would freeze the marker at the offset
 * that was live when it was read, so the moment a calibration landed the face
 * would keep drawing the bullet where the OLD offset put it. Held raw, every
 * marker re-plots against the current offset, and applying a calibration
 * visibly walks the bullet onto the point the operator marked — which is the
 * confirmation that the calibration did what it claimed.
 */
export interface CalibrationRead {
  shot: number;
  sensorX: number;
  sensorY: number;
  score: number | null;
}

interface Props {
  profileType: TargetProfileType;
  /** Bench reads to plot, in sensor mm. */
  reads: CalibrationRead[];
  /** The target's committed offset — what turns a sensor read into face mm. */
  offsetXmm: number;
  offsetYmm: number;
  /** Which read the calibration will be derived from. */
  selectedShot: number;
  /** Where the operator says the bullet really is. */
  trueX: number;
  trueY: number;
  /** False until the operator has actually marked a point — (0, 0) is a
   *  legitimate mark (dead centre) and must not be how "unmarked" is spelt. */
  trueMarked: boolean;
  onPickTrue: (xMm: number, yMm: number) => void;
  /** Return true to swallow a click. The fullscreen view uses this so that a
   *  drag-to-pan, which still ends in a `click` on this SVG, does not also
   *  re-mark the bullet's true position. */
  onClickGuard?: () => boolean;
  disabled?: boolean;
  isAr: boolean;
  /** Rendered edge length. The face is square in SVG space (400×400) even
   *  though the paper inside it is 450×1000mm — a bare number is px, a string
   *  is any CSS length (the fullscreen view sizes itself off the viewport). */
  size?: number | string;
  /** Join the reads in shot order. A commissioning pass is fired as a sequence
   *  and the trail is how the operator sees that sequence — which bullet came
   *  after which — rather than an unordered scatter of dots. */
  connectReads?: boolean;
  /** Overrides what the face says it does. The inline copy in the panel opens
   *  the fullscreen view rather than marking, and announcing "click to mark"
   *  there would describe the wrong action. */
  hint?: string;
}

const clamp = (v: number, half: number) => Math.max(-half, Math.min(half, v));

/** Scoring edge of a circular face — beyond it a hit scores zero. */
const CIRCULAR_RADIUS_MM = 450;

/**
 * The board, as the operator is standing in front of it.
 *
 * Commissioning calibration used to be three numbers in three boxes: shot
 * number, true X, true Y. Nothing showed where the board thought the bullet
 * was, so "derive offset & apply" was a leap of faith — a transposed sign or a
 * mis-keyed millimetre looked exactly like a correct entry until a relay was
 * fired against it. Here the read is a marker on the face, the operator marks
 * the real hole by clicking the paper, and the correction is the arrow between
 * the two.
 */
export function CalibrationTargetFace({
  profileType,
  reads,
  offsetXmm,
  offsetYmm,
  selectedShot,
  trueX,
  trueY,
  trueMarked,
  onPickTrue,
  onClickGuard,
  disabled = false,
  isAr,
  size = 240,
  connectReads = false,
  hint,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  const pick = (clientX: number, clientY: number) => {
    if (disabled) return;
    if (onClickGuard?.()) return;
    const svg = svgRef.current;
    if (!svg) return;
    // The element's own matrix, not its bounding rect: the rect includes this
    // face's 1px border, and mapping the bordered box onto the viewBox skews
    // every click by ~4mm at this size — the same order as the mounting error
    // being measured.
    const ctm = svg.getScreenCTM();
    const pt = ctm
      ? new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
      : clientToSvgPoint(clientX, clientY, svg.getBoundingClientRect());
    const { xMm, yMm } = svgPointToMm(pt.x, pt.y);
    // Clamped to the paper: a "known point" the operator fired at is on the
    // face by definition, and an unclamped click on the surrounding margin
    // would feed the derivation a coordinate that no bullet can occupy.
    // Clamped to the shape that is actually hanging there — the rectangle for
    // a Fig-11, the 450mm disc for a circular face.
    if (profileType === "CIRCULAR") {
      const r = Math.hypot(xMm, yMm);
      if (r > CIRCULAR_RADIUS_MM) {
        const k = CIRCULAR_RADIUS_MM / r;
        onPickTrue(Math.round(xMm * k), Math.round(yMm * k));
        return;
      }
      onPickTrue(xMm, yMm);
      return;
    }
    onPickTrue(
      clamp(xMm, TARGET_HALF_WIDTH_MM),
      clamp(yMm, TARGET_HALF_HEIGHT_MM),
    );
  };

  const topLeft = mmToSvgPoint(-TARGET_HALF_WIDTH_MM, TARGET_HALF_HEIGHT_MM);
  const bottomRight = mmToSvgPoint(TARGET_HALF_WIDTH_MM, -TARGET_HALF_HEIGHT_MM);
  const paper = {
    x: topLeft.x,
    y: topLeft.y,
    w: bottomRight.x - topLeft.x,
    h: bottomRight.y - topLeft.y,
  };

  const selected = reads.find((r) => r.shot === selectedShot) ?? null;
  const seenPt = selected
    ? mmToSvgPoint(selected.sensorX + offsetXmm, selected.sensorY + offsetYmm)
    : null;
  const truePt = mmToSvgPoint(trueX, trueY);
  const showVector =
    seenPt != null &&
    trueMarked &&
    (Math.abs(seenPt.x - truePt.x) > 1 || Math.abs(seenPt.y - truePt.y) > 1);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${SVG_VIEW_SIZE} ${SVG_VIEW_SIZE}`}
      style={{ width: size, height: size }}
      onClick={(e) => pick(e.clientX, e.clientY)}
      role="img"
      aria-label={
        hint ??
        (isAr
          ? "وجه الهدف — انقر لتحديد موضع الطلقة الحقيقي"
          : "Target face — click to mark where the bullet really landed")
      }
      className={`shrink-0 rounded border border-hud bg-black/20 ${
        disabled ? "opacity-50" : "cursor-crosshair"
      }`}
    >
      <title>
        {hint ??
          (isAr
            ? "انقر على الورقة لتحديد موضع الطلقة الحقيقي"
            : "Click the paper to mark the bullet's true position")}
      </title>

      {profileType === "FIGURE" ? (
        // 450×1000mm image in a 320×400 box: at 0.4 SVG units per mm it fits
        // to exactly the paper rect below, so the picture and the coordinate
        // space agree pixel for pixel.
        <image
          href="/Fig11Target.jpg"
          x={40}
          y={0}
          width={320}
          height={400}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : (
        [180, 160, 140, 120, 100, 80, 60, 40, 20].map((r, i) => (
          <circle
            key={r}
            cx={200}
            cy={200}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            opacity={0.3 + i * 0.05}
          />
        ))
      )}

      {/* Paper edge and the (0, 0) axes — without them a click is a guess at
          where the millimetres start. The rectangle is the Fig-11's 450×1000mm
          sheet; a circular face's own outer ring already draws its edge, and
          overlaying a rectangle on it would state a boundary that is not
          there. */}
      {profileType === "FIGURE" && (
        <rect
          x={paper.x}
          y={paper.y}
          width={paper.w}
          height={paper.h}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.8}
          strokeDasharray="4 4"
          opacity={0.45}
        />
      )}
      <line
        x1={profileType === "FIGURE" ? paper.x : 20}
        y1={200}
        x2={profileType === "FIGURE" ? paper.x + paper.w : 380}
        y2={200}
        stroke="currentColor"
        strokeWidth={0.6}
        opacity={0.35}
      />
      <line
        x1={200}
        y1={profileType === "FIGURE" ? paper.y : 20}
        x2={200}
        y2={profileType === "FIGURE" ? paper.y + paper.h : 380}
        stroke="currentColor"
        strokeWidth={0.6}
        opacity={0.35}
      />

      {/* The order the bullets were fired in, drawn before the markers so the
          dots sit on top of it rather than being cut by it. */}
      {connectReads && reads.length > 1 && (
        <polyline
          points={[...reads]
            .sort((a, b) => a.shot - b.shot)
            .map((r) => {
              const p = mmToSvgPoint(r.sensorX + offsetXmm, r.sensorY + offsetYmm);
              return `${p.x},${p.y}`;
            })
            .join(" ")}
          fill="none"
          stroke="rgb(245 158 11)"
          strokeWidth={1}
          strokeLinejoin="round"
          opacity={0.45}
        />
      )}

      {/* Every read the operator has pulled back, the selected one solid and
          the rest dimmed — two bullets on one face is the normal case and the
          panel must show which of them the offset is coming from. */}
      {reads.map((r) => {
        const p = mmToSvgPoint(r.sensorX + offsetXmm, r.sensorY + offsetYmm);
        const isSel = r.shot === selectedShot;
        return (
          <g key={r.shot} opacity={isSel ? 1 : 0.45}>
            <circle
              cx={p.x}
              cy={p.y}
              r={isSel ? 5 : 4}
              fill="rgb(245 158 11)"
              stroke="rgb(120 53 15)"
              strokeWidth={1}
            />
            {isSel && (
              <circle
                cx={p.x}
                cy={p.y}
                r={9}
                fill="none"
                stroke="rgb(245 158 11)"
                strokeWidth={1.2}
              />
            )}
            <text
              x={p.x + 9}
              y={p.y - 7}
              className="font-mono font-bold select-none"
              style={{ fontSize: 10, fill: "rgb(245 158 11)" }}
            >
              #{r.shot}
            </text>
          </g>
        );
      })}

      {/* Where the operator says it really is. */}
      {trueMarked && (
        <g>
          <line
            x1={truePt.x - 8}
            y1={truePt.y}
            x2={truePt.x + 8}
            y2={truePt.y}
            stroke="rgb(16 185 129)"
            strokeWidth={1.6}
          />
          <line
            x1={truePt.x}
            y1={truePt.y - 8}
            x2={truePt.x}
            y2={truePt.y + 8}
            stroke="rgb(16 185 129)"
            strokeWidth={1.6}
          />
          <circle
            cx={truePt.x}
            cy={truePt.y}
            r={5}
            fill="none"
            stroke="rgb(16 185 129)"
            strokeWidth={1.6}
          />
        </g>
      )}

      {/* The correction itself: board-saw → really-is. This arrow is the
          offset, drawn at the scale it will be applied. */}
      {showVector && seenPt && (
        <>
          <defs>
            <marker
              id="calArrow"
              markerWidth={6}
              markerHeight={6}
              refX={5}
              refY={3}
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 z" fill="rgb(16 185 129)" />
            </marker>
          </defs>
          <line
            x1={seenPt.x}
            y1={seenPt.y}
            x2={truePt.x}
            y2={truePt.y}
            stroke="rgb(16 185 129)"
            strokeWidth={1.4}
            strokeDasharray="5 3"
            markerEnd="url(#calArrow)"
          />
        </>
      )}
    </svg>
  );
}
