# Lodestar Dispatch — presentation speaker notes

One entry per slide of [lodestar-presentation.pdf](lodestar-presentation.pdf).

## 1. Lodestar

Lodestar Dispatch is my submission for the SFI International Fall 2026 Engineering Mini-Challenge: an intelligent load board and autonomous dispatch engine. The demo is live at the URL on screen and the code is public on GitHub.

## 2. A capital-allocation decision every few minutes, on a ten-minute clock

Dispatchers decide under a ten-minute expiry with finite trucks, a weight limit and geography. The three hard parts: empty miles are hidden and depend on which unit goes; capacity is a time-window problem, not a head count; and every delivery re-homes a unit, so bookings reshape the network.

## 3. What the board checks, and what Lodestar refuses

The provided board enforces weight and a simple per-hub count. It does not know about margin, deadhead, projected position or reserves, and its availability rule even counts a unit as free at its old hub for a pickup after its current delivery. Lodestar treats the board as a customer portal and enforces the business rules itself.

## 4. Lodestar sits between the customer board and the fleet

Two services. The provided board is treated as an external customer portal. Lodestar ingests it over WebSocket with reconciliation polling, owns the fleet schedule as temporal locks, prices every load honestly, enforces guardrails, can run on auto-pilot, and explains every decision. The React console talks only to Lodestar.

## 5. Every card carries the whole decision before you click

Nothing requires a second click to learn whether a load is worth it. The empty-miles figure comes from the unit the board will bind, measured from where that unit will be after its current drop. Guardrails are enforced in the backend; the UI only reflects them.

## 6. Bid to protect margin when we win, not to win every auction

The brief is explicit that live awards on the sandbox are not scored on bid amount, so history is where pricing is studied and the live board is where margin-aware decisions are practised. The model is small on purpose: it runs in numpy, retrains at boot, and is surfaced as a suggestion with a probability, not a black box.

## 7. Capacity follows the freight

The forecast walks every unit's locks to show free units at +2, +6, +12 and +24 hours. A truck inbound on a delivery counts as capacity at its destination, which is exactly the ATL to CHI then CHI-outbound pattern the brief describes.

## 8. One temporal lock per booking, and double-booking cannot happen

This is stricter than the board on purpose. In the unit test for chained loads, a unit on ATL to CHI is correctly offered a CHI outbound load with about ten empty miles and refused an ATL outbound load that would need a 600-mile empty move it cannot make in time. The board would accept both.

## 9. Held to the same guardrails as a human, and it shows its work

Safety here means operational guardrails: capacity, schedule conflicts, deadhead and minimum margin. Because auto-pilot runs through exactly the executor a human uses and cannot override, it can be switched on for the easy majority of loads and reviewed from the ledger.

## 10. A schema it owns, a pure evaluator, and proof it works

Architecture, ERD and data flow are in docs/ARCHITECTURE.md; the engineering and business report in docs/REPORT.md. The evaluator is pure and per-hub parallel, which is what makes the enterprise path on the next slides credible.

## 11. One session against the live board, default policy

Numbers come from one development session against the board at default settings, with the 18 tests and the 23-check end-to-end script passing. The value for a carrier is not any single accept; it is making every dispatcher behave like the best one on the desk, on the worst day.

## 12. The seams are already cut where the services would split

Operations would add metrics for ingest lag, blocked and rejected rates and margin versus policy to Prometheus, alerts on board disconnects and 409 spikes, and SSO with per-role override rights. Multiple boards sit behind one adapter interface with external ids namespaced by board.

## 13. Four known seams, each with a named next step

These are stated in the report as well. Naming them is part of the feasibility story: each one is a seam the architecture already anticipates rather than a surprise.

## 14. Lodestar

Thank you. The demo is live, the code is public, and the engineering and business report, architecture document and demo runbook are in the repository's docs folder.

