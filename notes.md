## Vibey development notes

### 2026-03-11

Intro prompt: Hi! I'm building vibey. See please readme.md, then docs/todis.md (philosophy) and docs/ustack.md (libraries). Then use the orchestration convention in prompt.md. For pupeteer, use the global pupeteer, don't install it.

- Please review all the server logs we do and give me their prefixes, I want to unify things but first I need to see what we have. Also explain what the LLM/SSE prefixes really mean.
- I want please the following changes: 1) Change REQ and RES to -RQ and -RS respectively; 2) rename DOCKER to DOCK; 3) when the server sends a message to the LLM, log it as LLM-RQ; 4) when the AI provider responds, mark it with LLM-RS; 5) mark the SSE-RQ and SSE-RS (RQ comes from the client, RS is what goes from the server to the client); 6) All three letter prefixes (SSE and LLM) should be prepended with one space to be aligned with the others.
- Add ISO timestamps.
- Please debug why we see a lot of LLM-RQ and not enough LLM-RS.
- Can you split consecutive tool uses in the client so we can see also at what time they were done? Also add timestamps to user messages.
- Please show the ms on LLM-RS logs.
- Please bold the ms. Also please pick eight colors and paint each of the eight log prefixes so they can be easily spotted. There's overlap, so let's do just four colors, one for DOCK, one for HTTP, one for SSE and one for LLM.
- Can you improve the look and feel of the write file tool, so that new lines are broken down, and we see them as green when they are added? On the client.
- Is there something being batched at the end of a long LLM response? Or maybe we stop streaming data at some point? There's a long delay at the end that seems unjustified. I want everything to be flowing, everything to flow to the .md as soon as we get it, and the client getting the updated chunks. No batches. Please review.
- It's ok to have a docker delay. And it's ok to batch writes to the .md but on the latency. You can have a buffer for everything that arrives between saves. Catch my drift?
- Nice! Please change the prompt to say that agents-now.md should be in the docs folder, so it's user editable.
- Please remove the extra spaces in the diffs between - or + lines.
- Is there any way we can use gotoB's B.diff to do a proper line diff, so we don't see a bunch of - and then a bunch of +s?
- The dropdown for model selection stopped working.
- Please add a section on how to run the tests just above their spec, on readme.md.
- Please fix the frontend tests, first run the fast ones. Then the dialog. Then the static. Then the backend.
- Every time we switch views, refresh what we see: either the list of projects, the list of docs or the list of dialogs. Please first add the assertions to the test suite in readme.md (client only). Then add tests for it, in each relevant suite. Don't run them.
- Now please make those tests by fixing the client.
- When we're streaming tool uses, we don't see timestamps or tokens in/out. Are we getting different data than if we were refreshing the page?
- Why can't we make the SSE and the .md to be equivalent in the data being sent?
- Absolutely, make the SSE emit something indistinguishable from the .md, and let the client reconstruct it.

### 2026-03-10

Intro prompt: Hi! I'm building vibey. See please readme.md, then docs/todis.md (philosophy) and docs/ustack.md (libraries). Then use the orchestration convention in prompt.md. For pupeteer, use the global pupeteer, don't install it.

