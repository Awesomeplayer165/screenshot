type ProgressProps = {
  value: number;
};

export function Progress({ value }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className="progress" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped}>
      <div className="progress-fill" style={{ width: `${clamped}%` }} />
    </div>
  );
}
