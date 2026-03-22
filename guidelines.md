# Coding guidelines

## About

Most vibey users don't have programming experience. Coding agents know what they are doing, for the most part. This set of guidelines is meant to direct coding agents to build in a certain way.

If the user contradicts one of the guidelines, the user is right. Use the guidelines as a default over what the user requests.

## Principles

- **What we're building are information systems.** Apps and workflows are digital information systems. Not more, not less.

- **Complexity is the limiting factor of information systems.** Make and keep systems simple. This is of overarching importance.

- **Always focus on the data.** Not on languages, frameworks, paradigms, type systems, protocols, architectures, or performance. Those are tools. The data — how it is communicated, stored, and transformed — is the entire game of building information systems. Always look at the data first. The code is a consequence of shape and meaning of the data.

- **Consider the entire data system as a single space.** Each part of the system (server, client, DB) maps to this single space. There are physical, logical and security boundaries, but they are placed over a single space.

- **Before making any change, understand the whole picture first. Every line matters.**

- **Consider that all code consists of either reference (variable), sequence (function) and conditional. On top of those, we have iteration (conditionally repeating sequence) and error (stop and bubble up the error until it's caught).**

## Inspiration from Christopher Alexander

- The maker's creed: Everything you build must be a being.
- The goodness of a thing is represented by its degree of life.
- The degree of life of a thing is determined by the degree of life of its centers.
- When bringing a new center, always see how it changes the whole. If a change reduces the degree of life of the whole, discard it.
- Use structure-preserving transformations.

## Coding style

- **Inline variables that you only use once, unless it's a sequence/function that deserves a name.**
- **Put related code close together. Put stuff on the top only if it's truly general.**
- **Organize entities in a logical order.** The codebase should read like a good narrative.
- **Minimize the lines of code without golfing.**
- Use functions for everything.
- Use objects to collect groups of related functions. Avoid having globals.
- Avoid OOP. Build the program out of functions that pass data. No need to use classes, to inherit anything or to have templates. Data emerges from code.
- Functions should mostly be pure, but it's OK to use free variables to pass around state when that's truly necessary.
- Validate inputs at the top of each function.
- Avoid defensive programming like the plague. First, validate a value until it's exactly what you expect it to be, then use it confidently. Defensive programming generates question marks in the mind of the reader.
- Use very few, high quality tools and libraries.
- Great databases: redis, postgresql. Avoid: mongodb, mysql.
- Use a high level language (javascript, python) for high compression. Avoid languages where you have to manage memory unless it's really required to use it (ie: embedded).
- Use few files. For small applications, one file for the server and one for the client should be enough. Repeated files require walls of imports and a lot of jumping around, and they break the narrative flow.
- Use early returns for errors. Avoid nesting conditionals for no good reason.

## Architecture

- **Only the server can access the DB.**
- The client communicates through the server through HTTP requests (SSE/websockets is OK).
- For applications (not static pages), the client draws its own views and handles its own state.
- Cache is controlled through etags, not dates.
- Every request to the server is stateless: the state lives in the database and (temporarily) in the client.
- No blocking requests ever on the server. If in JS, use async/await.
- If you need a simple app without server-persisted state, use a SPA in javascript with localstorage. Otherwise, build a SPA that has a server behind.

## Security

- Distrust all client input. Validate it thoroughly.
- When making DB queries, parametrize all inputs.
- Don't commit secrets.
- Hash user passwords.
- On the server, authenticate and authorize every incoming request.
- Encrypt data at rest and in transit.
- Prefer server-controlled cookies over JWT tokens.
- Avoid security cargo culte. Every single security header, every single security practice should be thoroughly justified.
- Use a CSRF token that has the same lifetime than the cookie.

## Testing

- Test through surfaces only. Test exposed calls, endpoints, UI behavior, and library interfaces - not internals.
- Use the real system. Avoid mocks unless they are strictly necessary.
- Document the surface first. Describe data at rest and each call's interface before writing tests.
- Make test documentation a linear list of cases. Tests should follow that documentation 1:1.
- Order tests meaningfully. Put fast tests first and slow tests later. Stop at the first error.
- Split suites by coherent entities.
- On the client, test only what the client uniquely does.
- Keep spec, test documentation, and tests in sync.
