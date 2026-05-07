# Git For Engineering Work

## Core Idea

Git is a distributed version control system built on a content-addressable object store. Unlike centralized systems such as Subversion or Team Foundation Version Control, every Git clone contains the full repository history. This design enables offline work, cheap branching, and resilient backups.

A mental model of how Git stores data is essential for understanding its commands beyond rote memorization. Git does not store file differences (deltas) as its primary representation. Instead, it stores snapshots of the entire project tree, where unchanged files are referenced by their existing hash rather than duplicated.

## The Object Model

Git stores all data in four types of objects, each identified by the SHA-1 hash of its content:

- **Blob**: A file's content. Blobs have no name or metadata; they are identified only by their hash. Two files with identical content share the same blob.
- **Tree**: A directory listing. It maps file names to blob hashes and subdirectory names to other tree hashes. A tree object is the Git equivalent of a filesystem directory inode.
- **Commit**: A snapshot of the entire repository at a point in time. Each commit stores the hash of the top-level tree object, the hash of the parent commit (or multiple parents for merges), an author, a committer, a timestamp, and a message.
- **Tag**: A human-readable name for a specific commit. Annotated tags store a tagger name, message, and date, and are themselves objects in the object store.

```bash
# Inspect object types and content
git cat-file -t <hash>    # blob, tree, commit, or tag
git cat-file -p <hash>    # pretty-print the object content
git rev-parse HEAD        # show the commit hash that HEAD points to
```

The content-addressable design means that any change to a file produces a new blob hash, a new tree hash, and a new commit hash. History is a directed acyclic graph (DAG) of commit objects.

## The Three Trees

Git maintains three tree structures that represent the state of the repository at any time:

| Tree | Description | Location |
| --- | --- | --- |
| HEAD | The last commit on the current branch | `.git/refs/heads/` |
| Index (staging area) | The proposed next commit | `.git/index` |
| Working directory | The files you edit on disk | Your filesystem |

The staging area is what distinguishes Git from most other version control systems. It allows you to build a commit incrementally, selecting only some changes to include:

```bash
git add src/OrderService.cs          # stage a single file
git add -p src/PaymentService.cs     # stage only specific hunks
git diff                              # show unstaged changes
git diff --staged                     # show staged changes (what will commit)
```

This separation between the working directory and the index gives fine-grained control over what goes into each commit. It is especially useful for splitting large changes into logical, reviewable commits.

## How Branching Works

A branch in Git is simply a movable pointer to a commit. The file `.git/refs/heads/main` contains a 40-character SHA-1 hash. When you make a new commit on a branch, Git updates this file to point to the new commit.

HEAD is a special pointer that indicates which branch is currently active. It is stored in `.git/HEAD` and typically contains `ref: refs/heads/main` rather than a hash directly. When you switch branches, Git updates HEAD and rewrites the working directory and index to match the target branch's commit.

```bash
# Create and switch branches
git branch feature/payment          # create a new pointer at current commit
git switch feature/payment          # move HEAD to the new branch
git switch -c feature/payment       # create and switch in one command

# Listing and deleting
git branch                          # list local branches
git branch -d feature/payment       # delete the branch pointer only
```

Because branches are just pointers, creating a branch is nearly instantaneous and uses no additional storage. The object model already contains all the data; the branch is merely a label.

## Reading History

```bash
git log --oneline --decorate --graph --all
git show HEAD
git diff
git diff --staged
```

The `--graph` flag renders the commit DAG visually, showing branching and merging structure. `git show HEAD` displays the commit diff and metadata for the most recent commit. `git diff --staged` shows exactly what would be committed, which is useful for pre-commit verification.

```bash
git log --oneline -5                         # last 5 commits
git log --author="name" --since="2 weeks ago" # filter by author and time
```

## The Staging Area

The staging area (index) is critical to Git's commit model. It sits between the working directory and the repository:

```text
Working Directory  --git add-->  Index (staging)  --git commit-->  Repository (HEAD)
```

Useful staging operations:

```bash
git add -N <file>         # add a new file but track its changes
git add -i                # interactive staging interface
git restore --staged <file>  # unstage a file (keep working changes)
git rm --cached <file>    # remove from tracking without deleting from disk
```

The index also stores conflict state during a merge or rebase, marking which files have conflicts that need resolution.

## Commit Messages

Good commit messages explain the change, not just what changed (which the diff already shows).

Recommended format:

```text
<verb> <area or behavior>

Why:
- short reason if needed

Notes:
- migration, risk, or follow-up if needed
```

Examples:

```text
Add server-side pagination for orders
Fix JWT audience validation
Refactor payment callback idempotency
```

Concrete example:

```text
Add idempotency key support to checkout

Why:
- clients may retry checkout after network timeouts

Notes:
- adds unique index on Orders.IdempotencyKey
```

## Merge

Merging combines divergent lines of development. Git performs a three-way merge using three snapshots: the common ancestor (merge base), the current branch tip, and the other branch tip.

```bash
git switch main
git pull
git merge feature/order-search
```

A merge creates a new commit with two parents. The history graph shows the branching structure explicitly.

**Fast-forward merge**: If the current branch has not diverged from the target, Git simply moves the pointer forward. No merge commit is created. This is the default behavior; use `--no-ff` to force a merge commit.

```bash
git merge --no-ff feature/order-search   # always create a merge commit
```

Pros of merge:
- Preserves full context of parallel development
- Safe for shared branches; does not rewrite commit history
- Merge commits document when features were integrated

Cons:
- Can create noisy, non-linear history if used for every small update
- Reviewing a merge commit can be harder than a linear sequence

## Rebase

Rebasing rewrites history by applying commits from one branch onto the tip of another. Instead of creating a merge commit, it replays each commit as a new object with a new hash.

```bash
git switch feature/order-search
git fetch origin
git rebase origin/main
```

Internally, rebase works by:
1. Finding the common ancestor of the current branch and the target branch
2. Collecting the commits on the current branch since the ancestor
3. Resetting the current branch to the target branch tip
4. Applying each collected commit in sequence (this may require conflict resolution)

```bash
# Interactive rebase for squashing, reordering, or editing commits
git rebase -i HEAD~5
```

Pros:
- Produces a clean, linear history
- Makes feature branches easier to review commit-by-commit
- Avoids merge commits

Cons:
- Rewrites commit hashes
- Dangerous on shared branches; other contributors' work will diverge
- Loses context about when parallel work was integrated

Do not rebase branches that others have based work on unless the team has explicitly agreed to it.

## Conflict Resolution

When a merge or rebase encounters conflicting changes, Git pauses and marks the conflicted files. Conflict markers show both versions:

```text
<<<<<<< HEAD
current branch code
=======
incoming branch code
>>>>>>> feature/order-search
```

Steps to resolve:

```bash
git status                                    # see which files are conflicted
# edit conflicting files to resolve
git add path/to/file.cs                       # mark as resolved
git rebase --continue                         # or git merge --continue
```

Understand both changes before resolving. Blindly choosing one side can lose work or introduce bugs.

Rebase applies each commit individually, so conflicts may appear multiple times. Resolve each conflict as it comes:

```bash
git rebase --skip    # skip the current commit (use carefully)
git rebase --abort   # cancel the rebase and return to original state
```

## Stash

Stashing temporarily saves uncommitted changes to a stack.

```bash
git stash push -m "wip order filters"
git stash list
git stash pop         # apply and remove the top stash
git stash apply stash@{1}  # apply a specific stash without removing it
```

The stash is implemented as a special type of commit (a merge commit of the working tree and index) stored in `.git/refs/stash`. It is useful for switching branches without committing half-finished work, but avoid using it as long-term storage. Stashes that persist for weeks are easily forgotten.

