# Encrypted fantasy snapshot

This repository contains a generic read-only fantasy-football sync script and a scheduled GitHub Actions workflow. It publishes only an AES-256-GCM encrypted snapshot; credentials, league identifiers, and plaintext data are stored as Actions secrets and are never committed.

The consumer validates the authenticated team's balance against a complete season board before showing the result. Other teams' balances are estimates because private adjustments may not appear on the board.
