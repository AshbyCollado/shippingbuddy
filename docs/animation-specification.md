# Animation specification

The preview is driven by one clamped `0..1` playhead. Replay, play/pause, previous, next, direct scrubbing, and 0.5×/1×/2× playback speed all update that same value, so the scene and caption cannot drift apart. Normal playback runs for nine seconds at 1× and stops at exactly 100%.

The playhead is divided into explicit construction stages:

1. Reveal the sheet and item (0–8%)
2. Show the protected envelope (8–14%)
3. Mark score lines (14–22%)
4. Trace the cut boundaries (22–30%)
5. Cut the net (30–38%)
6. Clear the scrap (38–44%)
7. Fold the joining tabs (44–54%)
8. Raise the side walls (54–72%)
9. Close the top flaps (72–90%)
10. Tape the centre seam (90–97%)
11. Finished calculated package (97–100%)

The preview is a client-only Three/R3F scene driven by the generated wrap plan. The flat phase renders the plan rectangles, score lines, cut lines, and generated scrap regions; the cutting phase traces the actual `plan.cuts` sequence; and the fold phase uses rigid panel groups, tabs, walls, flaps, item envelope, and a final tape seam. Common-box modes use a separate RSC assembly scene and never pretend that a factory box is a user-cut net.

Existing-box mode uses a shorter packing recipe: show the user's already-erected box, place the protected item, close the top flaps, tape the seam, and present the result. It never shows cut, score, scrap, or knocked-down factory-box stages.

This is a geometry-driven visual assembly model, not yet a validated collision solver or manufacturing-ready fold simulation. Physical samples are still required to validate board allowances, tab clearances, flap alignment, and strength.

Static result tabs remain usable while paused and the controls expose accessible labels for each state. Reduced-motion behavior is not yet implemented; this remains a follow-up before production release.
