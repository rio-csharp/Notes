# Git For Engineering Work

## Core Idea

Git is a distributed version control system. Good Git practice helps teams change code safely, understand history, and recover from mistakes.

## Daily Commands

```bash
git status
git add .
git commit -m "Add order search endpoint"
git pull
git push
git switch -c feature/order-search
```

Prefer `git switch` for branch switching in newer Git versions:

```bash
git switch main
git switch -c feature/payment-callback
```

## Reading History

```bash
git log --oneline --decorate --graph --all
git show HEAD
git diff
git diff --staged
```

Use `git diff --staged` before committing to verify what will be committed.

## Commit Messages

Good commit messages explain the change.

Good:

```text
Add server-side pagination for orders
Fix JWT audience validation
Refactor payment callback idempotency
```

Weak:

```text
fix
update
changes
```

A useful format:

```text
<verb> <area or behavior>

Why:
- short reason if needed

Notes:
- migration, risk, or follow-up if needed
```

Example:

```text
Add idempotency key support to checkout

Why:
- clients may retry checkout after network timeouts

Notes:
- adds unique index on Orders.IdempotencyKey
```

## Merge

Merge preserves branch history.

```bash
git switch main
git pull
git merge feature/order-search
```

Pros:

- preserves context;
- safe for shared branches;
- does not rewrite commit history.

Cons:

- can create noisy history if used for every small update.

## Rebase

Rebase replays commits on top of another base.

```bash
git switch feature/order-search
git fetch origin
git rebase origin/main
```

Pros:

- cleaner linear history;
- easier to read a feature branch.

Cons:

- rewrites commit hashes;
- dangerous on shared branches if other people depend on those commits.

Rule:

```text
Do not rebase public/shared branches unless the team explicitly agrees.
```

## Conflict Resolution

When conflicts happen:

```bash
git status
```

Open conflicted files and resolve the conflict sections. Git marks the current branch, the separator, and the incoming branch:

```text
[current branch section]
current branch code
[separator]
incoming branch code
[incoming branch section]
```

After resolving:

```bash
git add path/to/file.cs
git rebase --continue
```

or for merge:

```bash
git add path/to/file.cs
git commit
```

Do not blindly choose one side. Understand both changes.

## Stash

Stash temporarily saves local changes.

```bash
git stash push -m "wip order filters"
git stash list
git stash pop
```

Useful when switching branches, but avoid using stash as long-term storage.

## Revert vs Reset

`revert` creates a new commit that undoes a previous commit.

```bash
git revert <commit-sha>
```

Use for shared branches.

`reset` moves branch history.

```bash
git reset --soft HEAD~1
```

Use carefully and usually only on local work.

Avoid destructive commands unless you fully understand the impact:

```bash
git reset --hard
```

## Pull Request Quality

A good PR includes:

- test evidence;
- screenshots for UI;
- migration notes;
- risk areas;
- rollback notes if relevant.

PR description template:

```md
## What Changed

## Why

## How Tested

## Risks

## Deployment Notes
```

## Branching Strategies

### Trunk-Based Development

Small frequent merges to main.

Requires:

- strong CI;
- short-lived branches;
- feature flags;
- small changes;
- good test coverage.

### GitFlow

More structured:

- feature branches;
- develop;
- release;
- hotfix.

Useful for products with scheduled releases, but it can slow teams down if overused.

## Tags And Releases

```bash
git tag v1.4.0
git push origin v1.4.0
```

Tags mark release points. CI/CD can deploy from tags.
