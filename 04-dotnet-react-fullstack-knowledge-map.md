# .NET + React 全栈开发工程师工程学习知识点目录

这是一份详细知识点目录，用于后续逐步扩展成完整工程学习复习文档。当前版本只列知识点，不展开具体解释。

## 1. .NET 平台基础

### .NET 基本概念

- .NET / .NET Framework / .NET Core 的区别
- CLR
- BCL
- SDK 与 Runtime
- Runtime Identifier
- Assembly
- Namespace
- Project
- Solution
- NuGet
- Global.json
- Target Framework Moniker
- Self-contained deployment
- Framework-dependent deployment
- Single-file publishing
- Native AOT

### .NET Execution Model

- C# source code
- Compilation
- IL / MSIL / CIL
- Metadata
- Assembly loading
- CLR execution
- JIT compilation
- Tiered compilation
- ReadyToRun
- Native AOT
- Method invocation
- Stack and heap
- Managed code
- Unmanaged code
- Interop
- P/Invoke
- Garbage collection
- Exception handling model
- Thread pool
- SynchronizationContext
- Task scheduler
- Async state machine

### CLR

- Common Language Runtime
- Type safety
- Memory management
- Garbage collection
- JIT compiler
- Exception handling
- Security boundary
- Assembly loading
- AppDomain
- AssemblyLoadContext
- Reflection
- Attributes
- Runtime metadata

### Garbage Collection

- Managed heap
- Stack allocation
- Heap allocation
- Generations: Gen 0, Gen 1, Gen 2
- Large Object Heap
- Small Object Heap
- Server GC
- Workstation GC
- Background GC
- Blocking GC
- Finalizer
- IDisposable
- Dispose pattern
- `using`
- `await using`
- Memory leak in managed code
- Object lifetime
- GC roots
- WeakReference
- Span-related memory model

## 2. C# 基础与高级特性

### C# 语言基础

- Class
- Struct
- Record
- Interface
- Enum
- Namespace
- Access modifiers
- Constructor
- Static constructor
- Property
- Field
- Method
- Indexer
- Operator overload
- Partial class
- Nested type

### 面向对象

- Encapsulation
- Inheritance
- Polymorphism
- Abstraction
- Virtual / Override
- Abstract class
- Interface implementation
- Explicit interface implementation
- Sealed class
- Composition over inheritance
- SOLID principles

### 类型系统

- Value type
- Reference type
- Nullable value type
- Nullable reference type
- Boxing and unboxing
- Type conversion
- Implicit conversion
- Explicit conversion
- `is`
- `as`
- Pattern matching
- Generics
- Generic constraints
- Covariance
- Contravariance
- Invariance

### 常用关键字

- `var`
- `dynamic`
- `object`
- `readonly`
- `const`
- `static`
- `sealed`
- `abstract`
- `virtual`
- `override`
- `new`
- `ref`
- `out`
- `in`
- `params`
- `yield`
- `async`
- `await`
- `lock`
- `volatile`
- `unsafe`
- `fixed`

### 集合

- Array
- List
- Dictionary
- HashSet
- Queue
- Stack
- LinkedList
- SortedList
- SortedDictionary
- ConcurrentDictionary
- Immutable collections
- `IEnumerable`
- `IEnumerator`
- `ICollection`
- `IList`
- `IReadOnlyList`
- `IQueryable`
- Collection initializer
- Iterator

### LINQ

- LINQ to Objects
- LINQ to Entities
- Method syntax
- Query syntax
- Deferred execution
- Immediate execution
- Projection
- Filtering
- Sorting
- Grouping
- Joining
- Aggregation
- `Select`
- `SelectMany`
- `Where`
- `OrderBy`
- `GroupBy`
- `Join`
- `Any`
- `All`
- `First`
- `Single`
- `ToList`
- `AsEnumerable`
- `AsQueryable`

### 异步与并发

- Thread
- ThreadPool
- Task
- ValueTask
- async / await
- Async state machine
- CPU-bound vs I/O-bound
- Blocking call
- Deadlock
- CancellationToken
- Task cancellation
- Task continuation
- Task.WhenAll
- Task.WhenAny
- Parallel.ForEach
- PLINQ
- Lock
- Monitor
- Mutex
- Semaphore
- SemaphoreSlim
- ReaderWriterLockSlim
- Concurrent collections
- Race condition
- Deadlock
- Starvation
- Thread safety

### 异常处理

- Exception hierarchy
- Try / catch / finally
- Throw vs throw ex
- Custom exception
- Global exception handling
- Exception filter
- AggregateException
- Task exception
- Validation exception
- Domain exception
- Infrastructure exception

### 反射与元编程

- Reflection
- Attribute
- Custom attribute
- Type metadata
- Activator
- Expression tree
- Source generator
- Dynamic proxy
- Roslyn analyzer

## 3. ASP.NET Core

### ASP.NET Core 基础

- WebApplication
- Program.cs
- Minimal hosting model
- Startup legacy model
- Request pipeline
- Middleware
- Endpoint routing
- Controller
- Action
- Minimal API
- Model binding
- Model validation
- Filters
- Configuration
- Options pattern
- Logging
- Environment
- Static files
- Hosted service
- BackgroundService

### HTTP 与 Web 基础

- HTTP request
- HTTP response
- HTTP methods
- Status codes
- Headers
- Cookies
- Sessions
- Query string
- Route parameter
- Request body
- Content negotiation
- JSON serialization
- Compression
- Caching headers
- HTTPS
- TLS
- CORS

### Routing

- Convention-based routing
- Attribute routing
- Route constraints
- Route parameter
- Optional parameter
- Catch-all route
- Endpoint routing
- API versioning route

