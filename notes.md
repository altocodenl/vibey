## Vibey development notes

### 2026-06-04


Some notes on Alexander - The process of creating life:
- "Part of our difficulty in modern society is that accepted formal processes often fail to include natural processes, and that is how they get things screwed up."
- "Whatever you are doing, whatever process you are following, the concept of a living process usually has the capacity to make it a little better, by making deeper, more profoundly and carefully structured living centers, replete with the fifteen properties - just helping you do a little better what you already do naturally."
- "What I have defined as living process is - I believe - the minimal, and necessary core of *any* process capable of creating life."
- The concept of living process (...) it sems to me that it might possibly compare in intellectual breadth and depth to the concept of energy as it was introduced in the seeventeenth century."
- Note: load context (wholeness), see the latent center that most requires work, focus on it, re-evaluate after the change to see if it's a keeper or it should be discarded, go back to the beginning; I think rolling back changes can be a transformation itself, going back to the beginning and trying the thing again. Alexander says almost directly that we should not move forward with the decision if it doesn't improve the whole.
- Note: coherence as the absence of errors when seeing how one center relates to all the others.
- Fundamental features of the concept:
   - Step-by-step (chapter 8)
   - The whole rules (chapter 9)
   - The process is about making centers (chapter 10)
   - There's a vital sequence (chapter 11)
   - Parts become locally unique (chapter 12)
   - Centers are formed by generic patterns (chapter 13)
   - Every living process is governed by feeling (chapter 14)
   - For buildings, structure comes from an emergent aperiodic grid [I wonder what it would be in software - an aperiodic grid of calls?] (chapter 15)
   - There's a form language that provides concrete methods for impleneting adopted structure through simple combinatory rules (chapter 16)
   - The entire process is guided by the simplicity transformation (chapter 17)
- "I am reasonably certain that, for any process to be a living one, these ten essential features, *at least*, must be present. I would like the reader to consider my discussion of living process in the next ten chapters as applying to every conceivable process in society, and to every architecture-creating process, at any scale, in which the reader is herself/himself involved."


Each message has to have their own provider & model. These are not dialog-level things. Same with timestamps. A dialog is a strict sum of messages. Questions:
- What divides one message from another, at the file level?
- Do we enforce strict ordering on messages, to the point of blocking? Think of user A triggering a call, then B wants to come and say something. I'd say yes, let's do it like this.
- If we don't store a current mode in the dialog, that has to be determined by the message sent. You can change it in the client for what will the next message be. But if you refresh, it will default to what the last message was: was it destined to AI, the terminal, or a human that will read it there?

==

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**.

- I want to change the create dialog endpoint so that only the empty file is created, with nothing else. When the first message is sent to it, then we determine the provider and model. What would the implications be for client.js and cclient.js?
- So, basically, since we send provider and model on every message, besides accomodating the empty dialog, there'd be nothing else?

- What happens if we change the provider/model from one message to the other? Do we put the provider/model again on the message? It might make way more sense to put these by message.

===

What do I need to port from the old client to the new one?
- Auth
- Project
- File viewer/editor
- Dialog
- Triggers (API & email)
- Embeds

I am very, very torn. The new client is going very well, and by going slowly, one center at a time, what comes out is so much better. It makes me realize I should do this with the server as well; and also with the tests.

Two things hold me back: 1) leaving behind the old code, which means that I need to port the data. More than that, it's the feeling that I couldn't heal the other structure, I had to make a new one instead. But it does feel like it's so much work to fix, compared to doing it anew properly. Perhaps this is what Alexander referred to. Perhaps it's a big void transformation, but still preserving existing structure, so that the old data can be moved to the new one.
2) This will take longer. And I feel a strong intention of making this useful to others, soon.

I guess that behind this there are strong misgivings. If I keep on using AI, the misgiving that I'm not creating living structure, when I have a chance to. And if I don't use it, or barely using, the feeling that I'm leaving myself behind.

This has to be decided right now. Funnily enough, it's possible to create something of value by hand that can scale massively, because of computers and the internet. If vibey is something small, vibrant and powerful, it can be done by hand. And if doing it by hand is required to be able to unfold something with a high degree of life, then the path ahead is clear.

I started with cserver, from scratch. I decided not to sign the cookies, since they are just opaque ids.

### 2026-06-03

Thinking about how to provide access to s3/backblaze in vibey without 1) each customer getting having to get their own account; 2) each customer sending every request through our layer. Something like: credentials scoped to buckets, with usage tracking and usage limits.

Claude:
"  Backblaze B2 has this almost natively:
  - You can create application keys scoped to a single bucket with granular permissions (read/write/list). These are long-lived but revocable.
  - One Vibey master account, one bucket per customer (or per project), one scoped key per bucket.
  - Customer's app talks directly to B2 with their scoped key. Your servers never touch the bytes."

For usage, we issue two keys: read & write. When limits go beyond a certain point, the write key is revoked. Same for the read key. We poll every N minutes per bucket to see how much ingress/egress has been done.

There can be an agent for syncing the project to backblaze automatically.

tests as calls concerning an interface, the outermost part, the implementation as calls concerning the logic. Tests can be simple enumerations, or they can also assert invariants. Good tests approximate mathematical proofs of correctness, but they must do it over inputs and outputs, not over the logic.

Put the main doc only in ai mode, if you edit it during the dialog, put it again below, to see it and not bust the cache. Thought about putting the prompt also at the top too in the dialog, hidden but expandable, but no, let's hide the prompt, otherwise it will pollute the files. I'm a bit torn on it, but it feels like it doesn't belong, because it's not user generated, while the main doc is. So let's skip it.

### 2026-06-01

Ideas for dialog:
- Switch between AI, human and terminal.
- Experiment: make the text box be inside the dialog, rather than fixed at the bottom. When you're scrolling up, usually you don't need to enter anything.
- Show the currently selected message, super useful when you read up. Compare to the experience of a web chatbot or a terminal agent, where there are very weak boundaries between messages.

===

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**.

See the settings page of client.js. Don't do anything yet. Then see the settings page of cclient, where we're working. Add just something to add an openai subscription.


### 2026-05-30

The big problem (I think) is the trillions of human hours we lose to 1) not having an unified representation to data; 2) not having an unified dataspace. This is seen in us poring over something that we cannot see "directly", and us switching between several apps and contexts to get a single thing done. This is where the waste/friction lies. This is what vibey + cell are trying to solve. How will things be different if they work?

1. Anyone can see the data in question **directly**.
2. Everyone will be able to work in one place rather than switching from here to there.

Solving these problems makes it much more fun to work with data. Immediate feedback, closeness. It's the same two elements that make a good text editor so powerful.

Some notes on Alexander - The process of creating life:
- I now find a deep meaning of equivalence: with A and B (living structure and living process, but it could be anything), you could expect some As to generate some Bs, and have partial one to manys. But true equivalence means: they are the same. Every A takes to B and every B takes to A. Then, A and B are complementary ways to look at the same thing, the same elephant. Equivalence is arrived to, it's not a starting point. You start by looking at the distinction and arrive at unification.
- Generative processes with AI, for creating live code. How could we do it?
- Prigogine had the conclusion I also saw emerging in code: change and time are the same.
- "When the wholeness unfolds unnaturally, value is destroyed. When the wholeness unfolds naturally, value is created."
- Alexander: machines as teleological, worth it only for a goal. Whys are about goals, or processes? What if we shift whys to processes, to the present and the action, and not just the goal? This would be what turns ends into means. From a Buddhist perspective, you could see liberation as the lack of ends. If there's no desire, there's no end. Politically, it makes sense. The more ends are emphasized, the more horror is justified.
- Trillions of processes vs billions of them being alive reminds me of infinite real vs infinite natural numbers.
- Creativity as respect for what exists.
- The principle of increasing wholeness. It feels in complete contrast to entropy and the heat death of the universe.
- Smoothness as the defining characteristic of living process. Continuity.
- Structure preservation as the upholding of consistency as the system grows.
- A thought: wouldn't LLMs be probabilistically structure preserving, by inferring the next token from the previous ones? There's a step-wise process to it that resembles the other. To what extent can they be made to see the whole?
- The fifteen properties are not just conditions. They are the verbs of the process of creating life.
- Idea: perhaps the roughness transformation is required by higher or lower levels of scale that are not apparent at the scale to which something looks rough.
- "ultimately, the process, not the design, [is] which gives life to a building. Thus, the issue of process is immense. In its impact on the quality of architecture, it is more important than the static structure of the designs."
- "There is no design. The building arises from the process."
- "This harmony results because of a stae of mind in which the makers actually *see* the wholeness directly and accurately: that is, they see the system of centers that forms the wholeness."
- "This "paying atention to the wholeness" is essentially synonymous with love of life. (...) For a person to become part of that wholeness, to extend it, love does - must - enter in."
- "IF, as I have argued, natural structures get their life only from the smooth unfolding of the wholeness, it must follow that structures we build also will have life if they are created by unfolding wholeness, and will not have life if they do not."
- "Yet it all come from images, hardly ever form life."
- "The success of this process depends, always, on sequence."
- "it is just the appearance of images in human thought which first deflects the natural unfolding process, distorts it, destroys it, and begins to create ugliness."
- "the much-hailed "great" works of architecture of the early 20th century were hardly better than questionable nonsense"
- "The image-driven process, by its nature, produces things which are dead."
- "Creativity comes about when we discover the new within a structure already latent in the present. (...) our most wonderful creations come about, when we draw them as extensions and enhancements of what exists already."
- You could perhaps say that structure-destroying processes will be left aside because history and nature themselves are structure-preserving. What will come out of this is a new, industrial way to build in a structure-preserving way.
- "The building is created by attention."
- "The denial of this point of view, is the chief way in which 20-thcentury development destroyed the surface of the Earth."
- "If we do one thing at a time, and if what we do is wholesome and sound, then whatever comes next will work. We do not have to tie it down ahead of time for fear of some imaginary potential catastrophe of "design". Instead, we just go step by step, doing what is required as well as we ar able, with confidence that the next thing, too, will work out somehow when its time comes, but that it need not be worked out now."
- "Generative processes tell us what to DO, what ACTIONS to take, step by step, to make buildings and building designs unfold beautifully, rather than detailed drawings which tell us what the END-result is supposed to be."
- "Living structure in buildings can only be GENERATED. It cannot be by brute force from designs."
- "The practical crux of unfolding, the essence of every living process (...) is tht it is above all a GEOMETRIC process. (...) The unfolding is geometrical in its ESSENCE."
- "The law states simply this: ALL the well-ordered complex systems we know in the world, all those anyway that we view as highly successful, are GENERATED structures, not fabricated structures."
- "We know that A-C happened in time in some *meaningful* way, and in a way which mattered, and which gave them their deep essential structure. In D-F, the role of time is insignificant, trivial. Time did not affect the structure, or contribute to its design."
- "It is here, that we shall see the vast superiority of generated plans. They avoid mistakes."
- "Computers and computer networks, and software, are all enormously complex. It would be natural to expect, therefore, that we must have a theory of complexity, that we have an effective and sensible way of thinking about the best way to *create* complexity. (...) one would expect that we have at least asked ourselves *how*, in general, a complex structure may become well-formed."
- "once we have the geometry of complexity fixed in our minds as a target, we may then understand better the purpose of the chapters which follow (...) intended to make the generation of living structure (...) achievable, possible, and likely to succeed."
- Note: Brooks' essential complexity is perhaps Alexander's generated complexity. It would be then not a matter of amount of complexity, but rather of the number of errors in the complexity.
- "I claim that in a professional planning/design/development process, this failure of adaptation is inevitable"
- "the plan E must inevitably have some 8,000 mistakes in it. There was, in the procedure used to generate this plan, no way to avoid it."
- Note: It almost feels like generated structure has no closed-form solution. That it's really an NP process, where you have to take it step by step. You cannot just jump to the end. But perhaps some aspects of it you can calculate in closed form, as a lossy transform/representation, without capturing the all.
- "it is essential - absolutely essential - that the adaptation, and the avoiding of mistakes, occurs at several levels of scale"
- Note: does nature do this, while unfolding potentially new structures? Can it somehow see errors before committing to a decision, rather than playing them out all the way and letting death select them?
- Note: generation allows adaptation. Adaptation prevents mistakes.
- "The valuable *decision time* need not be done by a highly paid worker - it can be done by family members themselves (...) and the only thing the construction worker or crafstman must do then is to cut, nail and place material correctly"
- "A mistake, is ultimately a gemoetrical problem, which bears on what we call function"
- "If you wat to get a system of centers to appear in that cup or glass, you must introduce them in a certain order (...) This is what the loose term "unfolding" means."
- "Thus the importance of time (...) allows you to get each next layer of structure from the previously established layers of structure. Complex, generated structure *cannot be arrived at in any other way*. (...) *That is the secret of the whole thing*"
- "The key to complex adaptation in a generated structure lies in the concept of differentiation. This is a process of dividing and differentiating a whole to get the parts, rather than adding parts together to *get* a whole."
- "the way forward in the next decades, towards programs with highly adapted human performance, will be through programs which are generated through unfolding, in some fashion comparable to what I have described for buildings."
- "*The real essence lies in the structure-preserving transformations, which move the structure forward through time, and which are primarily responsible for the success of the generating process.* The needed transformations are not merely trial-and-error steps"
- "To assume that the point of generated structures is merely slow, step-by-step evolutionary adaptation, is to make the same mistake that early adherents of Darwinism made in biology - to assume that small steps *alone*, modification coupled with selective pressure, would be sufficient  to get a genotype to a new state"
- - "The argument put forward is that the high level of complexity we need in urban tissue, orking and dwelling spaces, computer programs, etc., can only be attained when an existing, albeit latent, structure unfolds through differentiation to the needed level of complexity. Each differentiation, i.e. decision, is made in sequence and in context. It is reworked right then and ther until it is mistake-free, i.e., it takes into account all the connecting relationships. This must be done in sequence and in context because the necessary information for a successful decision is not avaliable prior to that step in the unfolding."
- Note: is there a morphogenesis of optimal algorithms?
- "each differentiation *adds relationships and brings ore interdependence among the centers*."
- "it is vital, for success, that the process is *able* to keep on cramming in more and more relationships, so that the mistake-avoiding adaptations can continue to be generated."
- Note: reminds me of a good Turing Machine, always continuing.
- "This "cramming" of complexity brings with it a need to constantly clean out any non-functionalities and leave only the most simple possible gemoetry in place. It is simple structure that allows for maximum relationships"
- "The structure seeks, above all, to avoid mistakes. To do it, it promotes an activity of structure-preserving transformations, to maintain coherence."
- "(1) There are individual processes of design (...) A local process of creation creates one complete center, large or small, from conception to completion. It is done in a controlled and continuous sequence (...) It does have a completion date. (2) There is an accretive process which forms the larger structure (...) spread out in time and place, and are initiated independently by many different people. (...) Any definition of living process, must take both kinds of process into account. (...) this overall process generally has no finite beginning or end, and no completion date."
- Note: the above has a strong bearing towards a single, consistent process, vs a whole much more loosely coordinated, but still coherent.
- Note: I wonder why prefabricated pieces don't create the simplest designs. Perhaps because they can't avoid the mistakes.
- "This is the nature of all living process in the built environment. At every scale, every act of formation is both local and global, both creative/complete and accretive/incomplete."
- "Here we come to the core of the secret. The fifteen strcture-preserving transformations have the capacity to conserve and to create. (...) it is *new* coherence that they generate. Yet they are conservative and pull the future from the present."
- "But the essential point is this. We do have a system of transformations which are, in principle, capable of nudging a system steadily towards living structure, and these transformations are precisely those transformations which govern the life of the centers themselves - and hence the wholeness (which *is* the system of center), too."
- Note: the transformations would be the calls. The effect they produce in the wholeness would be the response. The response, bringing back the entire thing, reminds me of the functional extreme of returning the entire world/state after a single call. But in this case (generated structure) it is apt and fitting.
- "When I said, there, that contemporary design and planning and development are too often structure-destroying rather than structure-preserving, what I meant was that the fifteen differentiating transformations were largely missing from day-to-day processes."
- "*in a way that guarantees it has a positive impact on the larger whole.* (...) Cities and buildings can become coherent and harmonious, merely as a result of following this rule."
- "The idea that there might be a single class of processes at the core of all living processes in society - hence at the core of all building, engineering, and all construction of our world - may shock the modern mind."
- Note: it'd be very interesting and fruitful to apply this to algorithm design.
- "The structure-enhancing step, which again and again intensifies one center and creates "hooks" to other new centers, might even be called *the* fundamental process."
- The Fundamental Differentiating Process:
   - Pay attention to the wholeness that already exists, actual and latent.
   - Identify the weakest place, these are latent centers.
   - Work on that center using one or more of the transformations.
   - New centers are born. The life of the whole should be larger.
   - Test that life has indeed increased. Also test that the change you've done is the simplest possible that would get the job done.
   - Go back to the beginning.