- When I run the project suite in the client, I get an alert saying "Couldn't load project". Can you detect alerts during the tests and mark them as errors that stop the suite?
- Great! Can you please add a general "alert detection" to all client tests?
- Dialog is not fast. Fast is all but dialog, static and backend. Can you check the definition?
- I notice that going from pending to done takes a while sometimes. Is this because of git delays?
- Remove the pfs.exists checks.
- Please remove the redundant call to findDialogName. Also make the git command atomic, but ensure we don't create commits on empty changes.
- Nice! Can you now take the dialog tests and make sure that the client tests are aligned with the server tests and with the spec? Just make sure there are no teeth missing from the client tests concerning dialogs.
- When you're done, run the tests for dialog in the client. Also you can run the server ones too, one of them failed with 409 vs 200 expected. Just the dialog ones. You can rebuild vibey if you need to.
- Can you now check alignment of the client tests with respect to spec/server tests for the static suite?
- These sleeps are way too long. Why so long? Please shorten them, also you can then read the .mds to see what the LLMs actually called.
- Please add a "Vibeying" moving gauge at the bottom of an active dialog.
- Can you make it like that sequence that goes /-\| ?
- Server log improvements: log when chunks are obtained from LLM to server, not the chunks themselves, just that we get them. Also log separately that chunks are being sent to client.
- More server log improvements: all docker commands being sent (and when they're done too), almost like they were requests. Can you scope them by project too?
- Please get rid of the dialog-status ad-hoc logs
- Why so many of these? docker exec vibey-proj-dialog-20260310-202350-67449 mkdir -p '/workspace/doc'
- Run the fast server suite yourself and detect unnecessary round trips please
- Remove ensureProjectLayout from getExistingProject, just initialize the folders on project creation. Keep mkdir -p on writeFile so it's always there in case of rm -rf, it's no extra round trip either. As for running commands, first run them and if the container is not there, then ensure that it is there with the function. If you check something, you're already doing a roundtrip. Let the actual code handle it, and if there's nothing, then you return a 404.
- Those functions can take a rs (response) and if there's no project, respond with a 404 directly. Make them return a false and then the outer function checks for a false value, and if it gets one, it returns too.
```
Please do this in the server

 Performance: eliminate unnecessary docker round trips

 ### Context

  Every API request currently does 2 docker calls to check if the project container exists/is running, plus 3 mkdir -p calls to ensure doc/, dialog/,
 uploads/
   dirs exist. That's 5 extra docker execs (~250ms) before any actual work happens. The test suite logs show this clearly — every request has the same ps
 -aq,
  ps -q, mkdir doc, mkdir dialog, mkdir uploads preamble.

 ### Changes

 1. Remove ensureProjectLayout from getExistingProject

  In server.js, getExistingProject calls ensureProjectLayout which does 3 mkdir -p docker execs on every request. Remove that call. ensureProjectLayout
 should
  only be called from ensureProject (project creation / snapshot restore). The dirs live on the volume and survive container recreation.

 2. Replace optimistic existence checks with try-and-recover

  Currently resolveProject → getExistingProject → projectExists (1 docker call) → ensureProjectContainer (1-2 more docker calls) runs before any actual work.
  Instead:

 - Remove getExistingProject, projectExists, containerExists, containerRunning, and resolveProject as gatekeepers.
 - Let the actual pfs.* / dockerExec calls run directly. If the container doesn't exist, docker returns an error.
 - Write a single recovery function: when a docker exec fails with "no such container", call ensureProjectContainer to create/start it, then retry the
  original operation once. If it fails again or the volume doesn't exist either, return false and let the caller return (the function will have already sent
 a
  404 on rs).
 - The pfs functions and dockerExec should accept rs as a parameter. On unrecoverable failure (no volume = no project), they write a 404 to rs and return
  false. The calling route handler checks for false and returns early.

  This makes the happy path (container running) zero extra docker calls — just the actual work. First access after restart pays one retry.

 3. Keep mkdir -p in writeFile / appendFile

  The mkdir -p <dir> && cat > <file> pattern in writeFile and appendFile stays — it's already folded into a single docker exec so it's no extra round trip,
  and it handles edge cases like an agent doing rm -rf.

 4. Remove synchronous execSync at startup

  cleanupProjectContainers uses execSync. Make it async — it runs at server startup and there's no reason to block the event loop.

 ### How to verify

  Run node test-server fast and check the docker logs. The ps -aq, ps -q, and per-request mkdir calls should be gone. Each API request should show only the
  docker execs for its actual work (cat, find, stat, etc.), plus one recovery round trip on first access after restart.
```
- Please make those extra folds on the calls. Also batch the mtimes.
- Let's please now make server logs more unified: remove the "----" lines; make the docker calls be DOCKER REQUEST, with an id like the ones on HTTP REQ/RES, and an OK/FAILED with color. Make the docker logs have almost the same info as the HTTP calls. Also same for the SSE streams received from the LLM and sent to the client.
- Amazing. Please remove the project= prefix on the docker logs. Also put padding space to the left of "HTTP" and "SSE" so that it aligns with the DOCKER logs. Also shorten REQUEST to REQ and RESPONSE to RES
- Briliant! Now please run and fix the dialog test.

- Dialog concurrency issue: make `PUT /project/:project/dialog` first-come-first-served **per dialog**. If two requests try to continue/start the same dialog concurrently, the first one should win and the other should get **409** instead of racing on dialog file renames. Start with modifying the dialog suite in readme.md, then in test-server.
- Another agent is working on the server. Could you come up with a patch for fixing the above, but not implement it yet?
- Can you modify the client so that slug names are shown prettily? Everywhere except the url, I think
- Instead, port the deslugger function to the client and just use it

- Let's reorganize the state variables in the client. Look at the list in readme.md. Take the oauth ones and put them under an object oauth, with three entries inside.
- Please add the details on the nested oauths on the table, i want it all.
- Can you remove the falsy/null inits in initialize? They are not necessary. If nothing is there, we default to undefined. dale.go calls can take undefined and won't iterate.
- All the variables named chat..., I'm almost certain they concern dialogs. Please put them inside a dialog object. Including the voice ones. First the docs, then client.js.

- When the client doesn't have the vibeying section, can you add one that says Ready in green, and takes up the same space, and has a cursor appearing and disappearing (a `_`), so that the bottom doesn't move up or down?

===

Something that perhaps is still quite rare: have agents working on the background with your computer locked or turned off. vibey cloud would be really cloud based, so it's always running.
Vibey cloud has two advantages over the local. These would be 4. and 5.
- Always running
- Accessible from any machine, by you or whoever you share the project with.


Who would be interested in using vibey?
claude:
"People who think in text and want to build things without learning to code.

 - Writers, academics, humanities people who have ideas for tools, games, or small apps but hit a wall at the terminal. Your readme calls them out directly:
 "students of humanities stranded in the digital age."
 - Designers and product thinkers who can describe what they want clearly but don't want to context-switch into an IDE.
 - Solo founders / non-technical entrepreneurs who want to prototype something quickly — describe it, let agents build it, see it running in your browser.
 - Teachers who want to create interactive learning materials without a dev team.
 - Developers who are tired of scaffolding — sometimes you just want to say "build me a tictactoe game with React" and have it running in 30 seconds, embedded right in your notes.

 The common thread: people who are articulate and have clear ideas, but for whom the toolchain is the bottleneck, not the thinking. Vibey turns prose into working software, and keeps everything legible as text — no black boxes."

I just realized that the structure of gotoB state is the equivalent of the DB structure but on the frontend. The data at rest! The endpoints would be the rfuns, or perhaps the rfuns are the POST/PUT endpoints and the views are the GET endpoints. Yep, that's more like it:
- Store <-> DB
- rfuns <-> POST/PUT/DELETE endpoints
- vfuns <-> GET endpoints

Perhaps there could be a way to share your vibey as a static page so that people can use your app without logging in, as long as it requires minimal state that can be stored in localstorage.

### 2026-03-09

Intro prompt: Hi! I'm building vibey. See please readme.md, then docs/todis.md (philosophy) and docs/ustack.md (libraries). Then use the orchestration convention in prompt.md. For pupeteer, use the global pupeteer, don't install it.

These dialog tests take too long. Also, when I refresh the page on a dialog that just started, I don't get the page served until the dialog finishes. Could you please research these issues by inspecting the code? Vibey is running, you can rebuild it if youwant.

- Please move the execSync to exec.
- Please investigate the slow tests. Add logs to see if the slow thing is really the LLM provider, or there's something else making things uber-slow.

- Great! Please now, on the server tests, add a fast flag that includes every suite that's not the last three. Make the inclusion explicit, rather than excluding the slow ones.
- Dialog test steps 10, 16, 18 and 24 take forever (2 minutes each except for 24 which is about 30s). Can you add continuous logs to those tests to see what's going on? Just start with 10. Let's see if it's true LLM slowness or there's something else at play.
- Is there anything we could do to change the prompts without weakinging at all the tests?
- Don't we need any of the tests to take "longer", so we can cancel the dialog?

- Without restarting vibey yet, can you make the server logs much leaner, in that we should print incoming req and res without headers or bodies? Check how cicek allows to configure this.
- Great! Another one: in the client, when the agent is streaming text, if I refresh midstream, I still see the stream but what was before the refresh is cut into a separate message. Why is this?

- Nice. Now, the client is a bit of a mess: a lot of redraws, a lot of state variables, vfuns that are constantly redrawn. Let's clean this up by making  a list of state variables (those that go in gotoB state) and sort them alphabetically. Also make a list of timeouts or intervals, because most of them are suspect and can probably be refactored. Let's start by looking at what we have rather than fixing willy-nilly.

- Please rename all flowN (where N is a number) names on the tests for the server. Instead use the actual names of the suites.
- Please rename all flowN (where N is a number) names on the tests for the client.

### 2026-03-07

Intro prompt: Hi! I'm building vibey. See please readme.md, then docs/todis.md (philosophy) and docs/ustack.md (libraries). Then use the orchestration convention in prompt.md. For pupeteer, use the global pupeteer, don't install it.


- Goal: Have an endpoint that gives you SSE streaming of the dialog that's independent of the POST. Be able to tap into dialog streams instead of just getting the files, so we can refresh the page. Change the spec, the tests in readme.md, then the actual tests.
 Design sketch:
 1. POST /project/:p/dialog
     - Start the dialog asynchronously.
     - Return JSON immediately: {dialogId, filename, status:"active"}.
     - No SSE on POST.
 2. GET /project/:p/dialog/:id/stream (SSE)
     - If dialog is active, stream live chunks/tool events.
     - If dialog is done, either:
           - return 204, or
           - immediately send a done event and close.
 3. GET /project/:p/dialog/:id
     - Always returns the current markdown from disk.
 4. Client behavior
     - When opening a dialog, call GET /dialog/:id.
     - If status is active, open GET /dialog/:id/stream to follow live output.
     - On reconnect (refresh), you re-read the file and optionally reattach to stream.

- Let's start by modifying readme.md to document this.
- Please now edit the test suite for the server.
- Please now implement the server.
- Please run that suite in the server and see if it works.
- Please now change the client.


- Let's get the test-client tests aligned with the flows documented in readme.md, 1:1, and passing. Let's take the first suite and check it. When it looks aligned, you can run it. If you modify test-client.js, you need to copy it straight into the vibey container to avoid having to do a restart on it, since another agent is working on other parts.
- Please do the same thing for the doc flow.
- Time to do the same for the upload flow!
- Onwards! Time to do the same for snapshot.
- Can you remove autogit from the client tests, if it is there?
- Now a big one. Let's do dialog.

### 2026-03-06

- Refreshing the page on an active dialog makes it able for you to talk to it, which shouldn't be the case. Or opening a new tab on an active dialog, same thing. Is the dialog going on safely? The client should look up the status statelessly.
- Merge flow 3 into flow 1.
- Rename flow 8 to flow 3.
- Please read the .md for the test suites and add tests there that test special characters in the creation. Also add tests in dialog to check that the status changes from active to done whenever we expect a switch.
- Perfect. Now please put names on the suites on test-server, and remove any numberings from tags. Make the runner take the suites in the order they are presented in the readme.
- Please implement the project flow in test-server. You can re-build/re-run vibey and run that particular flow until it works.
- Now take the description of the dialog suite in readme.md and make it into a coherent sequence of linear steps: checking for the statuses after each action, doing the action-safety check while the dialog is already active, etc.
- Brilliant. Now reimplement the dialog flow with 1:1 on test-server.
- Great work. Now review the actual backend tests for docs and see if 100% of that is in the readme.md description. Then, add numberings to the .md, then to the .js, then run that suite.
- Let's proceed with the upload suite. Please review what's implemented in test-server for that suite to see if there's something mentioned there not mentioned in the .md. Then number the entries in the .md, following the style of previous flows documented (if you can think of something else to test, also add it). Then ensure that the .js is 1:1 with the .md. You can run that flow. Only in test-server.
- Let's proceed with the snapshot test suite. First, read it from readme.md. Please review what's implemented in test-server for that suite. If there are good tests in the implementation that are not in the .md, add them to the .md. Then, number the .md tests like we do for suites above. Then ensure that the .js implements every test in the .md, maintaining 1:1 with the .md. You can fix the server if necessary and restart docker. Please run the flow. Ignore client tests for now.
- Let's proceed with the autogit test suite. First, read it from readme.md. Please review what's implemented in test-server for that suite. If there are good tests in the implementation that are not in the .md, add them to the .md. Then, number the .md tests like we do for suites above. Then ensure that the .js implements every test in the .md, maintaining 1:1 with the .md. You can fix the server if necessary and restart docker. Please run the flow. Ignore client tests for now.

- We're refactoring the tests. readme.md and test-server.js is quite ahead of test-client.js. Please take the first flow (project) and see if there are client-specific tests that are not in readme.md or test-server.js yet.
- Great! Now make sure the client tests for the project flow matches 1:1 the readme.md, and that it passes.


- Now make a single suite of dialog tests (currently it's splitted) in test-server.
- Brilliant. Let's move on to the next suite, doc: qualify readme.md with client-specific assertions.
- Brilliant. Let's move on to the next suite, upload: qualify readme.md with client-specific assertions.


- Please review the backend for bugs. If you find something, don't fix it. Spot it, then see if we have a test for it. Then report back.

- Now take the description of the snapshot tests and add the - client entries, taking inspiration from what we already test in test-client. We already did this for previous suites.

Intro prompt: Hi! I'm building vibey. See please readme.md, then server.js and client.js, then docs/todis.md (philosophy) and docs/ustack.md (libraries). Then use the orchestration convention in prompt.md. For pupeteer, use the global pupeteer, don't install it.

### 2026-03-05

https://acko.net/blog/the-l-in-llm-stands-for-lying/
"The solution to the LLM conundrum is then as obvious as it is elusive: the only way to separate the gold from the slop is for LLMs to perform correct source attribution along with inference.

This wouldn't just help with the artistic side of things. It would also reveal how much vibe code is merely just copy/pasted from an existing codebase, while conveniently omitting the original author, license and link."

Prompts:

Hi! I'm building vibey. See please readme.md, then server.js and client.js, then docs/todis.md (philosophy) and docs/ustack.md (libraries). When you start a task, first read agents-now.md if it exists (if it doesn't, you'll create it in a moment). Then pick a name for yourself (a whimsical noun), then update agents-now.md and put your name, what you're doing and what files are you touching, so that no other agent touches them. If an agent is already working on those files, ask me on how to proceed. If you have no conflict, push on but note what you're changing. When you're done editing the files, remove your entry.

- Remove git from dialog, why is it a tool?
- Break newlines in output of tools: hide id, nice name of command, also input, then output should be separated in lines, that auto hidden and can be shown. From the client.
- Store which model responded, to be able to remember it on the dropdown after page refresh, and also if you switch, you know which was the previous one. Also display it at the bottom after getting the answer.
- When deleting project, tells you can't delete project but it still deletes it.
- Can you add red/green to the - + lines of the edit tool, on the dialog?
- I don't see the dialog turning purple when it's working.
- Please comment out flows 4 and 5 and try (without restarting vibey) to write a flow 4 that does the same but uses a static react to see if this will make the test much faster while testing essentially the same thing.
- No, that's not the point! The point is to have an agent build the static app! You're gaming it. Make the agent build the app.
- Please remove the 20 round limit on tool calls.
- I cannot name files with spaces in them (or other special characters, I presume). And when I do that on a dialog, I get dashes instead of spaces. Why do we have restrictions on characters? The only thing we cannot allow (I think) is two dots next to each other, or perhaps slashes too.
- Refreshing the page on an active dialog stops the agent?
- Instead of just something purple, could we make it "spinny" so we obviously see that the agent is at work? Sometimes there are pauses.
- I notice the agents inside vibey don't use rg, they use grep. Is it missing from the docker sandbox image?
- I notice an agent inside vibey taking a long time to complete a simple task. Why is this? Is perhaps the system prompt for vibey not as powerful enough sa what we have here in pi?


A historical prompt-in-vibey:
- Let's swing for the fences. Can you run the analysis on the savegame we have and put the output in a doc?


### 2026-03-04

Hi! I'm building vibey. See please readme.md, then server.js and client.js, then docs/todis.md (philosophy) and docs/ustack.md (libraries). When you start a task, first read agents-now.md if it exists (if it doesn't, you'll create it in a moment). Then pick a name for yourself (a whimsical noun), then update agents-now.md and put your name, what you're doing and what files are you touching, so that no other agent touches them. If an agent is already working on those files, ask me on how to proceed. If you have no conflict, push on but note what you're changing. When you're done editing the files, remove your entry.

- Can you make the settings so that they have a main section that only has the openai/anthropic subs and then a More button that shows the api keys and the vi mode?
- Great! Now please improve how the output of tools look. It looks very messy right now, with stdout, stderr. It used to look nicer too, maybe there's some dead code.
- Looks great! For the write file, do we store what we write in the md or not?
- Can you show a bit of it then with the chance to expand more?
- Looks great. Can you make it so that the red applies only to lines starting with "-" *only in diffs* and not in normal text?
- Please make the provider/model dropdown to be unified into one with four options instead of two with two.
- Can you refactor the views so that we always have the dialogs and the docs drawn in the background, and we just show/hide it? It's just for performance.
- That didn't work. The expensive thing is building the view, I think.
- WHen switching views between files and dialogs, sometimes the interface toggles back on its own. Why?

- When there's no LLM connections, don't allow to start new dialogs and put a warning that you must configure it.

### 2026-03-03

Hi! I'm building vibey. See please readme.md, then server.js and client.js, then docs/todis.md (philosophy) and docs/ustack.md (libraries).

- The frontend is all over the place. Things get refreshed and I lose state. Let's start by making sure that the backend tests run well. Please start vibey, then run the backend tests. If you need to fix something in vibey, stop and let me know what it is first.
- Please inspect the dialogs to see what went wrong.
- Do you think the agent got stuck?
- Restart vibey and try it again, just that flow.
- Kill the process and run all the other flows except 4 & 5.
- Change the prompt in the test for both backend and frontend to tell it to read it once and start working. Also for flow 5.
- Run 4 again please and poll every 1-2 minutes yourself. BTW, we have continuous polling on our test suite, right?

- An agent finished fixing all the server tests. Can you run the client tests now? Run flow by flow. Please rebuild and rerun vibey if you need to. If you see something broken in vibey (not the test), stop and report. Also, please switch the tests to use openai, not anthropic.
- Great! Now see the changes done in test-server and see if we can take some of that pixie dust onto the client ones, to make 4 pass.
- If the test failed, go and inspect the dialog directly, with timestamps, to see why we got stuck at the start/non blocking. Don't assume, verify.
- Let's eliminate the waiting state completely, it's silly. The LLM is either going or not. We no longer wait for authorizations. Please remove it from the docs, the server, the client and the tests.

### 2026-03-02

- OK, now please make the view in dialogs not redraw completely when we get a fresh dialog. I lose the state of the box where I write.You can just redraw the part of the dialog that shows the history.

### 2026-03-01

Hi! I'm building vibey. See please readme.md, then server.js and client.js, then docs/todis.md (philosophy) and docs/ustack.md (libraries).

- Can you debug why the client doesn't auto-update the dialog? I have to refresh the page when the agent is working.
- Please now use the global pupeteer (do not install pupeteer, it's already there) to just run flow 6, vi, and debug why it doesn't work. Focus on simplifying the code.

### civ2 analytics schema

Tables
- turn Hash
- civilizations List (each item is a civ row)
- units List (each item is a unit row)
- tiles List (each item is a tile row)
- cities List (each item is a city row)

Table: turn (one Hash per save/turn)
- save_path Text
- save_sha256 Text (optional)
- savtype Text (classic|fantastic|MGE|tot1.0|tot1.1)
- turn_elapsed Number (raw counter)
- display_total Number (raw counter)
- display_year Number (best‑effort; may be null/omitted for scenarios)
- display_month Number (1–12; may be null/omitted)
- difficulty Text
- barbarian_activity Text
- scenario_flag Number (0/1)
- reveal_map Number (0/1)
- unit_selected_on_start Number
- visible_map_civ_slot Number
- visible_map_civ_name Text
- player_civ_number_used Number
- alive_players_mask Number (bitmask)
- alive_players_names List of Text (expanded from mask)
- human_players_mask Number (bitmask)
- human_players_names List of Text (expanded from mask)
- current_pollution Number
- global_temp_raises Number
- turns_of_peace Number
- map_width Number
- map_height Number
- tiles_expected Number (width*height)
- n_units Number
- options_play Hash
  - bloodlust 0/1
  - simplified_combat 0/1
  - world_type Text (flat|round)
  - dont_restart_eliminated 0/1
- options_game Hash
  - move_units_without_mouse 0/1
  - enter_closes_city_screen 0/1
  - map_grid 0/1
  - sound_effects 0/1
  - music 0/1
  - cheat_menu 0/1
  - always_wait_end_of_turn 0/1
  - autosave 0/1
  - show_enemy_moves 0/1
  - no_pause_after_enemy_moves 0/1
  - fast_piece_slide 0/1
  - instant_advice 0/1
  - tutorial_help 0/1
- options_graphic Hash
  - animated_heralds 0/1
  - high_council 0/1
  - civilopedia_for_advances 0/1
  - throne_room_graphics 0/1
  - diplomacy_screen_graphics 0/1
  - wonder_movies 0/1
- options_report Hash
  - announce_love_the_day 0/1
  - warn_when_food_low 0/1
  - announce_disorder 0/1
  - announce_order_restored 0/1
  - show_non_combat_units_built 0/1
  - show_invalid_build_instructions 0/1
  - warn_when_city_growth_halted 0/1
  - show_city_improvements_built 0/1
  - zoom_to_city_not_default_option 0/1
  - warn_when_new_pollution_occurs 0/1
  - warn_when_changing_production_will_cost_shields 0/1
- wonders Hash (optional but cheap, global state)
  - The Pyramids Text (owner civ name | Destroyed | Not Built | city id if you prefer)
  - … all 28 wonders
- tech_first_discovered_by Hash (tech name -> civ name Text)
- tech_discovered_by Hash of Lists (tech name -> List of civ names)

Table: civilization (List; one Hash per civ slot 0..7)
- civ_slot Number (0=Barbarian)
- civ_name Text
- leader_name Text
- is_human 0/1
- is_alive 0/1
- treasury Number
- science_rate Number (0..100)
- tax_rate Number (0..100)
- luxury_rate Number (0..100)
- government Text
- reputation Text
- researching_name Text (or None)
- research_progress Number
- acquired_techs Number
- acquired_future_techs Number
- military_demographics Number
- sum_of_city_sizes Number
- units_active_total Number
- units_casualties_total Number
- units_producing_total Number
- units_active_by_type Hash (unit name -> Number)
- units_casualties_by_type Hash (unit name -> Number)
- units_producing_by_type Hash (unit name -> Number)

Table: unit (List; one Hash per unit record)
- unit_id Number (sequential as read)
- owner_civ_slot Number
- owner_civ_name Text
- type_id Number (as in save)
- type_name Text
- lat Number
- long Number
- veteran 0/1
- hitpoints_lost Number
- home_city_id Number (255/None → omit or set -1)
- home_city_name Text (if resolvable; else empty)
- goto_lat Number (omit if none)
- goto_long Number (omit if none)
- record_size Number (26 or 32; useful QA)
- savtype Text (copy for convenience)

Table: tile (List; one Hash per map tile)
- tile_index Number (row*width + col)
- lat Number (row)
- long Number (map long)
- col Number (derived from long if useful)
- row Number (alias of lat)
- terrain_id Number
- terrain_name Text (Desert..Ocean)
- river 0/1
- irrigation 0/1
- farmland 0/1
- mining 0/1
- road 0/1
- railroad 0/1
- pollution 0/1
- city_present 0/1
- fortress 0/1
- airbase 0/1
- unit_present 0/1
- owner_civ_slot Number (omit if none)
- owner_civ_name Text (omit if none)
- city_radius_owner_civ_slot Number (omit if none)
- city_radius_owner_civ_name Text (omit if none)
- land_sea_body_counter Number
- discovered_by_mask Number
- discovered_by_names List of Text

Note: If/when we enable per‑civ “as seen by” flags, we’ll add:
- seen_by Hash where key is civ_name and value is a Hash of flags seen (unit/road/rail/irrigation/farmland/fortress/airbase/city/pollution).

Table: city (List; one Hash per city)
- city_id Number (sequential as read)
- owner_civ_slot Number
- owner_civ_name Text
- name Text
- lat Number
- long Number
- size Number
- food_box Number
- shields_box Number
- base_trade Number
- total_trade Number
- science Number
- tax Number
- food Number
- shields Number
- happy Number
- unhappy Number
- coastal 0/1
- love_king 0/1
- disorder 0/1
- workers_inner Number
- workers_outer1 Number
- workers_outer2 Number
- improvements_count Number
- producing_code Text (raw hex or id)
- producing_name Text (if we decode; otherwise mirror code)
- specialists_dist Text (raw bitfield if helpful)
- specialists_q Number (raw value)

If you want, I can extend the fourdata schema right away with:
- diplomacy (treaties, attitudes),
- per‑civ tile visibility,
- city_improvements (list),
- city_trade_routes (list with partner city id and value),
- unit_status (activity/orders/moves),
- tile_special (bonus/hut),
- plus scenario_file and cheat_penalty under turn.options.

### 2026-02-26

https://lucumr.pocoo.org/2026/2/9/a-language-for-agents/
"Now though, we are slowly getting to the point where facts matter more, because you can actually measure what works by seeing how well agents perform with it. No human wants to be subject to surveys, but agents don’t care. We can see how successful they are and where they are struggling."

Prompt:
I want to make a website. The website should be written in lith/litc and when run, it should output static html with the css inside. I want the website to contain the intro to vibey (the big four plus bring your own inference). Installation instructions that are easily copiable. Please start.

### 2026-02-25

http://www.incompleteideas.net/IncIdeas/BitterLesson.html
"One thing that should be learned from the bitter lesson is the great power of general purpose methods, of methods that continue to scale with increased computation even as the available computation becomes very great. The two methods that seem to scale arbitrarily in this way are search and learning."

https://en.wikipedia.org/wiki/Richard_S._Sutton#Reinforcement_learning
"Sutton argues that large language models aren’t capable of learning on-the-job, and so new model architectures are required to enable continual learning.[25][non-primary source needed] Sutton further argues that a special training phase will be unnecessary — the agent will learn on-the-fly, rendering large language models obsolete.[25]"

Hi! I'm building vibey. See please readme.md, then server.js and client.js, then docs/todis.md (philosophy) and docs/ustack.md (libraries).

- Can you implement vi mode in client? No other agent will touch it. The details are in the corresponding TODO in readme.md.
- Amazing. Can you make the change on the server for /settings too? And document the vi mode in readme.md and remove (or repurpose) the vi TODO section?
---
- Can you implement snapshots? Don't touch client.js yet, just the server.
   - Snapshots are stored inside the vibey container, in its data volume.
   - Restoring a snapshot creates a new project with those files.
   - We have a snapshots view.
- Great! Can you modify readme.md accordingly? Especially with endpoint info.
- Perfct. Now you can modify the client to include snapshot support.
---
- Can you review the latest changes that are not committed? Don't modify any files. Just review the changes and see if they look good to you or not.
---
- Move the CSS to a different file: client-css.js; keep the litc format.
- Remove the dialog- and doc- convention and instead use dedicated folders for that on each project (dialog/, doc/). Also remove the "must end with .md" from the client. Please autocreate these folders on project creation, and modify prompt.md to let the agents know about these folders, which they can read if they need to. Do it everywhere including tests except for client.js.
- Please implement but do not run these server tests, using the existing style and conventions:
   - Add a flow 5 that requires a backend in another container. A tictactoe like that of flow 4 that is served through a port, also embedded.
   - Flow 6 for testing vi.
   - Flow 7 for testing snapshot mode.
---
- Fantastic! Now extrapolate the tests to the client tests, with the same approach. Uncomment any commented tests on the client tests. Don't run anything yet.
---
- You can now run vibey, run it dockerized as per the instructions. Then, start running the server tests, flow by flow, until they all work. Don't skip flows, focus on getting each flow done. If you have to fix something in the server, fix it, but don't change major behaviors; if you hit a significant doubt on intent/behavior, stop and ask.
---
Can you please document flows 5, 6 and 7 in readme.md? Add a bit more level of detail too to 1-4. your source of truth is the server tests. Don't modify any other files.
---
- You can now run vibey, run it dockerized as per the instructions. Then, start running the client tests until they all work. Use the global pupeteer. Don't skip flows, focus on getting each flow done. If you have to fix something in the server or client, fix it, but don't change major behaviors; if you hit a significant doubt on intent/behavior, stop and ask. You open localhost:5353 and then click on the Test button
- Can you change the tests so that they stream the console logs onto pupeteer so we can both see what's going on?
---
 Can you change the tests so that we can run just one passing a parameter? ANd uncomment them? And ask in client.js with a modal what do I want to run with ALL set as default in the prompt to run all?
- Great! Please now hide the test button unless there's a setting in secret.json that says testButton: true

New prompt:

Hi! I'm building vibey. See please readme.md, then server.js and client.js, then docs/todis.md (philosophy) and docs/ustack.md (libraries). When you start a task, first read agents-now.md if it exists (if it doesn't, you'll create it in a moment). Then pick a name for yourself (a whimsical noun), then update agents-now.md and put your name, what you're doing and what files are you touching, so that no other agent touches them. If an agent is already working on those files, ask me on how to proceed. If you have no conflict, push on but note what you're changing. When you're done editing the files, remove your entry.

- The vi cursor is not visible, can you fix that?
- The vi cursor is still not visible, can you fix that?
- It now works, this is cool! The jumping to edit with i and o is a bit flaky, sometimes you land on the wrong line. Can you debug with the client, making more thorough tests and then running just that flow with pupeteer?
---
- upload files into uploads/ show them at the bottom of the docs on the sidebar always visible (if you have any), if you click on it if it's media you show it, otherwise you just show some metadata as text; add docs, endpoints, client support and a test flow.
Brilliant! Can you add the tests please?
- I don't see a button for adding an upload, where is this?
- Great! Can you add support for spaces in files? Whatever we upload, it should be possible. Also enable multiselect to upload several files.
- My bad, the UX is bad. We need to create the image for sandbox on install so creating the project is instant.
---
Can you add the tests for flow 8 in test-server? Unless they're already there.
---
Let's think how we can help others install vibey locally. The only requirement is that they should have docker installed already, nothing else. I'm thinking of a curl command that can take the latest release from github, download it, untar it and put it in their Downloads folder. Thoughts?

### 2026-02-24

Hi! I'm building vibey. See please readme.md, then server.js and client.js, then docs/todis.md (philosophy) and docs/ustack.md (libraries).

### Prompts

- New architecture:
   - Vibey runs on its own docker
   - Each project, even ones with static files, have their own docker, with a port assigned to them by vibey. Also their own data volume.
   - Vibey reads files on the dockers of the projects to create the list of docs & dialogs
   - The beginning prompt to each agent includes the port number of the outside, to use in embeddings.
- Please review this idea and comment.
- I disagree. I want that if an agent goes rogue in a project, the blast radius is completely limited to that project.
- Please make the changes to the readme.md first to document this architecture, and mark it as [TO IMPLEMENT]
- Please remove in the readme any mention of docker mode. It's always going to be dockerized.
- Please now implement the changes on the server.
- Excellent! Do the tests or the client need changes?
- Can you debug the server tests? vibey is running.
- Please take all timestamps used in the snapshots and tests and make them into YYYYMMDD-ddmmss
- In the tests of flow 4, there are still references to flow 3 in the variable names. Can you fix that?
---
- I have a failure in the client tests at step f2-4: click main.md: textarea not found
- We're getting to the point. I want to see the file when I land, not edit it. It's just not showing anything. But if I refresh, it does show.
- Why do we have a timeout?
- We need the opaque. That should remain. If you need to render stuff there, you can do it with a responder that has priority of 1 and above. Sorry, -1000 and below.
- <div id="editor-preview-pane" class="editor-preview" opaque="true"></div>
  Still empty
- Still didn't work. Can you fire up client.js and click on that green button using pupeteer?
- If you figure out a more elegant approach, go for it. You're looking at the events, which gives you the key.
- Well done! Can you debug this now? Open it in pupeteer too: http://localhost:5353/project/flow3-20260224-203513-86607/static/
- You fixed it! Can you adjust the instructions on flow 4 of the server test? Make it minimal, just the errors.
- Can you take all the server tests and make sure that the same instructions and approach is used on the client tests? Also, the variable numbers on each flow should match the step (3 and 4 are sometimes crossed over). Just change the client tests please.


- Well done! Can you explain how the static proxying works now that everything's containerized?
- On creating a project, can you 1) allow arbitrary names with uppercase and symbols, or are we restricted by docker container names? 2) can you autocreate a minimal main.md that says "# <project name>"
- Can you base64 encode any non-alphanumeric characters and use a delimiter of sorts, so that the names are still readable?
- No trimming. Any string should generate a valid slug.
- Great! But don't we need to un-slugify when we're reading the projects?

====

https://antirez.com/news/158
"It is simply impossible not to see the reality of what is happening. Writing code is no longer needed for the most part. It is now a lot more interesting to understand what to do, and how to do it (and, about this second part, LLMs are great partners, too). It does not matter if AI companies will not be able to get their money back and the stock market will crash. All that is irrelevant, in the long run. It does not matter if this or the other CEO of some unicorn is telling you something that is off putting, or absurd. Programming changed forever, anyway."

### 2026-02-23

Idea for reading file tool: read multiple files at the same time, to avoid several round trips/messages.

Hi! I'm building vibey. See please readme.md, then server.js and client.js, then docs/todis.md (philosophy) and docs/ustack.md (libraries).

Prompt:
- How do I start vibey, dockerized? Please put it on an usage section at the top of readme.md.
- Please remove ALL authorizations, including in the settings. We're going to be YOLO by default.
- Sorry, I mean: remove all mentions or functionality concerning authorization from server.js. It won't even be an option.
- Please remove ALL notion of authorizing an agent's command. It will be YOLO by design. Just do this on client.js, another agent is doing the rest.
- Please remove ALL notion of authorizing an agent's command. It will be YOLO by design. Just do this on the tests.js, another agent is doing this on the server/client.
- Please remove ALL notion of authorizing an agent's command. It will be YOLO by design. Just do this on readme.md.
- To replace schwas, first add instead a SCHWA-SCHWA-SCHWA placeholder in your write function, then do a little grep to fix it as a second step.
- You didn't get me at all. Wherever you want to add three schwas, just add a silly placeholder. Finishing editing the file, then grep with replacement to fix the placeholders.
- Brilliant. There are still mentions of YOLO in server, client and tests. Except for the docs, there should be no mention of this. Can you clean it up please? I don't mean the oauth or api keys, just the authorization of tool uses.
- Fantastic. Can you change the tests (server & client) to use the new docs at docs/ustack.md?
- This is great! Now, can you make the agents reference https://github.com/fpereiro/ustack/blob/master/llms.md in test flow 4 for server and client?
- Is that a good link to retrieve? can you try to curl it yourself?

- Could you fix something in the client? When I see a doc, in view mode, I see nothing. When I go to edit, I do see it, and when I go back to view, it works.


### 2026-02-20

flexible and unreliable -> reliable while still flexible (software in the past; LLMs now)
what's the vibe? what am I doing with vibey?

Dialogs as documents that are append-only.

Deeds as things that are not docs. perhaps these are blobs. some of them executable. But they're not all blobs, many are also text, though not a document.

Architecture: I can have a single vibey server dockerized per server. what should I call it instead of server? Perhaps machine? Gear? Or engine? "Engine" sounds good. It brings the vibe of those who worked on cars before. It feels like "gear", while server is much drier and scarier. "Now that's a big engine".

- Add embeddings. Embed a view of an app in a document.
- Add audio. Be able to talk to an agent, and listen it back.

Demos: make me something interactive to learn chess.

Prompts:
Main: Hi! I'm building vibey. See please readme.md, then server.js and client.js, then docs/hitit.md (backend tests) and docs/gotoB.md (frontend framework).
- Can you invert test flows 3 and 4? Both in the server test and the client test.
---
- Now I want to tackle a core feature: embeddings. I want to be able to embed a local app fro athat project into the doc of the project. This requires a proxy through the vibey server, plus showing things like an iframe. Let's please design the server part first, including how this would look in the markdown.
- This is just gorgeous. Please add the docs about this to the relevant section of readme.md, probably above the TODO. Ignore vibey cloud for now, just focus on local. BTW, I think it's crazy reasonable to have one port & path per embed.
- Brilliant. Please implement the server part.
- You got it. Go for the client.
- Rather than HTML strings, can you use lith?
- Amazing. I think you need to wrap the iframe into an opaque pseudo-tag so that gotob doesn't use its elements to redraw things.
- If I ask the agent to embed the game in main.md, will it know how to do that?
- Brilliant. Add it to prompt.md.
----
- I'm working on embeddings. It all seems quite ready, except that I see in the client something like this:
```
əəəembed
port 4000
title Tic Tac Toe
height 520
əəə
```
  Do we have already code to actually show the embedding properly? Would this be outside of the textarea of the doc? How would this "split" the textarea in t he middle?
- My bad. I don't want it on editing mode. I switched and it now looks like this:
Do NOT skip the launch_agent call. Do NOT call launch_agent more than once for the same slug. Create each file with a separate write_file call.
Authorized: run_command Authorized: write_file Authorized: edit_file Authorized: launch_agent
- Holy Moly, it works! Can you fix the "Preview" button and logic so that when we are editing, the button says "View", and when you're in View mode, the button says "Edit"?
- Can you kill what's on port 4000 now and take the latest tictactoe project completed and start that one?
- No worries about that, just kill port 4000. Then make View mode the default, with Edit requiring a click. Thanks!
- Amazing. Add me a yolo setting, turned off by default, that if turned on, no authorizations are required.
- Amazing. Now, when going to a docs or dialogs tabs, can you autoselect the first one if there's nothing selected?
- I am thinking we need vibey to be able to serve things from projects that just have static HTML with JS, I find myself adding these backends that just serve static files. Could we have some sort of static proxy? Let's design.
- Brilliant idea. If no port is sent, then it's static. Or even better, we just say "port: static". For cache, can we leverage whatever is already provided by cicek? We have etags. No need for busting, it works out of the box. Please document first, then server, then client, let me know when to restart the server.
- Please do. Also update the prompt.md to teach how to do static embeddings.


- How could we change the interface so we can talk (instead of typing) on a dialog?
- So, we do speech recognition in the browser? How's the quality? The language support?
- Whisper is not under a normal openai sub, it's API driven, right?
- Let's go with speech recognition on the browser. client.js is yours.
- Amazing! Now, how can we make it voice directed so we can tell it when to stop recording and send? Maybe something like "send now"?
- Great ideas. Let's do "say now" plus 1.5 second of silence. Anything said before that interval makes the "send now" be part of a normal stream.
- It works! How can we make it so it keeps recording? Even better if we have a phrase to start recording, but am not at all sure if that's possible.
- Good points. Let's do it like this: if you're in the dialogs tab, and you don't select the textarea, hitting spacebar starts recording. Only if you're not recording already.
- This. Just. Works! Amazing. Please change "send now" to "send".
- Alright! Can you change flow 4 of the client tests to NOT delete the project at the end? Also, please change it on both client and server tests to add an embedding to main.md once the tictactoe is done (read it up on vibey.md, this was just done by another client) so we can play the game from the document. Just touch the tests, not the client or server.
- Changed my mind. Also remove the deletion at the end of flow 4. Also add a message at the end, when the AI is done, to embed the game in main.md. prompt.md has just been updated so the agent should know how to do this. Also, after swapping F3 and F4 a few labels were not updated, please take care of that.
- Can you change flow 4 on both client & server tests to not use a backend, and just create a static HTML+JS game?
- I forgot to say: there will be a static proxy, it's like what we have, except with "port: static". Another agent is implementing this now.



### 2026-02-19

The feeling of computing is a way to express yourself. Sometimes, it can also be useful; tool building can also be expressive. Using JIRA is not conducent to being expressive.

https://github.com/timhwang/nyrc/blob/main/NYRC%201%20-%20The%20Computer%20is%20a%20Feeling.md
"For us, computer is the specific feeling of artifacts that allow for intimate systems of personal meaning."
"“Computer”, once an apt term for both the technology and the feeling it gave, has become less descriptive with time."

For vibey: build with ideas
Ideas are expressed in natural language. The implementation now can happen through agents. What makes things different now is your ideas on what to do, much less on the code that makes those ideas happen.

Knowledge work was always more about figuring out what to do than actually doing. AI simply shifts the percentages more towards the former, to a point where the doing of knowledge work starts to become a commodity. If agents do most of the execution, then we all have to shift towards figuring out what to do and outlining it with great clarity.

What's exciting is to make vibey into making Tim Berners Lee's browser-editor more of a reality.

To have proxies to your own app, or even other apps, inside a document, is the key embedding in vibey. Forget about CORS: you send the request to the server that hosts vibey, then your own server does the proxying for you.
I can already see a security nightmare looming, which sometimes is indication of something massively useful. Let's start with public access things, or proxying to your own app which means you're already logged in (with the vibey cookies).

It feels like vibey is built on the shadow of the roads not taken by openclaw: 1) use the double sandbox of the browser and docker to make it much safer (and limited); 2) put it online rather than running it locally.

