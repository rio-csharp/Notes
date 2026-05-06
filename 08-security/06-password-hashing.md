# Password Storage, Verification, And Recovery

## Core Idea

Passwords should not be stored in plaintext, and they should not be stored in reversible encrypted form merely because the system can decrypt them later. A password store exists to verify future guesses, not to recover the original secret. That is why password hashing is a distinct security problem rather than a generic cryptography problem.

This chapter focuses on password handling as a lifecycle: storage, verification, failure handling, and reset.

## Hashing Versus Encryption

Encryption is reversible with the right key. Password hashing is designed to be one-way. Passwords should therefore be hashed with a deliberately slow password-hashing algorithm rather than encrypted for later recovery.

This is one of the most common early misconceptions in security engineering. If a system can trivially recover every original password, compromise of the database or key infrastructure becomes much more damaging.

## Slow Hashing Algorithms

Appropriate password-hashing algorithms include:

- Argon2;
- bcrypt;
- PBKDF2.

They are intentionally slower and more attack-resistant than general-purpose hashes such as SHA-256 or MD5. The slowness is a feature because it raises the cost of offline guessing after credential theft.

## Salt And Optional Pepper

A salt is a unique random value applied per password so that identical passwords do not produce identical stored hashes. Modern password libraries usually manage this automatically.

A pepper is an additional application-managed secret stored separately from the database. It can add another barrier, but it also complicates rotation and operational handling. Pepper is therefore a supplement at most, not a substitute for sound hashing.

## Verification And Rehashing

Password verification is not only a yes-or-no comparison. Mature systems also consider whether the stored hash was produced with outdated cost parameters or legacy algorithms. If verification succeeds but the hash is obsolete, the system can often rehash the password with the current settings during login.

This allows security posture to improve over time without forcing every user through an immediate password reset.

## Failure Handling And Lockout

Password verification should also be part of account-protection design:

- generic failure messages to avoid account enumeration;
- failed-attempt tracking;
- temporary lockout or step-up protection where appropriate;
- rate limiting on login endpoints;
- security logging that avoids exposing secrets.

These controls matter because password hashing alone does not stop online guessing. Storage safety and abuse resistance must work together.

## Password Reset As Credential Issuance

Password reset is effectively a credential-recovery flow and should be treated with similar seriousness. A secure reset process usually:

- issues a short-lived, single-use reset token;
- stores only a hash of that token;
- avoids revealing whether an account exists more than necessary;
- never sends a new password directly by email;
- invalidates the token after successful use.

This is a good example of security design extending beyond storage primitives into user-facing workflows.

## Audit And Sensitive Logging

Authentication events and reset attempts often deserve logging, but logs must never become a second secret store. Raw passwords, reset tokens, refresh tokens, and full authorization headers should not appear in logs. Good security logging records the event context without preserving the credential.

## Design Consequences

Password security is not just about picking the right hashing function. It also involves verification policy, rehash strategy, lockout and throttling, recovery design, and disciplined logging. Systems become materially safer when password handling is treated as a lifecycle rather than as a one-time hashing call during registration.