### Controller 与 API

- ApiController
- ControllerBase
- IActionResult
- ActionResult<T>
- CreatedAtAction
- NoContent
- BadRequest
- ProblemDetails
- ModelState
- DTO
- ViewModel
- Entity
- Request model
- Response model
- Mapping
- AutoMapper

### Middleware

- Built-in middleware
- Custom middleware
- Middleware ordering
- Exception handling middleware
- Authentication middleware
- Authorization middleware
- CORS middleware
- Static file middleware
- Routing middleware
- Endpoint middleware

### Filters

- Authorization filter
- Resource filter
- Action filter
- Exception filter
- Result filter
- Filter ordering
- Global filter
- Attribute filter

### Configuration

- appsettings.json
- appsettings.{Environment}.json
- Environment variables
- User secrets
- Command-line configuration
- Options pattern
- IOptions
- IOptionsSnapshot
- IOptionsMonitor
- Configuration binding
- Secret management

### Logging 与 Observability

- ILogger
- Log levels
- Structured logging
- Serilog
- Request logging
- Correlation ID
- Trace ID
- Distributed tracing
- Metrics
- Health checks
- OpenTelemetry
- Application Insights

## 4. Dependency Injection

### DI 基础

- Dependency Injection
- Inversion of Control
- Service container
- Service registration
- Constructor injection
- Method injection
- Property injection
- Service resolution
- Service provider

### 生命周期

- Singleton
- Scoped
- Transient
- Captive dependency
- Scoped service in Singleton
- IDisposable service disposal
- DbContext lifetime
- HttpClient lifetime

### 注册方式

- AddSingleton
- AddScoped
- AddTransient
- TryAdd
- TryAddEnumerable
- Factory registration
- Open generic registration
- Named service pattern
- Keyed service
- Scrutor scanning
- Decorator pattern

### 常见工程场景

- 为什么 Controller 可以注入 Service
- 为什么 DbContext 通常是 Scoped
- Singleton 中不能直接依赖 Scoped 的原因
- Transient 是否每次都是新对象
- ServiceProvider 手动 Resolve 的风险
- DI 与 Service Locator 的区别
- DI 与工厂模式的关系

## 5. Entity Framework Core

### EF Core 基础

- DbContext
- DbSet
- Entity
- Change Tracker
- Entity State
- Migration
- Code First
- Database First
- Fluent API
- Data Annotation
- Shadow property
- Owned entity
- Value converter

### 查询

- LINQ to Entities
- IQueryable
- SQL translation
- Deferred execution
- Tracking query
- No-tracking query
- Projection
- Include
- ThenInclude
- Filtered Include
- Split query
- Raw SQL
- Stored procedure
- Compiled query

### 关系映射

- One-to-one
- One-to-many
- Many-to-many
- Foreign key
- Navigation property
- Principal entity
- Dependent entity
- Cascade delete
- Restrict delete

### 数据变更

- Add
- Update
- Remove
- Attach
- SaveChanges
- SaveChangesAsync
- Change tracking
- Batch update
- Transaction
- Concurrency token
- RowVersion
- Optimistic concurrency

### 性能

- N+1 query
- Lazy loading
- Eager loading
- Explicit loading
- Pagination
- Index
- Query projection
- AsNoTracking
- DbContext pooling
- Bulk operation
- Connection pooling
- Query plan

## 6. Database / SQL

### 数据库基础

- Relational database
- Non-relational database
- Table
- Row
- Column
- Primary key
- Foreign key
- Unique constraint
- Check constraint
- Default constraint
- View
- Stored procedure
- Function
- Trigger

### SQL 基础

- SELECT
- INSERT
- UPDATE
- DELETE
- WHERE
- ORDER BY
- GROUP BY
- HAVING
- DISTINCT
- TOP / LIMIT
- OFFSET / FETCH
- JOIN
- UNION
- Subquery
- CTE
- Window function

### Join

- Inner Join
- Left Join
- Right Join
- Full Join
- Cross Join
- Self Join
- Anti Join
- Semi Join

### Transaction

- ACID
- Atomicity
- Consistency
- Isolation
- Durability
- Commit
- Rollback
- Savepoint
- Isolation levels
- Dirty read
- Non-repeatable read
- Phantom read
- Lost update
- Deadlock

### Index

- Clustered index
- Non-clustered index
- Composite index
- Covering index
- Unique index
- Filtered index
- Index seek
- Index scan
- Key lookup
- Execution plan
- Index fragmentation
- Index selectivity
- SARGable query
- Index invalidation scenarios

### 数据建模

- Normalization
- Denormalization
- 1NF
- 2NF
- 3NF
- BCNF
- Many-to-many table
- Audit fields
- Soft delete
- Temporal table
- Multi-tenant schema
- Data migration

### 常见数据库

- SQL Server
- PostgreSQL
- MySQL
- SQLite
- Redis
- MongoDB
- Elasticsearch

## 7. Web API 设计

### REST

- Resource
- URI naming
- HTTP method semantics
- Status code design
- Idempotency
- Safe method
- Pagination
- Filtering
- Sorting
- Field selection
- Partial update
- Batch operation
- API versioning

### API Contract

- Request DTO
- Response DTO
- Error response
- ProblemDetails
- Validation error
- OpenAPI
- Swagger
- Backward compatibility
- Breaking change
- API documentation

### Authentication / Authorization API

- Login
- Logout
- Register
- Refresh token
- Revoke token
- Password reset
- Email confirmation
- Role API
- Permission API
- Current user API

### File API

- File upload
- Multipart form data
- File download
- Streaming
- Large file upload
- File type validation
- File size limit
- Virus scanning
- Object storage