claude: "Vibey's bet is that the document is the right primitive — that coordinating agents is fundamentally an authoring and reading activity, something you want to compose, review, share, and return to. That's deeply web-native. A document has a URL. It's inspectable. It persists in a meaningful way. The interaction is first-class content, not ephemeral chat bubbles in someone else's silo."

It should be trivial to make a document public in read-only mode. But any embeddings are live.

Prompts:
- Please - Debug flow 3 in test-server. Please don't restart the server, if you need to let me know. There are other agents working.
- Fantastic! Look now at the dialogs. Why did the orchestrator spin five instead of just one agent for doing this? Look at the times to debug.
- But why was another agent being spawned?
- Maybe it's the instruction: ask the orchestrator to read the other dialogs to see what has been done already.
- This is glorious. Now, can you implement tests for 4? If you need to change the server, lemme know first.
- Fantastique! Did it all work on flow 4 or the server needs retouching?


- Can you comment out flow 2 and onwards from test-client? Please don't modify any other files.
- Brilliant, thanks. Can you find out why there are no seconds of duration showing in the dialogs? There's logic for it in the frontend, but it doesn't work. you can touch the client but nothing else for now. Example: 21:40:01 · 10.9kti + 4.5kto. What I want is, between the time and the kti/kto, have something like "2.5s"
- Glory! Thanks for figuring it out!! Now, let's make tool calls far more beautiful in the client: 1) hide the ugly ids; parse the JSON in them if it's JSON and only show the first few lines of them (and if there are no newlines, autoinsert them every 90 chars or so).
- We should also rename the vibey.md in test-server flow 1 to readme.md, when you're done
- Beautiful! Can you now make the dialogs look more like the docs textareas, although they won't be editable? Also, if you have a JSON, could you remove the "stdout": ... and instead make it more like a bolded `stdout:` with the content next to it? Nobody will copy that JSON from there.
- It looks GORGEOUS. Now, could you make user messages be slightly to the right and have perhaps 90% width? Same with the LLM messages, but left-aligned.

