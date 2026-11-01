# Bike Coach: Design

As of: 2026-10-31. Working name `bike-coach`.

Origin of the statements: **[User]** means the user said or confirmed it. **[Claude decision]** is a suggestion from the conversation or a decision made while writing, and can be changed. **[Research]** comes from the web research of 2026-10-31, mainly from community sources, and has not been verified on the real device.

## 1. What this is about

A private training app for two people on one Zwift Hub One. They ride one after the other or on different days. **[User]**

The app combines four things:

1. reliable trainer control and gap-free tracking
2. an AI coach that creates sessions and a long-term plan and adapts them dynamically
3. a fair, friendly comparison despite very different power values
4. entertainment: mountain videos and language learning (Dutch first, both starting from zero, other languages later)

**Why:** Success means that both get on the bike regularly and gladly and use the app a lot. **[User]**

## 2. The good session

Warmup, then demanding enough over its course to be really fun, but never frustrating. Added to that are moments of success and visible progress, in training and in the language. You can see what the other person did and where you stand yourself, without it turning mean. **[User]**

The model is the best Rouvy rides: mountain rides with ups and downs and beautiful landscapes. **[User]**

## 3. Goals, non-goals, anti-goals

**Goals, by priority** **[User]**:

1. No ride and no data are ever lost.
2. Tracking and long-term plan are correct.
3. Entertainment comes after that and is allowed to fail. If need be, a movie runs alongside, perhaps even permanently.

**Non-goals** **[Claude decision]**: no product for further users (the code is public, but built for one household), no full-fledged language school, no Zwift clone with a 3D world, no iPad Bluetooth connection for now.

**Anti-goals. This would be a failure, even if it works technically:**
- A ride aborts and the data is gone. **[User]**
- Training frustrates, or the comparison feels mean. **[User]**
- Language exercises come during hard intervals. **[User]**
- Missed days create guilt or pressure to catch up. **[Claude decision]**

## 4. Top rule: A ride is never lost

**[User]** for the goal, **[Claude decision]** for the implementation:

- A ride never depends on the internet, home server, AI or the interface.
- Every second is saved locally and crash-safe before it goes anywhere else. The home server gets the data afterwards and catches up after outages.
- After a crash the app offers to continue riding from the same point. At most a few seconds are missing.
- If the trainer, strap or clicker fails, the ride continues, the app reconnects in the background and marks the gap.
- Aborted rides are also saved and count for the plan and comparison.
- A new version of the interface or coach cannot end the running recording.
- **Acceptance before the first real ride:** automated and manual tests that hard-kill the process at 80%, cut the Bluetooth connection, shut down the server and reload the interface. In every case the ride must be preserved completely, apart from a few seconds. If the Mac itself fails, everything up to shortly before is preserved.

## 5. Architecture

All **[Claude decision]**, unless marked otherwise.

**Mac app with Electron (TypeScript) [Claude decision, requested by the user: a proper application]:** It consists of two strictly separated parts.

- *Ride service:* its own process, small and rarely changed. It holds the Bluetooth connections, controls the trainer, runs the current session and writes the recording. It survives every reload and every crash of the interface. If it crashes itself, the app restarts it and continues the ride.
- *Interface:* web technology in the app window, reloadable at any time, with full-screen mode and floating movie mode (see 7).

Pure Web Bluetooth is ruled out because every reload would drop the connections. Whether the chosen Bluetooth integration runs reliably in its own process is checked in Stage 0.

**Home server (Docker, SQLite):** Profiles, rides, plan and comparison. The coach's AI calls run on the Mac. The Mac and later the iPad use the same state. The server is never needed for a running ride. Before a ride starts, the ride service fetches the next session. If the server is unreachable, it takes the most recently saved session or a simple local default session.

**AI [User]:** Coach and language content run via `claude -p`, i.e. unmodified Claude Code on the Mac with the user's Pro login. CLIProxyAPI and LiteLLM are not used. The app wraps the call behind a small interface, so that switching to an API key only affects that one place. The calls therefore run only on the Mac, not on the home server. Responses are requested as structured JSON (`--output-format json`, `--json-schema`) and checked against the guardrails. Coach runs may not change files or execute commands.

