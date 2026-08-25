/**
 * How a finished run ends, as a class rather than a raw exit code.
 *
 * This lives in the plugin contract, not in the engine, because an evaluator
 * written by someone outside this repository has to be able to NAME its
 * verdict. An evaluator that can only succeed or throw has one way to report
 * "your score is below the threshold you set" — fail — and a caller then cannot
 * tell that outcome apart from the evaluator itself crashing. Those need
 * different exit codes and different messages.
 *
 * The numbers are the precedence order as well as the codes: the engine
 * resolves a run to the highest class any participant reported, so a config
 * error outranks a verdict failure and an internal error outranks both.
 */
export enum ExitClass {
  VerdictFail = 1,
  ConfigError = 2,
  RuntimeError = 3,
  InternalError = 4,
}