- Can you add (commented out) a test for flow 3 in test-client? Take the approach from flow 3 in test-server. Don't change any other files than test-client please.
- We're on a roll. Can you uncomment flow 2?
- Can you implement flow 4 based on what's done on the server tests?
- Great! In flow 1, can you rename vibey.md to readme.md?
- Amazing progress. Now, when I run 1 and 2 in the browser, it all works, but I only see this alert at the end: ✅ All tests passed (Flow #1)! (10274ms). I would have expected that alert to fire at the end of flow 1, and then when I OK it, for flow 2 to start.
- It worked! Can you uncomment flow 3?
Uncaught ReferenceError: inc is not defined
    at B.mrespond.match (client.js:192:7)
- Please fix this and also add alerts at the end of flow 2 and 3 and 4, as well as any pauses.


Hi! I'm building vibey. See please readme.md, then server.js and client.js, then docs/hitit.md (backend tests) and docs/gotoB.md (frontend framework).

### 2026-02-18

Four ideas for vibey:
- Audience: those with GPT or claude accounts, paid but perhaps even free. They already have their own inference and are using it.
- Add audio support in case you prefer to talk instead of type! Auto-conversion to text.
- It's not just about text, but perhaps the document. I feel there's tremendous power in putting little views on the docs that you can click on and expand as modals, or as a small iframe. You make the document dynamic. I'm thinking of a proxy that can show parts of the app you build there in the document. A throwback to the old web of pages, rather than the graphical SPA with its navigation.
- Vibey can function as a memory area for your interaction with different AIs. You store the interactions as documents. The results are also stored there as documents. You own it, and you can switch providers.

Summary:

Local vibey:
1. Offline vibey will provide a good interface, or a platform, for vibe coding locally: through your browser (not the terminal, not another native app). All you need to bring is your own inference.
2. The concept: everything is a document. Your docs. The dialogs with AI. Views of your app or images are embedded. The document is the gateway to everything.
3. Containerized: so that the blast radius is reduced, with your local machine and also between apps.

Cloud vibey:
1. Aligned pricing: An annual subscription (30 USD?) that gives you access to key cloud providers priced at cost (Hetzner for VPS, Backblaze for files); calls to LLM APIs; email sending. You can also of course bring your own API keys or subscriptions.
2. Automatic infra to: put projects (containers) onto servers, proxy traffic from/to your apps, HTTPS (bring your DNS record), receive emails, vibey session cookies.
3. No lock-in: the whole thing being open source, so you can always run the same thing yourself elsewhere, also in the cloud.

claude: "Weakest link right now: the embedded views / iframe proxy idea is technically the hardest and also the most novel — it needs a proof of concept to know if it actually feels good or just feels clever. I'd prototype that early."

### Prompts

Hi! I'm building vibey. See please readme.md, then server.js and client.js, then docs/hitit.md (backend tests) and docs/gotoB.md (frontend framework).

- Now, could you implement a dockerized version of vibey, local, based on what the TODO plan says in readme.md?
- Nice work! WIth what command can I spin up dockerized vibey?
- Nice! It is running. There's another agent writing backend/frontend tests. If you run the backend tests, flow 1 breaks if vibey is dockerized. Can you debug why?
- I think you fixed it! But I don't want to mount anything local. I want no blast radius. Can you copy the config files on build? I want that if a catastrophe happens inside vibey, your FS is untouched.
- Silly question: if I update the credentials through the UI, they are only changed in the data volume, right?
- What is docker.sandbox?
- Can you extract any system prompts inside server and client to a prompts.md?
- Please rename that to prompt.md but don't restart or rebuild docker, there's another agent working.





- Hi! Could you write the tests for flow 3? If we need functionality for launching agents as a tool, build that first. Then do the backend tests first.
- Response:
    - Global authorizations in doc-main.md auto-authorize run_command + launch_agent so the orchestrator can read files and spawn agents without manual approval
    - write_file stays unauthorized so the spawned agent stops at waiting quickly (instead of running indefinitely writing code)
    - Timeout bumped to 300s since the request involves two sequential LLM calls (parent + spawned dialog)
- Did you have to modify the server? I don't think so, just checking.
- Wait. Can you make the test so that the code actually gets written? A simple express backend. A simple static gotoB frontend with tictactoe. You can click on the authorizations yourself!
- Excellent! Can you implement the client side tests now for flow 3?
- Sorry about that. It was another agent. Make the backend test suite modular, so you can run each flow separately. If you pass no flag, you run all three. Then retry just for #3.
- We just dockerized vibey. Please check there.
- The tests shouldn't know anything about the filesystem. All assertions should be done through interfaces! The proof is in the app running at port 4000.
- I don't understand why runCompletion has rounds. Isn't this just one call and one response, on a given dialog? Please explain.
- No, let's do 20. I want to make sure that there's no subagent. Agents are all flat respective to the project.
- If you read the dialog, it seems to be done after a while. Can you check that? Maybe it's just that the port 4000 is not mapped. What exactly are you waiting for?
- Great work! But what is the SSE doing then? Is the main agent stuck? It shouldn't consume infinite tokens for no good reason.

### 2026-02-17

Prompts:
- Hi! I'm building vibey. See please readme.md, then server.js and client.js, then docs/hitit.md (backend tests) and docs/gotoB.md (frontend framework).
- Please run the server and then the backend tests, debug that minimal flow 1 we have, reporting on what you see while you work.
- Please take the vibey client tests and the boot script and put it all in one file. If you're in node, run the pupeteer. If you're in the browser, run the c.test things. So we have one file, self-contained, for frontend tests.
- Fantastic, now make this single file test-client.js, delete the boot one and test-client.js, but keep the other server tests file (test-server).
- Great! Now please add the modifications I added on the flow 1 on readme.md to the backend tests, then the frontend tests.
- Please change flow 1 so that the LLM knows to go one directory up to look for readme.md when running it from the client
- Please implement tests for flow 2. Don't restart the server. Don't modify the client either.
- There's another agent working on the server, so please work in the frontend.
   - The tool uses have huge outputs: can you hide anything after a few lines? I think the issue is the unescaped `\n`, which should be escaped so that outputs look OK.
   - Also, could you put the timestamps and tokens used at the end of the box, not the beginning?
   - Let's make the gauges section show: time without ms (end time: 2026-02-17T14:28:29); how many seconds it took, rounded (2.5s or 0.2s), only cumulative tokens in ks (2.3kt in, 1.8kt out)
   - Remove the "end time" stating, just put the time. Also don't put the date if it's today's date. Also compact the token part to "3.3k+1.8k in/out"
   - Great! Now make the stdout/stderr of the tools look prettier, and auto-compact.
   - Please use local times, you were right about that.
   - Don't hide/show per key (stdout, stderr); rather, make it a general toggle of hide by default, show by clicking on expand (and allow to compress), use gotoB state to mark something as expanded with a good, unrepeatable prefix that depends on the dialog and the message.
   - Keep the expansion when switching between dialogs, it might be handy. Please make the expanded output look like the compressed output.
   - You're doing great. Please make sure we always autoscroll down when new things appear if we're already at the bottom, like in a terminal.
   - Please fix the tests :D
   - Thanks!! Please make it track how many seconds the response took for the LLM between the date and the tokens, like 3.5s for 3543 ms.
   - Also, let's make it "2.3kti + 1.2kto"
- Let's containerize this. Let's design how. Can you run in 2026 a docker inside a docker? I'd like vibey itself to run inside a docker, and then be able to spawn dockers inside for each project. Is that tenable?
- The problem I see with dockers for each project on the host is port contention, perhaps also name clashes. Also, I'd like that if you kill vibey, you also kill all that's inside of it. Is dind quirky?
- How quirky it is? What are the typical failure modes? Let's consider we're now, this is greenfield.
- No, the --privileged flag is a major speed bump. Let's do it flat instead, and do good housekeeping. Write me a quick list of things to do containerize, to tackle it tomorrow.


### 2026-02-16

Rather than build one app for everyone, build a platform so that people can build their own apps. It's exactly like Yegge says (https://gist.github.com/chitchcock/1281611):
"Our Google+ team took a look at the aftermarket and said: "Gosh, it looks like we need some games. Let's go contract someone to, um, write some games for us." Do you begin to see how incredibly wrong that thinking is now? The problem is that we are trying to predict what people want and deliver it for them."
"We don't get Platforms, and we don't get Accessibility. The two are basically the same thing, because platforms solve accessibility. A platform is accessibility."

vibey as a platform for vibe coding.

### Summary of where I am with vibey

- My journey with cell: understand/empower people to build their own systems through a simple programming substrate. But, given the current revolution, most people will never see code anymore: they will be vibe coding, writing and debugging in a natural language.
- What will empower most people to program is to have a good environment for vibe coding. The only thing more empowering (not to build, but to run their life) is something like openclaw, but, for me, the security implications of that are just too big to contemplate. Not that it is impossible. But I want to solve another problem. I want to help people build small systems, small applications.
- Offline vibey will provide a good interface, or a platform, for vibe coding locally:
   1. Through your browser (not the terminal, not another native app)
   2. The concept: everything is markdown. Your docs. The dialogs with the LLMs. Almost zero state outside the markdown.
   3. Containerized: so that the blast radius is reduced, with your local machine and also between apps.
- If vibey works locally, local is not the end of the road. Almost always, people need their apps that run in servers, not locally. A server makes your app available 1) everywhere; 2) anytime. This means that more people are going to be using a lot more cloud resources for themselves, with the apps they vibe code.
- There are a lot of tools out there to solve this problem. A few are really good. The proposal of vibey in the cloud, besides vibey itself, would be to provide:
   1. An annual subscription (30 USD?) that gives you access to key cloud providers priced at cost (Hetzner for VPS, Backblaze for files); calls to LLM APIs; email sending. You can also of course bring your own API keys or subscriptions.
   2. Automatic infra to: put projects (containers) onto servers, HTTPS (bring your DNS record), receive emails, vibey session cookies.
   3. No lock-in: the whole thing being open source, so you can always run the same thing yourself elsewhere.
