# Chapter Recap

The first chapter establishes the execution foundations of modern .NET.

At this level, the important mental model is that a .NET application is not only source code plus a framework API surface. It is a layered execution environment:

- source code becomes IL and metadata;
- the host resolves runtime requirements and starts the application;
- CoreCLR provides managed execution services;
- compilation strategy shapes startup and throughput behavior;
- garbage collection governs object lifetime through reachability;
- assembly loading determines how code and dependencies enter the process;
- reflection exists because metadata remains available at runtime.

Taken together, these ideas explain why .NET applications are portable, observable, and productive, but also why deployment, startup, memory behavior, and runtime resolution must be understood as platform concerns rather than only application-code concerns.