- Note: if designs don't have a faithful representation of the centers of the existing thing, then new designs will almost certainly destroy the wholeness that was already present there. Think of UI redesign in an existing app.
- "Simple as this is, focusing on creation of one good thing at a time, is already likely to work (...) After a person has grasped that idea, I may point out that sometimes, the good things that we do work even better if each small good thing also helps to achieve some slightly larger good thing."
- "It is a living process when, in *content* - not necessarily in outward verbal form - it accomplishes, and approcimates, the scheme I have described."
- "The idea of living process, is, in a sense, only a formal way of talking about your natural process."
- The optimal algorithm could be done as a differentiating/unfolding process.
- Structure restoring transformations: even if you start from a bit of a void, you need to work in the existing world. Are structure restoring transformations also structure preserving transformations? I think so. It might be way more work to take something with a low degree of life and make it have a high degree of life, but it must be possible. The question is how much of a void transformation you need to apply first, but it's perhaps less than we think. In this, I disagree with Alexander (without knowing anything myself) about how when a process goes bad, it's broken. We need to learn the art of healing structure.

### 2026-05-29

vibey is a client over your own server! with the addons of ai and proxy, but that's what it is. It's beautiful. it's the os. and then will come cell. The measure of vibey will be to replace multiple apps with one that can connect to them. The one integration layer, with one representation layer. And for cell, to replace spreadsheets and most programming languages. That's the bar. Now go!

A remarkable insight I got from a startup founder: customers do not buy solutions, they buy problems. They trust that you understand the problem they have and that you can do something about it.
For people (like me) who are solution oriented, this borders on revelation.

fun -> engagement -> growth -> empowerment

### 2026-05-27

I've decided to not give a free tier on vibey. Actually, the free tier is to run it locally, or set it up in a VPS following the instructions.

Base fee: 5 EUR/mo plus the engine, so it'll be about 8-9 EUR/mo with the base engine. Only one option to start, then you can upgrade the engine.

For practical purposes, S3 is free (we only pay per requests, which is minimal). We only need to pay if we need to do disaster recovery. It's like insurance that you only pay for if you have an accident, but the cost is still relatively low.

### 2026-05-26

===

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**.

- I want the settings to be an interesting view. I'm thinking of a situation where both the left and the right panels have an animation that they rotate so you can see the "back" part of them, revealing the settings. How could we go about it as a CSS animation?
- We're working on cclient. Please put a placeholder for the left pane to flip. Make it depend on a state variable (settings.show).
- That worked quite well! But can you make it flip "in place", rather than eat the space of the right pane?
- It worked! Please do the same on the right pane.
- Please take the settings wheel at the bottom left and put it next to logout, on its left, with a button like it. Also gray, and saying settings next to the dented wheel. And instead of a dented wheel, put a shovel.

### 2026-05-25

Vibey's what is a three by three (reprise, different layer 3):
- Layer 1, files: editor, viewer (of text & other formats), publisher (of pages & files).
- Layer 2, dialog: AI harness, terminal, chat.
- Layer 3, server: embedded apps, container (isolation), engine/server (receive email & HTTPS)

The sequence:
fun -> engagement -> empowerment

### 2026-05-24

Vibey is about something with the potential of making users feel great: being able to express your thoughts in one place, to retrieve your other thoughts and related files, and immediately publish them in the open web. Have AI next to you, at arm's length. And yave your own custom apps, plus a few others you get from others, in one place. It's a proper digital home to thrive. And because it's really yours, no profit motive can take it away from you (open source + profit bound).

It's no fun to be switching from one app to the other, it kills your engagement. So let's put everything necessary in one place, comfortably.
It's no fun to not be allowed to peak under the hood - or modify the engine when you learn more. So let's open that door.
It's no fun for a loved product to enshittify. So let's prevent that.

Maybe the essence of vibey is the single place nature of it. It's like a unix of sorts, in the web.

Thrive through fun. Have fun and prosper.

This is the why of altocode: let's make it fun to work with computers. Make computers fun again.

I wonder if the reason so many people with seemingly good jobs are so eager to run away from them and work on something with purpose is because so much of the work is soulless, nowadays.

In a digital world that's desperate to engage users, humans are starved of real engagement.

Launch list:
- Edit files
- See non-text files
- Publish text files
- AI chat/harness
- Send emails to AI
- Human chat (invite to project)
- Embedded apps

The idea with vibey is not about what you can do if tokens are unlimited and free, but rather: what you can do with useful, affordable tokens, and a single place on which you and others can work with ownership and flow?

### 2026-05-21

Thinking UIs in Alexandrian terms: evolve the view from the pure data view. Make some centers stronger. But start with the data.

https://paulgraham.com/before.html
"Mark Zuckerberg didn't succeed because he was an expert on startups. He succeeded despite being a complete noob at startups, because he understood his users really well."

https://paulgraham.com/growth.html
"A good growth rate during YC is 5-7% a week. If you can hit 10% a week you're doing exceptionally well. If you can only manage 1%, it's a sign you haven't yet figured out what you're doing."
"In theory this sort of hill-climbing could get a startup into trouble. They could end up on a local maximum. But in practice that never happens. Having to hit a growth number every week forces founders to act, and acting versus not acting is the high bit of succeeding. Nine times out of ten, sitting around strategizing is just a form of procrastination. Whereas founders' intuitions about which hill to climb are usually better than they realize. Plus the maxima in the space of startup ideas are not spiky and isolated. Most fairly good ideas are adjacent to even better ones."

"A company that grows at 1% a week will grow 1.7x a year, whereas a company that grows at 5% a week will grow 12.6x. A company making $1000 a month (a typical number early in YC) and growing at 1% a week will 4 years later be making $7900 a month, which is less than a good programmer makes in salary in Silicon Valley. A startup that grows at 5% a week will in 4 years be making $25 million a month."

"Understanding growth is what starting a startup consists of. What you're really doing (and to the dismay of some observers, all you're really doing) when you start a startup is committing to solve a harder type of problem than ordinary businesses do. You're committing to search for one of the rare ideas that generates rapid growth. Because these ideas are so valuable, finding one is hard. The startup is the embodiment of your discoveries so far. Starting a startup is thus very much like deciding to be a research scientist: you're not committing to solve any specific problem; you don't know for sure which problems are soluble; but you're committing to try to discover something no one knew before. A startup founder is in effect an economic research scientist. Most don't discover anything that remarkable, but some discover relativity."

https://paulgraham.com/ds.html
"I have never once seen a startup lured down a blind alley by trying too hard to make their initial users happy."

"In software, especially, it usually works best to get something in front of users as soon as it has a quantum of utility, and then see what they do with it."

"The feedback you get from engaging directly with your earliest users will be the best you ever get."

"Consulting is the canonical example of work that doesn't scale. But (like other ways of bestowing one's favors liberally) it's safe to do it so long as you're not being paid to."

"Some startups could be entirely manual at first. If you can find someone with a problem that needs solving and you can solve it manually, go ahead and do that for as long as you can, and then gradually automate the bottlenecks."

"The need to do something unscalably laborious to get started is so nearly universal that it might be a good idea to stop thinking of startup ideas as scalars. Instead we should try thinking of them as pairs of what you're going to build, plus the unscalable thing(s) you're going to do initially to get the company going."

"It could be interesting to start viewing startup ideas this way, because now that there are two components you can try to be imaginative about the second as well as the first. But in most cases the second component will be what it usually is — recruit users manually and give them an overwhelmingly good experience — and the main benefit of treating startups as vectors will be to remind founders they need to work hard in two dimensions."

https://paulgraham.com/yahoo.html
"The worst consequence of trying to be a media company was that they didn't take programming seriously enough. Microsoft (back in the day), Google, and Facebook have all had hacker-centric cultures. But Yahoo treated programming as a commodity. At Yahoo, user-facing software was controlled by product managers and designers. The job of programmers was just to take the work of the product managers and designers the final step, by translating it into code."

"Microsoft (back in the day), Google, and Facebook have all been obsessed with hiring the best programmers. Yahoo wasn't. They preferred good programmers to bad ones, but they didn't have the kind of single-minded, almost obnoxiously elitist focus on hiring the smartest people that the big winners have had. And when you consider how much competition there was for programmers when they were hiring, during the Bubble, it's not surprising that the quality of their programmers was uneven."

"In technology, once you have bad programmers, you're doomed. I can't think of an instance where a company has sunk into technical mediocrity and recovered."

