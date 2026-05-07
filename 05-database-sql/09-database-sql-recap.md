# Database And SQL Recap

Relational databases are integrity systems rather than passive storage. Tables, keys, and constraints define the basic structure, but the deeper value lies in how that structure preserves valid relationships and rejects invalid state even when application code is imperfect. SQL operates over that structure declaratively, expressing result sets, filters, groupings, and transactional boundaries in terms the optimizer can translate into execution plans.

Several themes connect these topics. First, data shape and query shape are inseparable. Joins, normalization, denormalization, indexes, and query plans all reflect the same underlying truth: the schema determines which facts live where, and the workload determines how expensive it is to retrieve or update them. Second, physical design matters. Indexes, cardinality estimates, lock scope, and access paths influence both performance and concurrency behavior. Third, advanced patterns such as denormalized read models, partitioning, or sharding should extend a sound core model rather than compensate for a weak one.

Schema design, SQL semantics, access paths, and transaction behavior, understood at the database level, make higher-level persistence tooling easier to evaluate because their abstractions can be judged against the real behavior of the underlying system.