## 8. Security

### 身份认证

- Authentication
- Authorization
- Identity
- Claims
- Principal
- Role
- Permission
- Policy
- JWT
- Refresh token
- Access token
- Cookie authentication
- Session authentication
- OAuth 2.0
- OpenID Connect
- SSO
- MFA

### Web 安全

- XSS
- CSRF
- SQL Injection
- Command Injection
- Path Traversal
- SSRF
- CORS misconfiguration
- Clickjacking
- Open Redirect
- Insecure deserialization
- Broken access control
- Sensitive data exposure
- Security headers
- Content Security Policy
- SameSite cookie
- HttpOnly cookie
- Secure cookie

### 后端安全

- Input validation
- Output encoding
- Parameterized query
- Password hashing
- Salt
- Pepper
- BCrypt
- PBKDF2
- Rate limiting
- Account lockout
- Audit log
- Secret management
- Key rotation
- Least privilege
- Data encryption at rest
- Data encryption in transit

### 前端安全

- Token storage
- localStorage risk
- sessionStorage risk
- Cookie risk
- DOM XSS
- Dangerous HTML rendering
- Dependency vulnerability
- CSP
- Form validation
- Client-side permission visibility

### OWASP

- OWASP Top 10
- Broken Access Control
- Cryptographic Failures
- Injection
- Insecure Design
- Security Misconfiguration
- Vulnerable Components
- Identification and Authentication Failures
- Software and Data Integrity Failures
- Logging and Monitoring Failures
- SSRF

## 9. Performance

### 后端性能

- Async I/O
- Thread pool starvation
- Connection pooling
- DbContext pooling
- Caching
- Response compression
- Response caching
- Output caching
- Pagination
- Query optimization
- Batch processing
- Background jobs
- Rate limiting
- Memory allocation
- GC pressure
- Object pooling
- Span<T>
- ArrayPool<T>

### 数据库性能

- Index design
- Query plan
- Slow query
- N+1 query
- Pagination performance
- Keyset pagination
- Offset pagination
- Lock contention
- Deadlock analysis
- Connection pool exhaustion
- Denormalization
- Read replica
- Partitioning
- Sharding

### 前端性能

- Bundle size
- Code splitting
- Lazy loading
- Tree shaking
- Memoization
- Virtualized list
- Debounce
- Throttle
- Image optimization
- Font optimization
- Caching
- HTTP caching
- CDN
- Core Web Vitals
- LCP
- CLS
- INP
- TTFB
- Hydration cost

### 系统性能

- Latency
- Throughput
- Availability
- Scalability
- Bottleneck analysis
- Load testing
- Stress testing
- Profiling
- Horizontal scaling
- Vertical scaling
- Caching strategy
- Queue-based async processing

## 10. HTML

### HTML 基础

- Document structure
- DOCTYPE
- html
- head
- body
- meta
- title
- link
- script
- semantic tags
- forms
- tables
- lists
- images
- audio
- video

### 表单

- form
- input
- textarea
- select
- button
- label
- fieldset
- validation attributes
- controlled form
- uncontrolled form
- file input
- accessibility attributes

### 语义化与可访问性

- Semantic HTML
- ARIA
- role
- aria-label
- aria-describedby
- keyboard navigation
- focus management
- screen reader
- alt text
- tab order

## 11. CSS

### CSS 基础

- Selector
- Specificity
- Cascade
- Inheritance
- Box model
- Display
- Position
- Float
- Flexbox
- Grid
- Z-index
- Stacking context
- Overflow
- Transform
- Transition
- Animation

### 布局

- Normal flow
- Flex layout
- Grid layout
- Responsive layout
- Media query
- Container query
- Fluid layout
- Fixed layout
- Sticky header
- Sidebar layout
- Dashboard layout

### 样式工程化

- CSS Modules
- Sass
- Less
- Styled Components
- Emotion
- Tailwind CSS
- CSS variables
- Design tokens
- Theme
- Dark mode
- Utility-first CSS

### CSS 常见工程问题

- BFC
- Margin collapse
- Centering
- Position absolute relative to parent
- Z-index not working
- Flex item shrinking
- Grid auto-fit vs auto-fill
- Responsive units
- rem / em / px / vh / vw

## 12. JavaScript

### JS 基础

- Primitive types
- Object
- Prototype
- Prototype chain
- Scope
- Lexical scope
- Closure
- Hoisting
- `this`
- `call`
- `apply`
- `bind`
- Event loop
- Microtask
- Macrotask
- Promise
- async / await
- Error handling

### ES6+

- let / const
- Arrow function
- Destructuring
- Spread operator
- Rest parameter
- Template literal
- Module
- Class
- Map
- Set
- WeakMap
- WeakSet
- Symbol
- Iterator
- Generator
- Optional chaining
- Nullish coalescing

### 浏览器 API

- DOM
- Event
- Event bubbling
- Event capturing
- Event delegation
- Fetch
- Web Storage
- IndexedDB
- History API
- URL API
- Web Worker
- Service Worker
- IntersectionObserver
- ResizeObserver

## 13. TypeScript

### TS 基础

- Type annotation
- Type inference
- Interface
- Type alias
- Union type
- Intersection type
- Literal type
- Tuple
- Enum
- Generic
- Type assertion
- Type narrowing
- Optional property
- Readonly property
- Index signature

### TS 高级类型

- keyof
- typeof
- indexed access type
- mapped type
- conditional type
- infer
- template literal type
- discriminated union
- utility types
- Partial
- Required
- Pick
- Omit
- Record
- Exclude
- Extract
- ReturnType
- Parameters
- Awaited

### TS 工程化