- Interesting alternatives:
  - exe.dev: most like vibey, but with a different agent model and for devs.
     1. You buy underlying resources, and can create throwaway VMs on top of those resources.
     2. The VMs have a persistent disk.
     3. You can use a browser-based agent to interact with the VMs.
  - Val Town
     1. Excellent for tiny serverless/backend scripts and quick automations, especially JS/TS-first workflows.
     2. Less of a full “build your own app system” environment with local-first containers + portable infra path.
  - Replit
     1. Strongest all-in-one cloud coding product for broad users (editor, deploy, collaboration, AI help).
     2. Very locked-in.

Claude says:
- Conversion from local (free) to cloud (paid) — this is your funnel
- Time to first deployed app — this is your north star metric. If it's under 30 minutes, you win"
[I'd say it has to be three minutes]

Plan A:
- Make local vibey useful.
- Make vibey-as-a-service useful.
- Go back to work in cell.

=====

Alternative idea that I'm not considering for now: a place to store markdown and host client side js only, connect with your subscriptions, make little client side app with some persistence, no need to run anything else. just need a proxy for subscriptions and the client side app runs statically.

Vibey will have a vi-like mode in, because "vi" is in "vibey". It has to have a powerful editor as an opt-in.

Really curious to see if we can use documents as channels, so that LLMs can cooperate through them, like it was a slack channel.

Prompt header:
Hi! I'm building vibey. See please readme.md, then server.js and client.js, then docs/hitit.md (backend tests) and docs/gotoB.md (frontend framework).

Prompts:
- Perfect. Now iterate running node test-server.js and fixing wherever needed the tests. Do not fix the server yet.
- Hi! There's another agent modifying the code. Can you go through flow #1 and check that the tests at test-server.js match it? No need to run it yet.
- Fantastic. Now please read again readme.md, make sense of all the tool call conventions. The API is messy and it even looks inconsistent. Please use the schwas and an unified way to represent 1) user inputs; tool requests & authorizations; times and resources used per message. Put your output into a temporary file clean-convention.md
- Let's debug. I cannot even get a proper response to a "Hello". Please timeout your pupeteer to perhaps 1m, not more.
- Please make a pupeteer file that just opens the client and clicks on test, then listens to an alert and stops on it and reports it back to you. Do it as test-boot.js.
- The project deletion worked! Please don't jump to that project when clicking on the delete.
- There's another agent coding. Can you just run the tests for flow 1? The server is running.
- Please add a way to remove a project. Add the endpoint for that, the frontend logic. Also modify the readme in readme.md. Don't restart the server yet.