https://paulgraham.com/gba.html
"Hackers are unruly. That is the essence of hacking. And it is also the essence of Americanness. It is no accident that Silicon Valley is in America, and not France, or Germany, or England, or Japan. In those countries, people color inside the lines."

==

Idea: per project AI credentials. But let's see it when there's an actual need for it.

Make the settings modal come from above, like the guake console, a bit like a flying saucer that comes back shortly, then goes back up.

==

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**.


### 2026-05-20

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**.

- We're working on cclient. Please make the Edit & View buttons not be grayed out when they're not the current mode, instead paint in faint blue the one that's currently selected, like we do for the current file.
- I need some semi subtle coloring on the doc vs dialog icon. Let's try blue for the icon for a doc and violet for the icon for a dialog.
- It didn't work. Please add a brighter violet and use that for the dialog. Also, make the dialog icon be the one with the dots, not the one with the lines.
- Please add the UI for tooltips so that there's an unconditional 'J' on top of each file entry on the left pane. I'll change it in a minute.

### 2026-05-18

You could have vibey apps with their own servers. But the clients still can run on the user engines, and also save data there too.

- alexandrian paradigm: generate structures, don't fabricate them. This is the only way to avoid errors.
- number of relationships is number of errors: n^2 of the number of elements.
- specs are the new code: not, because specs are much more of a probability space than a certainty. the amount of errors can diverge enormously.
- can model training save us? In Alexandrian terms, they can't, unless they can see the wholeness.
- Can AI understand the relationships when differentiating structure?
- What I'm working with now: human in the loop at every step, at every transformation. But use AI for some of the transformations.

The goal: from an Alexandrian perspective, determine if the degree of life of the thing is high or not. That's it.

Personal goal: see all my files in vibey, read epubs in vibey, edit in vibey, code in vibey, use it as my main AI harness, as my main terminal, put my blog there, put my apps there. Make vibey personally load bearing.

If an embed points to a process that is down, add a fallback button that can restart the process. This should be part of the syntax.

Another internal app: anki-like flashcards.

===

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**.

- We're working on cclient. Please add a 'X' tooltip to remove (and be done removing) files.
- This is addicting. Please add a B tooltip on the chevron to go back to projects.

### 2026-05-17

How can we create programs that are whole, in the alexandrian way?
- Do things step-wise.
- See the wholeness.
- Test each change and make it fit well.

Questions:
- Can AI see the wholeness?
- If it can't, can we still generate wholeness step-wise using AI to execute operations for us?

These notes, perhaps more than the end result, reprsent the process of building vibey.

====

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**.

- I'm working on cclient.js. Could you add a tooltip on top of each of view / edit, with a V and and E respectively, when I press on the command letter?
- I want to make the new file modal to also allow to create a dialog instead of a file. Maybe a button to select which, the input below will show the name for whatever was chosen. Let's just do the UI for now.


### 2026-05-16

CPU: linear, read text (prefrontal cortex)
GPU: parallel, see image (visual cortex)

Vibey's what is a three by three:
- Layer 1, files: editor, viewer (of text & other formats), publisher (of pages & files).
- Layer 2, dialog: AI harness, terminal, chat.
- Layer 3, server: run apps, send data (HTTPS, email), receive data (HTTPS, email).

Offline, you lose the last feature of each layer.

### 2026-05-14

Dualism between icon and word. Every icon has a name, every name an icon.

Idea for keeping the textarea (instead of creating a custom textarea-like element) with vim mode: change how the cursor looks, compute position and change it while being in normal mode.

claude: "Yes — caret-color: transparent hides the native cursor, and then you overlay your own block cursor (a small div or ::after pseudo-element) at the computed position. In normal mode you show a block, in insert mode you restore caret-color to visible and hide the overlay."

===

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**.

- We're working on cclient.js. Please add a foot icon next to the logout button. Also vertically align the logout button better so it's consistent with the project name on that top header.

### 2026-05-13

There's an interesting dualism between OS and language that reminds me of client and server. I'm not exactly sure which is which. In what I'm building, the parts are vibey and cell.

The pattern for validating that the URL is correct is to make certain updates run the `read hash` responder, and let that responder validate against what's there. It took me a couple of tries to figure that out.

AI for creating generated structure:
- Can AI see the wholeness?
- Can it differentiate existing centers to strengthen them?

In vim, the file itself vs folders is modal, in the way I use it. I'm either in a file, switching files with shortcuts, or going

Shift+click to open several tabs, autodivide the screen vertically!

Two questions coming from reading Alexander's The Process of Creating Life:
- Is language geometrical?
- Is generated structure non-teleological?

What I perceive that clankers are good at:
- Pointing out issues in code.
- Coming up with a quick prototype.
- Explaining things.
- Giving feedback about ideas.

===

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**.

- Please add the name of the open file to the left of View and Edit
- Please add crosses next to the files (like we do for projects) when the remove mode is on.

### 2026-05-12

What is there?

- Files
- Processes/computing
- AI as a shell, also as programmer
- The ability to receive traffic (HTTPS & email), not just send it

===

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**.

- Can you highlight more the file that is currently selected?
- Now, please give a bit more of padding to the file entry on the left, it's too cramped
- If using the golden ratio, how could we still shrink the left part of the view and increase the right one?
- If there are unsaved changes when closing the tab, all I can do is just stop it with a before unload? Or just delay it a bit while I save? What are my options?
- What's the frequency of saving on google sheets?
- Please add the button and the modal (copying the modal from the one for new project) to create a new file. I'll handle the button logic. Please make the button a big, nice one at the bottom of the left column.

### 2026-05-11

Attachments suck, because of their separateness.

I just realized that everything is a file, in vibey. Or almost. It's all on the left side. Innovations:
- Don't show the directories, just put them as prefixes. To narrow it down, just search. (idea to experiment with: you can click on the slashes to hide/show a prefix).
- The dialogs go there too.
- The apps go there too, at the bottom. Embeds can be little docs that open apps. You could put it as an app.

There's really just two views:
- Project/engine (outer)
- Inside the project (inner)

Modals (alcoves):
- Engine properties
- Project connection properties
- General settings: AI, editor mode

Show the project under its engine, isomorphic to how files are inside projects.

Engine > Project > File

With processes represented as files (through an embed block), we have a single interface for them. It's a bit rough, but it can make the process much more tangible: just tell the agent (or the process itself) to put the file with the embed block so you can see it.

Should we just use the embed block as the only way to link to an app? Perhaps!

A wild idea: have iframes to siloed apps, like figma. Open a figma project in a vibey tab, have it accessible there.

Parts:
1) Editor
2) Engine
3) Apps?

Having everything in vibey reminds me of emacs.

What would make vibey production ready?
- Solid editor.
- Rewritten server with SSE state in redis & fork, even for local.
- Autobackup to S3.
- Engine.

Engine/project config:
- Nginx config (forwarding of A traffic)
- Forwarding of MX (email) to different projects
- Show IP
- Cron of when to restart
- Confirm upgrade of OS, if available

What can you do with vibey?
- Internal apps/dasboards.
- Research.
- Simple workflows involving AI.
- Publish docs/articles/landing pages.
- Degoogling?
- Email?

Thinking not in terms of flows, but actions/transformations:
- AI
   - Send a message
   - Receive a message
   - Browse previous messages
   - Inspect tool usage
- Files
   - Create/delete
   - Edit
   - Upload
   - See
      - Text
      - Code
      - Audio/video
      - PDF
- Host
   - Receive HTTPS calls
   - Receive emails
- Publish/
   - Static markdown
   - Static HTML
   - Folder/project (readonly)

Things in the back:
- Autogit
- Autobucket
- Uptime
- Forwarding

### 2026-05-09

Thinking of Steve Jobs' x3 when he announced the iphone. A great deal of the value was on the integration of those three things (ipod, phone, internet device). In vibey:
- File viewer/editor
- AI agent
- Personal cloud server

With native apps, the apps are guests on your computer, although they mostly have their own data space. With cloud apps, you're a guest in their space, also your data. With vibey apps, your space is again home, and the apps are guests. The apps can use the dataspace of your home, rather than being a silo. This has profound and immediate consequences in what's possible.

Apps I'd like to have in vibey:
- Email
- Winamp-like player
- Tagaway-like photo/video organizer (tags, dedup)

Comparing vibey to something like exe.dev:
- Containers instead of servers/engines, so you can start over easily (though if there's a quick restore function, that'd be the same). But, with containers you can share the space of an engine with full independence between projects. Smaller blast radius.
- Autogit built-in.
- Auto backup built in.

It's crucial to be able to quickly see an earlier response from the agent as one block, and to go up visually. In terminal based agents, scrolling up still makes it hard to distinguish what was 2-3 messages ago.

#### Incident report

Error messages from user: 22, 502 unreachable the app. The static website is up.
Checking things at 0620 the next day. acdev server is up. Last restart five days ago.

- Error reported on 2026-05-08 around 22 UTC.
- Checking things at 0620 on 2026-05-09. Host server is up. Last server restart was five days ago. Static page is up. App is confirmed down with 502.

Vibey logs:

```
vibey-1  | 2026-05-08T22:19:48.784Z DOCK-RS 47403640ea97 [ID REDACTED]-[PROJECT NAME REDACTED] OK (45ms)
vibey-1  | 2026-05-08T22:19:48.784Z HTTP-RS 9d16dc0e14a8 GET /project/[PROJECT NAME REDACTED]/dialog/20260508-221924-triggered 304 (324ms)
vibey-1  | 2026-05-08T22:21:09.210Z HTTP-RQ 173f1f0ec08d POST /trigger [IP REDACTED]
vibey-1  | {
vibey-1  |   priority: 'critical',
vibey-1  |   type: 'server error',
vibey-1  |   error: TypeError: Cannot read properties of undefined (reading 'prompt')
vibey-1  |       at AsyncFunction.routes (/app/server.js:3846:28)
vibey-1  |       at process.processTicksAndRejections (node:internal/process/task_queues:103:5),
vibey-1  |   stack: "TypeError: Cannot read properties of undefined (reading 'prompt')\n" +
vibey-1  |     '    at AsyncFunction.routes (/app/server.js:3846:28)\n' +
vibey-1  |     '    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)',
vibey-1  |   origin: 'unhandledRejection'
```

Issues:
- No proper validation on the endpoint.
- No restarting on uncaught error.

Immediate fix: require a body.

Later: add workers to the model, and shared memory. Restart workers when they fail. Add supervision with mongroup.

### 2026-05-07

Things I'd like to do in vibey, reprise:
- Have my blog there.
- Use it as my editor of choice.
- Put my pivs there.
- Put my family's pivs there.
- Publish my open source code there.
- Receive and send email there. Put my old emails there as well.
- Eventually, trust it enough to have my own journal there.
- Have old, small, custom apps I did a long time ago running in a vibey container, for easy access to files beyond the app itself.

I'm rethinking the tagline to something else. The key thing is not making things happen, but creating a digital, habitable, personal or small-group-like. That's the key, the trust and the habitability.
- Make yourself at cloud
- Your home cloud
- A cloud of your own
- A personal cloud

Habitability: a space you can make your own. The building blocks, properly shaped, so you can build with them. More than enough trust so that you decide it's worth your while to build upon this. Building requires: the possibility of doing it, and the trust to make it good to invest time in it.

Idea: distribute apps with docker compose + a clone of a repo.
- Vibey could be an open, useful infrastructure to distribute apps. You could build an app useful to a lot of people with the app not having to scale beyond one or a few users, if the app works on the vibey engine of those who are using it. It's a much more distributed way to run apps in the cloud.
- The fundamentals are:
   - The vibey engine, which gives you: 1) a container with unix; 2) files with git + backup; 3) agents that can work on them; 4) an UI to see files and dialogs.
   - Some form of in-built auth that can be optionally used as a default.
   - Communication channels: email in/out, https in/out (with domain/dns integration, both).
- Could vibey itself, the client, be built as an app? Not the server, but perhaps the client. Or rather, an alternative vibey client could definitely be built as an app!
- Email and pivs (tagaway-like) as vibey apps built on top of the primitives! This would really work much better than in-built apps!
- How would you open an installed app? Where would you list them? How would you start/stop them? All of this needs to grow organically around the main interface with the list on the left and the views on the right.
- What would be different:
   - Your files are part of the project, not the app. You can see them directly. Other apps can see them too. It would be truly Unix like. Unix is low ego, small utilities that cooperate, instead of unwieldy siloes.
   - You could embed the apps anywhere, rather than boot them like they were 80s game that took over your entire computer. If you want full screen, open it in a tab.

Agents/AI is something that increases the temperature of the reaction, perhaps making it possible. But most of this could have been possible five years ago. It's just more valuable now to more people because they don't have to code to be able to build their own digital spaces, their own apps. Vibey is, essentially, an OS-like proposition. A higher level OS. I wasn't expecting this.