- tsconfig
- strict mode
- module resolution
- path alias
- type declaration
- declaration file
- ambient type
- generic component typing
- API response typing
- form type modeling
- type-safe route

## 14. React

### React 基础

- Component
- JSX
- Props
- State
- Event handling
- Conditional rendering
- List rendering
- Key
- Controlled component
- Uncontrolled component
- Fragment
- Children
- Composition

### Hooks

- useState
- useEffect
- useLayoutEffect
- useMemo
- useCallback
- useRef
- useReducer
- useContext
- useImperativeHandle
- useId
- Custom hook
- Hook rules
- Dependency array
- Stale closure

### React 渲染模型

- Virtual DOM
- Reconciliation
- Fiber
- Render phase
- Commit phase
- StrictMode
- Concurrent rendering
- Batching
- State update queue
- Component re-render
- Memoization
- React.memo

### React Router

- BrowserRouter
- Route
- Nested route
- Layout route
- Dynamic route
- Query params
- Navigation
- Protected route
- Route loader
- Route action

### 状态管理

- Local state
- Lifted state
- Context
- useReducer
- Redux
- Redux Toolkit
- Zustand
- Jotai
- Recoil
- Server state
- Client state
- Form state
- URL state

### 数据请求

- Fetch
- Axios
- Interceptor
- AbortController
- React Query
- TanStack Query
- SWR
- Cache invalidation
- Optimistic update
- Retry
- Refetch
- Pagination query
- Infinite query

### 表单

- Controlled form
- Uncontrolled form
- React Hook Form
- Formik
- Zod
- Yup
- Field validation
- Form-level validation
- Async validation
- Dynamic form
- File upload

### React 性能

- Avoid unnecessary render
- React.memo
- useMemo
- useCallback
- Lazy loading
- Suspense
- Code splitting
- Virtual list
- Stable reference
- Key stability
- Profiler

### React 测试

- Jest
- Vitest
- React Testing Library
- Component test
- Hook test
- Mock API
- User event
- Snapshot test
- E2E with Playwright

## 15. Frontend Architecture

### 前端项目结构

- Feature-based structure
- Layer-based structure
- Component library
- Shared components
- Pages
- Routes
- Services
- Hooks
- Stores
- Types
- Utils
- Constants

### 前端设计模式

- Container / Presentational
- Compound component
- Render props
- Higher-order component
- Custom hook
- Provider pattern
- Controlled / uncontrolled pattern
- State reducer pattern
- Adapter pattern
- Facade pattern

### 前端工程化

- Vite
- Webpack
- Babel
- SWC
- ESLint
- Prettier
- Husky
- lint-staged
- npm
- pnpm
- yarn
- Monorepo
- Turborepo
- Nx
- Environment variables
- Build optimization

### UI 与设计系统

- Component API design
- Design tokens
- Theme system
- Accessibility
- Responsive design
- Dark mode
- Internationalization
- Localization
- Icon system
- Form component design
- Table component design

## 16. Architecture

### 后端架构

- Layered architecture
- Clean Architecture
- Onion Architecture
- Hexagonal Architecture
- Domain-Driven Design
- CQRS
- Event-driven architecture
- Microservices
- Modular monolith
- Monolith
- Distributed system

### 分层

- Presentation layer
- Application layer
- Domain layer
- Infrastructure layer
- Controller
- Service
- Repository
- Unit of Work
- Domain service
- Application service

### DDD

- Domain
- Entity
- Value Object
- Aggregate
- Aggregate Root
- Repository
- Domain Service
- Domain Event
- Bounded Context
- Ubiquitous Language
- Anti-corruption Layer
- Specification pattern

### CQRS / Event

- Command
- Query
- Command handler
- Query handler
- Mediator
- MediatR
- Event sourcing
- Domain event
- Integration event
- Outbox pattern
- Inbox pattern

### Microservices

- Service boundary
- API Gateway
- Service discovery
- Distributed transaction
- Saga pattern
- Eventual consistency
- Circuit breaker
- Retry
- Timeout
- Bulkhead
- Observability

## 17. Design Patterns

### 创建型模式

- Singleton
- Factory Method
- Abstract Factory
- Builder
- Prototype

### 结构型模式

- Adapter
- Decorator
- Facade
- Proxy
- Composite
- Bridge
- Flyweight

### 行为型模式

- Strategy
- Observer
- Command
- Mediator
- Template Method
- Chain of Responsibility
- State
- Iterator
- Visitor
- Memento

### .NET 常见模式

- Dependency Injection
- Options pattern
- Repository pattern
- Unit of Work
- Specification pattern
- Mediator pattern
- Decorator with Scrutor
- Factory with DI
- Hosted service pattern

### React 常见模式

- Composition
- Container / Presentational
- Provider
- Custom hook
- Compound component
- Controlled component
- Render props
- HOC
- Reducer pattern

## 18. Data Structures

### 基础数据结构

- Array
- Dynamic array
- Linked list
- Stack
- Queue
- Deque
- Hash table
- Set
- Map
- Tree
- Binary tree
- Binary search tree
- Heap
- Priority queue
- Graph
- Trie
- Union Find

### .NET 对应集合

- Array
- List<T>
- LinkedList<T>
- Stack<T>
- Queue<T>
- Dictionary<TKey,TValue>
- HashSet<T>
- SortedSet<T>
- SortedDictionary<TKey,TValue>
- PriorityQueue<TElement,TPriority>
- ConcurrentDictionary<TKey,TValue>

### 复杂度

- Time complexity
- Space complexity
- Big O
- Big Omega
- Big Theta
- Amortized complexity
- Best case
- Average case
- Worst case

## 19. Algorithms / DSA

### 排序