Thinking that YOLO is correct: if you have guardrails in place (container, backups, limiting destructive calls to external resources), you just let the LLM do its thing and give it permission to fail. Like network packets, if one doesn't make it, you just retry. (Thanks Mario Zechner for letting me see this through pi!)

### 2026-02-13

"Thou shalt not make a machine in the likeness of a human mind." -- Orange Catholic Bible

https://mariozechner.at/posts/2025-11-30-pi-coding-agent/#toc_6
"pi-tui uses a simple retained mode approach. A Component is just an object with a render(width) method that returns an array of strings (lines that fit the viewport horizontally, with ANSI escape codes for colors and styling) and an optional handleInput(data) method for keyboard input. A Container holds a list of components arranged vertically and collects all their rendered lines. The TUI class is itself a container that orchestrates everything."

"pi does not have a dedicated sub-agent tool. When Claude Code needs to do something complex, it often spawns a sub-agent to handle part of the task. You have zero visibility into what that sub-agent does. It's a black box within a black box. Context transfer between agents is also poor. The orchestrating agent decides what initial context to pass to the sub-agent, and you generally have little control over that. If the sub-agent makes a mistake, debugging is painful because you can't see the full conversation."

Agents talking to each other by being able to see their dialogs. Perhaps even coordinating by stopping and talking to a common dialog and polling it? Can agents wait or do they need the server to re-prompt them? Maybe waiting can be a tool.

?? interesting things to test: agent coordination

How can we have tasks in markdown and still have incremental updates? The idea is to move completely off JSON, or anything backed by a DB, for the purposes of project management.

On surface tests:
- linear sequence!
- liskov substitute change possible, other changes break
- errors are also outputs, it's a matter of order!


### 2026-02-12

Prompts:
- The changes to fix the bug are ugly as sin. Can you not just set the value using gotoB as is done elsewhere? If you need examples, let me know.
- Add openai and claude accounts as providers because to do this with API calls is going to be an arm and a leg. There should be an accounts section outside, next to projects. The credentials should be stored in the vibey folder, at config.json... Actually you're right. secret.js could be part of config.json. That would be the option to add the API keys. Add that too please. Hide the API keys so I
- Nice work! But the accounts part should have two sections: API keys and subscriptions. Add please the flow for both subscriptions. If possible, do this like the pi agent (which is open source) does, but changing the referrer to vibey when sending the oauth request.
- Fantastic work! Is this stored at `secret.json`? It shouldn't be in secret.js anymore.

IT WORKED! IT ALL WORKED!

- Change the logic so that when there's a provider with a subscription, you use that and not the API. Do we need new endpoints? Explain to me how it works under the hood before implementing.
- Bam, go for it.

- I'm tired of pupeteer. Build a test-client.js that can be loaded dynamically and executed by the client when clicking a button somewhere. Please read arc/gotoB.min.js to understand the libraries. Then use c.test for the tests.

### Claude's analysis of oauth with anthropic and openai

Now I have a clear picture. The OAuth flows are:

 Anthropic (Claude Pro/Max):
 1. Generate PKCE verifier/challenge
 2. Open browser to https://claude.ai/oauth/authorize with params
 3. User logs in and gets a code#state back from the redirect
 4. User pastes the code
 5. Exchange code for tokens at https://console.anthropic.com/v1/oauth/token
 6. Store access/refresh/expires
 7. When using: if token has sk-ant-oat, use authToken instead of apiKey, add special headers
 8. OpenAI follows a similar PKCE flow but runs a local callback server on port 1455, extracts the accountId from the JWT after token exchange, and then hits
 their Codex endpoint with the access token.

 For vibey as a web app, the server needs to handle OAuth coordination since the browser can't directly manage the flows. I'll set up endpoints to manage
 authentication across providers—one to check status, save credentials, initiate OAuth flows, handle callbacks, and log out. The Anthropic flow starts when
 the client requests an OAuth login, and the server generates the necessary parameters to kick things off. I'm picturing the Accounts page with an API Keys
 section for manual entry and a Subscriptions section with OAuth buttons—Claude's will prompt for a code paste while ChatGPT's will auto-receive the callback
 since vibey runs its own server. The backend will handle token exchange and storage, then transparently refresh tokens when needed during LLM calls.

 Now I'm starting the implementation, focusing on PKCE generation in Node.js, the OAuth endpoints, and token refresh logic.

 For OpenAI's callback, I realize the redirect_uri is hardcoded to http://localhost:1455/auth/callback, so I'll need to spin up a temporary server on that
 port just like pi does rather than trying to route it through vibey's main server. Anthropic's redirect is different, so I'll handle that separately.

 Now I have the full picture. Let me implement both OAuth flows. Here's the plan:

 - Anthropic OAuth: PKCE flow → user pastes code#state back
 - OpenAI Codex OAuth: PKCE flow → local callback server on port 1455 + manual paste fallback
 - Both store tokens in config.json, auto-refresh, originator set to vibey
 - Server LLM functions adapted to use OAuth tokens with correct headers

### 2026-02-11

https://mariozechner.at/posts/2025-11-22-armin-is-wrong/
"Local-first principles can't realistically govern a provider's internal state as long as they keep it hidden. And for closed SaaS LLMs, they will. Exposing full internal state would leak proprietary signals, make it easier to clone or fine-tune competitors, and lock providers into internal architectures they can't freely change. Wishing for "local-first friendly" APIs where all hidden state is exportable is nice in theory. It's just not going to happen with closed providers."

Working with LLM agents is addicting. It's hard to stop. It also allows you to build something more alexandrianly, by seeing it. I wonder if it will help us build systems with more life.

We were drowning in information *before* LLMs. Imagine now.

For vibey:
- Create projects that are self-contained. Well, perhaps not their own container, but definitely their own folder.
- You can save a copy of the project either as a .zip or as a project itself, that's listed as a snapshot/backup

Prompts:
- There is no point on denying all, remove that option.
- Long tool calls are summarized and can be expanded.
- Long tool calls are 1) shown only after the LLM responds to them (they should happen immediately) and they are still not autocompacted nor expandable.
- docs-main.md is injected at the top of each prompt by the server. If it's missing, nothing gets sent. Don't put it in the dialog box.
- Remove the message from the bottom box as soon as we send it to the LLM.
- Sorry, it's doc-main.md, not docs-main.md. Also put it in the markdown, but also subject it to compaction.
- The restoration on error is good, please restore that. The cleanup on send wasn't happening, fix that instead.
- Implement navigation with hash like I do in tagaway: https://raw.githubusercontent.com/altocodenl/tagaway/refs/heads/master/client.js (look for `'read', 'hash'` and how window.location.hash is changed/read).
- Why goto tab? Can't you just do like I do in tagaway and just navigate to #/dialogs, for example?
- Interrupting an agent stops the stream. This is done with PUT /dialog. Please put a stop button too to trigger this.
- Is this done? Remove pending tool calls from server memory. Have it written down in the markdown. When agreeing to execute from the dialog by human intervention, save that in the markdown of the dialog and resume the dialog.Also save blanket authorizations for the tool (let's say one per type) and have that available at the markdown. When a tool request comes from a dialog, the server checks if it was authorized or not in that dialog. If it was, it goes through, otherwise the dialog goes to pending. Also, when spinning the dialog, if there are global authorizations, put them right there from the beginning.
- Is this done? Possible dialog states: done, active, waiting (on human). Waiting means that a tool use is proposed. The status of a dialog is in its file name, its suffix is <status>.md. Decided against the LLM asking if we're done or not, let the human decide. The halting problem is solved by the human.
- Switching between tabs seems to be broken. Can you debug with pupeteer?
- When landing in dialogs, don't autoselect the first. Same for docs.
- Hide the stop button if we're not waiting on the LLM.
- When I navigate away from a doc with unsaved changes, ask me if I want to save before letting me leave and lose my changes.
- Please now test flow #1 in its entirety, as specified in readme.md. Use pupeteer. Check for everything, particularly compaction.
- Diff suggest & diff apply: show them nicely: green for the +, red for the -.
- Create projects that are self-contained. Not their own container (yet), but definitely their own folder. Have a first view that is a project selector that just lists the folders. You cannoto go up.
- You can save a copy of the project either as a .zip or as a project itself, that's listed as a snapshot/backup.
- Inside each project, you have the docs and the dialogs. The project name is reflected in the URL.
- Make sure URLs are URI encoded for every resource so we can have arbitrary names that won't break the navigation.

Pupeteer scripts are too one off. It'd be cool to give the LLM a way to run commands interactively in a frontend. Of course, security. But in a localhost context, why not?

### 2026-02-10

Good (LLM) tools are good at fetching a small and effective amount of context to solve the problem.

Mario Zechner: MCP is not composable. I think he's referring to the fact that you can grep an output from the OS whereas you cannot grep what comes back from an API. The goal is to get the relevant context without flooding the window.

So, the goal is to have vibey working!

What am I missing, spec wise? It's not really about the spec. It's about the essentials:

- Write and read markdown docs in your browser.
- Start and orchestrate agents through markdown files, also in your browser.
- Be able to start a project as a self-contained thing that doesn't pollute your computer, or the other projects.

pi is mindblowing. I want something like this on my browser. On every browser.

I'd like to get some sort of visual notification that an agent is waiting for my input. Not a ping, just something visual.

Prompts:
- Let's simplify further: a dialog is active, waiting for authorization, or done. But how do we know we're done-done and don't want to see it any more? We can archive the markdown. Nah, then we have active, waiting (for auth or input), or marked as done. Done is really closed by the user. Then the status can be set to either waiting or done from the endpoint in a `status` flag. If there's a prompt, you continue the thing. The one exception is when you deny, which sets the dialog to waiting too. The decisions are a prompt, see them as text that can be parsed. Same goes for authorizations. No need for mark done.
- The id is the slug, prepended by `dialog-<date>-` and suffixed by -<status>.md.
- When usage is unavailable, don't print anything.
- I want to rationalize the endpoints:
   - POST /dialog should just receive a model and a prompt to start.
   - The possible cases for PUT /dialog are to 1) stop it; 2) stop it and say something to continue it; 3) authorize a tool use
   - I want no separate /resume.
   - When a tool use is accepted, or already pre-authorized, do we need an endpoint? Can't the server just parse the LLM and make the call?
- Specify the conventions for tool calling as text. Add a nice sentinel with three schwas.
- Also the conventions for showing usage.
- Don't worry about the state transitions. Instead, when we kick off the LLM on an existing dialog, just move it to active.
- Remove the initial `prompt` on the client: when you start a new dialog, let me type on the box. Also select gpt5-3 from scratch on the dropdown in the client.
- Showing diffs should be with + and -, green/red, with a few lines shown and the possibility to expand.
- Tighten up the message timestamps so that every message has one.
- Only show non-dialogs on "docs". It should be "docs", not "files" on the tab.
- When sending a message, clear it from the bottom box.
- Make the clanker messages have a slightly reddish background, and the human ones slightly green.
- Please make the AI be purplish, rather than reddish.
- Remove the "apply" button after I clicked on an authorization.

### 2026-02-09

https://nolanlawson.com/2026/01/24/ai-tribalism/
"Today, I would say that about 90% of my code is authored by Claude Code. The rest of the time, I’m mostly touching up its work or doing routine tasks that it’s slow at, like refactoring or renaming."

"What I’ve noticed about a lot of these debates, especially if you spend a lot of time on Mastodon, Bluesky, or Lobsters, is that it’s devolved into politics. And since politics long ago devolved into tribalism, that means it’s become tribalism."

"I’ve seen what happens when you lash together some very stupid barnyard animals and they’ve suddenly built the Pyramids, so I’m not surprised when smart engineers say that the solution to bad AI is to just add more AI."