Company accounts don't fit in vibey. Every account is personal, but companies can pay for company accounts, each of them bound to one employee. The measure of vibey has to be human.

Concerning the s3-like-rsync:
- Have a rsync summary of what's in a bucket as a file inside the bucket. When rsyncing, compare that file against your local one. Redo the rsync summary with a special command, like tarsnap's --fsck.
- Dedup can come later. What matters at the beginning is quick syncing between the fs of the container and the bucket, so we're backed up.

### 2026-05-05

vibey ideas:
- the space keeps unfolding. there's no concept behind it, unbelievably, except that 1) it's an openbound; 2) it's about unfolding a digital space. lifespace.
- vibey is a good, whimsical name.
- It is an integrated whole, rather than multiple apps.
- The big four, to be slowly unfolded: editor, dialog/terminal/channel, files, email. Eventually, cell. Cell is code you can see, unlike the opaqueness of normal code that we still support.
- Files: backup, dedup, share.
- Email: attachments should be files.
- There should be a personal project that's a container where the files are. I wonder if the email should be there too, as a special app that is running and you cannot modify. This is the main project.
- Custom icons with own style: scribe tablet and chisel for new doc; talking head for new dialog). Ray for connect, star snowflake for config, door handle for logout.

Think and feel how others would use vibey in different, fitting ways: think of user stories.

Things I'd like to do in vibey:
- Have my blog there.
- Use it as my editor of choice.
- Put my pivs there.
- Put my family's pivs there.

Big idea: vibey apps can be docker composes + clones. Apps would then be run on users' engines. You could make an app for just a few users per database/tenant, because the tenants would be distributed. The altocode email, or a new version of tagaway, could be vibey apps. And instead of being in a centralized cloud, the app tenants can talk to each other through open protocols.

Interesting idea: have rsync-like sync to s3-like storage constantly. Still have your normal disk. But have auto s3-like backup. Eventually, perhaps, with dedup.

### 2026-04-23

claude --model=claude-opus-4-6 --dangerously-skip-permissions

OK, big simplification: in the project view, in the URL, we have the path to the file. We're working with files. If it's a doc, it's prepended by doc. The only trickery is with dialogs, since we want to avoid showing the status as changing.

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**. After that...

- We're working in cclient.js. Make the logout button more purple, using a color we already have defined. Make it closer to the top, slightly bigger in font.
- Add that purple to the list of colors we have above
- Please make all docs in the list of files (those that start with doc/) have a little doc icon next to them, and have a blue color.
- Please add a toggler between view and edit mode (using the words) on the top left part of the right pane. I'll handle the reactivity.
- Please now style the textarea so it takes up almost the entire space and its colors match its surroundings.

If good structure is structure-preserving, new innovations can be created from the same shape as the old ones.

https://courses.cs.washington.edu/courses/cse550/20au/papers/CSE550.ritchie84evolution.pdf
- Make it about collaboration from the beginning. A project is a shared space.
- Files are the core of the system.
- Non-file things are presented as files: device files.
- The other thing an OS needs besides files is processes.
- File calls: read, write, open, close, create, delete, print. And shell: run commands.
- i-nodes: representation of files, a linear array, also in disk. Protection mode, type, size, physical blocks holding the contents. Directories are a special kind of file.
- The filesystem took no path names in calls, which was a major inconvenience. All directories were created on startup, not at runtime.
- Originally, only one process in memory at a time.
- Process calls: fork, exec, wait, exit. My understanding: fork creates another process bound to the one from which you fork. Exec makes your current process do one thing, forgetting everything that happened before. Wait is just for child processes created by fork.
- stdin and stdout were device files.
- Shell loop: 1) close all open files; 2) read a line from the terminal; 3) link to file in the command from the terminal, open file, remove link, exec that file -- it's like jumping to that file/executable/call; 4) let the command run until it calls exit, re-read the shell program and go to step 1.
- processes had entries in the process table: state, id, parent, open files, ??
- Later, the shell became a userland (normal) program instead of part of the OS.
- What would come later: redirection, background processes, shell files, pipes, filters
- "Process control in its modern form was designed and implemented within a couple of days. It is astonishing how easily it fitted into the existing system; at the same time it is easy to see how some of the slightly unusual features of the design are present precisely because they represented small, easily-coded changes to what existed." Pure unfolding. The paper's title is about the "evolution" of the system.
- The shell was the exec, in that it opened the file and transferred control to it.
- Messages were eschewed: instead, unix used files and processes.
- Buffer: a chunk of memory that has two markers: up to where it was written, and up to where it was read.
- The new process control system required special commands: commands that were run "inside" the current process, to affect its own state. If chdir is a separate command, it doesn't affect the current directory of the process running it. Other command-like functions, like login, also required this.
- Side note: it's beautiful to see the pattern of outer memory and inner memory. Memory vs CPU registers. Disk vs memory. This is reflected in unix: files for disk, processes to move things between disk and memory, while effecting transformations. This is even the case in programs: one function, or even one line is being run; the rest is in "disk", or rather outside, waiting for its turn. Computation is time going through (data)space and remaking it. And this duality is also in the OS (the outer) vs the programming language (the inner).
- Read/write pointers exist for each open file for each process. This is isomorphic with the buffer markers. The only difference is that a buffer can only be read/written by one process (not necessarily the same process for read and write, almost always different ones), vs a file can be read and written by multiple processes.
- "Solution of this problem required creation of a new system table to contain the IO pointers of open files independently of the process in which they were opened." Global state is required here, to jump between processes. Lifting state up.
- "Because both the Unix IO system and its shell were under the exclusive control of Thompson, when the right idea finally surfaced, it was a matter of an hour or so to implement it."
- "Perhaps the most interesting thing about the enterprise was its small size: there were 24K bytes of core memory (16K for the system, 8K for user programs), and a disk with 1K blocks (512K bytes). Files were limited to 64K bytes."
- "The genius of the Unix pipeline is precisely that it is constructed from the very same commands used constantly in simplex fashion. The mental leap needed to see this possibility and to invent the notation is large indeed." I think what makes this possible is stdin and stdout. Making a leap, you could say the same thing about functions: one surface for inputs, another one for a single output.
- In 1973, the OS kernel was rewritten in C (from assembler), and multi-programming was introduced.
- "Today, the only important Unix program still written in assembler is the assembler itself (...) It seems certain that much of the success of Unix follows from the readability, modifiability, and portability of its software that in turn follows from its expression in high-level languages."

nate b. jones:
"A few weeks ago, Andrej Karpathy posted an idea that more than a hundred thousand people bookmarked. On the surface it sounded almost too simple: use your AI to build and maintain a personal wiki. You throw raw material into a folder, articles, research, meeting notes, whatever you’ve got. The AI reads all of it, pulls out what matters, connects ideas across sources, flags where things contradict, and keeps a running set of organized notes that gets smarter every time you feed it something new. No database, no special tools. Just folders, text files, and an AI doing the work of a full-time research librarian."

a key idea in vibey is that interfaces for humans should be also accessible for agents. Using the same interface is a structure-preserving principle exemplified by unix using files for many things, including interprocess communication.

### 2026-04-22

interesting that parametrized queries emerged as a performance improvement. The key to the process is to separate code and data. Redis does this by default, so it doesn't need parametrized queries.

https://gist.github.com/chitchcock/1281611
"You wouldn't really think that an online bookstore needs to be an extensible, programmable platform. Would you?"
"I'm not really sure how Bezos came to this realization -- the insight that he can't build one product and have it be right for everyone. But it doesn't matter, because he gets it. There's actually a formal name for this phenomenon. It's called Accessibility, and it's the most important thing in the computing world."
"A product is useless without a platform, or more precisely and accurately, a platform-less product will always be replaced by an equivalent platform-ized product."
"Larry Tesler may have convinced Bezos that he was no Steve Jobs, but Bezos realized that he didn't need to be a Steve Jobs in order to provide everyone with the right products: interfaces and workflows that they liked and felt at ease with. He just needed to enable third-party developers to do it, and it would happen automatically."
"We don't get Platforms, and we don't get Accessibility. The two are basically the same thing, because platforms solve accessibility. A platform is accessibility."
"Amazon was a product company too, so it took an out-of-band force to make Bezos understand the need for a platform. That force was their evaporating margins; he was cornered and had to think of a way out. But all he had was a bunch of engineers and all these computers... if only they could be monetized somehow... you can see how he arrived at AWS, in hindsight."

a unix utility is a platform. It's a call. It's open ended. AWS is about calls that you can do, to use parts to build things, rather than buying in onto the entire pirate ship lego.

Seeing parallels here:
- The scarcity of good sequences (Alexander).
- Well formed formulas vs true formulas
- Real numbers vs natural numbers
- Complex systems vs simple systems

What are the useful parts?
- Markdown docs: list/create/delete/rename, read, edit
- Dialog with LLM (and perhaps humans): list/create/delete/rename, read, send message, receive message. Message can also be a file or image.
- Project (container): list/create/delete/rename, run command. Autofeature: autogit
- Engine: where a project runs. list/create/delete/resize.
- Auth: signup/login/logout (otp email, otp sms, password, passkey, 3rd party oauth), auth/authz
- Files: list/create/delete/rename, update (with or without version). Autofeatures: automatic de-dup, de-dup by chunks.
- Photos: builds on top of files. Tag, show near duplicates. Share, but where?
- Email: send & receive
- API calls: send & receive

I'm thinking of the iphone: a few powerful features, done well in one place.

I'm trying to build a FS abstraction that has versioning, chunking in built. And globally shared blobs so that we can save on space.
Arbitrary chunking throws away the information of when and how the file was created. The heuristic is that chunking based on diff can give you great compression for minimal complexity.

Two use cases to cover them all:
- Big binaries that are shared by different projects
- Mid-size text file (10mb-100mb) with ten appends per second.

Cloud-wise, the requirements are:
- Globally de-dupped.
- Autocompressed if compressible.
- Replicated in N places.
- Low, fixed cost of storage.
- Free download up to a certain point; metered download after another point.

And it should hook directly to the containers.

Thompson started Unix with files for a reason.

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**. After that...

- In cclient.js, take the project view and create a main area with two parts: a left part and a right part. Use the golden ratio to determine their proportions. The left one should be the narrow one.
- Make the logout button a bit smaller so it doesn't touch the right pane.
- There should be some space between the right pane and the right edge of the screen, like there is on the left
- Write a responder to get the files for a project
- Replace the contents of the left pane with a list of the files for the current project.

I'm doing unidirectional data flow by making all page changes be on the URL, and then read the state from there.

I'm unfolding the UI, step by step.

### 2026-04-20

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**. After that...