- Bubble sort
- Selection sort
- Insertion sort
- Merge sort
- Quick sort
- Heap sort
- Counting sort
- Bucket sort
- Radix sort

### 搜索

- Linear search
- Binary search
- Binary search variants
- DFS
- BFS
- Backtracking

### 常见算法思想

- Two pointers
- Sliding window
- Prefix sum
- Difference array
- Hashing
- Recursion
- Divide and conquer
- Greedy
- Dynamic programming
- Topological sort
- Shortest path
- Union Find

### 常见题型

- Array problems
- String problems
- Linked list problems
- Stack / queue problems
- Tree traversal
- Binary search problems
- Graph traversal
- Interval problems
- Matrix problems
- Dynamic programming
- Design data structure

## 20. System Design

### 系统设计基础

- Functional requirements
- Non-functional requirements
- Capacity estimation
- API design
- Data model design
- High-level architecture
- Component design
- Bottleneck analysis
- Trade-off analysis

### 核心指标

- Availability
- Scalability
- Reliability
- Maintainability
- Consistency
- Latency
- Throughput
- Durability
- Fault tolerance

### 常见组件

- Load balancer
- API Gateway
- Web server
- Application server
- Database
- Cache
- Message queue
- Object storage
- CDN
- Search engine
- Scheduler
- Worker

### 缓存

- Client cache
- CDN cache
- Reverse proxy cache
- Application cache
- Distributed cache
- Redis
- Cache aside
- Write through
- Write back
- Cache invalidation
- Cache penetration
- Cache breakdown
- Cache avalanche

### 消息队列

- Queue
- Topic
- Producer
- Consumer
- Pub/Sub
- Retry
- Dead-letter queue
- Idempotency
- Ordering
- At-least-once
- At-most-once
- Exactly-once

### 数据一致性

- Strong consistency
- Eventual consistency
- CAP theorem
- ACID
- BASE
- Distributed transaction
- Saga
- Outbox
- Idempotency key

### 常见系统设计题

- URL shortener
- File upload system
- Notification system
- Chat system
- News feed
- E-commerce order system
- Payment system
- Rate limiter
- Logging system
- Search autocomplete
- Task scheduler
- Multi-tenant SaaS system

## 21. DevOps / Deployment

### Git

- Commit
- Branch
- Merge
- Rebase
- Cherry-pick
- Tag
- Stash
- Conflict resolution
- Pull request
- Code review
- GitFlow
- Trunk-based development

### CI/CD

- Build pipeline
- Test pipeline
- Deployment pipeline
- Artifact
- Environment promotion
- Blue-green deployment
- Canary deployment
- Rollback
- Feature flag

### Docker

- Dockerfile
- Image
- Container
- Volume
- Network
- Docker Compose
- Multi-stage build
- Health check
- Container registry

### Hosting

- IIS
- Kestrel
- Nginx
- Reverse proxy
- Windows Service
- Linux service
- Azure App Service
- Azure SQL
- Azure Storage
- Kubernetes basics

## 22. Common Technologies / Middleware

### Redis

- Redis basic data types
- String
- Hash
- List
- Set
- Sorted Set
- Stream
- Bitmap
- HyperLogLog
- Geospatial index
- Key expiration
- TTL
- Eviction policy
- Cache aside
- Write through
- Write back
- Distributed cache
- Distributed lock
- Redlock
- Rate limiting with Redis
- Session storage
- Pub/Sub
- Redis Stream
- Redis persistence
- RDB
- AOF
- Redis replication
- Redis Sentinel
- Redis Cluster
- Cache penetration
- Cache breakdown
- Cache avalanche
- Hot key
- Big key
- Serialization format
- StackExchange.Redis
- IDistributedCache

### Kafka

- Kafka broker
- Topic
- Partition
- Producer
- Consumer
- Consumer group
- Offset
- Commit offset
- Rebalance
- Replication factor
- Leader
- Follower
- ISR
- ZooKeeper
- KRaft
- Message key
- Message ordering
- Delivery semantics
- At most once
- At least once
- Exactly once
- Idempotent producer
- Transactional producer
- Consumer lag
- Dead-letter topic
- Retry topic
- Compacted topic
- Retention policy
- Schema registry
- Avro
- Protobuf
- JSON schema
- Kafka Connect
- Kafka Streams
- Event-driven architecture
- Confluent.Kafka .NET client

### Message Queue

- RabbitMQ
- Azure Service Bus
- Amazon SQS
- ActiveMQ
- Producer
- Consumer
- Queue
- Topic
- Exchange
- Routing key
- Binding
- Fanout
- Direct exchange
- Topic exchange
- Headers exchange
- Acknowledgement
- Retry
- Dead-letter queue
- Poison message
- Message durability
- Message ordering
- Delayed message
- Idempotent consumer
- Outbox pattern
- Inbox pattern
- Competing consumers

### Search Engine

- Elasticsearch
- OpenSearch
- Full-text search
- Inverted index
- Analyzer
- Tokenizer
- Mapping
- Document
- Index
- Shard
- Replica
- Query DSL
- Match query
- Term query
- Bool query
- Aggregation
- Highlighting
- Fuzzy search
- Autocomplete
- Pagination
- Search after
- Reindex
- Index alias
- NEST / Elastic.Clients.Elasticsearch

### Real-time Communication

- SignalR
- WebSocket
- Server-Sent Events
- Long polling
- Hub
- Connection
- Group
- User connection mapping
- Backplane
- Redis backplane
- Real-time notification
- Chat
- Presence
- Reconnection
- Heartbeat

### Background Jobs / Scheduling

