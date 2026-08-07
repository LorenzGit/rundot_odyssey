---
name: rundot-safety-support
description: "Design and operate safe RUN.world player-facing systems: UGC/reporting/moderation, consent, privacy-aware telemetry, notification safety, player recovery, support triage, and incident response. Use for community content, reports, moderation, player support, or safety review."
---

# RUN.world safety and support

Read the relevant local `ugc.md`, `notifications.md`, `files.md`, `storage.md`,
`logging.md`, and `error-handling.md` before implementation or operations.

1. Define a player-facing policy before accepting UGC: allowed content, report
   reasons, review ownership, response target, removal/appeal path, and
   escalation. Put reporting and block/exit controls near community content.
2. Keep privileged moderation and owner/editor CLI actions out of player UI.
   Inspect scope first; require explicit approval for moderation, deletion,
   player-data changes, visibility changes, or any irreversible action.
3. Minimize player data. Do not log, export, or expose credentials, private
   files, unnecessary identifiers, or user text. Make consent specific and
   reversible, especially for notifications and cross-channel messaging.
4. Provide a recovery path for lost progression, failed grants, unavailable
   content, account/profile issues, and abusive content. Collect only the
   diagnostic context needed; never promise a state change that is unverified.
5. Create a small incident record: affected game/version, player impact, known
   facts, mitigation, owner, update time, rollback/cleanup, and follow-up.

Use `references/moderation-and-incident-template.md` before operating a live
case. The official platform policy and creator obligations remain authoritative;
escalate legal, child-safety, payment, or credible-harm issues instead of
inventing policy.
