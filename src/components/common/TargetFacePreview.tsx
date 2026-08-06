import type { TargetProfileType } from "../../types";

interface Props {
  profileType: TargetProfileType;
  /** Rendered edge length in px. */
  size?: number;
  title?: string;
  className?: string;
}

/**
 * What the target actually looks like downrange.
 *
 * A profile dropdown reading "Silhouette" or "Bullseye" is a word; the face is
 * the thing an operator recognises from having stood in front of it. Showing it
 * next to the selector is how a wrong pick gets caught before a relay is fired
 * against the wrong scoring rings.
 *
 * Colours come from `currentColor` rather than an isDarkMode prop, so this
 * works anywhere in either theme without the caller having to thread state in.
 */
export function TargetFacePreview({
  profileType,
  size = 40,
  title,
  className = "",
}: Props) {
  const box = { width: size, height: size };

  if (profileType === "FIGURE") {
    return (
      <img
        src="/Fig11Target.jpg"
        alt={title ?? "Silhouette target"}
        title={title}
        style={box}
        // object-contain, not cover: the Fig-11 is taller than it is wide and
        // cropping it would cut off exactly the head/shoulder outline that
        // makes it recognisable at this size.
        className={`object-contain rounded border border-hud bg-black/20 shrink-0 ${className}`}
      />
    );
  }

  // Concentric rings, no scoring numerals — they are illegible at thumbnail
  // size and the ring pattern alone is what identifies the face.
  return (
    <svg
      viewBox="0 0 100 100"
      style={box}
      role="img"
      aria-label={title ?? "Bullseye target"}
      className={`rounded border border-hud bg-black/20 shrink-0 ${className}`}
    >
      <title>{title ?? "Bullseye target"}</title>
      {[46, 41, 36, 31, 26, 21, 16, 11, 6].map((r, i) => (
        <circle
          key={r}
          cx={50}
          cy={50}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          // Outer rings fade back so the aiming mark reads first, the same
          // visual weighting the full-size board uses.
          opacity={0.35 + i * 0.06}
        />
      ))}
      <circle cx={50} cy={50} r={3} fill="currentColor" />
    </svg>
  );
}