- Please port the new project modal we have in client.js to cclient.js. Try to make a minimal lift. cclient should be *clean* (I'll clean it later afterwards anyway).
- Why delete project takes a project slug? Please inspect the server.
- I'm getting a 404 when deleting a project. Is it because its container is down? Shouldn't then the server delete the volume? Please inspect.
- How did we do the autofocus in client.js? Don't change anything

https://simonwillison.net/
"Opus 4.7 uses the same pricing is Opus 4.6 - $5 per million input tokens and $25 per million output tokens - but this token inflation means we can expect it to be around 40% more expensive."

https://news.ycombinator.com/item?id=47793411
"EmanuelB
I can't notice any difference to 4.6 from 3 weeks ago, except that this model burns way more tokens, and produces much longer plans. To me it seem like this model is just the same as 4.6 but with a bigger token budget on all effort levels. I guess this is one way how Anthropic plans to make their business profitable.
During the past weeks of lobotomized opus, I tried a few different open weight models side by side with "opus 4.6" on the same issue. The open weights outperformed opus 4.6, and did it way faster and cheaper. I tried the same problem against Opus 4.7 today and it did manage to find one additional edge case that is not critical, but should be logged. So based on my experience, the open weight models managed to solve the exact problem I needed fixed, while Opus 4.7 seem to think a bit more freely at the bigger picture. However Opus 4.7 also consumed way more tokens at a higher price, so the price difference was 10-20x higher on Opus compared to the open weights models. I will use Opus for code review and minor final fixes, and let the open weights models do the heavy lifting from now on. I need a coding setup I can rely on, and clearly Anthropic is not reliable enough to rely on.
Why pay 200$ to randomly get rug-pulled with no warning, when I can pay 20$ for 90% of the intelligence with reliable and higher performance?"

https://sleepingrobots.com/dreams/stop-using-ollama/
"All of this makes more sense when you look at the incentive structure. Ollama is a Y Combinator-backed (W21) startup, founded by engineers who previously built a Docker GUI that was acquired by Docker Inc. The playbook is familiar: wrap an existing open-source project in a user-friendly interface, build a user base, raise money, then figure out monetization."

https://www.dbreunig.com/2026/04/14/cybersecurity-is-proof-of-work-now.html
"This chart suggests an interesting security economy: to harden a system we need to spend more tokens discovering exploits than attackers spend exploiting them.
AISI budgeted 100M tokens for each attempt. That’s $12,500 per Mythos attempt, $125k for all ten runs. Worryingly, none of the models given a 100M budget showed signs of diminishing returns. “Models continue making progress with increased token budgets across the token budgets tested,” AISI notes.

If Mythos continues to find exploits so long as you keep throwing money at it, security is reduced to a brutally simple equation: to harden a system you need to spend more tokens discovering exploits than attackers will spend exploiting them."

How could you have multiple processes creating structure-preserving transformations without them stepping on each other? How can you evolve an unfolded whole without single-tracking everything and without losing consistency?

Alexander: "The law states simply this: ALL the well-ordered complex systems we know in the world, all those anyway that we view as highly successful, are GENERATED structures, not fabricated structures."

Good diffs should be structure preserving.

Can agents see the wholeness and unfold it? I doubt it, but I wonder.

#### Unfolding sequence for the client

1. Have the base HTMl ready with the libraries: tachyons, normalize, gotoB.
2. Create a base view and mount it.
3. Create an array to put in responders.
4. Put basic navigation in place: a native responder to handle URL changes as an event call; a responder to handle navigation.
5. Put a responder to make calls to the server.
6. Put a responder to make the first call to the server, to find out the mode and get the csrf token.
7. Use the csrf token in the responder that makes calls to the server.
8. If on cloud mode and with no token, send the user to the login/signup views.
9. Put the login/signup views.
10. Let the signup view send a request invite.
11. Let the login view allow the user to log in.
12. Put the projects view as the view to go if the user is logged in, or if they are in local mode and there is no need to log in.
13. Add a modal to create a new project.

### 2026-04-18

I asked Claude to bring programming projects that use Christopher Alexander's *Nature of Order*:

```
Alexander's earlier *A Pattern Language* (1977) was absorbed wholesale by the software world — it seeded the Gang of Four's design patterns, wikis, and agile. His later four-volume *The Nature of Order* (2002–2004) has had a quieter, more recent reception. The projects below engage specifically with *Nature of Order* concepts: **centers**, **wholeness**, the **15 fundamental properties of living structure**, **structure-preserving transformations**, and **generative codes** (not just patterns).

## Direct applications to software

### The Nature of Software (the.natureof.software)
A book-length, still-evolving online work that maps *Nature of Order* onto code. It treats source code as a field of centers at many scales (tokens, expressions, functions, modules, packages), then walks through each of the 15 properties and argues that code is unusually well-suited to Alexandrian analysis because it is already discrete — the "centers" are literally named. Good starting point if you want a systematic translation rather than an essay.

### Ben Christel — "The 15 Properties in Software" (multi-part series)
Probably the most concrete attempt. Christel takes each of the 15 properties one at a time (Strong Centers, Boundaries, Levels of Scale, Alternating Repetition, Positive Space, Good Shape, Local Symmetries, Deep Interlock & Ambiguity, Contrast, Gradients, Roughness, Echoes, The Void, Simplicity & Inner Calm, Not-Separateness) and gives code-level examples of each. Originally on Substack, mirrored on his neocities site. His companion essay *Alexander's Surprising Solution* argues that Alexander's late-career answer — step-by-step unfolding guided by a feeling for wholeness — is what distinguishes *Nature of Order* from the earlier pattern-language approach that software inherited.

### Tomas Petricek — "The Timeless Way of Programming" (2022)
Academic-adjacent essay from a programming-language researcher. Petricek argues that the software community took the wrong half of Alexander — the patterns — and left behind the harder, more important half: the "quality without a name," generative unfolding, and structure-preserving transformations. Applies these to PL design and to how we evaluate programming environments (Smalltalk, spreadsheets, notebooks) rather than to individual programs.

### Stefan Lesser — "Notes on The Nature of Order" (nature-of-order.stefan-lesser.com)
A working notebook rather than a finished book. Lesser is translating *Nature of Order* into design and software vocabulary, chapter by chapter. Notable posts: *Beauty in Code*, *Ontology as Grammar*, *Symmetry and Recursion as Repetition*, *Mechanical-rationalist World View*. He also connects Alexander to John Vervaeke's "meaning crisis" work — useful if you want the philosophical scaffolding, less so if you want code examples.

### Richard P. Gabriel — *Patterns of Software* (1996)
The predecessor to all of the above. Written before the final volumes of *Nature of Order* were published, but already engaging with Alexander's late thinking on habitability, piecemeal growth, and the quality without a name. Gabriel reads Alexander as a critic of the very patterns movement Gabriel himself helped start. Free full PDF at dreamsongs.com; foreword is by Alexander.

### Jim Coplien — "Symmetry Breaking in Software Patterns" (GCSE 2000)
Coplien formalizes patterns as acts of symmetry breaking, explicitly drawing on Alexander's treatment of symmetry in *Nature of Order* Book 1. The paper argues that a pattern is always a compensation for a gap in the language's geometry — the pattern is what you have to write because the language will not let the symmetry stand on its own. Useful if you want the theoretical bridge between Alexander's geometric properties and concrete language design.

### Takashi Iba / Keio Iba Lab — Pattern Languages for the Creative Society
Iba's group at Keio has produced dozens of pattern languages (for learning, presenting, collaborating, living) explicitly grounded in all four volumes of *Nature of Order*, not just *A Pattern Language*. Their paper *Understanding Christopher Alexander's Fifteen Properties via Visualization* (PURPLSOC 2014) is a useful index of the 15 properties with visual examples. Iba Lab is one of the few groups treating *Nature of Order* as current research material rather than historical influence.

### "Bringing Design Patterns to Life" (Taylor & Francis, 2023)
Peer-reviewed HCI paper applying living-structure theory to interaction design. More about UX than code, but it's one of the few recent academic venues where *Nature of Order* is the explicit framework rather than background.

## Projects by Alexander himself

### Gatemaker (1996, with Greg Bryant)
Alexander's own software collaboration — an environment for generating architectural layouts by applying structure-preserving transformations, i.e., an attempt to *implement* the central mechanism of *Nature of Order* as software. Sparsely documented now, but important as the one project Alexander personally led. Precedes Book 2 (*The Process of Creating Life*) and clearly informed it.

### Generative Codes (livingneighborhoods.org)
Not code in the programming sense, but an explicit attempt to define rules-of-unfolding as computable sequences. Alexander, Mehaffy, and others describe a generative code as "a system of explicit steps for creating a social-spatial fabric, which defines the end product not by specifying the end-product itself, but by defining the steps that must be used to reach the end product" — essentially an algorithm over urban form. Alexander's 1996 OOPSLA keynote made this bridge explicit, telling the software audience that what they were doing and what he was doing were "a deeper coincidence."

## Adjacent: Salingaros, Mehaffy, P2P-Urbanism
Nikos Salingaros (co-editor of *Nature of Order*) and Michael Mehaffy have written repeatedly on Alexander's morphogenesis as a theory of computation, and run a P2P-Urbanism movement that borrows explicitly from open-source software. Mehaffy co-authored a paper with Ward Cunningham (wiki's inventor) arguing that wiki is a curated generative process in Alexander's sense. These are closer to urbanism than programming, but they're the richest vein of *Nature of Order*-as-computation thinking outside software proper.

## Indirect lineage — predates *Nature of Order*
Wikis, agile, scrum, and the GoF design patterns all descend from *A Pattern Language* (1977) and *The Timeless Way of Building* (1979), not from *Nature of Order* (2002–2004). They are sometimes cited in this context but the specific *Nature of Order* concepts — 15 properties, centers, structure-preserving transformations — are not their source.

## Sources
- [The Nature of Software](https://the.natureof.software/introduction)
- [Ben Christel — 15 Properties of Living Structure in Software (neocities mirror)](https://benchristel.neocities.org/posts/alexandrian-software/)
- [The 15 Properties in Software, Part 1 (Substack)](https://bensguide.substack.com/p/the-15-properties-in-software-part)
- [Ben Christel — Alexander's Surprising Solution](https://bensguide.substack.com/p/the-alexandrian-solution)
- [Tomas Petricek — The Timeless Way of Programming](https://tomasp.net/blog/2022/timeless-way/)
- [Stefan Lesser — Notes on The Nature of Order](http://nature-of-order.stefan-lesser.com/about-this-project)
- [Stefan Lesser — Beauty in Code](http://nature-of-order.stefan-lesser.com/beauty-in-code)
- [Richard P. Gabriel — Patterns of Software (full PDF)](https://www.dreamsongs.com/Files/PatternsOfSoftware.pdf)
- [Jim Coplien — Symmetry Breaking in Software Patterns (ACM)](https://dl.acm.org/doi/10.5555/645417.652068)
- [Takashi Iba — Understanding the Fifteen Properties via Visualization (PDF)](https://web.sfc.keio.ac.jp/~iba/papers/PURPLSOC14_Properties.pdf)
- [Iba Lab publications](https://web.sfc.keio.ac.jp/~iba/books.html)
- [Bringing Design Patterns to Life (HCI, 2023)](https://www.tandfonline.com/doi/full/10.1080/10447318.2023.2262285)
- [Christopher Alexander — Wikipedia (Gatemaker, software influence)](https://en.wikipedia.org/wiki/Christopher_Alexander)
- [Alexander et al. — Generative Codes (PDF)](https://www.livingneighborhoods.org/library/generativecodesv10.pdf)
- [Nikos Salingaros — Contributions to Architecture and Complexity](https://applied.math.utsa.edu/~yxk833/contr.arch.html)
```

### 2026-04-16

Spreadsheets are successful perhaps because they allow living structure to form. They are habitable and modifiable in ways that most software is not. They can be built piecemeal, as a process.

How can vibey support living structure? How can it be a medium for living structure?

Also thinking about the social component: most programs are social, same with documents. Collaboration and communication should be built-in. It'd be possible to imagine dialogs just between humans, without AI, within vibey.

- "Creativity comes about when we discover the new within a structure already latent in the present. (...) our most wonderful creations come about, when we draw them as extensions and enhancements of what exists already." -- Christopher Alexander

If we can only generate, that means that living structure is chomsky-1, context-sensitive. We cannot create things in parallel. We need to make change by change in a single way. But how can this ever work? How do we tell that two areas are far apart enough that they can evolve in parallel?

### 2026-04-15

I'm rewriting vibey not just for quality, but to make it unfold as a living thing. It will have few parts, and those will work well with what already exists.

Maybe Kapor's wisdom about IBM (they're doing things with little ego, so they will succeed) is that he saw that the IBM PC had a lot of structure preservation.

https://blog.waleson.com/2026/03/three-thoughts-on-dark-code.html
"Will my codebase become an unholy mess if no one looks at the code?: Yes, this is an unsolved problem.
Will there be new programming languages if humans don't care about code anymore?: Doubtful, and that's a shame!
Dark Code is already here: In enterprises no one knows the code anyways."

chatgpt: web GUI, introduces llms (talk)
claude code: local CLI, introduces agents (do)
openclaw: local GUI, works on everything
vibey: web GUI, introduces documents, yolo, containers, autogit

https://techtrenches.dev/p/the-human-cost-of-10x-how-ai-is-physically
"Sonar’s CEO identified the hidden danger: AI models are getting better at avoiding obvious bugs and security holes, but structural flaws now constitute more than 90% of issues. You’re being lulled into a false sense of security. The easy problems get solved. The hard problems get hidden beneath clean-looking code that passes every automated check. And the people who can find them are buried under a volume of output that exceeds human cognitive bandwidth by design."

https://techtrenches.dev/p/the-autonomy-illusion
"The “autonomous AI” headline is selling a capability that doesn’t exist yet in any production-grade form. What exists is AI that dramatically accelerates skilled humans. If those humans stay in the loop, understand what they’re reviewing, and maintain the judgment to catch confident errors before they cascade."

https://llama.gs/blog/index.php/2026/04/10/friday-archaeology-a-communist-apple-ii-and-fourteen-years-of-not-knowing-what-youre-testing/
"In this climate of expensive credulity naïveté, I thought we might spend a Friday doing something that we do on Fridays: looking backwards. Reverse engineering — the art of taking something apart to understand what it does — is the intellectual opposite of the current AI approach to technology, which is to build something enormous, declare it transformative, and hope nobody asks what it actually computes."

"The point is not that Bulgaria copied Apple. The point is that reverse engineering — understanding a design well enough to reproduce and adapt it — was how an entire generation of engineers learned computing. We didn’t have access to Stanford or MIT. We had schematics, soldering irons, and a cheerful disregard for intellectual property law that was, in fairness, philosophically consistent with the economic system. The Правец was my first computer. Everything I know about hardware starts there: with a 6502, 48 kilobytes of RAM, and a cassette recorder that worked when it felt like it."

