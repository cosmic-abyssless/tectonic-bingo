# Partial Bingo imports

Tectonic Bingo doesn't import part of a Bingo (signup questions only, or any other section) into an existing Bingo, and there's no separate partial export file. The one import path is the full Bingo export, which is imported as a new Bingo from Site admin.

## Why this is out of scope

The full export already carries the signup questions, with their helper text and every setting. So moving a whole Bingo between servers (local, staging, prod) is covered.

The request was really for copying just the questions to another Bingo or server. That isn't worth a second file format:

- A Bingo runs about every 6 months with a handful of signup questions (roughly 5 to 10), and setting them up by hand in the question builder takes minutes.
- A partial format needs its own validation, versioning and compatibility with older files, on top of the full export's.
- Importing into an *existing* Bingo raises questions (replace or append? duplicates? what if Signups are already open and answers exist?) that full imports into a new Bingo never face.

A lighter in-app alternative was considered during triage: a "Copy questions from another Bingo" button in the question builder, with no file. It was also declined for the same reason: the questions are quick to set up by hand.

## Prior requests

- #101: "Add import support for signup questions" (replace/append modes, a questions-only import file)
