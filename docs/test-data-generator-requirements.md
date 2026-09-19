### Overview

Currently we have a lack of prod-like test data to work off of when doing manual QA. Everything must be hand-inputted to try and simulate real user actions. The goal of this generator is to create realistic data so that developers can test their changes against something more true to life.

### Requirements

- Uses ../tectonic-comics-bingo-export.json as a base to import the test bingo
- In a dev env-only interface, we want the ability to run this script with the following options
  - Which stage to be on
  - If on the live stage, how far through the bingo we are
    - For example if today is 1/10, and we select 50% of the way thru it should set the bingo start date to ~1/5 and end date to ~1/14, as well as have the amount of submissions and tile completions be about 50% of what we would expect by the end of the bingo
- Data should be realistic
  - Most teams don't fully finish the board before the end date
  - Some teams perform better than others due to a mixture of luck and individual performance
  - Some tiles are harder/longer to complete than others, and only a subset of the team's members will be able to do the harder content.
    - Good example is tob issue 2 page 2, this requires either a very rare item (scythe) or getting drops from the hardmode version which few people can do.
    - Slayer bosses and wildy tiles on the other hand pretty much everyone is capable of doing
  - There are far fewer mods than actual players, this can lead to submissions building up sometimes and then mods coming through and approve in batches (this is usually based on the mods active hours, submissions build up more when they are sleeping)
  - Different teams will prioritize different tiles
  - Players are smart and will prioritize completing a line over finishing another random tile if possible
  - They will also prioritize finishing a tile to get the bonus points if 1 page is already complete
  - Submissions are rarely rejected, its usually just at the start when people forget to configure their codeword
- This needs to go through actual endpoints so that all the audit log stuff and side effects are properly accounted for, however timestamps need to be spoofed so the space between user actions is actually realistic
- Some kind of teardown script to avoid bloating the db when testing is complete
