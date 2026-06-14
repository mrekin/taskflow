* We use  `docker compose up --build` command to build and test app in docker. For small fixed don't need to build/test docker.

* URGENT! Build docker after development complete if user asks

* We use  headless chromium engine for browser MCP

* We follow @CLAUDE.md rules for every task, not only once at dialog.

* DON'T duplicate code. Always look for the optimal / DRY solution: reuse existing functions, extract a shared helper, keep ONE source of truth. Before writing new logic, check if similar behavior is already implemented elsewhere and unify it instead of copy-pasting another variation.