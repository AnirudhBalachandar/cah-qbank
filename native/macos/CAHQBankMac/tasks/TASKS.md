# Tasks

## Task IDs

1. learner-ui-shell
   Id: 1-learner-ui-shell
   Scope: Native macOS learner UI
   Files: Sources/App,Sources/ViewModels,Sources/Views,Tests/UI
   Note: Starting learner UI implementation in App/ViewModels/Views with focused UI tests
   Detail: tasks/details/1-learner-ui-shell.md
   Claimed by: WORKER3
   Claimed at: 2026-04-22T22:24:04Z

2. repo-link-date-parse
   Id: 2-repo-link-date-parse
   Scope: Fix native startup repo-link failure caused by database date parsing
   Files: Sources/Services/QBankService.swift,Sources/ViewModels/AppViewModel.swift,Tests/ServiceTests.swift
   Note: Normalized legacy numeric session timestamps on startup, added regression coverage, and verified with make test plus build_and_run.sh --verify.
   Detail: tasks/details/2-repo-link-date-parse.md
   Claimed by: CODEX
   Claimed at: 2026-04-23T04:52:25Z
   Done by: CODEX
   Done at: 2026-04-23T04:56:45Z

3. native-dashboard-redesign
   Id: 3-native-dashboard-redesign
   Scope: Upgrade native mac dashboard from legacy 4-card summary to a real analytics dashboard
   Files: Sources/Models/DomainModels.swift,Sources/Services/QBankService.swift,Sources/Views/DashboardView.swift,Sources/Views/RootView.swift,Tests/ServiceTests.swift
   Note: Replaced the legacy native dashboard with a real analytics layout backed by the new dashboard snapshot, charts, and regression coverage.
   Detail: tasks/details/3-native-dashboard-redesign.md
   Claimed by: CODEX
   Claimed at: 2026-04-23T05:00:13Z
   Done by: CODEX
   Done at: 2026-04-23T05:13:27Z

