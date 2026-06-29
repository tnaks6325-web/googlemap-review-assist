"use client";

interface StarRatingProps {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
}

const STAR_PATH =
  "M12 2.5l2.85 6.05 6.65.7-4.95 4.5 1.4 6.55L12 17.4 6.05 20.8l1.4-6.55L2.5 9.25l6.65-.7L12 2.5z";

/** 별점 선택 (1~5) */
export function StarRating({ value, onChange, size = 36 }: StarRatingProps) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label="별점">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}점`}
          onClick={() => onChange?.(n)}
          className="transition active:scale-90"
        >
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill={n <= value ? "var(--color-star)" : "var(--color-line)"}
            aria-hidden="true"
          >
            <path d={STAR_PATH} />
          </svg>
        </button>
      ))}
    </div>
  );
}
