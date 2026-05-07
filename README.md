# Notes — A Full-Stack Engineering Book

This is a book about building production software with .NET. It covers the full stack: the .NET platform and C# language fundamentals, ASP.NET Core for web services, Entity Framework Core for data access, SQL and database design, API engineering, security, frontend development with React and TypeScript, software architecture and design patterns, data structures and algorithms, common middleware and technologies, performance and scalability, system design, DevOps and cloud infrastructure, testing and quality assurance, production troubleshooting, and engineering decision-making.

The chapters are organized to build on each other. The .NET platform and C# chapters establish the foundation. ASP.NET Core, dependency injection, and data access build the backend. SQL, API design, and security round out the service layer. The frontend chapters cover HTML, CSS, JavaScript/TypeScript, and React. Architecture, design patterns, and system design connect code structure to system qualities. DevOps, testing, troubleshooting, and business scenarios prepare the reader for production reality. Each section ends with a recap that connects the material to the broader engineering picture.

This book is written for professional software engineers who want to understand not only how .NET features work, but why they are designed the way they are and when to choose one approach over another. The focus is on mechanism, trade-offs, and operational consequences — not on API reference lists.

<!-- END_BOOK -->

## Latest Downloads

The latest generated book files are published automatically from `main`:

- [Latest Release](https://github.com/rio-csharp/Notes/releases/tag/latest)
- [notes.epub](https://github.com/rio-csharp/Notes/releases/download/latest/notes.epub)
- [notes.pdf](https://github.com/rio-csharp/Notes/releases/download/latest/notes.pdf)
- [notes.html](https://github.com/rio-csharp/Notes/releases/download/latest/notes.html)

## Purpose

This repository stores the read-only source notes that CodeCafe mounts into the
API at runtime. It is separate from the application repository so notes can be
updated and deployed without rebuilding the CodeCafe application images.

## Deployment

The GitHub Actions workflow in this repository syncs the committed note content
to the target server path:

```text
/home/deploy/codecafe/notes
```

CodeCafe then reads the mounted content inside the API container from:

```text
/data/notes
```

## Required Repository Secrets

```text
TEST_SSH_HOST
TEST_SSH_PORT
TEST_SSH_USER
TEST_SSH_PRIVATE_KEY
PRODUCTION_SSH_HOST
PRODUCTION_SSH_PORT
PRODUCTION_SSH_USER
PRODUCTION_SSH_PRIVATE_KEY
```

## Recommended Repository Variables

```text
NOTES_CONTENT_PATH=/home/deploy/codecafe/notes
NOTES_SYNC_PRODUCTION_ENABLED=false
```
