import styles from "./rules.module.css";

// Monday-first, using getDay() indexes (0 = Sunday) to match excludedDays.
const WEEK = [
  { day: 1, letter: "M", name: "Monday" },
  { day: 2, letter: "T", name: "Tuesday" },
  { day: 3, letter: "W", name: "Wednesday" },
  { day: 4, letter: "T", name: "Thursday" },
  { day: 5, letter: "F", name: "Friday" },
  { day: 6, letter: "S", name: "Saturday" },
  { day: 0, letter: "S", name: "Sunday" },
];

export function WorkingDays({ excludedDays }: { excludedDays: number[] }) {
  const excluded = new Set(excludedDays);
  const working = WEEK.filter((d) => !excluded.has(d.day));
  const label =
    working.length === 0
      ? "No working days"
      : `Working days: ${working.map((d) => d.name).join(", ")}`;

  return (
    <span className={styles.days} role="img" aria-label={label}>
      {WEEK.map((d) => (
        <span
          key={d.day}
          title={`${d.name}${excluded.has(d.day) ? " (no delivery)" : ""}`}
          className={`${styles.day} ${excluded.has(d.day) ? styles.dayOff : ""}`}
        >
          {d.letter}
        </span>
      ))}
    </span>
  );
}