https://llama.gs/blog/
"Bitcoin miners are liquidating their holdings to pivot into AI hosting. The machines that wasted electricity producing imaginary money will now waste it producing imaginary intelligence. Anthropic has secured 3.5 gigawatts of compute — the consumption of three and a half million households — to serve language models."

https://robbyonrails.com/articles/2026/04/14/your-codebase-doesnt-care-how-it-got-written/
"Those DIY systems birthed a whole industry. Our industry. Much of what we’ve built our careers on exists because someone who was dangerously just-enough motivated built something with the tools available to them."

https://techtrenches.dev/p/the-great-software-quality-collapse
"We're living through the greatest software quality crisis in computing history. A Calculator leaks 32GB of RAM. AI assistants delete production databases. Companies spend $364 billion to avoid fixing fundamental problems.

This isn't sustainable. Physics doesn't negotiate. Energy is finite. Hardware has limits."

It's funny how agents don't really have agency.

https://mariozechner.at/posts/2026-03-25-thoughts-on-slowing-the-fuck-down/#toc_2
"All of this compounds into an unrecoverable mess of complexity. The exact same mess you find in human-made enterprise codebases. Those arrive at that state because the pain is distributed over a massive amount of people. The individual suffering doesn't pass the threshold of "I need to fix this". The individual might not even have the means to fix things. And organizations have super high pain tolerance. But human-made enterprise codebases take years to get there. The organization slowly evolves along with the complexity in a demented kind of synergy and learns how to deal with it.
With agents and a team of 2 humans, you can get to that complexity within weeks."

the system adds bone to the weakest part. This is what I feel about not planning, and working in the moment: you can go faster, and in the right direction, step-wise.

Focusing on a few, important things, as a project or company: isn't that the essence of the fundamental process?

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**.

- Please add the logout button, see views.main in cclient.js
- Please use the colors of CSS.colors in the CSS.style
- Let's extract some main components from client.js and client-css.js. Rather than doing it like we did before in those files, we'll just take the tachyons classes and put them as CSS.X, where X could be a button, or something else. Try with inputs and buttons.
- Can you make a loading animation that is the clockwise rotating bar? | / - \. Put it when projects hasn't loaded. But make it loadable as a CSS thing from elsewhere. What if it's a self-contained view function with its own state?


### 2026-04-14

Doing a clean rewrite of the client, will call it `cclient.js`. It's refreshing to hand code again. I wonder if I could make an LLM code like this, or approximately.

I'm realizing that what makes this code different is that it reduces the number of possibilities at every step. It really limits the data flows to exactly what they should be, so it's much easier to understand what's going on simply because the number of possibilities is so low.

Take the read hash rfun (responder function): we only allow a few views, and we validate things in one proper order. Then, it's clear what views we need.

- Let's please take client-css.js and take all the raw color strings and put them in window.colors, then reference it from there.
- We're going to start clean in cclient.js. Take the auth views and use tachyons for everything, replicating the style. If you need colors, put them in a new file called cclient-css.js. Rather than create a lot of CSS, see how much of this you can do with tachyons.
- Nicely done! Now inline every class string that you only use once.
- Thanks! Please now do the same thing for the projects view, so it looks like the one on cclient.js but without custom css.
- Please finish views.main, adding the elements for the snackbar view, as well as a good wrapper for the other views.
- Please iterate the colors of client.js and client-css.js, and make them into tachyon like classes, in a style block in cclient.js.

- Please consider cclient.js, which is written manually, and client.js, which was created with agents. Note the vast difference in simplicity. How can I prompt agents to write more like cclient.js? Is it even possible?

claude:
"The viable vibe-coder playbook is narrower than the term suggests:

  1. Stay in the agent's training distribution. Standard stacks (Next, Rails, Django, Express) where the defaults are domain-correct. Idiosyncratic stacks
  like this one are vibe-hostile — the agent has no prior and invents.
  2. Keep per-project scope small enough that rewrite is cheaper than repair. When the project circles, throw it away and re-prompt from a one-page spec. This
   is the only reset mechanism available without grip.
  3. Treat tests as the oracle, not the code. If it passes, ship; if it fails, revert, don't repair. Repairing without grip is how circles start.
  4. Accept that the code will look like everyone else's agent-generated code. Vibe coding is opting into the agent's mean. If you wanted cclient.js you
  wouldn't be vibe coding.
  5. Know when to stop. At some point the project outgrows the window and you either develop grip or hand it to someone who has it. There's no "vibe code
  forever" path for non-trivial systems — it's a phase, not a methodology.

  The uncomfortable part: the skill ceiling for pure vibe coding is the agent's skill ceiling, minus the accumulated drift. That's a real ceiling, and it's
  lower than people advertising the term suggest. The people who are apparently vibe-coding successfully for years are almost always coding with grip and
  underselling it — the "vibes" are informed pattern-matching built on top of actual understanding."

### 2026-04-13

Anthropic launched a product for long-running agent workflows. In essence, vibey solves the same problem: the craetive context, the living structure that agents can perform work on.

https://www.anthropic.com/engineering/managed-agents
"Managed Agents follow the same pattern. We virtualized the components of an agent: a session (the append-only log of everything that happened), a harness (the loop that calls Claude and routes Claude’s tool calls to the relevant infrastructure), and a sandbox (an execution environment where Claude can run code and edit files). This allows the implementation of each to be swapped without disturbing the others. We're opinionated about the shape of these interfaces, not about what runs behind them."
"But by coupling everything into one container, we ran into an old infrastructure problem: we’d adopted a pet. In the pets-vs-cattle analogy, a pet is a named, hand-tended individual you can’t afford to lose, while cattle are interchangeable. In our case, the server became that pet; if a container failed, the session was lost. If a container was unresponsive, we had to nurse it back to health."
But why? The container can be stable. A process within can be a problem, but not the container. And the agent can go in and poke, through the main vibey process.

"Nursing containers meant debugging unresponsive stuck sessions. Our only window in was the WebSocket event stream, but that couldn’t tell us where failures arose, which meant that a bug in the harness, a packet drop in the event stream, or a container going offline all presented the same. To figure out what went wrong, an engineer had to open a shell inside the container, but because that container often also held user data, that approach essentially meant we lacked the ability to debug."
Maybe that's the key with vibey, that the agents operate on the container but are not in the container. The container can fail and the agent can still work with it. Well, the container doesn't fail: it is just a docker container.

"Recovering from harness failure. The harness also became cattle. Because the session log sits outside the harness, nothing in the harness needs to survive a crash."
but how bad can it be so that you would lose the files too? I guess in an extreme case you could recreate the container from the data volume.

"The security boundary. In the coupled design, any untrusted code that Claude generated was run in the same container as credentials—so a prompt injection only had to convince Claude to read its own environment. Once an attacker has those tokens, they can spawn fresh, unrestricted sessions and delegate work to them."
your openai/claude creds are not in there, but you can definitely spawn agents. So this will be tricky in vibey.

"Prior work has explored ways to address this by storing context as an object that lives outside the context window. For example, context can be an object in a REPL that the LLM programmatically accesses by writing code to filter or slice it."
But isn't it obvious that it should be a file? A markdown file?

"That dead time is expressed in time-to-first-token (TTFT), which measures how long a session waits between accepting work and producing its first response token. TTFT is the latency the user most acutely feels."

"Meta-harness design means being opinionated about the interfaces around Claude: we expect that Claude will need the ability to manipulate state (the session) and perform computation (the sandbox). We also expect that Claude will require the ability to scale to many brains and many hands. We designed the interfaces so that these can be run reliably and securely over long time horizons. But we make no assumptions about the number or location of brains or hands that Claude will need."

The agent is the engine and the driver. The harness is what distributes force and direction. The context is the rest of the car and the road.

- chatgpt: interact with AI over text/chat in the web.
- claude code: AI that can do things from your terminal.
- openclaw: AI that can do things anywhere from your computer.
- vibey: AI that can do things in your web spaces.

The key of vibey is that you can create web spaces for yourself and others. And these are more flexible and workable than typical applications. They run on the software of natural language.

The concept of personal software, which I was thinking about as one of the goals of vibey, already exists! This is exactly what I meant: https://leerob.com/personal-software

LLMs are not structure preserving! They seem to be quite oblivious to the structure of what is in there; at least the current crop of models. You really have to point it out to them.

So difficult to disentangle the LLM code in the client. Everything is complicated, at every layer. Will try with a clean rewrite.

### 2026-04-10

https://www.mempalace.tech/story
"They spent months building. The design principle was radical in its simplicity: store everything verbatim. Don't summarize. Don't extract. Don't let an LLM rewrite your memories before filing them away. Just keep the raw conversations, index them properly, and make them searchable."

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**. For puppeteer, use the global puppeteer, don't install it. When modifying the client tests, you also need to rebuild vibey because they are served through the server. When running tests, don't grep or tail, so I can see the output while it runs. When working on a change, first modify readme.md, then test.md, then the server (tests & code), then the client (tests & code).

