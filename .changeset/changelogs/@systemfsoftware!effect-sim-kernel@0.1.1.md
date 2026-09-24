## 0.1.1

### Patch Changes

- Kernel.search enumerates each run's branches in linear time. It used to re-count a schedule's spent preemptions from the start of the run for every branch position, which cost about a fifth of a bounded search's time; the schedules explored are unchanged.