The user uses their plan for this private, non-commercial project for both profiles. That is their decision and is not addressed further.

Known risks:
- **Limit:** Coach and live improvement share the plan limit. If it is exhausted, the procedure from section 8 applies.
- **Technical:** According to the docs, `--bare` mode does not use the subscription login and is to become the default for `-p` in future. The call must take this into account and run in its own working folder, so that as little as possible of `~/.claude` is loaded. A test reports immediately if the call stops working after an update.

**iPad:** at first only as a display and for analysis. Web Bluetooth does not work in Safari on the iPad **[Research]**, but the ride service on the Mac makes that unnecessary for the display. Riding without a Mac would be a separate later project.

**Server rules** (for your own home server):
- Own folder `~/bike-coach/`, Compose name `bike-coach`, own `.env`.
- Ports from `127.0.0.1:7002–7099`, never `0.0.0.0`.
- `mem_limit` per service; together well below the permitted roughly 2 GiB where possible.
- Access through its own Tailscale sidecar, tailnet only, no Funnel. The auth key comes from the user.
- Backups into their own folder, only add to cron, no heavy jobs between 02:00 and 06:00.

## 6. Devices

**Available** **[User]**: Zwift Hub One, Zwift Clicker, Polar chest strap, two Garmin watches (inaccurate on the bike), iPad, home server. A fixed Mac stands at the bike at first; both use it and pick their profile in the app. A shared macOS account is **[Claude decision]**.

**Trainer** **[Research]**: The Hub One speaks Bluetooth FTMS, which other apps also use. That is sufficient for ERG mode and grade simulation. Virtual shifting via Zwift's own protocol is only usable through reverse engineering, and for the Hub One there are conflicting reports about it from Rouvy. If the Zwift Cog is used, real shifting can only run through this protocol.

**Shifting** **[Claude decision]**: The app simulates gears itself by shifting the grade sent to the trainer. The Zwift protocol is not needed. How good this feels will be settled by the first test.

**Clicker** **[Research]**: There is officially no interface, but there are reverse engineering projects. The information on the Click v2 is contradictory: BikeControl calls it only "mostly" supported and sometimes needs an unlock via Zwift, while zwiftboard (MIT, Windows only) by its own account reads it without an unlock. The Auuki author describes AES-CCM encryption on the Click. Firmware updates can break all of this. **That is why the clicker is important, but never a precondition for a ride** **[Claude decision]**. The replacement is the keyboard and an on-screen display. If it fails, the app switches to ERG mode or allows shifting by keyboard.

**Heart rate** **[Claude decision]**: Primarily the Polar strap. Without a strap the ride can also run without heart rate, or a Garmin watch sends it, if the model can do that (not verified). Power from the trainer is the main metric, heart rate complements it.

**Operation at the start:** Choose a profile, devices connect automatically, start the session. If a device is missing, the ride can still begin.

**Export:** Every ride as a FIT file, so it can be imported into Garmin Connect, for example. Automatic upload is not part of the first stage. **[Claude decision]**

## 7. Ride modes

