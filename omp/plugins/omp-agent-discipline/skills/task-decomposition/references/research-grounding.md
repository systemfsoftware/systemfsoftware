# Research Grounding — why each rule exists

Every rule in this skill traces to peer-reviewed or primary-source evidence. Load this when you need to justify, calibrate, or push back on a rule — not for routine dispatches.

## Decomposition beats monolithic execution

- **Zhou et al., "Least-to-Most Prompting Enables Complex Reasoning in Large Language Models"** (ICLR 2023, [arXiv:2205.10625](https://arxiv.org/abs/2205.10625)). Decompose-then-solve-sequentially beats monolithic chain-of-thought, with the gap WIDENING as problems get harder than anything in the model's context (SCAN length-generalization: ~99% vs ~16%). Implication: the monolithic worker doesn't just run long — it fails more, and retries are what consume wall-clock.
- **Wang et al., "TDAG: A Multi-Agent Framework based on Dynamic Task Decomposition and Agent Generation"** (2024, [arXiv:2402.10178](https://arxiv.org/abs/2402.10178)). One purpose-built subagent per bounded subtask outperforms fixed agents with sprawling briefs. Basis for "one maker per unit."

## Specification and verification are the dominant failure categories

- **Cemri et al., "Why Do Multi-Agent LLM Systems Fail?" (MAST)** (NeurIPS 2025, [arXiv:2503.13657](https://arxiv.org/abs/2503.13657)). 14 failure modes over 150+ execution traces across 5 frameworks, in three categories: specification failures, inter-agent misalignment, verification/termination failures. The monolithic rammed-in task is a specification failure; the unverifiable giant output is a verification failure. Their demonstrated mitigations — better specification, multi-level verification — are structural, not prompt-level. Also: more agents is NOT inherently better (coordination failures are their own category) — basis for "one maker by default; decompose on evidence."

## Per-unit verification beats end-of-run verification

- **Lightman et al., "Let's Verify Step by Step"** (ICLR 2024, [paper](https://proceedings.iclr.cc/paper_files/paper/2024/file/aca97732e30bcf1303bc22ac3924fd16-Paper-Conference.pdf)). Process supervision significantly outperforms outcome supervision (78.2% vs 72.4% on MATH). End-of-run verification of a giant diff is the hardest and weakest check; per-unit checks are smaller, earlier, more accurate. Caveat: Jia et al., "Do We Need to Verify Step by Step?" (2025, [arXiv:2502.10581](https://arxiv.org/abs/2502.10581)) complicates the RL-supervision story — per-unit verification here earns its keep through SCOPING (bounded diff, fresh context), which their critique doesn't touch.

## Front-loaded, fully-specified instructions

- **Laban et al., "LLMs Get Lost in Multi-Turn Conversation"** (2025, [arXiv:2505.06120](https://arxiv.org/abs/2505.06120)). Average 39% performance drop when instructions unfold over turns vs. one fully-specified prompt; wrong early turns are unrecoverable. Basis for: complete unit spec at dispatch, in a file, never negotiated in chat; fresh agent + complete spec per unit.

## Context growth degrades attention

- **Liu et al., "Lost in the Middle: How Language Models Use Long Contexts"** (TACL 2024, [arXiv:2307.03172](https://arxiv.org/abs/2307.03172)). U-shaped attention: reliable at context edges, substantial degradation mid-context, worsening with length even below nominal limits. A long-running worker's own brief and verify commands rot mid-context. Basis for small units and brief-at-the-edges.

## Structured handoffs beat dialogue

- **Hong et al., "MetaGPT: Meta Programming for a Multi-Agent Collaborative Framework"** (ICLR 2024, [arXiv:2308.00352](https://arxiv.org/abs/2308.00352)). Structured documents instead of dialogue for inter-agent handoff measurably reduce cascading hallucination. Basis for the dispatch-bundle-as-file rule.
- **Qian et al., "ChatDev: Communicative Agents for Software Development"** (ACL 2024, [paper](https://aclanthology.org/2024.acl-long.810.pdf)). Phase-chain decomposition with explicit per-phase instruction reduces coding hallucination. Basis for sequential unit execution with green-before-next gates.

## Cheap agentic models and heterogeneous assignment

- **Belcak et al. (NVIDIA), "Small Language Models are the Future of Agentic AI"** (2025, [arXiv:2506.02153](https://arxiv.org/abs/2506.02153)). Most agentic sub-invocations are repetitive, scoped, format-bound — small models suffice for the majority; frontier models only for open-ended reasoning. Position paper (vendor interest noted), but directionally corroborated by RouteLLM. Basis for heterogeneous model assignment: frontier orchestrator, cheap workers.
- **Ong et al., "RouteLLM: Learning to Route LLMs with Preference Data"** (ICLR 2025, [arXiv:2406.18665](https://arxiv.org/abs/2406.18665)). Routing between strong/weak models cuts cost up to 85% at ~95% quality — IF calls are classifiable. A sealed unit spec with bounded scope and fixed verify commands is an "easy call" by construction; monolithic dispatches are unclassifiable. Basis for why decomposition ENABLES cheap-worker routing.
- **MiniMax M3** (released 2026-06-01; [GitHub](https://github.com/MiniMax-AI/MiniMax-M3), [HF](https://huggingface.co/MiniMaxAI/MiniMax-M3)). 428B MoE, ~23B active, 1M context, open-weight; SWE-Bench Pro ~59 (frontier-adjacent) at roughly 8–15x under frontier pricing. Sparse attention ([arXiv:2606.13392](https://arxiv.org/abs/2606.13392)) improves long-context THROUGHPUT, not attention reliability over reasoning content — cheap workers make the sizing gate more mandatory, not less. Treat vendor-adjacent benchmark numbers as provisional.

## What the literature does NOT tell us

- No published benchmark measures agentic unit-size vs. model class directly — the budgets in `sizing-gate.md` are engineering defaults to calibrate, not literature values.
- These papers study single-task benchmarks, not multi-day autonomous loops. Effect directions transfer; magnitudes don't.

## Context window isolation per unit — clean context beats shared history

- **Zhang et al., "SWE-Edit: Rethinking Code Editing for Efficient SWE-Agent"** (2026, [arXiv:2604.26102](https://arxiv.org/abs/2604.26102)). Identifies the "context coupling problem": conflating code inspection, modification planning, and edit execution within a single context window forces agents to interleave exploration with formatted generation — irrelevant context accumulates and edit reliability degrades. SWE-Edit decomposes the interface into Viewer + Editor subagents, each with a clean context window. Result: +2.1 pp resolve rate, -17.9% inference cost on SWE-Bench Verified, consistent across multiple reasoning-model families. Implications for this skill: (1) each decomposed unit must operate in its own clean context — never share accumulated history between units; (2) the Viewer/Editor split is a worked example of capability-aligned decomposition.
- **Diao et al., "HIPIF: Hierarchical Planning and Information Folding for Long-Horizon LLM Agent Learning"** (2026, [arXiv:2606.10507](https://arxiv.org/abs/2606.10507)). Directly addresses long-context interference in multi-turn agentic tasks: continuously growing histories weaken the agent's ability to track global state. HIPIF trains agents to organise execution around explicit subgoals while **folding** completed subgoal histories — summarising and evicting them to maintain constant per-step context cost. Implications: the unit spec must describe what state is folded on completion; the orchestrator must evict the worker's context after each unit, not accumulate it.

## Verifiable gates prevent fabricated success — a structural firewall

- **"Goal-Autopilot: A Verifiable Anti-Fabrication Firewall for Unattended Long-Horizon Agents"** (2026, [arXiv:2606.11688](https://arxiv.org/abs/2606.11688)). The critical finding: long-horizon LLM agents cannot be trusted to self-report success. The paper proves a No-False-Success theorem — under gate soundness, floor enforcement, and plan coverage, termination implies the goal holds. The mechanism: a gated finite-state machine where a hard floor forbids any terminal "done" claim whose falsifiable gate did not actually execute and pass. Worst case degrades to an honest stall, never a fabricated success. Empirical results: 0.67% fabrication on SWE-bench Lite vs 33.7% (StateFlow), paired difference -33.07 pp [95% CI -36.53, -29.73]. Implications: (1) every dispatch unit's verify commands must be runnable by the orchestrator, not the worker; (2) a failed verify is an honest stall, never a reason to mark the unit done.

## Reasoning-mode decomposition — separate reasoning modes need separate context

- **"R-APS: Compositional Reasoning and In-Context Meta-Learning for Constrained Design via Reflective Adversarial Pareto Search"** (2026, [arXiv:2606.04823](https://arxiv.org/abs/2606.04823)). Identifies a root cause of agent failure: abductive, counterfactual, meta-inductive, corrective, and inductive reasoning pull a shared context in incompatible directions. The fix: reasoning-mode decomposition — allocate each reasoning mode its own context, orchestrate across three timescales (staged compositional reasoning, counterfactual stress-testing, meta-inductive rule extraction). Small 4B reasoning-specialised models prove competitive with general-purpose 70B backbones inside the protocol, suggesting structured protocols partially offset model scale. Implications: when a unit requires multiple reasoning modes, decompose further — one mode per unit, clean context per mode.

## Capability-aligned decomposition — decompose by capability boundary, not topic

- **"Designing Intelligent Enterprise Agents: A Capability-Aligned Multi-Agent Architecture (CEAD)"** (2026, [arXiv:2605.08258](https://arxiv.org/abs/2605.08258)). Revises the enterprise architecture thesis: governance cannot be the primary organising abstraction — agent design must be. Specifically: decompose by capability boundaries, autonomy allocation, interaction protocols, tool and data authority, state and memory design, **verification design**, and human interaction design. Verification is a first-class architectural dimension, not a post-hoc check. Implications: the unit spec's `write_scope` defines a capability boundary; each unit aligns with one capability; verification design is part of the unit spec from the start, not after the fact.

## Verifiable task synthesis at scale

- **Lv et al., "SCALECUA: Scaling Computer Use Agents with Verifiable Task Synthesis and Efficient Online RL"** (2026, [arXiv:2607.11185](https://arxiv.org/abs/2607.11185)). VeriGen framework: end-to-end generation of verifiable RL tasks through iterative docker interactions and a multi-agent feedback loop, producing 24K+ verifiable tasks at 100+ concurrent workers. Also introduces Visual Context Segmentation — a sliding window over recent context that yields 2.83x training speedup over step-wise decomposition. Implications: (1) verification can and should be automated at scale — a verify command is a falsifiable test; (2) sliding-window context management is a valid alternative to full context isolation for bounded-horizon units.

## Coordination complexity — a formal measure of when parallel agents conflict

- **"Tensor-Coord: Algebraic Decomposition of Joint Plan Tensors for Conflict-Free Multi-Agent LLM Planning"** (2026, [arXiv:2606.16478](https://arxiv.org/abs/2606.16478)). Represents joint plans as a third-order tensor over agents, timesteps, and actions. Defines a computable coordination complexity measure CC(Pi) = (R* - N) / N where R* is the minimal approximate CP rank. Proves R* = N is necessary and sufficient for plan independence. The residual defines a conflict score over agent pairs, timesteps, and actions — localising coordination failures without domain-specific rules. Implications: parallel dispatch is safe when write scopes are disjoint AND formal plan coordination complexity is minimal. Cross-write-scope comparison is table-stakes; the formal measure catches dynamic (runtime) conflicts that static scope comparison misses — an open problem this skill should flag as active research.

## Multi-stage tool-augmented decomposition

- **Zhang et al., "ReProAgent: Tool-Augmented Multi-Stage Agentic Generation of Bug Reproduction Tests from Issue Reports"** (2026, [arXiv:2607.09123](https://arxiv.org/abs/2607.09123)). Decomposes a complex SE task into four agent stages: bug localization, root cause analysis, test planning, and test generation. Each stage gets task-specific tools for decomposition and reflection — not a one-size-fits-all toolset. Results: 58.43%/70.30% on SWT-bench, exceeding OpenHands by 20.43/7.90 pp at $0.14/instance. Implications: each decomposed unit should be assigned task-specific tools aligned to its reasoning need — a "code search" unit gets different tools than a "test generation" unit. The dispatcher specifies which tools each unit may use.

## What the literature does NOT tell us

- No published benchmark measures agentic unit-size vs. model class directly — the budgets in `sizing-gate.md` are engineering defaults to calibrate, not literature values.
- These papers study single-task benchmarks, not multi-day autonomous loops. Effect directions transfer; magnitudes don't.
- The formal coordination complexity measure (Tensor-Coord) is promising but unvalidated outside contrived domains.
- Goal-Autopilot's gated state machine trades coverage for honesty — the correct characterization for unattended work, but the coverage loss must be tracked.
- All SOTA results are sensitive to backbone model. The decomposition rules in this skill are model-class-relative, a property the literature does not study directly.