https://www.anildash.com/2026/01/22/codeless/
"The ultimate result is the ability to create software at scale without directly writing any code, simply by providing strategic direction to a fleet of coding bots. Call it “codeless” software."

"Many coders didn't like using LLMs to generate code because they hallucinate. Codeless systems assume that the code they generate will be broken sometimes, and handle that failure."

"This has nothing to do with the "no code" hype from years ago, because it's not locked-in to one commercial vendor or one proprietary platform."

"Getting this stuff running is hard; you’re bouncing between obscure references to Gas Town on Steve Yegge’s Github, and a bunch of smart posts on Simon Willison’s blog, and sifting through YouTube videos about Ralph Wiggum to see if they’re about the Simpsons or the software."

"Maybe the distance from idea to app just got a little bit shorter? We're about to find out."

== Ideas for vibey

More thoughts:
- Rather than having a main agent, have four agents collaborating, like a skilled quartet of musicians. Let them self organize. Can they actually chat and divide the roles between themselves, taking turns in the conversation?
- How can we make agents work on the same dataspace, without splitting it into branches? Could you have agents working with CRDT?
- Every agent is an agent, though.
- Agents can interact with each other through files, which are their own internal dialogs.

Decisions:
- Don't hardcode the main agent into the vibey flow. Rather, allow vibey to spawn agents through MCP (or an endpoint, really) and let agents decide if they should spawn agents!
- Don't separate tasks. Just have tasks as part of the docs. The model becomes only three things: docs, dialogs and deed, the deed being whatever is being or has been built.
- What about versioning? Should vibey provide it? I'd rather add a snapshot taking that can include either the docs, dialogs, deed or all three, as a zip file. Save it outside, before an overzealous agent wipes it!
- Won't having tasks as a markdown file (or several) generate a lot of agents stepping over each other? What if they can communicate in a common area wher e they tail the last n lines? This can be just done as the instructions, it doesn't have to be hardcoded in vibey. Vibey allows you to explore these patterns.

When agents start modifying `doc-main.md` liberally, we have an all bets are off type of scenario.

### 2026-02-06

Tail recursive agents as agents that call other agents and then immediately stop themselves.

https://mariozechner.at/posts/2025-06-02-prompts-are-code/
"Prompts are code, .json/.md files are state"

"I'm a programmer. You're probably a programmer. We think in systems, deterministic workflows, and abstractions. What's more natural for us than viewing LLMs as an extremely slow kind of unreliable computer that we program with natural language?"

"Unlike ad hoc prompting where the conversation meanders, this programmatic approach follows a deterministic workflow. The LLM becomes a reliable executor of structured instructions rather than an unpredictable chat partner."

"What previously took me 2-3 weeks, now takes 2-3 days."

"This mental model has transformed how I work with established codebases using agentic coding tools. By treating LLMs as programmable computers rather than conversational partners, I've found a more reliable approach to complex software tasks. It's not a panacea and won't work for all problems, but it represents a step toward turning AI-assisted coding into an engineering discipline rather than a "throwing shit at the wall" approach."

https://mariozechner.at/posts/2025-11-30-pi-coding-agent/
"You are an expert coding assistant. You help users with coding tasks by reading files, executing commands, editing code, and writing new files.

"Available tools:
- read: Read file contents
- bash: Execute bash commands
- edit: Make surgical edits to files
- write: Create or overwrite files"

"Guidelines:
- Use bash for file operations like ls, grep, find
- Use read to examine files before editing
- Use edit for precise changes (old text must match exactly)
- Use write only for new files or complete rewrites
- When summarizing your actions, output plain text directly - do NOT use cat or bash to display what you did
- Be concise in your responses
- Show file paths clearly when working with files"

"Documentation:
- Your own documentation (including custom model setup and theme creation) is at: /path/to/README.md
- Read it when users ask about features, configuration, or setup, and especially if the user asks you to add a custom model or provider, or create a custom theme."

"pi's system prompt and tool definitions together come in below 1000 tokens."

"If you look at the security measures in other coding agents, they're mostly security theater. As soon as your agent can write code and run code, it's pretty much game over."

"pi does not and will not support MCP. I've written about this extensively, but the TL;DR is: MCP servers are overkill for most use cases, and they come with significant context overhead. (...) The alternative is simple: build CLI tools with README files. The agent reads the README when it needs the tool, pays the token cost only when necessary (progressive disclosure), and can use bash to invoke the tool. This approach is composable (pipe outputs, chain commands), easy to extend (just add another script), and token-efficient."

"That said, I welcome contributions. But as with all my open source projects, I tend to be dictatorial. A lesson I've learned the hard way over the years with my bigger projects. If I close an issue or PR you've sent in, I hope there are no hard feelings. I will also do my best to give you reasons why. I just want to keep this focused and maintainable. If pi doesn't fit your needs, I implore you to fork it. I truly mean it. And if you create something that even better fits my needs, I'll happily join your efforts."

https://mariozechner.at/posts/2025-12-22-year-in-review-2025/#toc_0
"Over the last three years a lot has happened. We've basically switched from asking ChatGPT or Claude on their respective websites for some functions to having semi-autonomous agents run on our machines in YOLO mode."

"In his recent blog post, Armin segmented coding agent users into two camps: the ones that keep them on a tight leash and stay in the loop, and the ones who orchestrate armies of agents. I'm falling into the former camp, maybe because I'm old."

"I'd also like to point out that not a lot of army of agents people have actually published their work, whereas I try to open source as much of my shit as possible and document it. So maybe there's a lesson in there somewhere."

"This is a repeating theme with agents: they're really only effective in the hands of domain experts. Another repeating theme is that domain experts don't yet understand how these tools can actually help them automate verifiable tasks, so they have more time to focus on the actual work."

"But again, that's just the vibe. And I think that's the general theme for this year. It's all just vibes."

https://mitchellh.com/writing/my-ai-adoption-journey
"To find value, you must use an agent. An agent is the industry-adopted term for an LLM that can chat and invoke external behavior in a loop1 At a bare minimum, the agent must have the ability to: read files, execute programs, and make HTTP requests."

"But, expertise formed. I quickly discovered for myself from first principles what others were already saying, but discovering it myself resulted in a stronger fundamental understanding.

Break down sessions into separate clear, actionable tasks. Don't try to "draw the owl" in one mega session.
For vague requests, split the work into separate planning vs. execution sessions.
If you give an agent a way to verify its work, it more often than not fixes its own mistakes and prevents regressions."

"The negative space here is worth reiterating: part of the efficiency gains here were understanding when not to reach for an agent. Using an agent for something it'll likely fail at is obviously a big waste of time and having the knowledge to avoid that completely leads to time savings."

"Very important at this stage: turn off agent desktop notifications. Context switching is very expensive. In order to remain efficient, I found that it was my job as a human to be in control of when I interrupt the agent, not the other way around. Don't let the agent notify you. During natural breaks in your work, tab over and check on it, then carry on."

"This is where I'm at today. I'm making an earnest effort whenever I see an agent do a Bad Thing to prevent it from ever doing that bad thing again. Or, conversely, I'm making an earnest effort for agents to be able to verify they're doing a Good Thing."

"I'm not [yet?] running multiple agents, and currently don't really want to. I find having the one agent running is a good balance for me right now between being able to do deep, manual work I find enjoyable, and babysitting my kind of stupid and yet mysteriously productive robot friend."

### 2026-02-05

For vibey:
- I'm deciding against a single dialog/main.md to keep track. What if we just do that with filenames? dialog-<role>-<noun>-<date>.open.md, with the `open` showing you if it's open. When it closes, we rename the file. We can have some sugar to paper over that on the UI.

Debug MCP:

```
  1. Missing System Message (server.js)

  The LLMs didn't know they could actually execute tools. Added system prompts to tell them to use the tools:

  2. Checkbox State Not Being Sent (client.js)

  The toggle pattern ['!', ['useTools']] wasn't working - the value was always false on the server. Fixed by evaluating the negation immediately:
```

### 2026-02-04

If LLM models are roughly as good as their data, and big LLM models already are trained on *all* the data, then why are they still becoming better? Is it because they are being fed with their failure modes and they're learning from them?

Claude suggests it's that, plus three more things:
- More compute
- Better data selection
- Architecture/algorithmic improvements

"The base pretrained model gets you ~80% there. The remaining improvement comes from understanding how the model fails and systematically addressing those patterns through post-training."

Merge conflicts can be explained by the CAP theorem, when your team has more than one member and you have to work on related things at the same time. If the work is not partitioned, you'll generate a consistency issue.

Understanding bootstrapping through the call and response paradigm:
- The base layer (could be opcodes, assembler, C, whatever powers your implementation) has a number of calls.
- You don't have a way of transforming the calls of your language to the calls on the system.
- Using the calls of the underlying layer, you implement some of your language calls. This is the bootstrapped layer.
- Then, to express all the calls in your language, you use the calls of your language that are in the bootstrapped layer.
- If you needed all the calls in your language to express any call in your language, your language would have to be bootstrapped completely, which is meaningless as a term. The notion of bootstrapping implies that there are two parts of your language, essential calls and then calls that can be expressed in terms of the essential calls.

Understanding functional programming and side effects through call and response in the dataspace: a pure function is one that doesn't read anything "from the left" and doesn't write anything "to the left" (only in its result). But still, this implies native calls that are still to the left, but since they are considered unchanging, they don't represent mutable state. You could think of this dual purity as read-purity and write-purity. Kind of reminds me of both funarg problems.

Refactoring is changing the implementation of a call without changing its interface.

Main takeaways of Vibe Coding (the book):
- Vibe coding is worth it. 2-10x potential. It enables FAAFO: faster, ambitious, autonomous, fun and optionality.
- It's not less work, it's just different work.
- Continuum: from chat to multiple autonomous agents. Work in parallel with several agents, giving them autonomy but not abdicating responsibility.
- You can converge onto good code by interacting.
- Manage the context window: context increases quadratically with every interaction, because you need to send the entire thing back.
- Count your babies: validate what the LLM does. Set clear standards for code and tests.
- Planning: tasks and tracer bullets.
- Make agents give a summary of what they did once they're done, and save that for following sessions.

== Prompts:

Hi! I'm building vibey. See please readme.md, then server.js and client.js.

Please clean up all the claude and openai code we have in the server and the client, just keep the reference to the API keys. Also keep the dialog part of the UI, but gut the respondres. And verify that the markdown functionality is present. We'll do the agent/MCP stuff later.

Summary:

⏺ The cleanup is complete and the markdown functionality is working. Here's a summary:

  Server (server.js) - Reduced from ~1040 lines to ~130 lines:
  - Kept: Static routes, file CRUD routes (GET/POST/DELETE /file/:name, GET /files)
  - Kept: API key references as env vars (for future use)
  - Removed: All session/dialog routes, Claude/Codex spawning, OpenAI streaming, tool execution, agent loops

  Client (client.js) - Reduced from ~1050 lines to ~310 lines:
  - Kept: Files responders (load, save, create, delete, close, Ctrl+S shortcut)
  - Kept: Files view with list sidebar and editor
  - Kept: Tab switching between Dialogs and Files
  - Added: Simple placeholder for Dialogs tab ("Dialogs coming soon")
  - Removed: All session/output handling, Claude/OpenAI output parsing, tool call UI, question blocks
  - Default tab changed to 'files' instead of 'dialogs'

  Verified working:
  - File list loads correctly
  - Clicking a file opens it in the editor with content visible
  - The textarea properly displays file content (using content as child element, not value attribute)

==

Please test this:
- Allow the server to write and read markdown files locally, all against a folder `vibey` (done)
- Allow the client to list the markdown files in that folder, open them, edit them in whsiwyg with some standard and good markdown editor that can be loaded from the client side. (done)

There's pupeteer installed.

==

It's "define", not "refine".

### 2026-02-03

New idea: what if instead of running claude code or codex locally and have that in vibey, we just use the API? If the LLM can call local tools, we'd be doing quite well, except for pupeteer, but perhaps even that is possible.

I feel I'm fighting the tools to stream this, whereas the API calls would be cleaner and still get the job done.

