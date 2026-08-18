import type { AssignmentStrategy } from "@/services/settings";

export function pickSeller(
  sellerIds: string[],
  openCountBySeller: Record<string, number>,
  strategy: AssignmentStrategy = "leastBusy",
): string | null {
  if (sellerIds.length === 0) return null;
  if (strategy === "leastBusy") {
    return [...sellerIds].sort((left, right) =>
      (openCountBySeller[left] ?? 0) - (openCountBySeller[right] ?? 0))[0];
  }
  return sellerIds[0];
}
