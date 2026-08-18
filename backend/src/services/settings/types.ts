import type { AssignmentStrategy } from "@/lib/types";
export type { AssignmentStrategy } from "@/lib/types";

export interface StoreSettings {
  defaultMarkup?: number;
  assignmentStrategy?: AssignmentStrategy;
  paymentLinkExpirationMinutes?: number;
  features?: Record<string, boolean>;
}
