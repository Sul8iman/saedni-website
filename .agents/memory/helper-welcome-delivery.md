---
name: Helper welcome delivery
description: Durable rule for sending the first helper WhatsApp welcome template.
---

The first-helper welcome must use a database-backed claim/lease before the provider request. Set the delivery timestamp only after Meta accepts the template; clear the lease after a failed request so a later valid helper OTP can retry.

**Why:** An in-process lock cannot prevent duplicate sends when multiple API instances verify the same helper concurrently. A timestamp alone cannot coordinate the pre-send period.

**How to apply:** Keep the timestamp as the permanent idempotency marker. Use a short, recoverable lease with a unique owner for the background send. Any successful helper OTP may attempt delivery; the database claim permits it only when the timestamp is absent and no live lease exists. Never add template components or a CTA for `saedni_helper_welcome`.