## Distributed Workflows

Git is distributed: every clone is a full repository with complete history. Remotes are references to other copies:

```bash
git remote -v                    # list remotes
git remote add origin <url>      # add a remote
git fetch origin                 # download objects from remote without merging
git pull origin main             # fetch + merge (or rebase if configured)
git push origin main             # upload objects and update remote refs
```

**Fetch vs Pull**: `git fetch` only downloads objects and updates remote-tracking branches (`origin/main`). It never modifies your working directory. `git pull` is `git fetch` followed by a merge (or rebase with `--rebase`). Prefer `git fetch` followed by inspection before integrating, especially when working on a shared branch.

**Push safety**: Git rejects a push if the remote branch has commits you do not have locally. This prevents accidental overwrites. Use `git pull --rebase` first to integrate remote changes.

```bash
git push --force-with-lease      # safer force push; checks if remote has unexpected commits
```

Avoid `git push --force` on shared branches. `--force-with-lease` is safer because it refuses if someone else has pushed since your last fetch.

## Revert vs Reset

`git revert` creates a new commit that undoes a previous commit. It is the safe choice for shared branches because it does not rewrite history.

```bash
git revert <commit-sha>          # creates a new commit that reverses the changes
git revert HEAD                  # undo the most recent commit
```

`git reset` moves the current branch pointer and optionally modifies the index and working directory:

```bash
git reset --soft HEAD~1          # move branch pointer only; changes remain staged
git reset --mixed HEAD~1         # move pointer and unstage changes (default)
git reset --hard HEAD~1          # move pointer and discard working changes
```

Use reset on local branches only. After resetting a pushed branch, other clones will diverge.

## Cherry-Pick

Cherry-picking applies a specific commit from one branch onto another:

```bash
git switch main
git cherry-pick abc1234          # apply commit abc1234 to main
```

Internally, cherry-pick computes the diff between the commit and its parent, then applies that diff to the current branch. Conflicts are resolved the same way as merge conflicts.

Cherry-pick is useful for hotfixes and backporting, but overuse can create duplicate commits that make history harder to follow.

## Pull Request Quality

A well-structured pull request (PR) helps reviewers focus on behavior and risk. For detailed guidance on code review practices including PR descriptions, reviewer responsibilities, and common review patterns, see the [Code Review Quality](../20-testing-quality/05-code-review-quality.md) chapter.

- Test evidence and coverage details
- Screenshots for UI changes
- Database migration notes
- Risk areas and rollback plan
- Deployment notes

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

Small, frequent merges to the main branch. Requires:

- Strong CI with fast feedback
- Short-lived branches (hours or days, not weeks)
- Feature flags to hide incomplete work
- Small, incremental changes
- Good test coverage

Trunk-based development reduces merge conflicts and integration risk because no branch diverges far from main.

### GitFlow

A more structured model with multiple long-running branches:

- `main`: production releases
- `develop`: integration branch for features
- `feature/*`: individual feature work
- `release/*`: release preparation
- `hotfix/*`: urgent production fixes

GitFlow works well for products with scheduled releases and separate release cycles. It can slow teams down if applied to continuous delivery workflows, where trunk-based development is often more efficient.

### GitHub Flow

A simpler model: main branch is always deployable, feature branches are short-lived, and every merge to main triggers deployment. Works well for continuous delivery.

## Tags And Releases

Tags mark specific points in history, typically releases:

```bash
git tag v1.4.0
git push origin v1.4.0

# Annotated tag (recommended for releases)
git tag -a v2.0.0 -m "Release version 2.0.0"
git push origin v2.0.0
```

CI/CD pipelines commonly deploy from tags, ensuring that the deployed artifact is traceable to an exact source snapshot. Unlike branches, tags are not meant to move. When a fix is needed for a past release, create a new patch tag (v1.4.1) rather than moving an existing tag.
