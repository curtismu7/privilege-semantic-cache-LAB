# Talk track

<!-- The source for the Talk track view and the presenter mode. Written once with {{castBrand}}-style tokens; the four vertical packs
     (airlines, retail, health, finance) and customer.config.json fill them. A test fails on a token no pack defines. A heading that starts with
     "S01:" to "S09:" belongs to the story of the same number. Keep every section short enough to say in a minute. -->

## Before you start

You are about to show per-key semantic caching: a similar prompt is answered from the key's cache, and the Usage view shows Requests, From cache and Saved. Say first what is sourced and what is not. The only claims taken from the 2026-11-21 release notes are these: each LLM key can name its own embedding model and its own vector Redis, sets a match strictness and a TTL, and the Usage view shows Requests, From cache and Saved. Everything else on the screen is this lab's own model and is labelled UNVERIFIED. The Mock or Real modal opens first and says the same; close it with Got it.

The story is told for {{castBrand}}, an invented example. The verticals change the words, not the engine and not the numbers.

## What is simulated, and what is not

Everything is simulated: the gateway, the embedding model, the vector Redis, the model provider and time. Nothing leaves this machine, and a guard refuses any outbound call. Real mode is not built; its toggle is disabled with the reason.

Say plainly that the encoder is a stand-in. It hashes character groups into numbers and compares them; it is not a real embedding model and it measures shared words, not meaning. A paraphrase scores high here only when it reuses words. Do not let anyone read a score on this page as a measure of how a real embedding model would rate the pair.

Say also what the lab does not know: how the product computes Saved, whether it runs the guard before or after the lookup, and what it does when the Redis is down. The Limits page lists each of these.

The cache scope is an open question, not an answer: whether the cache is per key only or also per user is not confirmed, so the lab shows a question card and no result. Do not build a story around it.

## S01: An exact repeat is answered from the cache

Run the first scenario: {{castApp}} asks the same question twice while {{castTask}}. The first ask is a miss and goes to the model; the second scores 1 and is answered from the cache with no model call. Point at the first Usage card, the scenario's own: two requests, one from cache, and a Saved number in lab-model tokens (the live key's Usage below it stays at zero, because a scenario runs on its own key).

## S02: A paraphrase above the strictness is a hit, and the score is shown

Run the second scenario. The second wording is not the stored prompt, but it shares most of its text, so it scores high and is a hit. Say the score out loud (it is in the Score column of the steps table). Remind the room that this stand-in measures shared text, not meaning.

## S03: An unrelated prompt is a miss

Run the third scenario. A prompt about something else scores near zero, falls below the strictness and goes to the model. That is how {{castOwner}} can see that the cache does not answer a question with the answer to a different one.

## S04: Moving the strictness flips the same pair between hit and miss

Run the fourth scenario, then open the similarity view and move the slider. The pair's score does not change; only the line moves. Below the line it is a miss, at or above the line it is a hit. This is the choice {{castOwner}} makes for {{castKey}}: how close is close enough.

## S05: After the TTL the answer is gone

Run the fifth scenario. The answer is stored at lab time 400 ms and expires at 60,400 ms. One millisecond before that it is a hit; at exactly that time it is a miss. In your own run, use the Advance control to move the lab clock and ask again.

## S06: The Usage view matches the calls

Run the sixth scenario: five calls, three of them from the cache. The scenario's own Usage card reads Requests 5, From cache 3, Saved 165 lab-model tokens. Say that how the product computes Saved is not in the release notes; the lab counts the stored answer's output tokens and labels the unit UNVERIFIED.

## S07: Two keys with different embedding settings never share an answer

Run the seventh scenario. Three keys ask the same prompt; each misses once and then hits only on its own entry. Different embedding models are different vector spaces and a different store is a different place. Do not say whether the product also scopes by user: that is the open question.

## S08: A prompt the guard blocked never enters the cache

Run the eighth scenario. The guard blocks the prompt: the first step counted nothing and stored nothing, and the scenario's Usage card ends at two requests (the later miss and hit), not three. The same text sent again, unblocked, is a miss because it was never cached. Say that the lab runs the guard first and that the product's order is UNVERIFIED.

## S09: The vector store is down and the error has a name

Run the ninth scenario, or switch the store off yourself and run a prompt. The outage step is a named error with no model call, and the scenario's Usage card shows two requests: the outage run was not counted. Say that what the product does in an outage is UNVERIFIED; the lab claims neither fail-open nor fail-closed.