- Hangfire
- Quartz.NET
- BackgroundService
- IHostedService
- Worker Service
- Cron expression
- Recurring job
- Delayed job
- Fire-and-forget job
- Retry policy
- Job persistence
- Distributed job processing
- Idempotent job
- Job monitoring

### API Communication

- REST
- GraphQL
- gRPC
- WebSocket
- Server-Sent Events
- OpenAPI
- Swagger
- API Gateway
- BFF pattern
- API aggregation
- Request timeout
- Retry
- Circuit breaker
- Rate limiting
- Versioning

### .NET Common Libraries

- MediatR
- AutoMapper
- FluentValidation
- Serilog
- NLog
- Polly
- Refit
- Dapper
- Entity Framework Core
- StackExchange.Redis
- Confluent.Kafka
- MassTransit
- Hangfire
- Quartz.NET
- Swashbuckle
- NSwag
- BenchmarkDotNet
- Bogus
- xUnit
- Moq
- Testcontainers

### Frontend Common Libraries

- React Router
- TanStack Query
- Redux Toolkit
- Zustand
- Jotai
- React Hook Form
- Formik
- Zod
- Yup
- Axios
- MSW
- Ant Design
- Material UI
- Mantine
- Chakra UI
- Tailwind CSS
- Framer Motion
- D3.js
- ECharts
- i18next
- date-fns
- dayjs

### Observability / Monitoring

- OpenTelemetry
- Prometheus
- Grafana
- Application Insights
- Datadog
- New Relic
- ELK stack
- Seq
- Sentry
- Jaeger
- Zipkin
- Structured logging
- Metrics
- Tracing
- Distributed tracing
- Alerting
- Dashboard
- Health check
- Correlation ID
- Trace ID

### API Gateway / Reverse Proxy

- Nginx
- YARP
- Ocelot
- Envoy
- Kong
- Traefik
- Azure API Management
- Reverse proxy
- Load balancing
- SSL termination
- Path-based routing
- Header-based routing
- Rate limiting
- Authentication at gateway
- Request transformation
- Response transformation

### Authentication / Identity Tools

- ASP.NET Core Identity
- IdentityServer
- Duende IdentityServer
- Keycloak
- Auth0
- Azure AD
- Azure AD B2C
- Okta
- OAuth 2.0
- OpenID Connect
- SAML
- JWT
- Refresh token
- Client credentials flow
- Authorization code flow
- PKCE

### Cloud / Infrastructure

- Azure App Service
- Azure Functions
- Azure SQL
- Azure Storage
- Azure Service Bus
- Azure Key Vault
- Azure Redis Cache
- Azure Container Apps
- Azure Kubernetes Service
- AWS EC2
- AWS Lambda
- AWS RDS
- AWS S3
- AWS SQS
- AWS SNS
- AWS ElastiCache
- AWS ECS
- AWS EKS
- Cloud storage
- Secret manager
- Managed database
- Serverless

### Container / Orchestration

- Docker
- Docker Compose
- Kubernetes
- Pod
- Deployment
- Service
- Ingress
- ConfigMap
- Secret
- Persistent Volume
- Namespace
- Helm
- Horizontal Pod Autoscaler
- Rolling update
- Liveness probe
- Readiness probe

### Data / Analytics Tools

- SQL Server
- PostgreSQL
- MySQL
- MongoDB
- Cosmos DB
- DynamoDB
- Snowflake
- BigQuery
- Data warehouse
- ETL
- CDC
- Debezium
- Power BI
- Tableau

### Feature Management

- Feature flag
- LaunchDarkly
- Azure App Configuration
- Unleash
- A/B testing
- Canary release
- Kill switch
- Gradual rollout
- User targeting

### Common Review Technology Scenarios

- Redis as distributed cache
- Redis as distributed lock
- Redis for rate limiting
- Kafka for event streaming
- Kafka vs RabbitMQ
- Message queue retry and dead-letter design
- Elasticsearch for search
- SignalR for real-time notification
- Hangfire for background jobs
- API Gateway in microservices
- OpenTelemetry for tracing
- Dockerizing .NET and React apps
- Kubernetes deployment basics
- Cloud storage file upload
- Identity provider integration

## 23. Networking / Protocols

### 网络基础

- TCP/IP model
- OSI model
- TCP
- UDP
- IP
- DNS
- DHCP
- NAT
- Port
- Socket
- Connection timeout
- Read timeout
- Keep-alive
- Packet loss
- Latency
- Bandwidth
- Throughput

### TCP

- Three-way handshake
- Four-way termination
- Connection state
- TIME_WAIT
- SYN flood
- TCP retransmission
- Congestion control
- Flow control
- Nagle algorithm
- TCP keepalive

### HTTP

- HTTP/1.1
- HTTP/2
- HTTP/3
- Request line
- Response line
- Header
- Body
- Cookie
- Cache-Control
- ETag
- Last-Modified
- Content-Type
- Content-Length
- Transfer-Encoding
- Chunked transfer
- Keep-Alive
- Connection pooling
- Idempotency

### HTTPS / TLS

- TLS handshake
- Certificate
- CA
- Public key
- Private key
- Symmetric encryption
- Asymmetric encryption
- Certificate chain
- Certificate expiration
- HSTS
- SSL termination

### DNS / CDN

- DNS lookup
- A record
- CNAME
- MX record
- TXT record
- TTL
- DNS cache
- CDN
- Edge location
- Cache invalidation
- Origin server

### Network Review Topics

- What happens when entering a URL
- HTTP vs HTTPS
- HTTP/1.1 vs HTTP/2
- TCP vs UDP
- DNS resolution process
- CORS preflight request
- Connection pooling
- API timeout troubleshooting
- 502 / 503 / 504 errors

## 24. Browser Internals