**Movie mode** (from Stage 1) **[User's idea, implementation Claude decision]**: small window next to any movie, with power target, heart rate, cadence, remaining time and clear notices before changes. No language exercises. The session runs in ERG mode, so no looking is needed.

**Mountain mode** (Stage 4) **[Claude decision, based on the user's wishes]**: The terrain structures the session.
- *Climb:* demanding, music or motivational videos, no language. **[User]**
- *Summit:* moment of success with a view, best time or comparison with the last ride.
- *Descent and valley:* recovery, landscape and language.

The language does not have to match the landscape. Pure Netherlands routes are rejected for lack of mountains.

**Control in mountain mode [Claude decision]:** The trainer rides the video's grade, scaled per person based on FTP. The video runs at virtual speed. The scaling is chosen so that both take roughly equally long for the same climb. The coach sets the route, scaling and target load, instead of prescribing power values. The guardrails act through the scaling: if heart rate runs away or power stays above the limit, the ride service lowers the grade. Scoring is the time with your own scaling against your own earlier rides. The format for sessions and recording must represent both kinds (power target and scaled grade) from Stage 1 on.

## 8. AI coach and plan

**Scope [User]:** The AI creates and controls the individual sessions and the long-term plan and serves as coach. The plan adapts dynamically: one person may ride once a week, the other seven times.

**Rules [Claude decision]:**
- No fixed weekly calendar. When you get on, the coach suggests the session that will do the most good today, and you can make it easier, harder or shorter.
- Missed days are never made up. After breaks things restart gently; with frequent riding, enough easy sessions are built in.
- Every change is justified in one or two sentences.
- After each ride there is a short survey (too easy, just right, too hard). It feeds into the plan.
- Long-term goal: regularity and increasing fitness. A personal goal can optionally be added.

**Long-term plan [User confirmed]:** No calendar, but for each person a visible phase (for example "Build, about 3 more weeks"), a forecast of FTP development and a review of what the coach changed and why. The plan is right when the load rises slowly, the FTP forecast roughly comes true and most sessions are rated "just right".

**Free text [User confirmed]:** A short text field for notes such as "knee is twinging" or "I'm away next week". The coach takes them into account and replies briefly. A full chat is not planned for now.

**Data [User confirmed, subject to the second person's consent]:** The AI gets heart rate, FTP and ride data, but no names.

**AI failure [Claude decision]:** The coach generates its suggestions after the ride and stores them in advance. So when you get on, a session is usually already there. If Claude is unreachable or the limit is exhausted, the app takes the stored session or a rule-based one and catches up on the analysis later. A ride is never blocked by this.

**Division of work [Claude decision]:** The AI plans before and after the ride. During the ride the ride service decides on its own and without AI, for example to lower the power target if heart rate runs away or cadence collapses.

**Guardrails [Claude decision]:** Fixed rules in the code, not just in the AI prompt, limit suggestions: maximum intensity and progression relative to FTP, minimum recovery after hard sessions, abort or reduction possible at any time. The AI produces structured sessions that are checked before acceptance. Anything invalid is discarded and replaced by a default session.

**Performance values:** Each person has their own FTP. It is determined by a short ramp test and carried forward by the coach. **[User: own values; Claude decision: method]**

## 9. Comparison

**Principle [User]:** Each person trains by their own values. The user pushes considerably more watts, and the comparison must not punish that.

**Implementation [Claude decision]:**
- Leaderboard only from things both can influence equally: progress against yourself, completed sessions, regularity measured against your own rhythm, learned words.
- The same route or session is scored relative to your own FTP.
- A shared goal, such as elevation gain for "together up Mont Ventoux".
- Friendly teasing, no defeat displays. The other person's raw power values only appear if you open them.

## 10. Language learning (Stage 4)

- Language in quiet phases, never in hard intervals; music or motivational videos there. Each person sets the heart rate limit for this. **[User]**
- Both start from zero. At the beginning there are short words and sentences for listening and repeating, quizzes with the clicker or keyboard. Videos with subtitles come at a higher level. **[User: videos, zero knowledge; Claude decision: order]**
- A language plan per person that repeats across rides whatever has not yet stuck (spaced repetition). The language is selectable, Dutch first. **[Claude decision; User: other languages possible]**
- The AI generates content and adapts it. A learning state stays usable even without AI, because content is generated and stored in advance. **[Claude decision]**
- On movie rides, learning pauses without penalty. The coach can occasionally suggest a session with language. **[Claude decision]**

## 11. Live improvement on the bike

**[User]**: During the first rides the app is observed live and improved in a targeted way, while the user sits on the bike and gives direct feedback.

**Implementation [Claude decision]:**
- Claude Code runs on the Mac as the developer. This is separate from the coach in the app.
- It sees a continuously written stream of power, heart rate, cadence, clicks, coach decisions and errors.
- The user gives feedback by voice. A long press on the clicker or a key marks the exact moment. The specific voice input is left to the builder to choose.
- **Changeable live:** interface, texts, power targets of the running session within the guardrails, coach prompts.
- **Not changeable live:** the ride service with recording and Bluetooth. Changes to it and larger rework are noted and implemented after the ride.
- Every live change can be undone immediately.

## 12. Mountain videos (Stage 4)

**[Research]**
- Source to start with: [Van Gestel](https://cycling.vangestel.online/), first-person rides, including Col de Rousset, Col de Menée, Col de Grimone, as MP4 (newer ones in AV1), under CC BY-NC-SA 4.0. Private use fits this, attribution is shown in the app. The files are stored locally, not redistributed.
- Rouvy videos are not usable.
- Still unclear: How well do grade data and picture match? Can the format be read directly? This will be checked in Stage 4 with a real video.
- Own recordings are possible later. Further video sources and music: The user can use their own files or a music app running in parallel; integration of streaming services is not planned. **[Claude decision]**

## 13. Stages

Each stage is rideable on its own. **[User]** for the priority, **[Claude decision]** for the breakdown.

0. **Device test (throwaway check):** First check Hub One and Polar strap without our own code using Auuki in Chrome, then with our own probe program: Bluetooth in its own Electron process, clicker model and buttons. This covers Hub One via FTMS in ERG and grade simulation, Polar strap, clicker buttons, simulated gears on the real device.
1. **Foundation:** Ride service, recording with all acceptance tests from section 4, profiles, manually chosen sessions, movie mode, live improvement, server sync, FIT export. From the start the ride service handles ERG and grade simulation with simulated gears, and rides without video on an elevation profile are possible. That way this protected part does not need rework for Stage 4. **[Claude decision]** If the gears feel bad in the device test, grade is ridden without shifting, and ERG remains the basis.
2. **Coach:** FTP test, plan, sessions, guardrails, post-ride survey.
3. **Comparison and progress:** Views, leaderboard, shared goal.
4. **Fun layer:** Mountain videos, language, motivational videos, each individually switchable off.

## 14. Auuki as a reference

[Auuki](https://github.com/dvmarinoff/Auuki) is an actively maintained open source app (last commit 2026-10-30, AGPL-3.0) with FTMS, ERG, grade simulation, ZWO sessions and FIT recording in the browser. **[Research]**

**[Claude decision]:** Auuki serves as a test tool and reference, not as a foundation. Its architecture depends on the browser, and recovering after a crash has been an open request there since 2022 ([#95](https://github.com/dvmarinoff/Auuki/issues/95)). Both contradict the top rule. The clicker is also still open there ([#181](https://github.com/dvmarinoff/Auuki/issues/181)). If code is taken over, AGPL applies to it. For purely private use this is unproblematic; for a later publication it must be taken into account.

## 15. Left to the builder

- Bluetooth library and storage format, as long as section 4 is met
- Data model, interfaces, test tools
- Interface design within the scope of this document
- Specific model for `claude -p` and guardrail limits according to common training practice
- Type of speech output

## 16. Sources

- [Road.cc Hub One](https://road.cc/content/review/zwift-hub-one-304467), [Correr una Maratón Hub One](https://www.correrunamaraton.com/zwift-hub-one-review-opinion/)
- [DC Rainmaker: Rouvy and Virtual Shifting](https://www.dcrainmaker.com/2025/02/rouvy-adds-zwift-cog-click-ride-virtual-shifting-battle-royale-begins.html)
- [SHIFTR](https://github.com/doudar/SHIFTR), [BikeControl](https://github.com/OpenBikeControl/bikecontrol), [zwift-joypad-android](https://github.com/rainyx/zwift-joypad-android)
- [Auuki](https://github.com/dvmarinoff/Auuki), [zwiftboard](https://github.com/thomaschampagne/zwiftboard)
- [Claude Code: Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance), [Claude Code: Headless](https://code.claude.com/docs/en/headless)
- [Van Gestel Videos](https://cycling.vangestel.online/)
