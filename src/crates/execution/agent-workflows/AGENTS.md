# Agent Workflows

`opc-agent-workflows` owns named OPC-Team workflow policy that is independent
from hosts and concrete IO, such as DeepResearch report shaping.

It may build on Agent Runtime contracts. Agent Runtime must not depend on this
crate. Host selection belongs to Assembly; filesystem, network, and process IO
belong to Services; protocol translation belongs to Interfaces or Adapters.

Keep workflow modules independent unless they share a proven runtime primitive.

## Verification

```bash
cargo test -p opc-agent-workflows
```
