export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export function overlaps(startA: string, endA: string, startB: string, endB: string) {
  return startA < endB && startB < endA;
}

export function formatMoney(cents: number) {
  return `¥${(cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