Let me think. I want a claude code or codex experience just with api calls. You'd have to support:
- network calls
- os calls
- reading files would be catting or grepping, so also os calls.
- making and applying diffs on files (also os call?)

I want nothing whitelisted at the beginning, ask me through stdin.

I'm getting mindblown by the idea of MCP as XMLHTTPRequest, and LLMs as high-level glue. You can just say "get me X data from salesforce", and the LLM will get it, and it will do a nice little ad-hoc visualization of it wherever you want it, in a doc page, or another page of your application. It's truly the end of the silo.

Vibey could circumvent claude code and codex. Just get an API token and get going. Really pay per token. Wow.

### 2026-02-02

Concepts as interfaces to representations.

Perhaps interfaces and tools are the exact same thing. A way to "call" something, without being it.

Perhaps short code is like practical poetry.

Beings as places of consciousness, in the same way that (in alexandrian terms), centers are the places of the whole. And the places make the whole thing. The thing is made of places.

Types without casts: types reduce the possibilities of the statistical ensemble of the program; that improves your prospects for compiling it and for understanding it. Types as reduction of possibilities in a systematic way. It should be just made with code.

Vibey needs entrypoints so that agents can get data from the outside, not just through you and the dialogs.

Why is an agent with grep better than RAG?

https://brent.hailpern.com/wp-content/uploads/2020/02/p671-ritchie.pdf
"Thompson wanted to create a comfortable computing environment constructed according to his own design, using whatever means were available. His plans, it is evident in retrospect, incorporated many of the innovative aspects of Multics, including an explicit notion of a process as a locus of control, a tree-structured file system, a command interpreter as a user-level program, simple representation of text files, and generalized access to devices. They excluded others, such as unified access to memory and to files."
"B can be thought of as C without types; more accurately, it is BCPL squeezed into 8K bytes of memory and filtered through Thompson's brain."
"The rule, which survives in today's C, is that values of array type are converted, when they appear in expressions, into pointers to the first of the objects making up the array. "

Unix has files for everything: to interchange data between programs, device drivers as files (or directories), even pids (which are stored in files) to address a process. They are first class places. And streams are also files. I really get it: it's first class places, like we have in cell (where everything is addressable in the dataspace).
And if there's no essential distinction between system and user commands, every call is a call.
So cell is very much in the unix spirit.

In vibey, everything's going to be text, that is, markdown. So, everything's a markdown file: the documentation, the rules (are the rules the documentation? Probably), the dialogs (which are the agent processes) and the tasks. Everything's a markdown file.

claude: "The reconciliation loop is key. You're not building an event-driven system with complex state machines. You're building a declarative system where the main agent periodically asks "does reality match the rules?" and fixes any discrepancies. This is how Kubernetes works - the control loop pattern. It's much simpler than trying to handle every possible state transition."

Re-posting the article here on LLM-high in the notes for historical context:

#### Hypothesis: LLM agents are the new high-level programming language

Following this hypothesis, what C did to assembler, what Java did to C, what Javascript/Python/Perl did to Java, now LLM agents are doing to all programming languages.

What do I mean by LLM agents? I mean that the main development stack of a human will soon be:
- **Multiple**: a number of agents working in parallel.
- **Autonomous**: those agents only requiring feedback from the human every once in a while, but mostly work autonomously.

How can we determine if the hypothesis is true? If a human developer **can now build an order of magnitude more (10x) using multiple autonomous agents** compared to what the human would be able to build without them, then the hypothesis is true. I'm not sure of it yet (as of January 2026) but I'm seriously considering.

For many that have been in the software business for a while, the mind reels with objections. Let's address the easy ones first:

- 10x lines of code is not building 10x more, it's just slop: the measure should be done on the actual functional output delivered, not the lines of code. If we go with the hypothesis, the "lines of code" are really the instructions to the LLM.
- LLMs are only for those who don't know how to code: while there will be many new programmers thanks to LLMs, that doesn't mean that experienced programmers won't benefit from using LLM agents. Evidence shows that many experienced programmers are experiencing a lot more output thanks to LLMs.
- LLMs are for those who don't want to think/work: if you are using LLMs to do more than you did before, you'll have to think and work more, not less. It's more demanding to manage a fleet of agents, and you'll have to design way more (since you're building x times what you were building before in the same amount of time).
- LLMs are going to make our coding skills rot: probably. But at work we are not usually concerned about our assembler, or our C chops rotting, if they exist at all. Most of us practice those chops in our free time, because we cannot defend the case that we'd be more productive working in assembler or C at work (for most types of software development).
- The code that LLMs make is much worse than what I can write: almost certainly; but the same could be said about your assembler, or your C code. As long as what the LLM generates is sufficiently efficient, it will run and it will already be ready. The system will be uglier, but it will still work.
- Using LLM agents is expensive: if they give you already 50% more productivity, and your salary is an average salary, they are not. And LLMs will only get cheaper. They are only expensive in absolute, not in relative terms.
- I tried using LLM agents one afternoon and they wasted my time: there's a learning curve involved. It takes a while to get a hang of working with multiple LLM agents. Think of the hours and days you spent fighting the tools and syntax of your programming stack, until you more or less got it.

(None of the above are defensible, I think, though emotionally they are not easy to accept)

Now for two objections that go to the crux of the matter:

- Quality: aren't LLMs are generating code that will soon become a dumpster fire? Are we not building in foundations of sand?
- Understandability: won't LLMs generate so much code we can never hope to understand it? Even if the systems work, are we not forever in peril of not controlling them because we don't understand them?

I would like tho use quality and understandability as the goals for any acceptable framework of LLM programming. Economically, only quality is indefensible as a goal. Understandability might be a romantic dream or a good long term bet (I'm choosing the latter, but you can of course be agnostic).

Now for the quaint: LLMs are far more nondeterministic than previous higher level languages. They also can help you figure out things at the high level (descriptions) in a way that no previous layer could help you dealing with itself.

#### How would this look?

Let's try to find the common elements of how this near-future would look like:

- **Documentation**: a set of markdown pages that contain the specification of the system: purpose, main entities, endpoints, constraints, core flows, coding standards.
- **Implementation**: the codebase, plus all of the data. This is what runs and what holds state. The codebase should be reconstructable from the documentation, and the data should be consistent with its description in the documentation.
- **Dialogs**: multiple agents are churning away at their tasks. They produce text while they're thinking through the solution, some of it code: this is the dialog (which is expressible as a markdown page). A human can inspect at any time this stream of text, code changes and commands; a human can also enter the dialog. Some dialogs can be waiting for human input. When an agent completes its work, the dialog is no longer alive but it still is accessible.
- **Tasks**: a dynamic set of discrete pieces of work, expressed as a markdown page. They should be reconstructable from the documentation + the existing state of the codebase. Tasks should be nestable. They have a status (done, pending, in progress, waiting for human interaction, complete).

Looking at this, we see two stocks and two flows. The two stocks are the "tions" (documentation and implementation), which are the accretions of the system. And we also see two flows, which are the dialogs and tasks. The dialogs and the tasks build both the documentation and the implementation. It's also possible for the human to modify the documentation and the implementation directly, but that won't happen that often, as most of the flow is agentic and the human will spend most of their time interacting with the agents.

How will agents will be structured? Since agents can play multiple roles (since the underlying models are general purpose), I think we can leave as much freedom as possible here. If any agent can enter any dialog, and any human can enter any dialog, we can let the human experiment with different possibilities:

- Agents working on tasks independently, start to finish.
- Managing agents that are in charge of orchestrating what's next.
- QA agents to try to break new features.
- Reviewing agents that take a new unmerged feature and review it without the context of the builder.
- Merging agents that resolve conflicts.

The important thing is that the human can either manually or automatically spin agents with instructions that can be either one-offs or a chunk of the documentation.

There's an opportunity for a new type of world wide web - or rather, for making the existing web much more free and web-like, breaking the silos of applications. That opportunity is MCP. MCP (a standard for tool calling by LLMs), which everyone and their mother is rushing to support, can be considered as a general XMLHTTPRequest. This opens the possibility to have your AI agents take any functionality and data that's siloed in an existing application and put it in a dynamic canvas of your own choosing.

My original vision for cell was a grid of code and data (the dataspace) that you can fully understand and is already deployed. This is not enough. This will be just the "grid". Surrounding the grid will be a set of dynamic pages, where documentation and functionality come together.

Documentation won't just be documentation: you will be able to embed functionality, either from your own application (which will be supported in the grid) or from external applications. You can have mini dashboards or widgets that you can bring to fullscreen. Or you can navigate to another page. Your cell will be a collection of pages, plus the grid, plus the agents that are working on it. And a lot of it can be accessible from the outside.

This all still requires a server for these reasons:
- Receive requests while you're not online.
- Persist data.
- Keep the agents working.
- Many calls cannot be done directly from the browser for security reasons, so they require a server to make the request.

What about quality and understandability? If instead of a big stack, we use a good substrate, the line count of the LLM output will be much less, and more understandable. If this is the case, we can vastly increase the quality and performance of the systems we build.

The frontend of the system is now the documentation and the agents; the backend is the stack/substrate.

Open questions:
- How do we store the documentation and dialog alongside the implementation?
- How do we use version control systems?

==

### 2026-02-01

How would an UI for AI agents look like?

- Zero lock in: open source, can run powered by any LLM provider.
- Browser: both desktop & mobile friendly.
- Text based: markdown everywhere except for code/data: documentation, tasks, dialogs with agents.
- Agent roles are based in a ruleset: text that determines the roles. An agent spins up whatever agents are needed to fulfill the roles automatically.
- Versioned: uses either git or a relational database for history. Agents can't delete history.
- Main human actions: write/edit the ruleset; review the progress; interact with agents that are waiting for input.
- "An agentic interface for those who love text."

This would require a server, for persistence, managing processes, and hosting the interface.

What is not provided is the installation of the devtools (git, dbs, runtimes), that's supposed to be already there. But eventually this could be also managed by the backend of the UI.

Codename for this new UI: vibey.

What would I like?

- Read/write markdown in the browser. Have dialogs as markdown where you can also contribute.
- Stream claude code and codex into this markdown.

== Prompt to build it

Hi! Please read docs/llm-high.md; then read the development notes for 2026-02-01 in readme.md.

Create a single server.js file copying the framework from what's in server.js. Create another file called client.js, copying the framework from what is in editor.js. By framework I mean the libraries and the basic tooling, not the specific logic.

The goal is to be able to show a page where I can talk to a claude code agent, running locally, and get the responses back.

==

How would it really look?

- Four main tabs:
   - Documentation
   - Accretion (system/data, the result, what you make)
   - Dialogs
   - Tasks

With the docs:

- See all the docs. They are markdown files saved in `docs`, with the name 1:1 to the file.
- Switch between UI (dropdown menus, whsiwyg) and text-like markdown modes in each doc.
- Allow embedding of HTML inside the markdowns to have little windows with tool calling.

With the dialogs:

- Like the docs, but you can enter text below. Shows things slightly to the left (LLM) and the right (you).
- Can also distinguish between LLM agents, they are named at the top so you can see whose's who.
- The dialogs are saved under `dialogs`.

With the tasks:

- Each task is a separate markdown file.
- Tasks can reference each other.

What's the main workflow?

- Write the agents.md file, where you specify general rules, as well as 1) the roles of the agents; 2) how many to run of each and on which tool (claude code, codex).

When can I use vibey to build vibey itself? Probably it won't be very long.

==

https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type
"The two alternatives are theoretically equivalent, as each can emulate the other.[1] However, there are practical differences. State-based CRDTs are often simpler to design and to implement; their only requirement from the communication substrate is some kind of gossip protocol. Their drawback is that the entire state of every CRDT must be transmitted eventually to every other replica, which may be costly. In contrast, operation-based CRDTs transmit only the update operations, which are typically small. However, operation-based CRDTs require guarantees from the communication middleware; that the operations are not dropped or duplicated when transmitted to the other replicas, and that they are delivered in causal order.[1]"

If complexity indeed accrues quadratically (as seen in LLMs), then the impact of simplifying is also quadratic.
