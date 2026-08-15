/**
 * One validation or business-rule rejection that a client can render.
 */
export interface IDiagnosis {
  /**
   * Human-readable explanation of the rejected value or operation.
   */
  message: string;

  /**
   * Property path associated with the rejection, or an empty string when the
   * rejection applies to the complete operation.
   */
  accessor: string;
}