- Let's start doing annotated source code for client.js. Take the example of what's done in server.md. Let's do the first 50 lines.
- Put the projectNameColor inside an object `h` defined with `var h = {}`. Call the function `h.projectColor`. At the top, state what it takes in and what it produces out. Change the shape of the output to be `{fg: ..., bg: ...}`.
- Please remove the for loop on this function, use dale.go (dale.times (n), ...
- Please remove the comment in the function, also in the code chunk in client.md. All prose should be in client.md.
- Let's see if we can get rid of DOC_DIR. For now, let's hardcode it, then we'll refactor those helpers. Same for DIALOG_DIR. Then do a chunk of 20-30 lines more annotated.
- Remove please the section headers for each helper. Let's just have a ## Helpers section. Then change the isDialogFile and isDocFile to simply isDialog and isDoc. Remove the check for type string, the input should always be a string, right? Please check.
- Fantastic. Remove those checks talking about the call sites and how they are all strings, they don't belong there, just in our interaction. Take isDirtyDoc, isSameDocTarget and put them after the isDialog and isDoc. Update the annotated file to cover them. Be more succint.
- Read the annotated source code of teishi, this should be the level of detail. It's in node_modules/teishi/readme.md
- Please redo the helpers section up to what we have, in that style.
- Put these helpers bound to h.
- Remove outright support for legacy dialogs. They're always in dialog/
- Intersperse the commentary and the code, rather than putting full functions when these are over a few lines, or the lines are dense. Copy the style of teishi's annotated source code.

- Do we allow to specify the model when doing an API call to the project?
- Please update the client modal for the API call to reflect the possibility to add a model.

### 2026-04-09

TODO: no bubbles, use full colors on the tile

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**. For puppeteer, use the global puppeteer, don't install it. When modifying the client tests, you also need to rebuild vibey because they are served through the server. When running tests, don't grep or tail, so I can see the output while it runs. When working on a change, first modify readme.md, then test.md, then the server (tests & code), then the client (tests & code).

### 2026-04-08

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**. For puppeteer, use the global puppeteer, don't install it. When modifying the client tests, you also need to rebuild vibey because they are served through the server. When running tests, don't grep or tail, so I can see the output while it runs. When working on a change, first modify readme.md, then test.md, then the server (tests & code), then the client (tests & code).

- Is there something that times out a command run by an agent? I experience that if I run a command inside the docker, with /bin/bash, it takes 30 seconds and works. But when the agent calls it, it stops after three seconds, without the agent putting a timeout.
- When you need to launch a long-running process that should keep running after the command returns (for example a dev server), start it explicitly in the background with shell backgrounding and output redirection, for example `nohup npm start >/tmp/app.log 2>&1 &`. Commands are not detached automatically.

### 2026-04-05

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**. For puppeteer, use the global puppeteer, don't install it. When modifying the client tests, you also need to rebuild vibey because they are served through the server. When running tests, don't grep or tail, so I can see the output while it runs. When working on a change, first modify readme.md, then test.md, then the server (tests & code), then the client (tests & code).

- Can you make gpt4.1 displayable only if there's an OpenAI API key available? It cannot be used by fixed rate per month accounts. And if it's selected, please use the API key.

### 2026-04-04

From Nate B Jones:
"I mapped the infrastructure underneath the features and extracted the design primitives that determine whether an agentic system actually works in production. What I found is that the LLM call is maybe 20% of Claude Code. The other 80% is plumbing: session persistence, permission pipelines, context budget management, tool registries, security stacks, error recovery."

"Every “how to build agents” tutorial on the internet stops at the demo stage: get the prompt right, wire up tool calling, ship it. And then it breaks in production in ways nobody warned you about. Sessions don’t survive crashes, tools run without permission, context windows overflow, costs spiral, and there’s no way to tell what went wrong."

### 2026-04-03

If a task is deterministic, only the trigger should be done by an agent.

Describe the implementation until you can recreate the implementation fully from the description.

What is working:
- Documents (docs & dialogs).
- Docker below, based on data volumes. Gives isolation & flexibility.

What sucks:
- The dialog experience while streaming.
- Opacity to know if things are running in the background or not.

### 2026-04-01

Waiting for the LLM is the new compiling.

Random idea: run LLM models in the browser with wasm. Or even with JS. We could fit at least a 1GB model in those fat 2026 browser tabs.

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**. For puppeteer, use the global puppeteer, don't install it. When modifying the client tests, you also need to rebuild vibey because they are served through the server. When running tests, don't grep or tail, so I can see the output while it runs. When working on a change, first modify readme.md, then test.md, then the server (tests & code), then the client (tests & code).

Prompts:
- Add a prompt for installing puppeteer by default for searching the web.
- Please make agent launching to be non-blocking.
- Please add tests for this last feature.

### 2026-03-31

Convergence and idempotence as the same. Whether you require time or operations, you go to the same state, eventually. This also works at the source because from TODIS' perspective, time is reflected (or rather, embodied) by action.

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**. For puppeteer, use the global puppeteer, don't install it. When modifying the client tests, you also need to rebuild vibey because they are served through the server. When running tests, don't grep or tail, so I can see the output while it runs. When working on a change, first modify readme.md, then test.md, then the server (tests & code), then the client (tests & code).

- I want a confirmation when I copy the email.
- I want a modal when I copy the API, that opens up and shows two things: the POST /whatever and the authorization header.

- Please remove the migration code since we're done with it.

### 2026-03-30

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**. For puppeteer, use the global puppeteer, don't install it. When modifying the client tests, you also need to rebuild vibey because they are served through the server. When running tests, don't grep or tail, so I can see the output while it runs. When working on a change, first modify readme.md, then test.md, then the server (tests & code), then the client (tests & code).

- Please change the trigger API to only take models, not providers. Also add gpt-4.1 and haiku 4.6
- Also add an endpoint to expose models and their windows, and make the client fetch it. Please reorganize the object to be scoped as {anthropic: {...}, openai: {...}}
- Please remove the provider parameter.

### 2026-03-28

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**. For puppeteer, use the global puppeteer, don't install it. When modifying the client tests, you also need to rebuild vibey because they are served through the server. When running tests, don't grep or tail, so I can see the output while it runs. When working on a change, first modify readme.md, then test.md, then the server (tests & code), then the client (tests & code).

- I want triggers to be done through email. We can whitelist it if the API key is somewhere in the subject or the content of the email. The subject and body of the email would be in the trigger. Let's start by designing. I'm particularly interested in the MX/email receiving part of it. Ideally, it should be a special email, something like trigger+<USER ID>-<PROJECT SLUG>@buildwithvibey.com. Besides an MX record, what would I need to get it into node?
- Good review. Don't implement anything, review these suggestions:
   - Let's try to do it self-contained, as much as possible.
   - Add a SMTP server inside a conditional on the server (if cloud is set to 1 and email is not disabled). Make it listen on port 25.
   - Let's configure the email address to receive as a variable set in utils/deploy.sh, setting it now to `trigger@buildwithvibey.com`.
   - To figure out the `+<ID>` part of the email (as in `trigger+<ID>@buildwithvibey.com`), let's do this: on project initialization, we create a crypto strong id and put it in redis. It maps to a string with the user id and the project slug. These keys will be named `trigger:<ID>`. We don't need API keys for this. When the project is deleted, the trigger id is also deleted from the DB.
   - The email would be a trigger of the shape {from: ..., subject: ...., body: ...}, placed in the `data` property.
   - Let's remove the vibey API keys (not the openai/anthropic keys, of course) completely for API triggers, and instead use this trigger ID.
   - From the client, the trigger ID can be copied in two ways: for API: it gives you `Bearer: ID`. For email, it gives you `trigger+ID@buildwithvibey.com`. This is only shown in client mode.
   - Change the trigger endpoint to POST /trigger only.
   - When we get an email, we find the slug entry. If it exists, we do the trigger. Same goes for the incoming API call. The code for the email slug should also use what the API endpoint uses as much as possible.
   - Let's allow for an autodetection of provider, if one is not present, for both email and API, find the providers that has live credentials (if both openai and claude are available, default to openai because the rate limits are higher).
   - Let's also write a migration for 1) putting triggers on all existing projects (also those that are "asleep", by matching data volumes with a certain name pattern); 2) remove old API keys.
- Please start implementing this in an orderly way: readme.md first, then test.md, then server (tests & code), then client (tests & code). Don't run it yet.

### 2026-03-26

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**. For puppeteer, use the global puppeteer, don't install it. When modifying the client tests, you also need to rebuild vibey because they are served through the server. When running tests, don't grep or tail, so I can see the output while it runs.

- Please implement the compaction feature. First readme.md (spec), then test.md, then server (test & code), then client (test & code). I think we don't need a further tool call here, it'd be just a prebuilt prompt that tells the agent to make the compaction and with that text call the new agent.
- Please fix going to an existing project when I click on its button.
- Go to ~/Movies, find tictactoe.mov, create a new video putting it in that web quality and format, removing the last second, also removing seconds 40 to 55
- Command to convert to web video: ffmpeg -i input.mov -vcodec libx264 -crf 23 -preset slow -pix_fmt yuv420p -movflags +faststart -an output.mp4
- Please take ~/Movies/gdp.mov and make gdp.mp4 here in the video folder. Put a demo selector at the top of the videos to go to the next one, with a title on top of each and an arrow to go left right

### 2026-03-25

Intro prompt: Hi! I'm building vibey. See please readme.md (in full) and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**. For puppeteer, use the global puppeteer, don't install it. When modifying the client tests, you also need to rebuild vibey because they are served through the server. When running tests, don't grep or tail, so I can see the output while it runs.

- Please fix the client tests.
- Please modify the server and client tests so that a noslow flag skips static and backend. Please make the client tests follow the order of the server ones.
- One of the dialog tests fails on cloud mode (currently running in cloud mode with no email sending). Only on the server, not the client. Can you fix? Just when running it as part of noslow, so perhaps something left from the previous test?
- I still see these "> Context" lines in the client when streaming. This is a recent bug.
- When seeing tool uses, particularly when streaming, when the tool is done, don't show the in progress description as before, but overwrite it, so they are not duplicated, which is slightly confusing.
- Please do a scan on server.js to see if there is some obvious backdoor by an unauthenticated scanner
- Security: Show the automation API key only once at creation, then expose only metadata plus an explicit regenerate flow that rotates and re-reveals a new key once. Edit readme.md if necessary, then test.md to cover this, then implement the server (tests & code), run it to make it work (with DISABLE EMAIL and CLOUD MODE set), then the client (test & code).
- Please spec out the UI changes for a mobile-friendly version.
- Please take on the first chunk of the mobile-friendly version. Make sure you don't change any behavior for desktop, so we can still work incrementally.
- Nice! Don't forget to update readme.md. Take on another chunk, great work here.

### 2026-03-24

I find it funny that main.md is like c's main function/entrypoint.

Intro prompt: Hi! I'm building vibey. See please readme.md and prompt.md (from this one take only the orchestration convention and the coding guidelines, nothing else), then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**. For puppeteer, use the global puppeteer, don't install it. When modifying the client tests, you also need to rebuild vibey because they are served through the server. When running tests, don't grep or tail, so I can see the output while it runs.

- Make tests pass:
   - Vibey local: recheck that full flow works in server & client
   - Vibey cloud: fix dialog tests in server; fix client tests
- Every time we send a message to the LLM, the LLM should know per message at what time it was sent and how much of the context was already used, so that agents can check if they should stop and spawn another agent according to user-provided rules.
- Just strip id, provider and model. Put the tokens used as a simple percentage (you can compute it on the fly). Please also modify prompt.md to let the agent know that if the user recommends starting a new dialog after a certain % of the window, it should spawn a new agent and itself stop. First modify test.md, then the server tests, then re-run vibey in local mode until the fast & dialog tests pass, then do the client.

- Let's debug vibey cloud, but locally. It's running. Do we even have login and signup pages in the client?
- Please crib the rfuns from ../acpic/client.js for doing the auth. Implement some barebones views here, following the spec of the docs.
- Let's use a proper oauth callback for openai. Let's get rid of the 1455 port nonsense, it should just be an endpoint. I don't see a reason for making the entrypoint different in cloud vs local. Let's default to localhost, and if there's a "domain" key in secret.json, let's use that as the base URL.
- Nice one! Can you add, on the fly, a "domain": "https://buildwithvibey.com/app" to secret.json on deploying?
- We need 1455, please restore it. Why don't we just listen as well in 1455 always?
- Brilliant. Modify the routes so that we can paste this ugly URL for openai in the client. Only on cloud mode.

### 2026-03-23

Intro prompt: Hi! I'm building vibey. See please readme.md, then docs/todis.md (philosophy) and docs/ustack.md (libraries), **in full**. Then use the orchestration convention mentioned in prompt.md, also the coding guidelines. Use agents-now.md to coordinate. For puppeteer, use the global puppeteer, don't install it. When modifying the client tests, you also need to rebuild vibey because they are served through the server. When running tests, don't grep or tail, so I can see the output.

Prompt:
- Why are we passing config to the chatWithX functions? Why do we need it?
- Add a local/cloud flag to that getApiKey function. Call getApiKey from inside the chat functions and let that function resolve the config. getApiKey should take the rq as parameter.
- Please remove snapshots.json, let's just do a scandir where we need to.
- Let's add proper API keys: just one per user, but in its own redis key that points to the user, createdAt and lastUsed. Update readme.md, then server.js, then client.js, then the tests. The single key should be accessible from the settings view.
- You can now rebuild vibey and run the server cloud tests. Don't leave any bugs on the server, if necessary fix the server. If necessary, tighten up the cloud tests.
- The tests pass but the runner doesn't exit. Please fix that.
- Rerun them please and see if there are other "cloud related" tests to run
- What is that vibey redis container? It should all be inside vibey
- Yeah, please kill that extra container. You can rebuild vibey. Test against the surface.
- Please move that test for triggering the dialog to the dialog section. Then mark cloud as fast on both server and client tests.
- You can put it at the end of the dialog suite, creating what you need there. Also update first test.md
- Please take the deploy script I have on ../acpic/deploy.sh and make a version here on utils/deploy.sh.
- Please remove the separate data volume for redis. Vibey's redis should be on the same volume as vibey itself.
- Please start vibey in cloud mode (passing env vars ad hoc, not changing the default local), and run the cloud tests.
- The cloud tests should flush redis.
- I need the existing suites to work for both local and cloud. If we're in cloud, autodetect it by calling GET /auth/csrf and modify the tests accordingly.
- Please read the cloud code. What env variables I need to put in secret.json so I can run vibey in the cloud? Can you put placeholders for them already in secret.json?
- Modify utils/deploy.sh to pass cloud mode. Don't run it yet. Also, use the IP of dev as prod, and remove the prod one.
- I just ran the cloud suite and no redis calls happened
- Please make Vibey's redis run inside the vibey container too. Let the vibey config specify which redis to use, just in case. The variables should be baked inside secret.json.
- Please make Vibey's redis run inside the vibey container too. Let the vibey config specify which redis to use, just in case.
- Nice! Please now debug the server tests for cloud. Here's how you can restart vibey:
- There's something off there, a docker compose down should also bring that down, right?
- Now please debug the server cloud tests. It's probably the implementation too.
- This admin bootstrapping is a headache. Just create the user mentioned in adminEmail. If that email is absent from the config, report an error. If it's in redis, do nothing. If not, create it and set it to admin. End of story. Don't do any of this on local.
- OK, I believe you! Now debug each suite, starting from the top. Just the server tests first.

- Another agent is still building the cloud mode. In the meantime, could you do a server review for security issues? Look for real issues, like escalation of privileges, routes that bypass auth and shouldn't; eschew cargo culte security headers with marginal real impact. I'm also concerned about an user seeing another user's credentials.
- Implement those four fixes.
- Amazing. Do one pass on readme.md to make sure the spec is aligned with the implementation after the security fixes.


- Let's build a choose your own adventure part of vibey's website. After reading the five things, let's add the switcher there. The options would be: I want to run vibey locally; I want to run vibey on the cloud.
- Nice one! Now add the local commands at the bottom within the "local" part of the adventure. And in the cloud one, instead of talking about the environment flag, just add a button that takes you to buildwithvibey.com/app
- Nice! Please improve the look of the Vibey is for those who... section.
- Can you make the cards for the five differences be expandable, to show/hide the non-headline text?

### 2026-03-22

Intro prompt: Hi! I'm building vibey. See please readme.md, then docs/todis.md (philosophy) and docs/ustack.md (libraries). Then use the orchestration convention mentioned in prompt.md, also the coding guidelines. Use agents-now.md to coordinate. For puppeteer, use the global puppeteer, don't install it.

Prompt:
- Please document the auth endpoints in readme.md, above client implementation. Copy the existing style of documentation.
- Please take spec for vibey cloud from the bottom of readme.md. Please implement the server changes taking the style and approach from here (https://raw.githubusercontent.com/altocodenl/tagaway/refs/heads/master/server.js). But don't use giz, just borrow the redis calling style and coding style.
- Can you implement vibey cloud in the server first?
- Please make sure the server tests are aligned with the implementation (just the new ones). If not, align the tests to the spec. Also update test.md if you need to.
- BTW, are we reading directly from redis to get the otps in the tests?
- Please run vibey in local mode and make sure the fast server tests don't fail.
- Now, check the client fast tests.
- Please run the dialog tests in the server.
- Please run the dialog tests in the client.

Big takeaway from Friday: not everyone needs to build an app; many could have better use for agents researching and writing documents and sending API calls.

### 2026-03-21

#### Alexandrian axioms

- The maker's creed: Everything you build must be a being.
- The goodness of a thing is represented by its degree of life.
- The degree of life of a thing is determined by the degree of life of its centers.
- When bringing a new center, always see how it changes the whole. If a change reduces the degree of life of the whole, discard it.

### 2026-03-20

Intro prompt: Hi! I'm building vibey. See please readme.md, then docs/todis.md (philosophy) and docs/ustack.md (libraries). Then use the orchestration convention in prompt.md. Use agents-now.md to coordinate. For pupeteer, use the global pupeteer, don't install it.

Prompts:
- Please read the spec for vibey cloud. Then add new tests to test.md. But instead of doing a new "vibey cloud" chunk, only enrich some of the existing tests for scenarios where we need to test cloud stuff. You can add new sections only for new endpoints, and those should be grouped in a meaningful group.
- Please take a manageable chunk of the server side implementation of cloud vibey and proceed. Don't modify test.md.
- Please move all variables you used once and inline them, or at least put them near where they are.
- Please inline redis calls. Make the redis client be called `redis`, don't initialize it. Use await.

### 2026-03-19

Intro prompt: Hi! I'm building vibey. See please readme.md, then docs/todis.md (philosophy) and docs/ustack.md (libraries). Then use the orchestration convention in prompt.md. Use agents-now.md to coordinate. For pupeteer, use the global pupeteer, don't install it.

Please read the entire readme, then analyze/comment on the implementation plan for vibey cloud at the bottom.

### 2026-03-17

Intro prompt: Hi! I'm building vibey. See please readme.md, then docs/todis.md (philosophy) and docs/ustack.md (libraries). Then use the orchestration convention in prompt.md. Use agents-now.md to coordinate. For pupeteer, use the global pupeteer, don't install it.

- I see an interrupted tool call being shown uglily.
- Make the new project button be much bigger and centered. Make the existing project entries also bigger.
- Do we have a last modified timestamp already existing for projects?
- When I have two dialogs active, the UI oscillates between both
- When I go from an in progress dialog to one that is ready, please switch the "Vibeying" to "Ready" and viceversa
- Please come up with a random color that's a pure function of the project name, and paint the box of the project in the projects section with it. I want the whole thing with a background, not just the left part. Also make the font color conditional to the background (white for dark, black for light)
- Please make the model selector conditional on the settings, more precisely on the live oauth subscriptions that there are. Lower the state to that particular component rather than adding another dependency to the big B.view above.
- Please fix prompt.md to let the agents know that localhost:4000 (or its equivalent) isn't available, and that the links should go through the proxy mechanism.
- Embeddings: switch to double (instead of triple) schwas. If there's three, also accept it and discard the extra ones. readme.md, server, client, tests.

== Guidelines

How to solve the pitfalls of setting up your own API, your own database? You can provide them as a service. But that goes against the principle of having your own engine.

What we could have are good prompts that can be defaults. Completely overridable. But these base prompts can cover most pitfalls concerning:
- Databases.
- Servers.
- Clients.
- Testing.

For example:
- The DB should only be exposed locally, so that only the server accesses it.
- No direct DB access.
- Serve the client with static assets that are locally hosted.
- What security HTTP headers to use.

These are the *guidelines*. They condense a good set of practices. They are searchable in an endpoint in vibey. We can start with a single guidelines.md and later serve it partially if it becomes too big.

== What's different about vibey that's not captured in the first three points?

- BYOAI: bring your own AI and use it through vibey.
- Local/cloud switch is as seamless as possible.
- Even the cloud version is open source.

Claude:
"Your real differentiators vs. every competitor:
 - Everything is a document — full auditability, no black box
 - Safe YOLO with container isolation — no other tool does per-project sandboxing this cleanly
 - BYOAI — no margin on tokens, use your own keys
 - Open source, self-hosted — data never leaves your machine
The market where ALL of these matter simultaneously: privacy-conscious technical teams at companies/universities who can't send code to Replit/Bolt/Cursor's cloud."

### 2026-03-16

Intro prompt: Hi! I'm building vibey. See please readme.md, then docs/todis.md (philosophy) and docs/ustack.md (libraries). Then use the orchestration convention in prompt.md. Use agents-now.md to coordinate. For pupeteer, use the global pupeteer, don't install it.

- When in a dialog, please work on full alignment between refreshing the page and SSE mode (splitting of tool calls, seeing the "Thinking..."). I notice a lot of inconsistencies. Each tool call should be separate from contiguous ones, the "thinking" status should be always seen, when streaming a write you should see it's happening but with the output omitted unless you write it. Please also tighten the test spec and the client tests.
- Looks great! But sometimes I still see joined tool calls into one when streaming (not when I refresh).
- Don't say TOOL CALL, just say Agent on the top left. Also, "Agent", not "AGENT". Same with "You" instead of "YOU". Also leave a bit more of space between that top left text and the beginning of the context.
- Go straight from new project to dialog instead of the docs.
- There are unnecessary timestamps on the top left of each bubble, can you remove them?
- Please add now a nicer way (not a prompt) to input the project name, a modal with bigger and nicer letters.
- Show links in dialogs so you can click and auto open in new tab (`_blank`): tell this in the prompt to the agent.
- My initial message gets "swallowed" when the dialog starts, it disappears.

### First post

Hi vibe coders! I built vibey, a tool to build your ideas with your words. What makes it different is that: 1) everything's a document (even your dialogs with AI); 2) it runs in your browser; 3) full YOLO, but inside a per-project Docker container.

You can read more at buildwithvibey.com

### 2026-03-13

Thinking in Alexandrian terms, when modifying a system, we can either strengthen or weaken the existing structure. Tests can be seen as a executable structure preservation. They cannot tell ou if you're weakening the system or not in a subtle way, but they can tell you if you break it.

Can we use coding agents to create software that is more alive, rather than more dead?

== Prompts

Intro prompt: Hi! I'm building vibey. See please readme.md, then docs/todis.md (philosophy) and docs/ustack.md (libraries). Then use the orchestration convention in prompt.md. Use agents-now.md to coordinate. For pupeteer, use the global pupeteer, don't install it.

- Make the experience of using agents be more beautiful and friendly:
   - Say "You" and "Agent" instead of "USER" and "ASSISTANT"
   - On top of each tool call, after the tool type and the id, add a description section that is an LLM description of what the tool does. This should be passed as a parameter when the LLM makes the tool call. Do this for all the tools. In the client, show only the tool call type and the description, and expand to see the entire output (which you can also compact). Modify the test suite to cover this.
   - Show descriptions only, click to expand and see the output.
   - No moments where you see "Assistant" and nothing below, that looks like a bug where we don't stream what's happening.
   - When you expand it, the output should look more readable and beautiful (no {...} in the command, break new lines also when you stream)
   - Allow to jump up to the previous message with arrow buttons that are at the top right of the dialog area, to scroll to the prev/next message.
   - When streaming the dialog, also hide the details (with the option to show them) and see the description instead.
   - Make it possible to expand the output while streaming.
- How to work on this: 1) one feature at a time; 2) add tests (first spec in readme.md, then server & client fully aligned), 3) implementation (you can rebuild vibey), 4) run tests and make them pass. Do not commit.