### Browser Rendering

- DOM
- CSSOM
- Render tree
- Layout
- Paint
- Composite
- Reflow
- Repaint
- Critical rendering path
- Render-blocking resource
- Parser-blocking script

### Browser Runtime

- JavaScript engine
- V8
- Call stack
- Heap
- Event loop
- Microtask queue
- Macrotask queue
- requestAnimationFrame
- Garbage collection in browser
- Web Worker
- Service Worker

### Storage

- Cookie
- localStorage
- sessionStorage
- IndexedDB
- Cache Storage
- Storage quota
- SameSite
- HttpOnly
- Secure cookie

### Browser Security

- Same-origin policy
- CORS
- CSP
- XSS
- CSRF
- iframe sandbox
- Clickjacking
- Mixed content
- Secure context

### Browser Performance

- Resource loading
- Preload
- Prefetch
- Preconnect
- Lazy loading
- Image decoding
- Layout shift
- Main thread blocking
- Long task
- Performance API
- Lighthouse
- DevTools Performance panel

## 25. Computer Science / Operating System Basics

### Operating System

- Process
- Thread
- Coroutine
- Context switching
- User mode
- Kernel mode
- System call
- Virtual memory
- Page
- Page fault
- File descriptor
- I/O
- Blocking I/O
- Non-blocking I/O
- Async I/O

### Concurrency Fundamentals

- Race condition
- Critical section
- Mutex
- Semaphore
- Monitor
- Lock-free
- Atomic operation
- Memory visibility
- Deadlock
- Livelock
- Starvation
- Producer-consumer

### Memory

- Stack
- Heap
- Pointer
- Reference
- Memory allocation
- Memory fragmentation
- Memory leak
- Cache locality
- CPU cache
- LRU

### Encoding / Data Representation

- ASCII
- Unicode
- UTF-8
- UTF-16
- Base64
- JSON
- XML
- YAML
- CSV
- Binary format
- Endianness
- Serialization
- Deserialization

## 26. Code Quality / Maintainability

### Clean Code

- Naming
- Function size
- Class responsibility
- Duplication
- Cohesion
- Coupling
- Side effects
- Immutability
- Guard clause
- Error handling
- Code readability

### Refactoring

- Extract method
- Extract class
- Replace conditional with polymorphism
- Introduce parameter object
- Remove dead code
- Simplify condition
- Dependency inversion
- Strangler Fig pattern
- Legacy code refactoring

### Code Review

- Correctness
- Readability
- Testability
- Security
- Performance
- Maintainability
- API compatibility
- Error handling
- Logging
- Naming
- Pull request size

### Static Analysis

- Compiler warnings
- Nullable warnings
- Roslyn analyzer
- ESLint
- TypeScript strict mode
- SonarQube
- Code coverage
- Dependency scanning
- Secret scanning

### Technical Debt

- Technical debt identification
- Refactoring priority
- Migration plan
- Breaking change management
- Backward compatibility
- Documentation debt
- Test debt

## 27. Integration / Practical Business Scenarios

### Third-party Integration

- Payment integration
- Stripe
- PayPal
- Webhook
- Email service
- SMS service
- OAuth provider
- Map service
- File storage
- SFTP
- ERP integration
- CRM integration

### Webhook

- Webhook signature
- Replay attack
- Idempotency key
- Retry handling
- Dead-letter handling
- Event ordering
- Event versioning
- Webhook monitoring

### Email / Notification

- SMTP
- Email template
- Transactional email
- Bulk email
- Bounce handling
- Unsubscribe
- Push notification
- In-app notification
- Notification preference

### File Processing

- CSV import
- Excel import
- PDF generation
- Image processing
- Virus scanning
- File metadata
- Large file streaming
- Background processing
- Object storage lifecycle

### Date / Time / Localization

- UTC
- Local time
- Time zone
- Daylight saving time
- Date-only value
- Time-only value
- DateTime
- DateTimeOffset
- NodaTime
- Locale
- CultureInfo
- Currency formatting
- Number formatting
- Translation files
- RTL layout

### Multi-tenancy

- Tenant identification
- Tenant isolation
- Database per tenant
- Schema per tenant
- Shared database
- Tenant-aware query filter
- Tenant-specific configuration
- Tenant-specific branding
- Cross-tenant data leak prevention

### Reporting / Export

- Dashboard metrics
- Aggregation query
- Export to CSV
- Export to Excel
- Export to PDF
- Scheduled report
- Large report generation
- Data permission in reports

## 28. Production Troubleshooting / Incident Handling

### Troubleshooting Method

- Symptom collection
- Reproduction
- Log analysis
- Metrics analysis
- Trace analysis
- Recent change review
- Hypothesis testing
- Rollback decision
- Root cause analysis
- Postmortem

### Backend Incidents

- 500 error
- High latency
- High CPU
- High memory
- Memory leak
- Thread pool starvation
- Connection pool exhaustion
- Database timeout
- Deadlock
- Redis timeout
- Message queue backlog
- File handle exhaustion

### Frontend Incidents

- Blank screen
- JavaScript runtime error
- Chunk load error
- API 401 loop
- CORS failure
- Cache stale issue
- Source map
- Browser compatibility
- Slow page load
- Layout shift

### Deployment Incidents

- Bad configuration
- Missing environment variable
- Secret rotation failure
- Database migration failure
- Rollback failure
- Version mismatch
- Container crash loop
- Health check failure
- DNS issue
- Certificate expiration

### Incident Communication

- Severity level
- Incident owner
- Timeline
- Status update
- Customer impact
- Mitigation
- Root cause
- Action items

## 29. Agile / Collaboration / Team Reflection

### Agile / Team Process

