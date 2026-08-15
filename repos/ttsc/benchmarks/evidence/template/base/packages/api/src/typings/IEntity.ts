import type { tags } from "typia";

/**
 * Minimal reference to one persisted entity.
 */
export interface IEntity {
  /**
   * Primary identifier of the referenced entity.
   */
  id: string & tags.Format<"uuid">;
}