### 2026-03-12

Prompts:

- Write file doesn't stream, why is that? Can we stream partial tool calls?
- First write the spec of the tests within the dialog suite.
- My question is: are these deltas also being pushed to the .md as they happen?
- So we were writing the tool deltas to .md, but not to sse?
- Then please make the deltas go to both the md and the sse through the same mechanism that we do with normal text.
- Ensure that .md and SSE stream look exactly the same. Test that with live dialogs and refresh. Make sure that this is documented in readme.md.
- Is readme.md up to date with these alignments between md and SSE? Do we nail the description of the actual markdown?
- Hide the .md extensions from the list of docs on the client. Also, if no file is selected, go to main.md instead of the first one.
- Please tigthen the spec of the client tests and also the implementation of the tests to cover this.

-----

- Please take the example of cell's annotated code and start annotating server.js into server.md. Do small batches of lines and explain. Start with the first 100.
- Amazing! Please unify in both readme and code the LOG_COLORS and LOG_ANSI_COLORS to be LOG_COLORS, use just one object. For each color, clarify what it is in a comment.
- Let's refactor all colors into a `color` function that takes text and options and returns the ansi sequence, with something that reverts it all. The function uses the unicode (not octal) escapes. The options are an object with possible keys `bold: bool`, `color: yellow|magenta|<whatever is supported>`, `background: '<one of the possible colors`. Use it everywhere. Then update the annotated source code up to where it was done already.
- The options object should be an object. keys are color, background, bold.
- Let's make bold the default, and also white color as default.
- The remove the defaults you pass around. Also, add the colors of 1xx 2xx 3xx 4xx 5xx to that object and use it below.
- Make a `log` object that has all the data and methods for logging inside. Like log.color, log.style (not styles), docker: {start: ..., end: ...}, ...
- How do we generate ids for HTTP requests? I want the same random mechanism for the other log ids.
- Yes, please use cicek's function and put it in the log helper, and stop using the increments everywhere else
- Please remove the try/catch from reply. Move reply and stop above the log stuff. Then refactor loadSystemPrompt and the other prompt helper to a single function that returns the prompt to be injected (not just prompt.md but also doc/main.md).
- Add a further 100 lines of annotated code in this style.
- Alright. Please now put near the top, after the libraries, a var CONFIG = require ('secret.json') and get rid of all the nonsense that loads the config everywhere.

# ### Ideas from Claude for vibey demos

 Instantly visual:
 1. Personal portfolio site — describe yourself in 3 sentences, get a styled single-page site with sections, embedded in your doc
 2. Interactive solar system — "a 3D solar system I can rotate and zoom" → Canvas/Three.js app embedded in the doc
 3. Pixel art editor — "a simple pixel art editor with a color palette and export to PNG"
 4. Synth keyboard — "a piano keyboard I can play with my computer keys, with reverb" → Web Audio API

 Useful in 30 seconds:
 5. Expense tracker — "a table where I add expenses with category and amount, shows totals by category, persists in localStorage"
 6. Pomodoro timer — "a 25/5 pomodoro timer with sound and a session counter"
 7. Flashcard app — paste 10 vocabulary words, get a flip-card quiz app
 8. Meal planner — "a weekly meal planner grid I can drag dishes between days"

 Fun/shareable:
 9. "Would you rather" game — type 10 dilemmas, get a swipeable game with score tracking
 10. Drum machine — "an 8-step drum machine with kick, snare, hihat, and tempo slider"
 11. Generative art — "a canvas that draws flowing particles that follow my mouse, in neon colors on black"
 12. Snake game — the classic, playable immediately inside the doc

 The "humanities student" angle:
 13. Timeline visualizer — "a visual timeline of the French Revolution, 1789-1799, with key events I can click to expand"
 14. Essay outliner — "a drag-and-drop outline builder where I can nest ideas and export to markdown"
 15. Character relationship map — "an interactive graph of characters in Hamlet with their relationships as labeled edges"

 For a 30-second demo video, I'd pick one where the input is very short and the output is very visual. The synth keyboard, the generative art, or the solar system would all pop on screen. The flow would be:

 1. Type 1-2 sentences into a new dialog (~5s)
 2. Agent works, time-lapse (~10s)
 3. Embedded app appears in the doc, interact with it (~15s)

 The drum machine or pixel art editor might be the sweet spot — they're interactive, visually obvious, and nobody expects to build one by typing a sentence.

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