- Scrum
- Kanban
- Sprint planning
- Daily standup
- Retrospective
- Backlog refinement
- Story point
- Acceptance criteria
- Definition of Done
- Release planning

### Product Thinking

- Requirement clarification
- User story
- Edge case
- MVP
- Trade-off
- Prioritization
- User impact
- Business value
- Data-driven decision

### Communication

- Technical explanation
- Cross-functional collaboration
- Requirement negotiation
- Estimation
- Risk communication
- Status reporting
- Mentoring
- Knowledge sharing
- Documentation

### Collaboration Reflection Prompts

- Summarize your engineering background
- Most challenging project
- Conflict with teammate
- Production incident experience
- Tight deadline
- Learning new technology
- Handling ambiguous requirements
- Receiving code review feedback
- Giving code review feedback
- Failure and lesson learned

### English Review Topics

- Project introduction in English
- Explaining technical decision in English
- Explaining bug investigation in English
- Explaining trade-offs in English
- Asking clarifying questions in English

## 30. Testing

### 后端测试

- Unit test
- Integration test
- Functional test
- xUnit
- NUnit
- MSTest
- Moq
- NSubstitute
- TestServer
- WebApplicationFactory
- In-memory database
- Testcontainers

### 前端测试

- Unit test
- Component test
- Integration test
- E2E test
- Jest
- Vitest
- React Testing Library
- Playwright
- Cypress
- Mock Service Worker

### 测试知识点

- Test pyramid
- Arrange Act Assert
- Mock
- Stub
- Fake
- Spy
- Fixture
- Snapshot
- Test coverage
- Regression test
- Boundary test
- Negative test

## 31. Common Full-stack Review Scenarios

### CRUD 功能

- List page
- Detail page
- Create form
- Edit form
- Delete confirmation
- Pagination
- Sorting
- Filtering
- Validation
- Error handling
- Loading state
- Empty state

### 登录权限

- Login page
- JWT issuing
- Refresh token
- Route guard
- API authorization
- Role management
- Permission management
- Logout
- Token expiration

### 管理后台

- Dashboard
- Data table
- Search form
- Advanced filter
- Export
- Import
- File upload
- Audit log
- Operation log
- User management
- Role management

### 线上问题排查

- 500 error
- Slow API
- Database timeout
- Memory leak
- High CPU
- Thread pool starvation
- Deadlock
- CORS error
- Authentication failure
- Frontend blank screen
- Bundle loading failure
- Cache issue

## 32. 项目案例准备目录

### 项目介绍

- Project background
- Business problem
- Tech stack
- Architecture
- Module responsibility
- Database design
- API design
- Frontend structure
- Deployment

### 项目亮点

- Authentication and authorization
- Clean Architecture
- EF Core optimization
- React component abstraction
- State management
- Error handling
- Logging
- Caching
- Performance optimization
- Testing
- CI/CD

### 项目难点

- Complex query
- Permission model
- Concurrency control
- Large data pagination
- File upload
- Third-party integration
- Data consistency
- Frontend performance
- Deployment issue

## 33. 核心复习问题目录

### .NET / C#

- C# 值类型和引用类型
- Boxing and unboxing
- `string` vs `StringBuilder`
- `IEnumerable` vs `IQueryable`
- `List` vs `Array`
- `Dictionary` 原理
- `async/await` 原理
- `Task` vs `Thread`
- `ref` vs `out`
- `class` vs `struct` vs `record`
- Interface vs abstract class
- Garbage collection
- IDisposable
- LINQ deferred execution

### ASP.NET Core

- Middleware pipeline
- Filter types
- Dependency injection lifetimes
- Model binding
- Model validation
- Authentication vs Authorization
- JWT flow
- CORS
- Global exception handling
- Logging
- Configuration
- Options pattern

### Database

- Index principle
- Clustered vs non-clustered index
- Transaction isolation levels
- Deadlock
- Query optimization
- Join types
- Pagination optimization
- N+1 query
- Normalization

### React / Frontend

- React rendering process
- Virtual DOM
- Reconciliation
- useEffect dependency
- useMemo vs useCallback
- React.memo
- Controlled vs uncontrolled component
- Context vs Redux
- React Query
- Key usage
- Frontend performance
- XSS
- CORS

### Architecture / System Design

- Layered architecture
- Clean Architecture
- Repository pattern
- Unit of Work
- CQRS
- DDD
- Cache strategy
- Message queue
- Idempotency
- Rate limiting
- Distributed transaction
- System scalability

### DSA

- Array and string
- Hash table
- Stack and queue
- Linked list
- Tree
- Graph
- Binary search
- Sorting
- Two pointers
- Sliding window
- Dynamic programming

### Networking / Browser

- What happens when entering a URL
- HTTP vs HTTPS
- HTTP/1.1 vs HTTP/2 vs HTTP/3
- TCP three-way handshake
- DNS lookup
- Browser rendering process
- Event loop in browser
- Cookie vs localStorage vs sessionStorage
- Same-origin policy
- CORS preflight
- Browser cache

### Production / Troubleshooting

- How to troubleshoot slow API
- How to troubleshoot 500 error
- How to troubleshoot database timeout
- How to troubleshoot memory leak
- How to troubleshoot frontend blank screen
- How to handle production incident
- How to do rollback
- How to write postmortem

### Practical Scenarios

- Webhook idempotency
- Payment callback handling
- CSV import design
- Large file upload
- Email notification design
- Time zone handling
- Multi-tenant data isolation
- Export large report

### Behavioral

- Project introduction
- Technical challenge
- Conflict resolution
- Code review experience
- Incident experience
- Trade-off decision
- Learning experience
- Ownership example
