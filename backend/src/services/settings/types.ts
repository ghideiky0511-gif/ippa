export type AssignmentStrategy = "leastBusy" | "roundRobin" | "any";

export interface StoreSettings {
  defaultMarkup?: number;
  assignmentStrategy?: AssignmentStrategy;
  paymentLinkExpirationMinutes?: number;
  features?: Record<string, boolean>;
}
