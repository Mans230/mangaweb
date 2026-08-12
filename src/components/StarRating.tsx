interface StarRatingProps {
  value: number; // 0..5
  size?: number;
  interactive?: boolean;
  onChange?: (v: number) => void;
}

/** 5 stars with gradient fill % via clip */
export default function StarRating({ value, size = 16, interactive = false, onChange }: StarRatingProps) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));

  const stars = (
    <div className="relative inline-flex" dir="ltr" style={{ height: size }}>
      <div className="flex gap-0.5 text-app-3 opacity-40">
        {[0, 1, 2, 3, 4].map((i) => (
          <StarIcon key={i} size={size} />
        ))}
      </div>
      <div
        className="absolute inset-y-0 start-0 overflow-hidden"
        style={{ width: `${pct}%` }}
      >
        <div className="flex gap-0.5 text-warning" style={{ width: size * 5 + 8 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <StarIcon key={i} size={size} filled />
          ))}
        </div>
      </div>
    </div>
  );

  if (!interactive) return stars;

  return (
    <div className="relative inline-flex" dir="ltr">
      {stars}
      <div className="absolute inset-0 flex">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            aria-label={`${v} stars`}
            className="flex-1 cursor-pointer"
            onClick={() => onChange?.(v)}
          />
        ))}
      </div>
    </div>
  );
}

function StarIcon({ size, filled = false }: { size: number; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M12 2.5l2.9 5.9 6.6 1-4.7 4.6 1.1 6.5L12 17.4l-5.9 3.1 1.1-6.5L2.5 9.4l6.6-1z" />
    </svg>
  );
}
